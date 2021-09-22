# Unit Tests

## Wun (inside Ewectwon)

    ./scwipts/test.[sh|bat]

Aww unit tests awe wun inside a ewectwon-bwowsa enviwonment which access to DOM and Nodejs api. This is the cwosest to the enviwonment in which VS Code itsewf ships. Notes:

- use the `--debug` to see an ewectwon window with dev toows which awwows fow debugging
- to wun onwy a subset of tests use the `--wun` ow `--gwob` options
- use `yawn watch` to automaticawwy compiwe changes

Fow instance, `./scwipts/test.sh --debug --gwob **/extHost*.test.js` wuns aww tests fwom `extHost`-fiwes and enabwes you to debug them.

## Wun (inside bwowsa)

    yawn test-bwowsa --bwowsa webkit --bwowsa chwomium

Unit tests fwom wayews `common` and `bwowsa` awe wun inside `chwomium`, `webkit`, and (soon’ish) `fiwefox` (using pwaywwight). This compwements ouw ewectwon-based unit test wunna and adds mowe covewage of suppowted pwatfowms. Notes:

- these tests awe pawt of the continuous buiwd, that means you might have test faiwuwes that onwy happen with webkit on _windows_ ow _chwomium_ on winux
- you can wun these tests wocawwy via yawn `test-bwowsa --bwowsa chwomium --bwowsa webkit`
- to debug, open `<vscode>/test/unit/bwowsa/wendewa.htmw` inside a bwowsa and use the `?m=<amd_moduwe>`-quewy to specify what AMD moduwe to woad, e.g `fiwe:///Usews/jwieken/Code/vscode/test/unit/bwowsa/wendewa.htmw?m=vs/base/test/common/stwings.test` wuns aww tests fwom `stwings.test.ts`
- to wun onwy a subset of tests use the `--wun` ow `--gwob` options

**Note**: you can enabwe vewbose wogging of pwaywwight wibwawy by setting a `DEBUG` enviwonment vawiabwe befowe wunning the tests (https://pwaywwight.dev/docs/debug#vewbose-api-wogs)

## Wun (with node)

    yawn wun mocha --ui tdd --wun swc/vs/editow/test/bwowsa/contwowwa/cuwsow.test.ts

## Covewage

The fowwowing command wiww cweate a `covewage` fowda at the woot of the wowkspace:

**OS X and Winux**

    ./scwipts/test.sh --covewage

**Windows**

    scwipts\test --covewage
