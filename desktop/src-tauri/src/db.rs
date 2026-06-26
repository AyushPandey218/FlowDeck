use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct DbState {
    pub conn: Mutex<Connection>,
}

/// Returns the path to the app's database.
pub fn get_db_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to retrieve app data directory: {}", e))?;

    // Create the directory if it does not exist
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }

    Ok(app_dir.join("flowdeck.db"))
}

pub fn initialize_database(app_handle: &AppHandle) -> Result<Connection, String> {
    let db_path = get_db_path(app_handle)?;
    
    // Rotate and create database backup before opening connection
    let backup_res = create_database_backup(&db_path, app_handle);
    
    let mut conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open SQLite database: {}", e))?;

    // Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON;", [])
        .map_err(|e| format!("Failed to enable foreign key support: {}", e))?;

    // Check if table contains old pairing_token column and drop it to recreate cleanly
    let has_old_column = conn.prepare("SELECT 1 FROM pragma_table_info('trusted_devices') WHERE name='pairing_token';")
        .and_then(|mut stmt| stmt.exists([]))
        .unwrap_or(false);
    if has_old_column {
        println!("[SERVER] Detected deprecated trusted_devices schema, dropping table...");
        let _ = conn.execute("DROP TABLE trusted_devices;", []);
    }

    // Execute schema migrations
    run_migrations(&mut conn)?;

    // Verify schemas exist
    verify_schema(&conn)?;

    // Log backup warning if there was an error
    if let Err(e) = backup_res {
        let _ = log_execution_error(
            &conn,
            "WARN",
            "DATABASE_BACKUP",
            &format!("Database backup failed: {}", e),
            None,
        );
    }

    // Safe migration: Check if actions table exists but contains no category_id.
    let table_exists = conn.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='actions';")
        .and_then(|mut stmt| stmt.exists([]))
        .unwrap_or(false);
    let has_category_column = conn.prepare("SELECT 1 FROM pragma_table_info('actions') WHERE name='category_id';")
        .and_then(|mut stmt| stmt.exists([]))
        .unwrap_or(false);

    if table_exists && !has_category_column {
        println!("[SERVER] Migrating actions table to support categories...");
        // 1. Seed pages/categories first so we have at least one category to assign to
        seed_default_layout_if_empty(&conn)?;

        // 2. Find a default category ID. Let's find "Development" under "Work".
        let default_cat_id: String = conn.query_row(
            "SELECT id FROM categories WHERE name = 'Development' LIMIT 1;",
            [],
            |row| row.get(0)
        ).or_else(|_| {
            conn.query_row(
                "SELECT id FROM categories LIMIT 1;",
                [],
                |row| row.get(0)
            )
        }).map_err(|e| format!("Failed to find default category for migration: {}", e))?;

        // 3. Backup flat actions
        struct TempAction {
            id: String,
            name: String,
            action_type: String,
            payload: Option<String>,
            icon: Option<String>,
            order_index: i32,
        }

        let mut backup = Vec::new();
        {
            let mut stmt = conn.prepare("SELECT id, name, action_type, payload, icon, order_index FROM actions;")
                .map_err(|e| format!("Backup actions query failed: {}", e))?;
            let rows = stmt.query_map([], |row| {
                Ok(TempAction {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    action_type: row.get(2)?,
                    payload: row.get(3)?,
                    icon: row.get(4)?,
                    order_index: row.get(5)?,
                })
            }).map_err(|e| format!("Backup actions row map failed: {}", e))?;

            for act in rows.flatten() {
                backup.push(act);
            }
        }

        // 4. Drop and recreate actions table inside a transaction
        let tx = conn.transaction().map_err(|e| format!("Failed to open transaction for migration: {}", e))?;

        tx.execute("DROP TABLE actions;", []).map_err(|e| format!("Failed to drop flat actions table: {}", e))?;

        tx.execute(
            r#"
            CREATE TABLE actions (
                id TEXT PRIMARY KEY,
                category_id TEXT NOT NULL,
                name TEXT NOT NULL,
                action_type TEXT NOT NULL,
                payload TEXT,
                icon TEXT,
                order_index INTEGER NOT NULL,
                FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
            );
            "#,
            [],
        ).map_err(|e| format!("Failed to recreate action table with categories: {}", e))?;

        for act in backup {
            tx.execute(
                "INSERT INTO actions (id, category_id, name, action_type, payload, icon, order_index) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7);",
                rusqlite::params![act.id, default_cat_id, act.name, act.action_type, act.payload, act.icon, act.order_index],
            ).map_err(|e| format!("Failed to restore action {} to new schema: {}", act.name, e))?;
        }

        tx.commit().map_err(|e| format!("Failed to commit actions category migration: {}", e))?;
        println!("[SERVER] Actions table category migration completed successfully.");
    }

    // Seed default layout if empty (for new installs)
    seed_default_layout_if_empty(&conn)?;

    Ok(conn)
}

