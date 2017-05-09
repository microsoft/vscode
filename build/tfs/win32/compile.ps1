. .\lib.ps1

exec { & .\scripts\npm.bat install }
exec { & npm run gulp -- mixin }
exec { & npm run gulp -- --max_old_space_size=4096 vscode-win32-min }