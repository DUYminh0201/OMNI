$ErrorActionPreference = "Stop"

$workspace = "c:\Users\nminh\Desktop\vibe - code\omni"
$origInstaller = "C:\Users\nminh\Downloads\Omnira-Studio-Setup-1.2.7.exe"
$sevenZip = "C:\Users\nminh\AppData\Local\electron-builder\cache\7zip@1.0.0\7zip-win-x64-a34pt\bin\7za.exe"
$makensis = "C:\Users\nminh\AppData\Local\electron-builder\cache\nsis-3.0.4.1\nsis-3.0.4.1-1mx3n\makensis.exe"
$mktSrc = if (Test-Path "$workspace\my app\resources\mkt-flow") { "$workspace\my app\resources\mkt-flow" } elseif (Test-Path "$workspace\mkt-flow") { "$workspace\mkt-flow" } else { "C:\Users\nminh\Desktop\vibe - code\MKT FLOW" }
$asarCmd = if (Test-Path "$mktSrc\node_modules\.bin\asar.cmd") { "$mktSrc\node_modules\.bin\asar.cmd" } else { "npx asar" }

$staging = "$workspace\staging"
$tempBuild = "$workspace\temp_build"

Write-Host "1. Chuan bi thu muc staging & temp"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
if (Test-Path $tempBuild) { Remove-Item $tempBuild -Recurse -Force }
New-Item -ItemType Directory -Path "$staging\resources" -Force | Out-Null
New-Item -ItemType Directory -Path "$tempBuild" -Force | Out-Null

Write-Host "2. Trich xuat file goc tu installer"
& $sevenZip x "$origInstaller" "-o$staging" -y "-x!resources\app.asar"
& $sevenZip e "$origInstaller" "resources\app.asar" "-o$tempBuild" -y
& $sevenZip x "$origInstaller" "resources\app.asar.unpacked\*" "-o$tempBuild" -y
if (Test-Path "$tempBuild\resources\app.asar.unpacked") {
    Move-Item "$tempBuild\resources\app.asar.unpacked" "$tempBuild\app.asar.unpacked" -Force
}

Write-Host "3. Sao chep runtime node.exe & icon"
Copy-Item "$workspace\runtime\node.exe" "$staging\node.exe" -Force
Copy-Item "$workspace\app_icon.ico" "$staging\resources\app_icon.ico" -Force
Copy-Item "$workspace\runtime\resources\icon.png" "$staging\resources\icon.png" -Force

Write-Host "4. Cap nhat va dong goi app.asar"
& $asarCmd extract "$tempBuild\app.asar" "$tempBuild\extracted_app"
if ($LASTEXITCODE -ne 0) { throw "asar extract failed" }

Copy-Item "$workspace\my app\out" "$tempBuild\extracted_app" -Recurse -Force
& $asarCmd pack "$tempBuild\extracted_app" "$staging\resources\app.asar" --unpack "{**/*.node,**/better-sqlite3/**,**/ffmpeg-static/**,**/ffprobe-static/**}"
if ($LASTEXITCODE -ne 0) { throw "asar pack failed" }

Write-Host "5. Chuan bi mkt-flow tu $mktSrc"
$mktDest = "$staging\resources\mkt-flow"
New-Item -ItemType Directory -Path $mktDest -Force | Out-Null
Copy-Item "$mktSrc\apps" "$mktDest\apps" -Recurse -Force
Copy-Item "$mktSrc\packages" "$mktDest\packages" -Recurse -Force
Copy-Item "$mktSrc\package.json" "$mktDest\package.json" -Force

New-Item -ItemType Directory -Path "$mktDest\runtime\bin" -Force | Out-Null
New-Item -ItemType Directory -Path "$mktDest\runtime\database" -Force | Out-Null
New-Item -ItemType Directory -Path "$mktDest\runtime\temp" -Force | Out-Null
New-Item -ItemType Directory -Path "$mktDest\runtime\uploads" -Force | Out-Null

# KIỂM TRA BẢO MẬT & DỮ LIỆU RÁC TRƯỚC KHI COPY (Fail-Fast Guards):
$forbiddenPatterns = @("keys.json*", "*.key", "*.pem", ".env*")
foreach ($pat in $forbiddenPatterns) {
    $found = Get-ChildItem "$mktSrc\runtime" -Recurse -Filter $pat -ErrorAction SilentlyContinue
    if ($found) {
        throw "SECURITY ALERT: File nhay cam duoc tim thay trong $mktSrc\runtime: $($found.FullName -join ', '). Build bi huy de bao ve secret!"
    }
}

# Kiểm tra thư mục uploads nguồn: không được chứa video/file rác làm phình bộ cài
$sourceUploadFiles = Get-ChildItem "$mktSrc\runtime\uploads" -Recurse -File -Exclude ".gitkeep" -ErrorAction SilentlyContinue
if ($sourceUploadFiles) {
    $totalMB = [math]::Round(($sourceUploadFiles | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
    throw "BUILD ERROR: Phat hien $totalMB MB file uploads trong $mktSrc\runtime\uploads. Hay don dep truoc khi build!"
}

# Copy database mẫu (chỉ model_registry và nvidia models tĩnh, không copy file nhạy cảm)
Get-ChildItem "$mktSrc\runtime\database\*" -Exclude "keys.json*","*.log" | Copy-Item -Destination "$mktDest\runtime\database" -Force
if (Test-Path "$mktDest\runtime\database\keys.json") {
    Remove-Item "$mktDest\runtime\database\keys.json" -Force
    throw "SECURITY ALERT: keys.json xuat hien trong staging! Build bi huy."
}

if (Test-Path "$mktSrc\runtime\bin") {
    Copy-Item "$mktSrc\runtime\bin\*" "$mktDest\runtime\bin" -Force
}

Write-Host "6. Sao chep node_modules cho mkt-flow"
robocopy "$mktSrc\node_modules" "$mktDest\node_modules" /E /MT:16 /R:1 /W:1 /NFL /NDL /NP /NJH /NJS | Out-Null

Write-Host "7. Nen toan bo du lieu sang app.7z"
if (Test-Path "$workspace\app.7z") { Remove-Item "$workspace\app.7z" -Force }
& $sevenZip a -t7z -mx=5 -ms=on "$workspace\app.7z" "$staging\*"

Write-Host "8. Bien dich NSIS Installer"
& $makensis "$workspace\installer.nsi"

Write-Host "9. Dat file setup ra Desktop"
Copy-Item "$workspace\Omnira-Studio-Setup-1.2.7.exe" "C:\Users\nminh\Desktop\Omnira-Studio-Setup-1.2.7.exe" -Force

Write-Host "10. Don dep thu muc tam"
Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $tempBuild -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$workspace\test_asar_fix" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$workspace\check_asar" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$workspace\app.7z" -Force -ErrorAction SilentlyContinue

Write-Host "BUILD SUCCESS!"