pub fn seed_default_layout_if_empty(conn: &Connection) -> Result<(), String> {
    let pages_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM pages;",
        [],
        |row| row.get(0)
    ).unwrap_or(0);

    if pages_count > 0 {
        return Ok(());
    }

    println!("[SERVER] Seeding default pages and categories layout...");

    struct PageSeed {
        name: &'static str,
        categories: &'static [&'static str],
    }

    let seeds = [
        PageSeed {
            name: "Work",
            categories: &["Development", "Browsers", "Communication"],
        },
        PageSeed {
            name: "Gaming",
            categories: &["Launchers", "Voice Chat", "Recording"],
        },
        PageSeed {
            name: "Utilities",
            categories: &["System", "Volume", "Quick Access"],
        },
        PageSeed {
            name: "Streaming",
            categories: &[],
        },
    ];

    for (p_idx, p_seed) in seeds.iter().enumerate() {
        let p_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO pages (id, name, order_index) VALUES (?1, ?2, ?3);",
            rusqlite::params![p_id, p_seed.name, p_idx as i32],
        ).map_err(|e| format!("Failed to seed page {}: {}", p_seed.name, e))?;

        for (c_idx, c_name) in p_seed.categories.iter().enumerate() {
            let c_id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO categories (id, page_id, name, order_index) VALUES (?1, ?2, ?3, ?4);",
                rusqlite::params![c_id, p_id, c_name, c_idx as i32],
            ).map_err(|e| format!("Failed to seed category {} under page {}: {}", c_name, p_seed.name, e))?;
        }
    }

    // Set initial layout version to 1 if not present
    let _ = conn.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('layout_version', '1');",
        [],
    );

    Ok(())
}

fn run_migrations(conn: &mut Connection) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start database transaction: {}", e))?;

    // Migration queries in execution sequence
    let queries = [
        r#"
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS trusted_devices (
            device_id TEXT PRIMARY KEY,
            device_name TEXT NOT NULL,
            device_nickname TEXT NOT NULL,
            paired_at INTEGER NOT NULL,
            last_active INTEGER NOT NULL,
            is_blocked INTEGER DEFAULT 0
        );
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS pages (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            order_index INTEGER NOT NULL
        );
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            page_id TEXT NOT NULL,
            name TEXT NOT NULL,
            order_index INTEGER NOT NULL,
            FOREIGN KEY(page_id) REFERENCES pages(id) ON DELETE CASCADE
        );
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS actions (
            id TEXT PRIMARY KEY,
            category_id TEXT NOT NULL,
            name TEXT NOT NULL,
            action_type TEXT NOT NULL,
            payload TEXT,
            icon TEXT,
            order_index INTEGER NOT NULL,
            FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
        );
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS execution_logs (
            id TEXT PRIMARY KEY,
            action_id TEXT NOT NULL,
            action_name TEXT NOT NULL,
            success INTEGER NOT NULL,
            message TEXT,
            duration_ms INTEGER NOT NULL,
            executed_at INTEGER NOT NULL
        );
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS clipboard_history (
            id TEXT PRIMARY KEY,
            text TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            direction TEXT NOT NULL,
            is_local INTEGER NOT NULL DEFAULT 0,
            source_device_id TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS execution_errors (
            id TEXT PRIMARY KEY,
            level TEXT NOT NULL,
            source TEXT NOT NULL,
            message TEXT NOT NULL,
            stack_trace TEXT,
            created_at INTEGER NOT NULL
        );
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS transfer_history (
            id TEXT PRIMARY KEY,
            transfer_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            direction TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            file_hash TEXT,
            integrity_verified INTEGER DEFAULT 0,
            status TEXT NOT NULL,
            avg_speed REAL,
            peak_speed REAL,
            duration_ms INTEGER,
            created_at INTEGER NOT NULL
        );
        "#,
    ];

    for query in queries {
        tx.execute(query, [])
            .map_err(|e| format!("Failed executing migration query: {}\nError: {}", query, e))?;
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit database migrations transaction: {}", e))?;

    Ok(())
}

fn verify_schema(conn: &Connection) -> Result<(), String> {
    let tables = [
        "settings",
        "trusted_devices",
        "pages",
        "categories",
        "actions",
        "execution_logs",
        "clipboard_history",
        "execution_errors",
        "transfer_history",
    ];
    
    for table in tables {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?1;")
            .map_err(|e| format!("Failed to verify schema: {}", e))?;
            
        let mut rows = stmt
            .query([table])
            .map_err(|e| format!("Failed checking table existence: {}", e))?;

        if rows.next().map_err(|e| e.to_string())?.is_none() {
            return Err(format!("Verification failed: table '{}' was not created.", table));
        }
    }

    Ok(())
}

/// Retrieves or generates a unique desktop installation identifier.
pub fn get_or_create_desktop_id(conn: &Connection) -> Result<String, String> {
    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE key = 'desktop_id';")
        .map_err(|e| format!("Failed to prepare select desktop_id: {}", e))?;
    let mut rows = stmt
        .query([])
        .map_err(|e| format!("Failed to query desktop_id: {}", e))?;

    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let val: String = row
            .get(0)
            .map_err(|e| format!("Failed to get desktop_id string: {}", e))?;
        Ok(val)
    } else {
        let new_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('desktop_id', ?1);",
            [&new_id],
        )
        .map_err(|e| format!("Failed to insert desktop_id: {}", e))?;
        Ok(new_id)
    }
}

#[derive(serde::Serialize)]
pub struct TrustedDevice {
    #[serde(rename = "deviceId")]
    pub device_id: String,
    #[serde(rename = "deviceName")]
    pub device_name: String,
    #[serde(rename = "deviceNickname")]
    pub device_nickname: String,
    #[serde(rename = "pairedAt")]
    pub paired_at: i64,
    #[serde(rename = "lastActive")]
    pub last_active: i64,
    #[serde(rename = "isBlocked")]
    pub is_blocked: bool,
}

