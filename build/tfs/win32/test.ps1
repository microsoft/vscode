. .\lib.ps1

exec { & npm run gulp -- electron }
exec { & .\scripts\test.bat --build --reporter dot }
# exec { & .\scripts\test-integration.bat }