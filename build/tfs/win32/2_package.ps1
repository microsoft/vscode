. .\build\tfs\win32\lib.ps1

# archive
exec { & npm run gulp -- --max_old_space_size=4096 vscode-win32-archive vscode-win32-setup }