use std::process::Command;
use std::os::windows::process::CommandExt;
use serde::{Serialize, Deserialize};
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InstalledApp {
    pub name: String,
    pub path: String,
    pub icon: String, // Base64 data URL
    pub category: String,
}

pub struct AppCatalog {
    pub apps: Mutex<Vec<InstalledApp>>,
}

impl AppCatalog {
    pub fn new() -> Self {
        Self {
            apps: Mutex::new(Vec::new()),
        }
    }
}

fn categorize_app(name: &str, path: &str) -> String {
    let name_lower = name.to_lowercase();
    let path_lower = path.to_lowercase();

    if name_lower.contains("chrome")
        || name_lower.contains("edge")
        || name_lower.contains("firefox")
        || name_lower.contains("opera")
        || name_lower.contains("brave")
        || name_lower.contains("browser")
    {
        "Browsers".to_string()
    } else if path_lower.contains("steam")
        || path_lower.contains("epic games")
        || path_lower.contains("riot games")
        || name_lower.contains("game")
        || name_lower.contains("minecraft")
        || name_lower.contains("gog galaxy")
    {
        "Games".to_string()
    } else if name_lower.contains("discord")
        || name_lower.contains("slack")
        || name_lower.contains("zoom")
        || name_lower.contains("teams")
        || name_lower.contains("telegram")
        || name_lower.contains("whatsapp")
    {
        "Social & Communication".to_string()
    } else if name_lower.contains("code")
        || name_lower.contains("visual studio")
        || name_lower.contains("intellij")
        || name_lower.contains("pycharm")
        || name_lower.contains("git")
        || name_lower.contains("sublime")
        || name_lower.contains("postman")
        || name_lower.contains("terminal")
        || name_lower.contains("powershell")
        || name_lower.contains("command prompt")
    {
        "Development".to_string()
    } else if name_lower.contains("spotify")
        || name_lower.contains("obs")
        || name_lower.contains("vlc")
        || name_lower.contains("music")
        || name_lower.contains("player")
        || name_lower.contains("audacity")
        || name_lower.contains("premiere")
        || name_lower.contains("da vinci")
    {
        "Media & Entertainment".to_string()
    } else if name_lower.contains("word")
        || name_lower.contains("excel")
        || name_lower.contains("powerpoint")
        || name_lower.contains("outlook")
        || name_lower.contains("office")
        || name_lower.contains("notion")
        || name_lower.contains("adobe")
        || name_lower.contains("acrobat")
        || name_lower.contains("photoshop")
        || name_lower.contains("illustrator")
        || name_lower.contains("figma")
    {
        "Productivity & Office".to_string()
    } else {
        "Utilities".to_string()
    }
}

#[derive(Deserialize)]
struct RawApp {
    name: String,
    path: String,
    icon: String,
}

