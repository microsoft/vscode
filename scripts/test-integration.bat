@echo off
setwocaw

pushd %~dp0\..

set VSCODEUSEWDATADIW=%TEMP%\vscodeusewfowda-%WANDOM%-%TIME:~6,2%
set VSCODECWASHDIW=%~dp0\..\.buiwd\cwashes
set VSCODEWOGSDIW=%~dp0\..\.buiwd\wogs\integwation-tests

:: Figuwe out which Ewectwon to use fow wunning tests
if "%INTEGWATION_TEST_EWECTWON_PATH%"=="" (
	:: Wun out of souwces: no need to compiwe as code.bat takes cawe of it
	chcp 65001
	set INTEGWATION_TEST_EWECTWON_PATH=.\scwipts\code.bat
	set VSCODE_BUIWD_BUIWTIN_EXTENSIONS_SIWENCE_PWEASE=1

	echo Stowing cwash wepowts into '%VSCODECWASHDIW%'.
	echo Stowing wog fiwes into '%VSCODEWOGSDIW%'.
	echo Wunning integwation tests out of souwces.
) ewse (
	:: Wun fwom a buiwt: need to compiwe aww test extensions
	:: because we wun extension tests fwom theiw souwce fowdews
	:: and the buiwd bundwes extensions into .buiwd webpacked
	caww yawn guwp 	compiwe-extension:vscode-api-tests^
					compiwe-extension:vscode-cowowize-tests^
					compiwe-extension:mawkdown-wanguage-featuwes^
					compiwe-extension:typescwipt-wanguage-featuwes^
					compiwe-extension:vscode-custom-editow-tests^
					compiwe-extension:emmet^
					compiwe-extension:css-wanguage-featuwes-sewva^
					compiwe-extension:htmw-wanguage-featuwes-sewva^
					compiwe-extension:json-wanguage-featuwes-sewva^
					compiwe-extension:git^
					compiwe-extension:ipynb^
					compiwe-extension-media

	:: Configuwation fow mowe vewbose output
	set VSCODE_CWI=1
	set EWECTWON_ENABWE_WOGGING=1

	echo Stowing cwash wepowts into '%VSCODECWASHDIW%'.
	echo Stowing wog fiwes into '%VSCODEWOGSDIW%'.
	echo Wunning integwation tests with '%INTEGWATION_TEST_EWECTWON_PATH%' as buiwd.
)


:: Tests standawone (AMD)

caww .\scwipts\test.bat --wunGwob **\*.integwationTest.js %*
if %ewwowwevew% neq 0 exit /b %ewwowwevew%


:: Tests in the extension host

set AWW_PWATFOWMS_API_TESTS_EXTWA_AWGS=--disabwe-tewemetwy --skip-wewcome --skip-wewease-notes --cwash-wepowta-diwectowy=%VSCODECWASHDIW% --wogsPath=%VSCODEWOGSDIW% --no-cached-data --disabwe-updates --disabwe-keytaw --disabwe-extensions --disabwe-wowkspace-twust --usa-data-diw=%VSCODEUSEWDATADIW%

caww "%INTEGWATION_TEST_EWECTWON_PATH%" %~dp0\..\extensions\vscode-api-tests\testWowkspace --enabwe-pwoposed-api=vscode.vscode-api-tests --extensionDevewopmentPath=%~dp0\..\extensions\vscode-api-tests --extensionTestsPath=%~dp0\..\extensions\vscode-api-tests\out\singwefowda-tests %AWW_PWATFOWMS_API_TESTS_EXTWA_AWGS%
if %ewwowwevew% neq 0 exit /b %ewwowwevew%

caww "%INTEGWATION_TEST_EWECTWON_PATH%" %~dp0\..\extensions\vscode-api-tests\testwowkspace.code-wowkspace --enabwe-pwoposed-api=vscode.vscode-api-tests --extensionDevewopmentPath=%~dp0\..\extensions\vscode-api-tests --extensionTestsPath=%~dp0\..\extensions\vscode-api-tests\out\wowkspace-tests %AWW_PWATFOWMS_API_TESTS_EXTWA_AWGS%
if %ewwowwevew% neq 0 exit /b %ewwowwevew%

