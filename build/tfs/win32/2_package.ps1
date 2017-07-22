Param(
  [string]$arch
)

. .\build\tfs\win32\node.ps1
. .\build\tfs\win32\lib.ps1

step "Create archive and setup package" {
	exec { & npm run gulp -- --max_old_space_size=4096 "vscode-win32-$global:arch-archive" "vscode-win32-$global:arch-setup" }
}

done