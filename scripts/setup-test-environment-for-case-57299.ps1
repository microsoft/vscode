$TempPath = [System.IO.Path]::GetTempPath()

Remove-Item -Verbose -Force -Recurse (Join-Path $TempPath 'vscode\57299')

$RepoWithNoRebaseDir = New-Item -Verbose -ItemType Directory -Path (Join-Path $TempPath 'vscode\57299\no-rebase')
$RepoWithBogusRebaseHeadDir = New-Item -Verbose -ItemType Directory -Path (Join-Path $TempPath 'vscode\57299\bogus-rebase-head')
$RepoWithInteractiveRebaseDir = New-Item -Verbose -ItemType Directory -Path (Join-Path $TempPath 'vscode\57299\interactive-rebase')
$RepoWithNonInteractiveRebaseDir = New-Item -Verbose -ItemType Directory -Path (Join-Path $TempPath 'vscode\57299\noninteractive-rebase')

Push-Location $RepoWithNoRebaseDir
git init
git commit -m "expect rebase commit to be undefined" --allow-empty
Pop-Location

Push-Location $RepoWithBogusRebaseHeadDir
git init
git commit -m "expect rebase commit to be undefined" --allow-empty
Set-Content '.git\REBASE_HEAD' -Value (git rev-parse HEAD)
Pop-Location

Push-Location $RepoWithNonInteractiveRebaseDir
git init
git commit -m "expect rebase commit to be valid, because of rebase-apply dir" --allow-empty
git checkout -b test-root
Set-Content test.txt -Value "starting text"
git add .
git commit -m "starting text"
git checkout -b test-a
Set-Content test.txt -Value "a"
git add .
git commit -m "a"
git checkout -b test-b test-root
Set-Content test.txt -Value "b"
git add .
git commit -m "b"
git rebase test-a
# Repo now has a conflict
Pop-Location

Push-Location $RepoWithInteractiveRebaseDir
git init
git commit -m "expect rebase commit to be valid, because of rebase-merge dir" --allow-empty
git checkout -b test
Set-Content test.txt -Value "starting text"
git add .
git commit -m "starting text"
Set-Content test.txt -Value "a"
git add .
git commit -m "a"
Set-Content test.txt -Value "b"
git add .
git commit -m "b"
git rebase -i
# Need to manually create a conflict - drop the "a" commit
git rebase -i head^^
Pop-Location