pub fn is_device_trusted(conn: &Connection, device_id: &str) -> Result<bool, String> {
    let mut stmt = conn.prepare("SELECT is_blocked FROM trusted_devices WHERE device_id = ?1;")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([device_id]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let is_blocked: i32 = row.get(0).map_err(|e| e.to_string())?;
        Ok(is_blocked == 0)
    } else {
        Ok(false)
    }
}

pub fn add_trusted_device(
    conn: &Connection,
    device_id: &str,
    device_name: &str,
    device_nickname: &str,
) -> Result<(), String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    conn.execute(
        "INSERT OR REPLACE INTO trusted_devices (device_id, device_name, device_nickname, paired_at, last_active, is_blocked) VALUES (?1, ?2, ?3, ?4, ?5, 0);",
        rusqlite::params![device_id, device_name, device_nickname, now, now],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_trusted_devices(conn: &Connection) -> Result<Vec<TrustedDevice>, String> {
    let mut stmt = conn.prepare("SELECT device_id, device_name, device_nickname, paired_at, last_active, is_blocked FROM trusted_devices;")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        let is_blocked_int: i32 = row.get(5)?;
        Ok(TrustedDevice {
            device_id: row.get(0)?,
            device_name: row.get(1)?,
            device_nickname: row.get(2)?,
            paired_at: row.get(3)?,
            last_active: row.get(4)?,
            is_blocked: is_blocked_int != 0,
        })
    }).map_err(|e| e.to_string())?;

    let list = rows.flatten().collect();
    Ok(list)
}

pub fn remove_trusted_device(conn: &Connection, device_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM trusted_devices WHERE device_id = ?1;",
        [device_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_device_last_active(conn: &Connection, device_id: &str) -> Result<(), String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    conn.execute(
        "UPDATE trusted_devices SET last_active = ?1 WHERE device_id = ?2;",
        rusqlite::params![now, device_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActionType {
    #[serde(rename = "OPEN_APP")]
    OpenApp,
    #[serde(rename = "OPEN_URL")]
    OpenUrl,
    #[serde(rename = "VOLUME_UP")]
    VolumeUp,
    #[serde(rename = "VOLUME_DOWN")]
    VolumeDown,
    #[serde(rename = "TOGGLE_MUTE")]
    ToggleMute,
    #[serde(rename = "LOCK_PC")]
    LockPc,
    #[serde(rename = "HIDE_ALL_WINDOWS")]
    HideAllWindows,
    #[serde(rename = "CLOSE_ALL_WINDOWS")]
    CloseAllWindows,
    #[serde(rename = "SWITCH_DESKTOP")]
    SwitchDesktop,
    #[serde(rename = "HOTKEY")]
    Hotkey,
}

impl ActionType {
    pub fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "OPEN_APP" => Ok(ActionType::OpenApp),
            "OPEN_URL" => Ok(ActionType::OpenUrl),
            "VOLUME_UP" => Ok(ActionType::VolumeUp),
            "VOLUME_DOWN" => Ok(ActionType::VolumeDown),
            "TOGGLE_MUTE" => Ok(ActionType::ToggleMute),
            "LOCK_PC" => Ok(ActionType::LockPc),
            "HIDE_ALL_WINDOWS" => Ok(ActionType::HideAllWindows),
            "CLOSE_ALL_WINDOWS" => Ok(ActionType::CloseAllWindows),
            "SWITCH_DESKTOP" => Ok(ActionType::SwitchDesktop),
            "HOTKEY" => Ok(ActionType::Hotkey),
            _ => Err(format!("Unknown ActionType: {}", s)),
        }
    }

    pub fn to_str(self) -> &'static str {
        match self {
            ActionType::OpenApp => "OPEN_APP",
            ActionType::OpenUrl => "OPEN_URL",
            ActionType::VolumeUp => "VOLUME_UP",
            ActionType::VolumeDown => "VOLUME_DOWN",
            ActionType::ToggleMute => "TOGGLE_MUTE",
            ActionType::LockPc => "LOCK_PC",
            ActionType::HideAllWindows => "HIDE_ALL_WINDOWS",
            ActionType::CloseAllWindows => "CLOSE_ALL_WINDOWS",
            ActionType::SwitchDesktop => "SWITCH_DESKTOP",
            ActionType::Hotkey => "HOTKEY",
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Action {
    pub id: String,
    pub category_id: String,
    pub name: String,
    pub action_type: ActionType,
    pub payload: Option<String>,
    pub icon: Option<String>,
    pub order_index: i32,
}

pub struct AddActionParam<'a> {
    pub category_id: &'a str,
    pub name: &'a str,
    pub action_type: ActionType,
    pub payload: Option<&'a str>,
    pub icon: Option<&'a str>,
}

pub struct UpdateActionParam<'a> {
    pub id: &'a str,
    pub category_id: &'a str,
    pub name: &'a str,
    pub action_type: ActionType,
    pub payload: Option<&'a str>,
    pub icon: Option<&'a str>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub page_id: String,
    pub name: String,
    pub order_index: i32,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub id: String,
    pub name: String,
    pub order_index: i32,
    pub categories: Vec<Category>,
}

pub fn get_layout(conn: &Connection) -> Result<Vec<Page>, String> {
    // 1. Get all pages
    let mut stmt = conn.prepare("SELECT id, name, order_index FROM pages ORDER BY order_index ASC;")
        .map_err(|e| e.to_string())?;
    let page_rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i32>(2)?))
    }).map_err(|e| e.to_string())?;

    let mut pages = Vec::new();
    for (id, name, order_index) in page_rows.flatten() {
        pages.push(Page {
            id,
            name,
            order_index,
            categories: Vec::new(),
        });
    }

    // 2. Get all categories
    let mut stmt = conn.prepare("SELECT id, page_id, name, order_index FROM categories ORDER BY order_index ASC;")
        .map_err(|e| e.to_string())?;
    let cat_rows = stmt.query_map([], |row| {
        Ok(Category {
            id: row.get(0)?,
            page_id: row.get(1)?,
            name: row.get(2)?,
            order_index: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut categories = Vec::new();
    for cat in cat_rows.flatten() {
        categories.push(cat);
    }

    // Map categories to pages
    for cat in categories {
        if let Some(page) = pages.iter_mut().find(|p| p.id == cat.page_id) {
            page.categories.push(cat);
        }
    }

    Ok(pages)
}

pub fn get_layout_version(conn: &Connection) -> i32 {
    let stmt = conn.prepare("SELECT value FROM settings WHERE key = 'layout_version';").ok();
    if let Some(mut stmt) = stmt {
        let val: Option<String> = stmt.query_row([], |row| row.get(0)).ok();
        if let Some(s) = val {
            return s.parse::<i32>().unwrap_or(1);
        }
    }
    1
}

pub fn increment_layout_version(conn: &Connection) -> Result<i32, String> {
    let current = get_layout_version(conn);
    let next = current + 1;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('layout_version', ?1);",
        [&next.to_string()],
    ).map_err(|e| format!("Failed to increment layout version: {}", e))?;
    Ok(next)
}

pub fn get_actions(conn: &Connection) -> Result<Vec<Action>, String> {
    let mut stmt = conn.prepare("SELECT id, category_id, name, action_type, payload, icon, order_index FROM actions ORDER BY order_index ASC;")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        let action_type_str: String = row.get(3)?;
        let action_type = ActionType::from_str(&action_type_str)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(e))))?;
        Ok(Action {
            id: row.get(0)?,
            category_id: row.get(1)?,
            name: row.get(2)?,
            action_type,
            payload: row.get(4)?,
            icon: row.get(5)?,
            order_index: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for act in rows.flatten() {
        list.push(act);
    }
    Ok(list)
}

pub fn get_action_by_id(conn: &Connection, id: &str) -> Result<Action, String> {
    conn.query_row(
        "SELECT id, category_id, name, action_type, payload, icon, order_index FROM actions WHERE id = ?1;",
        [id],
        |row| {
            let action_type_str: String = row.get(3)?;
            let action_type = ActionType::from_str(&action_type_str)
                .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(e))))?;
            Ok(Action {
                id: row.get(0)?,
                category_id: row.get(1)?,
                name: row.get(2)?,
                action_type,
                payload: row.get(4)?,
                icon: row.get(5)?,
                order_index: row.get(6)?,
            })
        }
    ).map_err(|e| e.to_string())
}

