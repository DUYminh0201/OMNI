Add-Type -AssemblyName System.Drawing

function Create-MultiResIcon($pngPath, $icoPath) {
    $src = [System.Drawing.Bitmap]::FromFile($pngPath)
    $sizes = @(16, 24, 32, 48, 64, 128, 256)
    $images = @()

    foreach ($sz in $sizes) {
        $bmp = New-Object System.Drawing.Bitmap $sz, $sz
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.DrawImage($src, 0, 0, $sz, $sz)
        $g.Dispose()

        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $images += ,@($sz, $ms.ToArray())
        $bmp.Dispose()
    }
    $src.Dispose()

    $fs = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
    $bw = New-Object System.IO.BinaryWriter($fs)

    # ICONDIR
    $bw.Write([UInt16]0) # Reserved
    $bw.Write([UInt16]1) # Type = 1 (icon)
    $bw.Write([UInt16]$images.Count) # Count

    $offset = 6 + ($images.Count * 16)
    foreach ($item in $images) {
        $sz = $item[0]
        $bytes = $item[1]
        $w = if ($sz -eq 256) { [Byte]0 } else { [Byte]$sz }
        $h = if ($sz -eq 256) { [Byte]0 } else { [Byte]$sz }
        $bw.Write($w)
        $bw.Write($h)
        $bw.Write([Byte]0) # Colors
        $bw.Write([Byte]0) # Reserved
        $bw.Write([UInt16]1) # Planes
        $bw.Write([UInt16]32) # Bit count
        $bw.Write([UInt32]$bytes.Length) # Size
        $bw.Write([UInt32]$offset) # Offset
        $offset += $bytes.Length
    }

    foreach ($item in $images) {
        $bw.Write($item[1])
    }

    $bw.Flush()
    $bw.Close()
    $fs.Close()
    Write-Host "Multi-res ICO created at $icoPath ($((Get-Item $icoPath).Length) bytes)"
}

Create-MultiResIcon "c:\Users\nminh\Desktop\vibe - code\omni\runtime\resources\icon.png" "c:\Users\nminh\Desktop\vibe - code\omni\app_icon.ico"
