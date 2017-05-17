Param(
   [string]$mixinPassword,
   [string]$vsoPAT
)

. .\build\tfs\win32\lib.ps1

# In order to get _netrc to work, we need a HOME variable setup
$env:HOME=$env:USERPROFILE

$env:npm_config_disturl="https://atom.io/download/electron"
$env:npm_config_target="1.6.6"
$env:npm_config_runtime="electron"
$env:npm_config_cache="$HOME/.npm-electron"
mkdir -p "$env:npm_config_cache"

# Create a _netrc file to download distro dependencies
"machine monacotools.visualstudio.com password ${vsoPAT}" | Out-File "$env:USERPROFILE\_netrc" -Encoding ASCII

step "Install dependencies" {
  exec { & npm install }
}

$env:VSCODE_MIXIN_PASSWORD = $mixinPassword
step "Mix in repository from vscode-distro" {
  exec { & npm run gulp -- mixin }
}

step "Install distro dependencies" {
  exec { & npm run install-distro }
}

step "Build minified" {
  exec { & npm run gulp -- --max_old_space_size=4096 vscode-win32-min }
}

step "Run unit tests" {
  exec { & .\scripts\test.bat --build --reporter dot }
}

# step "Run integration tests" {
#   exec { & .\scripts\test-integration.bat }
# }

done