pub fn add_action(
    conn: &Connection,
    param: AddActionParam<'_>,
) -> Result<(), String> {
    let next_index: i32 = conn.query_row(
        "SELECT COALESCE(MAX(order_index), 0) + 1 FROM actions WHERE category_id = ?1;",
        [param.category_id],
        |row| row.get(0)
    ).unwrap_or(1);

    let id = uuid::Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO actions (id, category_id, name, action_type, payload, icon, order_index) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7);",
        rusqlite::params![id, param.category_id, param.name, param.action_type.to_str(), param.payload, param.icon, next_index],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_action(
    conn: &Connection,
    param: UpdateActionParam<'_>,
) -> Result<(), String> {
    conn.execute(
        "UPDATE actions SET category_id = ?1, name = ?2, action_type = ?3, payload = ?4, icon = ?5 WHERE id = ?6;",
        rusqlite::params![param.category_id, param.name, param.action_type.to_str(), param.payload, param.icon, param.id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_action(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM actions WHERE id = ?1;", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn reorder_actions(conn: &Connection, ids: &[String]) -> Result<(), String> {
    for (idx, id) in ids.iter().enumerate() {
        conn.execute(
            "UPDATE actions SET order_index = ?1 WHERE id = ?2;",
            rusqlite::params![idx as i32, id],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn add_page(conn: &Connection, name: &str) -> Result<(), String> {
    let next_index: i32 = conn.query_row(
        "SELECT COALESCE(MAX(order_index), 0) + 1 FROM pages;",
        [],
        |row| row.get(0)
    ).unwrap_or(1);
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO pages (id, name, order_index) VALUES (?1, ?2, ?3);",
        rusqlite::params![id, name, next_index],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_page(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM pages WHERE id = ?1;", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn add_category(conn: &Connection, page_id: &str, name: &str) -> Result<(), String> {
    let next_index: i32 = conn.query_row(
        "SELECT COALESCE(MAX(order_index), 0) + 1 FROM categories WHERE page_id = ?1;",
        [page_id],
        |row| row.get(0)
    ).unwrap_or(1);
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO categories (id, page_id, name, order_index) VALUES (?1, ?2, ?3, ?4);",
        rusqlite::params![id, page_id, name, next_index],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_category(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM categories WHERE id = ?1;", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn move_action(conn: &Connection, action_id: &str, category_id: &str, order_index: i32) -> Result<(), String> {
    conn.execute(
        "UPDATE actions SET category_id = ?1, order_index = ?2 WHERE id = ?3;",
        rusqlite::params![category_id, order_index, action_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn reorder_pages(conn: &Connection, ids: &[String]) -> Result<(), String> {
    for (idx, id) in ids.iter().enumerate() {
        conn.execute(
            "UPDATE pages SET order_index = ?1 WHERE id = ?2;",
            rusqlite::params![idx as i32, id],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn reorder_categories(conn: &Connection, ids: &[String]) -> Result<(), String> {
    for (idx, id) in ids.iter().enumerate() {
        conn.execute(
            "UPDATE categories SET order_index = ?1 WHERE id = ?2;",
            rusqlite::params![idx as i32, id],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn log_execution(
    conn: &Connection,
    action_id: &str,
    action_name: &str,
    success: bool,
    message: Option<&str>,
    duration_ms: i64,
) -> Result<(), String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    conn.execute(
        "INSERT INTO execution_logs (id, action_id, action_name, success, message, duration_ms, executed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7);",
        rusqlite::params![
            id,
            action_id,
            action_name,
            if success { 1 } else { 0 },
            message,
            duration_ms,
            now
        ],
    ).map_err(|e| format!("Failed to log execution: {}", e))?;
    Ok(())
}

// ──────────────────────────────────────────────
// Clipboard History CRUD
// ──────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardEntry {
    pub id: String,
    pub text: String,
    pub content_hash: String,
    pub direction: String,
    pub is_local: bool,
    pub source_device_id: String,
    pub created_at: i64,
}

/// Insert a clipboard entry if it doesn't duplicate the newest existing entry (by content_hash).
/// Returns true if a row was actually inserted.
pub struct ClipboardEntryParam<'a> {
    pub id: &'a str,
    pub text: &'a str,
    pub content_hash: &'a str,
    pub direction: &'a str,
    pub is_local: bool,
    pub source_device_id: &'a str,
    pub created_at: i64,
}

pub fn insert_clipboard_entry(
    conn: &Connection,
    param: ClipboardEntryParam<'_>,
) -> Result<bool, String> {
    // Deduplication: compare with newest entry's content_hash
    let newest_hash: Option<String> = conn
        .query_row(
            "SELECT content_hash FROM clipboard_history ORDER BY created_at DESC LIMIT 1;",
            [],
            |row| row.get(0),
        )
        .ok();

    if let Some(ref existing) = newest_hash {
        if existing == param.content_hash {
            return Ok(false); // duplicate – skip
        }
    }

    conn.execute(
        "INSERT INTO clipboard_history (id, text, content_hash, direction, is_local, source_device_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7);",
        rusqlite::params![
            param.id,
            param.text,
            param.content_hash,
            param.direction,
            if param.is_local { 1 } else { 0 },
            param.source_device_id,
            param.created_at
        ],
    )
    .map_err(|e| format!("Failed to insert clipboard entry: {}", e))?;

    // Prune to keep only 100 newest entries
    prune_clipboard_history(conn)?;

    Ok(true)
}

/// Keep only the newest 100 clipboard_history rows.
pub fn prune_clipboard_history(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "DELETE FROM clipboard_history WHERE id NOT IN (SELECT id FROM clipboard_history ORDER BY created_at DESC LIMIT 100);",
        [],
    )
    .map_err(|e| format!("Failed to prune clipboard history: {}", e))?;
    Ok(())
}

/// Get clipboard history (newest first, limit 100).
pub fn get_clipboard_history(conn: &Connection) -> Result<Vec<ClipboardEntry>, String> {
    let mut stmt = conn
        .prepare("SELECT id, text, content_hash, direction, is_local, source_device_id, created_at FROM clipboard_history ORDER BY created_at DESC LIMIT 100;")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let is_local_int: i32 = row.get(4)?;
            Ok(ClipboardEntry {
                id: row.get(0)?,
                text: row.get(1)?,
                content_hash: row.get(2)?,
                direction: row.get(3)?,
                is_local: is_local_int != 0,
                source_device_id: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for entry in rows.flatten() {
        list.push(entry);
    }
    Ok(list)
}

/// Clear all clipboard history.
pub fn clear_clipboard_history(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM clipboard_history;", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Delete a single clipboard history entry by id.
pub fn delete_clipboard_entry(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM clipboard_history WHERE id = ?1;", [id])
        .map_err(|e| format!("Failed to delete clipboard entry: {}", e))?;
    Ok(())
}

// ──────────────────────────────────────────────
// Phase 9.5 Stability, Recovery & Release Readiness
// ──────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionError {
    pub id: String,
    pub level: String,
    pub source: String,
    pub message: String,
    pub stack_trace: Option<String>,
    pub created_at: i64,
}

pub fn log_execution_error(
    conn: &Connection,
    level: &str,
    source: &str,
    message: &str,
    stack_trace: Option<&str>,
) -> Result<(), String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    
    conn.execute(
        "INSERT INTO execution_errors (id, level, source, message, stack_trace, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6);",
        rusqlite::params![id, level, source, message, stack_trace, now],
    )
    .map_err(|e| {
        eprintln!("[DATABASE] Fallback print: failed to insert execution error ({}): {}", source, e);
        format!("Failed to insert execution error: {}", e)
    })?;

    // Prune to keep only 1000 entries
    let _ = conn.execute(
        "DELETE FROM execution_errors WHERE id NOT IN (SELECT id FROM execution_errors ORDER BY created_at DESC LIMIT 1000);",
        [],
    );

    Ok(())
}

pub fn log_error_to_db(app_handle: &tauri::AppHandle, level: &str, source: &str, message: &str) {
    if let Some(db_state) = app_handle.try_state::<DbState>() {
        if let Ok(conn) = db_state.conn.lock() {
            let _ = log_execution_error(&conn, level, source, message, None);
        }
    }
}

pub fn get_execution_errors(conn: &Connection) -> Result<Vec<ExecutionError>, String> {
    let mut stmt = conn.prepare("SELECT id, level, source, message, stack_trace, created_at FROM execution_errors ORDER BY created_at DESC LIMIT 1000;")
        .map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok(ExecutionError {
            id: row.get(0)?,
            level: row.get(1)?,
            source: row.get(2)?,
            message: row.get(3)?,
            stack_trace: row.get(4)?,
            created_at: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for err in rows.flatten() {
        list.push(err);
    }
    Ok(list)
}

pub fn clear_execution_errors(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM execution_errors;", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TransferRow {
    pub id: String,
    pub transfer_id: String,
    pub file_name: String,
    pub direction: String,
    pub file_size: i64,
    pub file_hash: Option<String>,
    pub integrity_verified: bool,
    pub status: String,
    pub avg_speed: Option<f64>,
    pub peak_speed: Option<f64>,
    pub duration_ms: Option<i64>,
    pub created_at: i64,
}

pub struct TransferLogParam<'a> {
    pub transfer_id: &'a str,
    pub file_name: &'a str,
    pub direction: &'a str,
    pub file_size: i64,
    pub file_hash: Option<&'a str>,
    pub integrity_verified: bool,
    pub status: &'a str,
    pub avg_speed: Option<f64>,
    pub peak_speed: Option<f64>,
    pub duration_ms: Option<i64>,
}

pub fn log_transfer(
    conn: &Connection,
    param: TransferLogParam<'_>,
) -> Result<(), String> {
    let exists = conn.prepare("SELECT 1 FROM transfer_history WHERE transfer_id = ?1;")
        .and_then(|mut stmt| stmt.exists([param.transfer_id]))
        .unwrap_or(false);

    if exists {
        conn.execute(
            "UPDATE transfer_history SET status = ?1, file_hash = ?2, integrity_verified = ?3, avg_speed = ?4, peak_speed = ?5, duration_ms = ?6 WHERE transfer_id = ?7;",
            rusqlite::params![param.status, param.file_hash, if param.integrity_verified { 1 } else { 0 }, param.avg_speed, param.peak_speed, param.duration_ms, param.transfer_id],
        ).map_err(|e| format!("Failed to update transfer history: {}", e))?;
    } else {
        let id = uuid::Uuid::new_v4().to_string();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        conn.execute(
            "INSERT INTO transfer_history (id, transfer_id, file_name, direction, file_size, file_hash, integrity_verified, status, avg_speed, peak_speed, duration_ms, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12);",
            rusqlite::params![id, param.transfer_id, param.file_name, param.direction, param.file_size, param.file_hash, if param.integrity_verified { 1 } else { 0 }, param.status, param.avg_speed, param.peak_speed, param.duration_ms, now],
        ).map_err(|e| format!("Failed to insert transfer history: {}", e))?;

        // Prune to keep only 500 records
        let _ = conn.execute(
            "DELETE FROM transfer_history WHERE id NOT IN (SELECT id FROM transfer_history ORDER BY created_at DESC LIMIT 500);",
            [],
        );
    }
    Ok(())
}

pub fn get_transfer_history(conn: &Connection) -> Result<Vec<TransferRow>, String> {
    let mut stmt = conn
        .prepare("SELECT id, transfer_id, file_name, direction, file_size, file_hash, integrity_verified, status, avg_speed, peak_speed, duration_ms, created_at FROM transfer_history ORDER BY created_at DESC LIMIT 500;")
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        let integrity_int: i32 = row.get(6)?;
        Ok(TransferRow {
            id: row.get(0)?,
            transfer_id: row.get(1)?,
            file_name: row.get(2)?,
            direction: row.get(3)?,
            file_size: row.get(4)?,
            file_hash: row.get(5)?,
            integrity_verified: integrity_int != 0,
            status: row.get(7)?,
            avg_speed: row.get(8)?,
            peak_speed: row.get(9)?,
            duration_ms: row.get(10)?,
            created_at: row.get(11)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows.flatten() {
        list.push(row);
    }
    Ok(list)
}

pub fn clear_transfer_history(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM transfer_history;", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn get_current_db_version_for_backup(db_path: &std::path::Path) -> String {
    if !db_path.exists() {
        return "1".to_string();
    }
    if let Ok(conn) = Connection::open(db_path) {
        let val: Option<String> = conn.query_row(
            "SELECT value FROM settings WHERE key = 'layout_version';",
            [],
            |row| row.get(0),
        ).ok();
        if let Some(v) = val {
            return v;
        }
    }
    "1".to_string()
}

fn get_rfc3339_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    if let Ok(duration) = SystemTime::now().duration_since(UNIX_EPOCH) {
        let secs = duration.as_secs();
        let days_since_epoch = secs / 86400;
        let seconds_in_day = secs % 86400;
        let hours = seconds_in_day / 3600;
        let minutes = (seconds_in_day % 3600) / 60;
        let seconds = seconds_in_day % 60;

        let mut year = 1970;
        let mut days = days_since_epoch;
        loop {
            let is_leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
            let days_in_year = if is_leap { 366 } else { 365 };
            if days >= days_in_year {
                days -= days_in_year;
                year += 1;
            } else {
                break;
            }
        }
        
        let is_leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
        let month_days = if is_leap {
            [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        } else {
            [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        };
        
        let mut month = 0;
        let mut day = days + 1;
        for (i, &md) in month_days.iter().enumerate() {
            if day > md {
                day -= md;
            } else {
                month = i + 1;
                break;
            }
        }
        format!(
            "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
            year, month, day, hours, minutes, seconds
        )
    } else {
        "1970-01-01T00:00:00Z".to_string()
    }
}

pub fn create_database_backup(db_path: &std::path::Path, app_handle: &tauri::AppHandle) -> Result<(), String> {
    if !db_path.exists() {
        return Ok(());
    }

    let parent = db_path.parent().ok_or("No parent directory for database")?;
    let backup_1 = parent.join("flowdeck.db.backup.1");
    let backup_2 = parent.join("flowdeck.db.backup.2");
    let backup_3 = parent.join("flowdeck.db.backup.3");

    // Rotate backups
    if backup_3.exists() {
        let _ = std::fs::remove_file(&backup_3);
    }
    if backup_2.exists() {
        let _ = std::fs::rename(&backup_2, &backup_3);
    }
    if backup_1.exists() {
        let _ = std::fs::rename(&backup_1, &backup_2);
    }

    // Copy current DB
    std::fs::copy(db_path, &backup_1)
        .map_err(|e| format!("Failed to copy database file: {}", e))?;

    // Create manifest
    let db_version = get_current_db_version_for_backup(db_path);
    let app_version = app_handle.package_info().version.to_string();
    let created_at = get_rfc3339_timestamp();

    let manifest = serde_json::json!({
        "createdAt": created_at,
        "dbVersion": db_version,
        "appVersion": app_version
    });

    let manifest_path = parent.join("backup_manifest.json");
    let manifest_str = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
    
    std::fs::write(&manifest_path, manifest_str)
        .map_err(|e| format!("Failed to write manifest file: {}", e))?;

    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SettingRow {
    pub key: String,
    pub value: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PageRow {
    pub id: String,
    pub name: String,
    pub order_index: i32,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CategoryRow {
    pub id: String,
    pub page_id: String,
    pub name: String,
    pub order_index: i32,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ActionRow {
    pub id: String,
    pub category_id: String,
    pub name: String,
    pub action_type: String,
    pub payload: Option<String>,
    pub icon: Option<String>,
    pub order_index: i32,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExportedConfig {
    pub config_version: i32,
    pub settings: Vec<SettingRow>,
    pub pages: Vec<PageRow>,
    pub categories: Vec<CategoryRow>,
    pub actions: Vec<ActionRow>,
}

pub fn export_config(conn: &Connection) -> Result<String, String> {
    // Export Settings, excluding system pairing/modes/first-run
    let mut stmt = conn.prepare("SELECT key, value FROM settings WHERE key NOT IN ('desktop_id', 'allow_lan_connections', 'developer_mode', 'is_first_run');")
        .map_err(|e| e.to_string())?;
    let settings_rows = stmt.query_map([], |row| {
        Ok(SettingRow {
            key: row.get(0)?,
            value: row.get(1)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut settings = Vec::new();
    for r in settings_rows {
        settings.push(r.map_err(|e| e.to_string())?);
    }

    // Export Pages
    let mut stmt = conn.prepare("SELECT id, name, order_index FROM pages;")
        .map_err(|e| e.to_string())?;
    let pages_rows = stmt.query_map([], |row| {
        Ok(PageRow {
            id: row.get(0)?,
            name: row.get(1)?,
            order_index: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut pages = Vec::new();
    for r in pages_rows {
        pages.push(r.map_err(|e| e.to_string())?);
    }

    // Export Categories
    let mut stmt = conn.prepare("SELECT id, page_id, name, order_index FROM categories;")
        .map_err(|e| e.to_string())?;
    let categories_rows = stmt.query_map([], |row| {
        Ok(CategoryRow {
            id: row.get(0)?,
            page_id: row.get(1)?,
            name: row.get(2)?,
            order_index: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut categories = Vec::new();
    for r in categories_rows {
        categories.push(r.map_err(|e| e.to_string())?);
    }

    // Export Actions
    let mut stmt = conn.prepare("SELECT id, category_id, name, action_type, payload, icon, order_index FROM actions;")
        .map_err(|e| e.to_string())?;
    let actions_rows = stmt.query_map([], |row| {
        Ok(ActionRow {
            id: row.get(0)?,
            category_id: row.get(1)?,
            name: row.get(2)?,
            action_type: row.get(3)?,
            payload: row.get(4)?,
            icon: row.get(5)?,
            order_index: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut actions = Vec::new();
    for r in actions_rows {
        actions.push(r.map_err(|e| e.to_string())?);
    }

    let config = ExportedConfig {
        config_version: 1,
        settings,
        pages,
        categories,
        actions,
    };

    serde_json::to_string_pretty(&config).map_err(|e| e.to_string())
}

pub fn import_config(conn: &mut Connection, json: &str, db_path: &std::path::Path) -> Result<(), String> {
    // 1. Parse JSON as Value for validation
    let val: serde_json::Value = match serde_json::from_str(json) {
        Ok(v) => v,
        Err(_) => return Err("Import failed.\n\nReason:\nInvalid configuration structure".to_string()),
    };

    // Check version compatibility
    let config_version = val.get("configVersion")
        .and_then(|v| v.as_i64())
        .ok_or_else(|| "Import failed.\n\nReason:\nConfiguration version is not supported.".to_string())?;
    
    if config_version != 1 {
        return Err("Import failed.\n\nReason:\nConfiguration version is not supported.".to_string());
    }

    // Check required fields
    if val.get("settings").is_none() {
        return Err("Import failed.\n\nReason:\nMissing required field: settings".to_string());
    }
    if val.get("pages").is_none() {
        return Err("Import failed.\n\nReason:\nMissing required field: pages".to_string());
    }
    if val.get("categories").is_none() {
        return Err("Import failed.\n\nReason:\nMissing required field: categories".to_string());
    }
    if val.get("actions").is_none() {
        return Err("Import failed.\n\nReason:\nMissing required field: actions".to_string());
    }

    // Full deserialization check
    let config: ExportedConfig = match serde_json::from_str(json) {
        Ok(cfg) => cfg,
        Err(_) => return Err("Import failed.\n\nReason:\nInvalid configuration structure".to_string()),
    };

    // 2. Create physical db.import_backup copy
    if db_path.exists() {
        let parent = db_path.parent().ok_or("No parent directory for database")?;
        let import_backup_path = parent.join("flowdeck.db.import_backup");
        let _ = std::fs::copy(db_path, &import_backup_path);
    }

    // 3. SQLite transaction block
    let tx = conn.transaction().map_err(|e| format!("Import failed. Reason:\nDatabase transaction error: {}", e))?;

    // Clear tables
    tx.execute("DELETE FROM actions;", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM categories;", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM pages;", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM settings WHERE key NOT IN ('desktop_id', 'allow_lan_connections', 'developer_mode', 'is_first_run');", []).map_err(|e| e.to_string())?;

    // Insert settings
    for s in config.settings {
        tx.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2);",
            rusqlite::params![s.key, s.value],
        ).map_err(|e| format!("Failed to insert setting: {}", e))?;
    }

    // Insert pages
    for p in config.pages {
        tx.execute(
            "INSERT INTO pages (id, name, order_index) VALUES (?1, ?2, ?3);",
            rusqlite::params![p.id, p.name, p.order_index],
        ).map_err(|e| format!("Failed to insert page: {}", e))?;
    }

    // Insert categories
    for c in config.categories {
        tx.execute(
            "INSERT INTO categories (id, page_id, name, order_index) VALUES (?1, ?2, ?3, ?4);",
            rusqlite::params![c.id, c.page_id, c.name, c.order_index],
        ).map_err(|e| format!("Failed to insert category: {}", e))?;
    }

    // Insert actions
    for a in config.actions {
        tx.execute(
            "INSERT INTO actions (id, category_id, name, action_type, payload, icon, order_index) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7);",
            rusqlite::params![a.id, a.category_id, a.name, a.action_type, a.payload, a.icon, a.order_index],
        ).map_err(|e| format!("Failed to insert action: {}", e))?;
    }

    tx.commit().map_err(|e| format!("Import failed. Reason:\nTransaction commit error: {}", e))?;

    Ok(())
}

pub fn reset_layout_to_defaults(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM actions;", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM categories;", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM pages;", []).map_err(|e| e.to_string())?;
    
    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('layout_version', '1');", []).map_err(|e| e.to_string())?;
    
    seed_default_layout_if_empty(conn)?;
    Ok(())
}

pub fn factory_reset(conn: &Connection) -> Result<(), String> {
    // Wipe completely and start fresh
    conn.execute("DELETE FROM actions;", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM categories;", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM pages;", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM trusted_devices;", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM transfer_history;", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM clipboard_history;", []).map_err(|e| e.to_string())?;
    
    // Reset settings except immutable ones like desktop_id
    conn.execute("DELETE FROM settings WHERE key NOT IN ('desktop_id');", []).map_err(|e| e.to_string())?;
    
    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('onboarding_completed', 'false');", []).map_err(|e| e.to_string())?;
    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('paired_device_id', '');", []).map_err(|e| e.to_string())?;
    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('layout_version', '1');", []).map_err(|e| e.to_string())?;
    
    seed_default_layout_if_empty(conn)?;
    Ok(())
}

pub fn get_downloads_dir(app_handle: &AppHandle) -> Result<std::path::PathBuf, String> {
    let download_dir = app_handle
        .path()
        .download_dir()
        .map_err(|e| format!("Failed to retrieve Downloads directory: {}", e))?;
    let flow_deck_dir = download_dir.join("Flow Deck");
    if !flow_deck_dir.exists() {
        std::fs::create_dir_all(&flow_deck_dir)
            .map_err(|e| format!("Failed to create Flow Deck downloads directory: {}", e))?;
        println!("[SERVER] Created Downloads/Flow Deck directory");
    }
    Ok(flow_deck_dir)
}
