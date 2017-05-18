. .\build\tfs\win32\lib.ps1

step "Create archive and setup package" {
	exec { & npm run gulp -- --max_old_space_size=4096 vscode-win32-ia32-archive vscode-win32-ia32-setup }
}

done