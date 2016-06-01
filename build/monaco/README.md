# Steps to publish a new version of monaco-editor-core

## Generate monaco.d.ts

* Generate `.d.ts` files from our modules
 * kill `gulp watch` if you have it running
 * `SET VSCODE_BUILD_DECLARATION_FILES=1`
 * run `gulp watch`
* `node build/lib/api`
* validate that the file is generated ok and that everything compiles

## Bump version

* increase version in `build/monaco/package.json`

## Generate npm contents for monaco-editor-core

* Be sure to have all changes committed **and pushed to the remote**
* (the generated files contain the HEAD sha and that should be available on the remote)
* run gulp editor-distro

## Publish

* `cd out-monaco-editor-core`
* `npm publish`
