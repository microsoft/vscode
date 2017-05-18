Param(
   [string]$mixinPassword,
   [string]$vsoPAT
)

. .\scripts\env.ps1
. .\build\tfs\win32\lib.ps1

# Create a _netrc file to download distro dependencies
# In order to get _netrc to work, we need a HOME variable setup
$env:HOME=$env:USERPROFILE
"machine monacotools.visualstudio.com password ${vsoPAT}" | Out-File "$env:USERPROFILE\_netrc" -Encoding ASCII

step "Install dependencies" {
  exec { & npm install --arch=ia32 }
}

$env:VSCODE_MIXIN_PASSWORD = $mixinPassword
step "Mix in repository from vscode-distro" {
  exec { & npm run gulp -- mixin }
}

step "Get Electron" {
  exec { & npm run gulp -- electron-ia32 }
}

step "Install distro dependencies" {
  exec { & node build\tfs\common\installDistro.js }
}

step "Build minified" {
  exec { & npm run gulp -- --max_old_space_size=4096 vscode-win32-ia32-min }
}

step "Run unit tests" {
  exec { & .\scripts\test.bat --build --reporter dot }
}

# step "Run integration tests" {
#   exec { & .\scripts\test-integration.bat }
# }

done