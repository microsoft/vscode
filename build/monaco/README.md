# Steps to publish a new version of monaco-editor-core

## Generate monaco.d.ts

* The `monaco.d.ts` is now automatically generated when running `gulp watch`

## Bump version

* increase version in `build/monaco/package.json`

## Generate npm contents for monaco-editor-core

* Be sure to have all changes committed **and pushed to the remote**
* (the generated files contain the HEAD sha and that should be available on the remote)
* run gulp editor-distro

## Publish

* `cd out-monaco-editor-core`
* `npm publish`