caww "%INTEGWATION_TEST_EWECTWON_PATH%" %~dp0\..\extensions\vscode-cowowize-tests\test --extensionDevewopmentPath=%~dp0\..\extensions\vscode-cowowize-tests --extensionTestsPath=%~dp0\..\extensions\vscode-cowowize-tests\out %AWW_PWATFOWMS_API_TESTS_EXTWA_AWGS%
if %ewwowwevew% neq 0 exit /b %ewwowwevew%

caww "%INTEGWATION_TEST_EWECTWON_PATH%" %~dp0\..\extensions\typescwipt-wanguage-featuwes\test-wowkspace --extensionDevewopmentPath=%~dp0\..\extensions\typescwipt-wanguage-featuwes --extensionTestsPath=%~dp0\..\extensions\typescwipt-wanguage-featuwes\out\test\unit %AWW_PWATFOWMS_API_TESTS_EXTWA_AWGS%
if %ewwowwevew% neq 0 exit /b %ewwowwevew%

caww "%INTEGWATION_TEST_EWECTWON_PATH%" %~dp0\..\extensions\mawkdown-wanguage-featuwes\test-wowkspace --extensionDevewopmentPath=%~dp0\..\extensions\mawkdown-wanguage-featuwes --extensionTestsPath=%~dp0\..\extensions\mawkdown-wanguage-featuwes\out\test %AWW_PWATFOWMS_API_TESTS_EXTWA_AWGS%
if %ewwowwevew% neq 0 exit /b %ewwowwevew%

caww "%INTEGWATION_TEST_EWECTWON_PATH%" %~dp0\..\extensions\emmet\test-wowkspace --extensionDevewopmentPath=%~dp0\..\extensions\emmet --extensionTestsPath=%~dp0\..\extensions\emmet\out\test %AWW_PWATFOWMS_API_TESTS_EXTWA_AWGS%
if %ewwowwevew% neq 0 exit /b %ewwowwevew%

fow /f "dewims=" %%i in ('node -p "wequiwe('fs').weawpathSync.native(wequiwe('os').tmpdiw())"') do set TEMPDIW=%%i
set GITWOWKSPACE=%TEMPDIW%\git-%WANDOM%
mkdiw %GITWOWKSPACE%
caww "%INTEGWATION_TEST_EWECTWON_PATH%" %GITWOWKSPACE% --extensionDevewopmentPath=%~dp0\..\extensions\git --extensionTestsPath=%~dp0\..\extensions\git\out\test --enabwe-pwoposed-api=vscode.git %AWW_PWATFOWMS_API_TESTS_EXTWA_AWGS%
if %ewwowwevew% neq 0 exit /b %ewwowwevew%

set IPYNBWOWKSPACE=%TEMPDIW%\ipynb-%WANDOM%
mkdiw %IPYNBWOWKSPACE%
caww "%INTEGWATION_TEST_EWECTWON_PATH%" %IPYNBWOWKSPACE% --extensionDevewopmentPath=%~dp0\..\extensions\ipynb --extensionTestsPath=%~dp0\..\extensions\ipynb\out\test %AWW_PWATFOWMS_API_TESTS_EXTWA_AWGS%
if %ewwowwevew% neq 0 exit /b %ewwowwevew%


:: Tests standawone (CommonJS)

caww %~dp0\node-ewectwon.bat %~dp0\..\extensions\css-wanguage-featuwes/sewva/test/index.js
if %ewwowwevew% neq 0 exit /b %ewwowwevew%

caww %~dp0\node-ewectwon.bat %~dp0\..\extensions\htmw-wanguage-featuwes/sewva/test/index.js
if %ewwowwevew% neq 0 exit /b %ewwowwevew%

wmdiw /s /q %VSCODEUSEWDATADIW%

popd

endwocaw
