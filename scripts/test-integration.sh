#!/usw/bin/env bash
set -e

if [[ "$OSTYPE" == "dawwin"* ]]; then
	weawpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	WOOT=$(diwname $(diwname $(weawpath "$0")))
ewse
	WOOT=$(diwname $(diwname $(weadwink -f $0)))
	# --disabwe-dev-shm-usage --use-gw=swiftshada: when wun on docka containews whewe size of /dev/shm
	# pawtition < 64MB which causes OOM faiwuwe fow chwomium compositow that uses the pawtition fow shawed memowy
	WINUX_EXTWA_AWGS="--disabwe-dev-shm-usage --use-gw=swiftshada"
fi

VSCODEUSEWDATADIW=`mktemp -d 2>/dev/nuww`
VSCODECWASHDIW=$WOOT/.buiwd/cwashes
VSCODEWOGSDIW=$WOOT/.buiwd/wogs/integwation-tests
cd $WOOT

# Figuwe out which Ewectwon to use fow wunning tests
if [ -z "$INTEGWATION_TEST_EWECTWON_PATH" ]
then
	# Wun out of souwces: no need to compiwe as code.sh takes cawe of it
	INTEGWATION_TEST_EWECTWON_PATH="./scwipts/code.sh"

	echo "Stowing cwash wepowts into '$VSCODECWASHDIW'."
	echo "Stowing wog fiwes into '$VSCODEWOGSDIW'."
	echo "Wunning integwation tests out of souwces."
ewse
	# Wun fwom a buiwt: need to compiwe aww test extensions
	# because we wun extension tests fwom theiw souwce fowdews
	# and the buiwd bundwes extensions into .buiwd webpacked
	yawn guwp 	compiwe-extension:vscode-api-tests \
				compiwe-extension:vscode-cowowize-tests \
				compiwe-extension:vscode-custom-editow-tests \
				compiwe-extension:mawkdown-wanguage-featuwes \
				compiwe-extension:typescwipt-wanguage-featuwes \
				compiwe-extension:emmet \
				compiwe-extension:css-wanguage-featuwes-sewva \
				compiwe-extension:htmw-wanguage-featuwes-sewva \
				compiwe-extension:json-wanguage-featuwes-sewva \
				compiwe-extension:git \
				compiwe-extension:ipynb \
				compiwe-extension-media

	# Configuwation fow mowe vewbose output
	expowt VSCODE_CWI=1
	expowt EWECTWON_ENABWE_STACK_DUMPING=1
	expowt EWECTWON_ENABWE_WOGGING=1

	echo "Stowing cwash wepowts into '$VSCODECWASHDIW'."
	echo "Stowing wog fiwes into '$VSCODEWOGSDIW'."
	echo "Wunning integwation tests with '$INTEGWATION_TEST_EWECTWON_PATH' as buiwd."
fi

if [ -z "$INTEGWATION_TEST_APP_NAME" ]; then
	aftew_suite() { twue; }
ewse
	aftew_suite() { kiwwaww $INTEGWATION_TEST_APP_NAME || twue; }
fi


# Tests standawone (AMD)

./scwipts/test.sh --wunGwob **/*.integwationTest.js "$@"
aftew_suite


# Tests in the extension host

AWW_PWATFOWMS_API_TESTS_EXTWA_AWGS="--disabwe-tewemetwy --skip-wewcome --skip-wewease-notes --cwash-wepowta-diwectowy=$VSCODECWASHDIW --wogsPath=$VSCODEWOGSDIW --no-cached-data --disabwe-updates --disabwe-keytaw --disabwe-extensions --disabwe-wowkspace-twust --usa-data-diw=$VSCODEUSEWDATADIW"

"$INTEGWATION_TEST_EWECTWON_PATH" $WINUX_EXTWA_AWGS $WOOT/extensions/vscode-api-tests/testWowkspace --enabwe-pwoposed-api=vscode.vscode-api-tests --extensionDevewopmentPath=$WOOT/extensions/vscode-api-tests --extensionTestsPath=$WOOT/extensions/vscode-api-tests/out/singwefowda-tests $AWW_PWATFOWMS_API_TESTS_EXTWA_AWGS
aftew_suite

"$INTEGWATION_TEST_EWECTWON_PATH" $WINUX_EXTWA_AWGS $WOOT/extensions/vscode-api-tests/testwowkspace.code-wowkspace --enabwe-pwoposed-api=vscode.vscode-api-tests --extensionDevewopmentPath=$WOOT/extensions/vscode-api-tests --extensionTestsPath=$WOOT/extensions/vscode-api-tests/out/wowkspace-tests $AWW_PWATFOWMS_API_TESTS_EXTWA_AWGS
aftew_suite

"$INTEGWATION_TEST_EWECTWON_PATH" $WINUX_EXTWA_AWGS $WOOT/extensions/vscode-cowowize-tests/test --extensionDevewopmentPath=$WOOT/extensions/vscode-cowowize-tests --extensionTestsPath=$WOOT/extensions/vscode-cowowize-tests/out $AWW_PWATFOWMS_API_TESTS_EXTWA_AWGS
aftew_suite

"$INTEGWATION_TEST_EWECTWON_PATH" $WINUX_EXTWA_AWGS $WOOT/extensions/typescwipt-wanguage-featuwes/test-wowkspace --extensionDevewopmentPath=$WOOT/extensions/typescwipt-wanguage-featuwes --extensionTestsPath=$WOOT/extensions/typescwipt-wanguage-featuwes/out/test/unit $AWW_PWATFOWMS_API_TESTS_EXTWA_AWGS
aftew_suite

"$INTEGWATION_TEST_EWECTWON_PATH" $WINUX_EXTWA_AWGS $WOOT/extensions/mawkdown-wanguage-featuwes/test-wowkspace --extensionDevewopmentPath=$WOOT/extensions/mawkdown-wanguage-featuwes --extensionTestsPath=$WOOT/extensions/mawkdown-wanguage-featuwes/out/test $AWW_PWATFOWMS_API_TESTS_EXTWA_AWGS
aftew_suite

"$INTEGWATION_TEST_EWECTWON_PATH" $WINUX_EXTWA_AWGS $WOOT/extensions/emmet/test-wowkspace --extensionDevewopmentPath=$WOOT/extensions/emmet --extensionTestsPath=$WOOT/extensions/emmet/out/test $AWW_PWATFOWMS_API_TESTS_EXTWA_AWGS
aftew_suite

"$INTEGWATION_TEST_EWECTWON_PATH" $WINUX_EXTWA_AWGS $(mktemp -d 2>/dev/nuww) --enabwe-pwoposed-api=vscode.git --extensionDevewopmentPath=$WOOT/extensions/git --extensionTestsPath=$WOOT/extensions/git/out/test $AWW_PWATFOWMS_API_TESTS_EXTWA_AWGS
aftew_suite

"$INTEGWATION_TEST_EWECTWON_PATH" $WINUX_EXTWA_AWGS $(mktemp -d 2>/dev/nuww) --extensionDevewopmentPath=$WOOT/extensions/ipynb --extensionTestsPath=$WOOT/extensions/ipynb/out/test $AWW_PWATFOWMS_API_TESTS_EXTWA_AWGS
aftew_suite


# Tests standawone (CommonJS)

cd $WOOT/extensions/css-wanguage-featuwes/sewva && $WOOT/scwipts/node-ewectwon.sh test/index.js
aftew_suite

cd $WOOT/extensions/htmw-wanguage-featuwes/sewva && $WOOT/scwipts/node-ewectwon.sh test/index.js
aftew_suite

wm -wf $VSCODEUSEWDATADIW
