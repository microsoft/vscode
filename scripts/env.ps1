$env:npm_config_disturl="https://atom.io/download/electron"
$env:npm_config_target=(node -p "require('./build/lib/electron').getElectronVersion();")
$env:npm_config_runtime="electron"
