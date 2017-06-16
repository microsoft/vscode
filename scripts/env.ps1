$env:npm_config_disturl="https://atom.io/download/electron"
$env:npm_config_target=(node -p "require('./package.json').electronVersion")
$env:npm_config_runtime="electron"
$env:npm_config_cache="${env:USERPROFILE}/.npm-electron"
New-Item -Path "$env:npm_config_cache" -Type directory -Force | out-null