serve.ps1
A minimal, reusable PowerShell HTTP server for this project.
Usage (from repo root):
  .\serve.ps1 [-Port 8000]

This script does not require Python or Node. It opens an HttpListener on localhost
and serves files from the script's directory (defaults to the repo root).
#>

param(
    [int]$Port = 8000,
    [string]$Root = (Split-Path -Path $MyInvocation.MyCommand.Definition -Parent)
)

$prefix = "http://localhost:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

function Get-MimeType($file) {
    $ext = [System.IO.Path]::GetExtension($file).ToLower()
    switch ($ext) {
        '.html' { 'text/html' }
        '.htm'  { 'text/html' }
        '.css'  { 'text/css' }
        '.js'   { 'application/javascript' }
        '.json' { 'application/json' }
        '.png'  { 'image/png' }
        '.jpg'  { 'image/jpeg' }
        '.jpeg' { 'image/jpeg' }
        '.gif'  { 'image/gif' }
        '.svg'  { 'image/svg+xml' }
        default { 'application/octet-stream' }
    }
}

try {
    $listener.Start()
    Write-Output "Serving $Root at $prefix"
    Write-Output "Press Ctrl+C in this window to stop the server."

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $req = $context.Request

        $path = $req.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrEmpty($path)) { $path = 'index.html' }

        # Prevent path traversal
        $safePath = [System.IO.Path]::GetFullPath((Join-Path $Root $path))
        if (-not $safePath.StartsWith((Get-Item $Root).FullName, [System.StringComparison]::OrdinalIgnoreCase)) {
            $context.Response.StatusCode = 403
            $data = [System.Text.Encoding]::UTF8.GetBytes('403 - Forbidden')
            $context.Response.OutputStream.Write($data,0,$data.Length)
            $context.Response.Close()
            continue
        }

        if (Test-Path $safePath) {
            try {
                $bytes = [System.IO.File]::ReadAllBytes($safePath)
                $mime = Get-MimeType $safePath
                $context.Response.ContentType = $mime
                $context.Response.ContentLength64 = $bytes.Length
                $context.Response.OutputStream.Write($bytes,0,$bytes.Length)
            } catch {
                $context.Response.StatusCode = 500
                $msg = "500 - Internal Server Error: $($_.Exception.Message)"
                $data = [System.Text.Encoding]::UTF8.GetBytes($msg)
                $context.Response.OutputStream.Write($data,0,$data.Length)
            }
        } else {
            $context.Response.StatusCode = 404
            $data = [System.Text.Encoding]::UTF8.GetBytes('404 - Not Found')
            $context.Response.OutputStream.Write($data,0,$data.Length)
        }
        $context.Response.Close()
    }
} catch {
    Write-Error "Server error: $($_.Exception.Message)"
} finally {
    if ($listener.IsListening) { $listener.Stop() }
}
