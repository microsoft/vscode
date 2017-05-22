Param(
  [Parameter(Position=0,mandatory=$true)]
  [string] $latest,
  [Parameter(Position=1,mandatory=$false)]
  [string] $stable
)

# Setup sample repository for the smoke test
Set-Location ..
if (-Not (Test-Path vscode-smoketest-express)) {
  git clone https://github.com/Microsoft/vscode-smoketest-express.git
  Set-Location ./vscode-smoketest-express
} else {
  Set-Location ./vscode-smoketest-express
  git fetch origin master
  git reset --hard FETCH_HEAD
  git clean -fd
}
npm install

# Setup the test directory for running
Set-Location ..\smoketest
if (-Not (Test-Path node_modules)) {
  npm install
}

# Configure environment variables
$env:VSCODE_LATEST_PATH = $latest
$env:VSCODE_STABLE_PATH = $stable
$env:SMOKETEST_REPO = "..\vscode-smoketest-express"

if ($latest.Contains('Insiders')) {
  $env:VSCODE_EDITION = 'insiders'
}

# Retrieve key bindings config file for Windows
$testDirectory = (Resolve-Path .\).Path
$client = New-Object System.Net.WebClient
$client.DownloadFile("https://raw.githubusercontent.com/Microsoft/vscode-docs/master/scripts/keybindings/doc.keybindings.win.json","$testDirectory\test_data\keybindings.win32.json")

# Compile and launch the smoke test
tsc
npm test