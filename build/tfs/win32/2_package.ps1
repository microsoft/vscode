Param(
  [string]$arch
)

. .\build\tfs\win32\node.ps1
. .\build\tfs\win32\lib.ps1

step "Create archive and setup package" {
	exec { & npm run gulp -- "vscode-win32-$global:arch-archive" "vscode-win32-$global:arch-setup" }
}

done