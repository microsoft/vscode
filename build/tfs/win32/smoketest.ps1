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
$env:HOME = $env:USERPROFILE
"machine monacotools.visualstudio.com password ${vsoPAT}" | Out-File "$env:USERPROFILE\_netrc" -Encoding ASCII

# Set the right architecture
$env:npm_config_arch = "$arch"

step "Install dependencies" {
	exec { & npm install }
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

step "Run smoke test" {
	$Screenshots = "$env:AGENT_BUILDDIRECTORY\smoketest-screenshots"
	Remove-Item -Recurse -Force -ErrorAction Ignore $Screenshots

	exec { & Push-Location test\smoke }
	exec { & .\node_modules\.bin/mocha --build "$env:AGENT_BUILDDIRECTORY\VSCode-win32-$global:arch\Code - Insiders.exe" --screenshots "$Screenshots" }
	exec { & Pop-Location }
}

done