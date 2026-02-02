# vscode-wasm-typescript

Language server host for typescript using vscode's sync-api in the browser.

## Getting up and running

To test this out, you'll need three shells:

1. `yarn watch` for vscode itself
2. `yarn watch-web` for the web side
3. `node <root>/scripts/code-web.js --coi`

The last command will open a browser window. You'll want to add `?vscode-coi=`
to the end. This is for enabling shared array buffers. So, for example:
`http://localhost:8080/?vscode-coi=`.

### Working on type acquisition

In order to work with web's new type acquisition, you'll need to enable
`TypeScript > Experimental > Tsserver > Web: Enable Project Wide Intellisense`
in your VS Code options (`Ctrl-,`), you may need to reload the page.

This happens when working in a regular `.js` file on a dependency without
declared types. You should be able to open `file.js` and write something like
`import lodash from 'lodash';` at the top of the file and, after a moment, get
types and other intellisense features (like Go To Def/Source Def) working as
expected. This scenario works off Tsserver's own Automatic Type Acquisition
capabilities, and simulates a "global" types cache stored at
`/vscode-global-typings/ts-nul-authority/project`, which is backed by an
in-memory `MemFs` `FileSystemProvider`.

### Simulated `node_modules`

For regular `.ts` files, instead of going through Tsserver's type acquisition,
a separate `AutoInstallerFs` is used to create a "virtual" `node_modules` that
extracts desired packages on demand, to an underlying `MemFs`. This will
happen any time a filesystem operation is done inside a `node_modules` folder
across any project in the workspace, and will use the "real" `package.json`
(and, if present, `package-lock.json`) to resolve the dependency tree.

A fallback is then set up such that when a URI like
`memfs:/path/to/node_modules/lodash/lodash.d.ts` is accessed, that gets
redirected to
`vscode-node-modules:/ts-nul-authority/memfs/ts-nul-authority/path/to/node_modules/lodash/lodash.d.ts`,
which will be sent to the `AutoInstallerFs`.
