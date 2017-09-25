Param(
  [string]$arch,
  [string]$mixinPassword,
  [string]$vsoPAT
)

. .\build\tfs\win32\node.ps1
. .\scripts\env.ps1
. .\build\tfs\win32\lib.ps1

# Create a _netrc file to download distro dependencies
# In order to get _netrc to work, we need a HOME variable setup
"machine monacotools.visualstudio.com password ${vsoPAT}" | Out-File "$env:HOME\_netrc" -Encoding ASCII

# Set the right architecture
$env:npm_config_arch="$arch"

step "Install dependencies" {
  exec { & npm install }
}

step "Hygiene" {
  exec { & npm run gulp -- hygiene }
}

$env:VSCODE_MIXIN_PASSWORD = $mixinPassword
step "Mix in repository from vscode-distro" {
  exec { & npm run gulp -- mixin }
}

step "Get Electron" {
  exec { & npm run gulp -- "electron-$global:arch" }
}

step "Install distro dependencies" {
  exec { & node build\tfs\common\installDistro.js }
}

step "Build minified" {
  exec { & npm run gulp -- "vscode-win32-$global:arch-min" }
}

# step "Create loader snapshot" {
#   exec { & 	node build\lib\snapshotLoader.js --arch=$global:arch }
# }

step "Run unit tests" {
  exec { & .\scripts\test.bat --build --reporter dot }
}

# step "Run integration tests" {
#   exec { & .\scripts\test-integration.bat }
# }

done
