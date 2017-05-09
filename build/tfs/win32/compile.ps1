. .\build\tfs\win32\lib.ps1

# set agent specific npm cache
if (Test-Path env:AGENT_WORKFOLDER) {
	$env:npm_config_cache = "${env:AGENT_WORKFOLDER}\npm-cache"
}

# npm install
exec { & .\scripts\npm.bat install }

# mixin
exec { & npm run gulp -- mixin }

# compile
exec { & npm run gulp -- --max_old_space_size=4096 vscode-win32-min }