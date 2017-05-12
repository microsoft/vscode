Param(
   [string]$mixinPassword
)

. .\build\tfs\win32\lib.ps1

STEP "npm install"
exec { & .\scripts\npm.bat install }

STEP "mixin repository from vscode-distro"
$env:VSCODE_MIXIN_PASSWORD = $mixinPassword
exec { & npm run gulp -- mixin }

STEP "build minified win32"
exec { & npm run gulp -- --max_old_space_size=4096 vscode-win32-min }

STEP "run unit tests"
exec { & .\scripts\test.bat --build --reporter dot }

# STEP "run integration tests"
# exec { & .\scripts\test-integration.bat }