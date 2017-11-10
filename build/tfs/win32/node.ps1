# install node
$env:Path = $env:NVM_HOME + ";" + $env:NVM_SYMLINK + ";" + $env:Path
$NodeVersion = "7.10.0"
nvm install $NodeVersion
nvm use $NodeVersion
$env:Path = $env:NVM_HOME + "\v" + $NodeVersion + ";" + $env:Path