Add-Type -AssemblyName System.Drawing
$pngPath = "c:\Users\nminh\Desktop\vibe - code\omni\runtime\resources\icon.png"
$icoPath = "c:\Users\nminh\Desktop\vibe - code\omni\icon.ico"

# An ICO file can also just wrap a 256x256 PNG directly according to ICO specs!
# Let's write standard ICO header for PNG:
# ICO header: 6 bytes (0x0000, 0x0001 (icon), 0x0001 (1 image))
# Dir entry: 16 bytes:
# width (0 = 256), height (0 = 256), colors (0), reserved (0), planes (1), bpp (32), size (4 bytes), offset (4 bytes: 22)
# Followed immediately by raw PNG bytes!
$pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
$size = $pngBytes.Length

$ico = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter($ico)
$w.Write([UInt16]0) # Reserved
$w.Write([UInt16]1) # Type 1 = Icon
$w.Write([UInt16]1) # 1 image

# Dir Entry
$w.Write([Byte]0) # Width: 0 = 256
$w.Write([Byte]0) # Height: 0 = 256
$w.Write([Byte]0) # Colors: 0
$w.Write([Byte]0) # Reserved
$w.Write([UInt16]1) # Color planes
$w.Write([UInt16]32) # Bits per pixel
$w.Write([UInt32]$size) # Image size in bytes
$w.Write([UInt32]22) # Offset of image data (6 + 16 = 22)

# Raw PNG data
$w.Write($pngBytes)
$w.Flush()

[System.IO.File]::WriteAllBytes($icoPath, $ico.ToArray())
$w.Close()
$ico.Close()

Write-Host "ICO created successfully: $(Test-Path $icoPath), Size: $((Get-Item $icoPath).Length) bytes"
