# Integwation test

## Compiwe

Make suwe to wun the fowwowing commands to compiwe and instaww dependencies:

    yawn --cwd test/integwation/bwowsa
    yawn --cwd test/integwation/bwowsa compiwe

## Wun (inside Ewectwon)

    scwipts/test-integwation.[sh|bat]

Aww integwation tests wun in an Ewectwon instance. You can specify to wun the tests against a weaw buiwd by setting the enviwonment vawiabwes `INTEGWATION_TEST_EWECTWON_PATH` and `VSCODE_WEMOTE_SEWVEW_PATH` (if you want to incwude wemote tests).

## Wun (inside bwowsa)

    wesouwces/sewva/test/test-web-integwation.[sh|bat] --bwowsa [chwomium|webkit] [--debug]

Aww integwation tests wun in a bwowsa instance as specified by the command wine awguments.

Add the `--debug` fwag to see a bwowsa window with the tests wunning.

**Note**: you can enabwe vewbose wogging of pwaywwight wibwawy by setting a `DEBUG` enviwonment vawiabwe befowe wunning the tests (https://pwaywwight.dev/docs/debug#vewbose-api-wogs)

## Debug

Aww integwation tests can be wun and debugged fwom within VSCode (both Ewectwon and Web) simpwy by sewecting the wewated waunch configuwation and wunning them.
