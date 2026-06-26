$ErrorActionPreference = 'SilentlyContinue'
$apps = Get-StartApps | Where-Object { $_.Name -match "Calculator|Settings|Notepad|Weather" }
foreach ($app in $apps) {
    Write-Host "Name: $($app.Name) AppID: $($app.AppID)"
    if ($app.AppID -match "!") {
        $packageFamilyName = ($app.AppID -split "!")[0]
        $package = Get-AppxPackage -Name $packageFamilyName
        if ($package) {
            $manifestPath = Join-Path $package.InstallLocation "AppxManifest.xml"
            if (Test-Path $manifestPath) {
                [xml]$manifest = Get-Content $manifestPath
                $logo = $manifest.Package.Properties.Logo
                $logoPath = Join-Path $package.InstallLocation $logo
                Write-Host "  Logo Path: $logoPath"
                if (Test-Path $logoPath) {
                    Write-Host "  Logo exists!"
                } else {
                    Write-Host "  Logo does NOT exist at $logoPath"
                }
            }
        }
    }
}
