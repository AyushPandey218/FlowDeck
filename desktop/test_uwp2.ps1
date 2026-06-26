$ErrorActionPreference = 'SilentlyContinue'
$apps = Get-StartApps | Where-Object { $_.Name -match "Calculator|Settings|Notepad" }
foreach ($app in $apps) {
    if ($app.AppID -match "!") {
        $packageFamilyName = ($app.AppID -split "_")[0]
        Write-Host "Searching for package: $packageFamilyName"
        $package = Get-AppxPackage -Name $packageFamilyName
        if ($package) {
            $manifestPath = Join-Path $package.InstallLocation "AppxManifest.xml"
            if (Test-Path $manifestPath) {
                [xml]$manifest = Get-Content $manifestPath
                $logo = $manifest.Package.Properties.Logo
                Write-Host "  Logo: $logo"
                
                # UWP often stores files as scale-100, scale-125, etc.
                # Let's list files in the asset directory
                $assetDir = Join-Path $package.InstallLocation (Split-Path $logo)
                $basename = [System.IO.Path]::GetFileNameWithoutExtension($logo)
                $files = Get-ChildItem -Path $assetDir -Filter "$basename*.png"
                if ($files) {
                    Write-Host "  Found logo file: $($files[0].FullName)"
                }
            }
        }
    }
}
