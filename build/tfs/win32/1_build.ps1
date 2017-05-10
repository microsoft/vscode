. .\build\tfs\win32\lib.ps1

# npm install
exec { & .\scripts\npm.bat install }

# mixin
exec { & npm run gulp -- mixin }

# compile
exec { & npm run gulp -- --max_old_space_size=4096 vscode-win32-min }

# run tests
exec { & .\scripts\test.bat --build --reporter dot }

# run integration tests
# exec { & .\scripts\test-integration.bat }