pub fn scan_installed_applications() -> Vec<InstalledApp> {
    let script = r#"
        $ErrorActionPreference = 'SilentlyContinue'
        Add-Type -AssemblyName System.Drawing
        $shell = New-Object -ComObject WScript.Shell
        $apps = @()
        $pathsSeen = New-Object System.Collections.Generic.HashSet[string]

        # 1. Scan Start Menu Shortcuts
        $locations = @(
            "$env:ProgramData\Microsoft\Windows\Start Menu\Programs",
            "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
        )
        foreach ($loc in $locations) {
            if (Test-Path $loc) {
                Get-ChildItem -Path $loc -Filter *.lnk -Recurse | ForEach-Object {
                    try {
                        $shortcut = $shell.CreateShortcut($_.FullName)
                        $target = $shortcut.TargetPath
                        if ($target -and $target.EndsWith(".exe") -and (Test-Path $target)) {
                            $norm = $target.ToLower()
                            if (-not $pathsSeen.Contains($norm)) {
                                $pathsSeen.Add($norm) | Out-Null
                                
                                $iconBase64 = ""
                                try {
                                    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($target)
                                    if ($icon) {
                                        $bitmap = $icon.ToBitmap()
                                        $ms = New-Object System.IO.MemoryStream
                                        $bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                                        $iconBase64 = "data:image/png;base64," + [Convert]::ToBase64String($ms.ToArray())
                                        $bitmap.Dispose()
                                        $icon.Dispose()
                                        $ms.Dispose()
                                    }
                                } catch {}
                                
                                $apps += [PSCustomObject]@{
                                    name = $_.BaseName
                                    path = $target
                                    icon = $iconBase64
                                }
                            }
                        }
                    } catch {}
                }
            }
        }

        # 2. Scan Registry
        $regPaths = @(
            "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
            "HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
            "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"
        )
        foreach ($regPath in $regPaths) {
            if (Test-Path (Split-Path $regPath)) {
                Get-ItemProperty $regPath | ForEach-Object {
                    try {
                        $name = $_.DisplayName
                        if (-not $name) { return }
                        
                        $exePath = ""
                        if ($_.DisplayIcon -and $_.DisplayIcon -like "*.exe*") {
                            $parts = $_.DisplayIcon -split ','
                            $potentialPath = $parts[0].Trim('"', ' ')
                            if ($potentialPath -like "*.exe" -and (Test-Path $potentialPath)) {
                                $exePath = $potentialPath
                            }
                        }
                        
                        if (-not $exePath -and $_.InstallLocation -and (Test-Path $_.InstallLocation)) {
                            $cleanedName = $name -replace '[^a-zA-Z0-9]', ''
                            $files = Get-ChildItem $_.InstallLocation -Filter *.exe
                            foreach ($file in $files) {
                                if ($file.BaseName -like "*$cleanedName*" -or $cleanedName -like "*$($file.BaseName)*") {
                                    $exePath = $file.FullName
                                    break
                                }
                            }
                        }
                        
                        if ($exePath -and $exePath.EndsWith(".exe")) {
                            $norm = $exePath.ToLower()
                            if (-not $pathsSeen.Contains($norm)) {
                                $pathsSeen.Add($norm) | Out-Null
                                
                                $iconBase64 = ""
                                try {
                                    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($exePath)
                                    if ($icon) {
                                        $bitmap = $icon.ToBitmap()
                                        $ms = New-Object System.IO.MemoryStream
                                        $bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                                        $iconBase64 = "data:image/png;base64," + [Convert]::ToBase64String($ms.ToArray())
                                        $bitmap.Dispose()
                                        $icon.Dispose()
                                        $ms.Dispose()
                                    }
                                } catch {}
                                
                                $apps += [PSCustomObject]@{
                                    name = $name
                                    path = $exePath
                                    icon = $iconBase64
                                }
                            }
                        }
                    } catch {}
                }
            }
        }

        # 3. Scan UWP / Windows Store Apps using Get-StartApps
        try {
            $startApps = Get-StartApps
            foreach ($app in $startApps) {
                if (-not $app.AppID) { continue }
                
                # Exclude if it's an exe we already processed
                if ($app.AppID -like "*.exe" -and $pathsSeen.Contains($app.AppID.ToLower())) {
                    continue
                }
                
                $shellPath = "shell:AppsFolder\$($app.AppID)"
                $norm = $shellPath.ToLower()
                if (-not $pathsSeen.Contains($norm)) {
                    $pathsSeen.Add($norm) | Out-Null
                    
                    $iconBase64 = ""
                    try {
                        if ($app.AppID -match "!") {
                            $packageFamilyName = ($app.AppID -split "_")[0]
                            $package = Get-AppxPackage -Name $packageFamilyName -ErrorAction SilentlyContinue
                            if ($package) {
                                $manifestPath = Join-Path $package.InstallLocation "AppxManifest.xml"
                                if (Test-Path $manifestPath) {
                                    [xml]$manifest = Get-Content $manifestPath -ErrorAction SilentlyContinue
                                    $logo = $manifest.Package.Properties.Logo
                                    if ($logo) {
                                        $assetDir = Join-Path $package.InstallLocation (Split-Path $logo)
                                        $basename = [System.IO.Path]::GetFileNameWithoutExtension($logo)
                                        $files = Get-ChildItem -Path $assetDir -Filter "$basename*.png" -ErrorAction SilentlyContinue
                                        
                                        # Prefer a non-contrast scale-100 or scale-200 logo
                                        $bestLogo = $null
                                        if ($files) {
                                            $bestLogo = $files[0].FullName
                                            foreach ($file in $files) {
                                                if ($file.FullName -match "scale-200") {
                                                    $bestLogo = $file.FullName
                                                }
                                            }
                                            
                                            $bytes = [System.IO.File]::ReadAllBytes($bestLogo)
                                            $iconBase64 = "data:image/png;base64," + [Convert]::ToBase64String($bytes)
                                        }
                                    }
                                }
                            }
                        }
                    } catch {}
                    
                    $apps += [PSCustomObject]@{
                        name = $app.Name
                        path = $shellPath
                        icon = $iconBase64
                    }
                }
            }
        } catch {}

        if ($apps.Count -gt 0) {
            $apps | ConvertTo-Json -Compress
        } else {
            "[]"
        }
    "#;

    let output = Command::new("powershell")
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let json_str = String::from_utf8_lossy(&out.stdout);
            let raw_apps: Result<Vec<RawApp>, _> = serde_json::from_str(&json_str);
            match raw_apps {
                Ok(raw) => {
                    raw.into_iter()
                        .map(|a| {
                            let cat = categorize_app(&a.name, &a.path);
                            InstalledApp {
                                name: a.name,
                                path: a.path,
                                icon: a.icon,
                                category: cat,
                            }
                        })
                        .collect()
                }
                Err(e) => {
                    eprintln!("Failed to parse apps json: {}", e);
                    Vec::new()
                }
            }
        }
        Ok(out) => {
            let err = String::from_utf8_lossy(&out.stderr);
            eprintln!("Powershell execution failed: {}", err);
            Vec::new()
        }
        Err(e) => {
            eprintln!("Failed to spawn powershell: {}", e);
            Vec::new()
        }
    }
}

#[tauri::command]
pub fn get_installed_applications(
    catalog: State<'_, AppCatalog>,
) -> Result<Vec<InstalledApp>, String> {
    let apps = catalog.apps.lock().map_err(|e| e.to_string())?;
    Ok(apps.clone())
}

#[tauri::command]
pub fn refresh_installed_applications(
    catalog: State<'_, AppCatalog>,
) -> Result<Vec<InstalledApp>, String> {
    let scanned = scan_installed_applications();
    let mut apps = catalog.apps.lock().map_err(|e| e.to_string())?;
    *apps = scanned.clone();
    Ok(scanned)
}

#[tauri::command]
pub fn set_run_on_startup(enabled: bool) -> Result<(), String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to get current executable path: {}", e))?;
    let exe_str = exe_path.to_string_lossy();
    
    let script = if enabled {
        format!(
            "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'FlowDeck' -Value '\"{}\"'",
            exe_str
        )
    } else {
        "Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'FlowDeck' -ErrorAction SilentlyContinue".to_string()
    };
    
    let output = Command::new("powershell")
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
        .output()
        .map_err(|e| format!("Failed to execute powershell: {}", e))?;
        
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Registry command failed: {}", err));
    }
    
    Ok(())
}
