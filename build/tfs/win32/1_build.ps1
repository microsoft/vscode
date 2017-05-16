Param(
   [string]$mixinPassword,
   [string]$vsoPAT
)

. .\build\tfs\win32\lib.ps1

# In order to get _netrc to work, we need a HOME variable setup
$env:HOME=$env:USERPROFILE

# Create a _netrc file to download distro dependencies
@"
machine monacotools.visualstudio.com
password ${vsoPAT}
"@ | Out-File "$env:USERPROFILE\_netrc" -Encoding ASCII

STEP "Install dependencies"
exec { & .\scripts\npm.bat install }

STEP "Mix in repository from vscode-distro"
$env:VSCODE_MIXIN_PASSWORD = $mixinPassword
exec { & npm run gulp -- mixin }

STEP "Install distro dependencies"
exec { & npm run install-distro }

STEP "Build minified"
exec { & npm run gulp -- --max_old_space_size=4096 vscode-win32-min }

STEP "Run unit tests"
exec { & .\scripts\test.bat --build --reporter dot }

# STEP "Run integration tests"
# exec { & .\scripts\test-integration.bat }