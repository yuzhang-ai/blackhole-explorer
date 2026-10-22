param([int]$Port = 41731)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$prefix = "http://127.0.0.1:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Host "Could not listen on $prefix"
  Write-Host $_
  Write-Host "If the port is in use, edit PORT in start.bat and the -Port value."
  exit 1
}

$open = "http://127.0.0.1:$Port/?fps=1"
Write-Host "Serving $root"
Write-Host "Hero view: $open"
Write-Host "Close this window to stop."
Start-Process $open

$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.png'  = 'image/png'
  '.svg'  = 'image/svg+xml'
  '.webp' = 'image/webp'
  '.webm' = 'video/webm'
  '.json' = 'application/json'
  '.wasm' = 'application/wasm'
  '.ico'  = 'image/x-icon'
  '.txt'  = 'text/plain; charset=utf-8'
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($rel -eq '/') { $rel = '/index.html' }
    $rel = $rel.TrimStart('/')
    $rel = $rel.Replace('/', [IO.Path]::DirectorySeparatorChar)
    if ($rel.Contains('..')) { throw 'bad path' }
    $path = Join-Path $root $rel
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      $res.StatusCode = 404
      $missing = [Text.Encoding]::UTF8.GetBytes('Not found')
      $res.ContentType = 'text/plain; charset=utf-8'
      $res.ContentLength64 = $missing.Length
      $res.OutputStream.Write($missing, 0, $missing.Length)
    } else {
      $ext = [IO.Path]::GetExtension($path).ToLowerInvariant()
      if ($types.ContainsKey($ext)) {
        $res.ContentType = $types[$ext]
      } else {
        $res.ContentType = 'application/octet-stream'
      }
      $bytes = [IO.File]::ReadAllBytes($path)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.OutputStream.Close()
  }
}
