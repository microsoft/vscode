# install node
$env:Path = $env:NVM_HOME + ";" + $env:NVM_SYMLINK + ";" + $env:Path
$NodeVersion = "8.9.1"
nvm install $NodeVersion
nvm use $NodeVersion
npm install -g yarn
$env:Path = $env:NVM_HOME + "\v" + $NodeVersion + ";" + $env:Path