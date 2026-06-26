# Flow Deck: Database Schema

Flow Deck stores user layouts, custom script triggers, settings, and authorization states in a local SQLite database managed by the Tauri Rust backend.

## Schema Diagram (Conceptual)

```
   ┌─────────────┐
   │  settings   │ (Key-Value configuration parameters)
   └─────────────┘

   ┌───────────────────┐
   │  trusted_devices  │ (Paired mobile devices authorization list)
   └───────────────────┘

   ┌──────────┐
   │  pages   │ (Grid pages)
   └────┬─────┘
        │ 1
        │
        │ *
   ┌────▼───────┐
   │ categories │ (Layout grouping categories inside pages)
   └────┬───────┘
        │ 1
        │
        │ *
   ┌────▼───────┐
   │  actions   │ (Configured execution triggers)
   └────────────┘
```

---

## Tables Definition

### 1. `settings`
Used to persist global configuration toggles such as default host port, dark mode preferences, and automatic startup settings.
```sql
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

### 2. `trusted_devices`
Holds records of all paired mobile devices. Keeps tracks of pairing status and active tokens to authenticate incoming network payloads.
```sql
CREATE TABLE IF NOT EXISTS trusted_devices (
    device_id TEXT PRIMARY KEY,
    device_name TEXT NOT NULL,
    pairing_token TEXT NOT NULL,
    paired_at INTEGER NOT NULL,      -- Epoch timestamp
    last_active INTEGER NOT NULL,    -- Epoch timestamp
    is_blocked INTEGER DEFAULT 0     -- Binary flag (0 = active, 1 = blocked)
);
```

### 3. `pages`
The mobile dashboard UI is organized in grid pages. This table keeps record of page names and custom display order.
```sql
CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    order_index INTEGER NOT NULL
);
```

### 4. `categories`
Pages contain categories to group related buttons (e.g. "Gaming", "Work Utilities", "Media").
```sql
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL,
    name TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    FOREIGN KEY(page_id) REFERENCES pages(id) ON DELETE CASCADE
);
```

### 5. `actions`
The individual launcher configurations (buttons) map to rows in this table.
```sql
CREATE TABLE IF NOT EXISTS actions (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL,
    name TEXT NOT NULL,
    action_type TEXT NOT NULL,       -- Enumerated strings: 'APP', 'GAME', 'FOLDER', 'URL', 'POWERSHELL', 'BATCH', 'CMD', 'MEDIA', 'SYSTEM'
    payload TEXT NOT NULL,           -- Direct instruction payload (e.g., path to executable, url string, script lines)
    icon_data TEXT,                  -- Base64 or local filepath vector definition
    order_index INTEGER NOT NULL,
    FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
);
```

### 6. `clipboard_history`
Stores synced clipboard entries on the local desktop device with direction badges and source identifiers. High-performance index/deduplication is handled via `content_hash`.
```sql
CREATE TABLE IF NOT EXISTS clipboard_history (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    direction TEXT NOT NULL,         -- 'desktop_to_mobile' or 'mobile_to_desktop'
    is_local INTEGER NOT NULL DEFAULT 0,  -- 1 if generated locally, 0 if received
    source_device_id TEXT NOT NULL,  -- Device ID where the copy action originated
    created_at INTEGER NOT NULL      -- Epoch timestamp in milliseconds
);
```

---

## SQLite Performance & Operational Rules
1. **Foreign Key Enforcement**: SQLite does not enable foreign key constraints by default. The Rust database helper must execute `PRAGMA foreign_keys = ON;` upon establishing connection pools.
2. **Atomic Upgrades**: Migration steps will be checked systematically via a schema-version table or basic SQLite checks to prevent breaking schema alterations.

