$target = 'c:\vscode\scripts\pr-automation\Check-Prerequisites.ps1'
[ref]$tokens = $null
[ref]$errors = $null
[Management.Automation.Language.Parser]::ParseFile($target, [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Value) {
    $errors.Value | ForEach-Object { Write-Host $_.Message -ForegroundColor Yellow }
    exit 1
} else {
    Write-Host 'No parse errors' -ForegroundColor Green
}
