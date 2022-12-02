# vscode-wasm-typescript
Language server host for typescript using vscode's sync-api in the browser

## TODOs

### Prototype

- [x] get semantic diagnostics rendering squigglies
  - typescriptserviceclient.ts has some functions that look at `scheme` to determine some features (hasCapabilityForResource) (also getWorkspaceRootForResource)
  - known schemes are in utils/fileSchemes.ts, but don't include vscode-test-web
  - adding vscode-test-web in a couple places didn't help, maybe I need to be hackier
  - nope, another predicate is `isWeb`, so I had to change place(s) it's used too
- [ ] cancellation

### Cleanup

- [x] point webpack hack to node_modules; link those files to locally built ones
- [ ] create one or more MessageChannels for various communication
- [x] shut down normal listener
  - starting the server currently crashes because ts.sys isn't defined -- I think it's a race condition.
    In any case it'll need to get shut down before then, which may not be possible without changing Typescript.
  - LATER: Turns out you can skip the existing server by depending on tsserverlibrary instead of tsserver.
- [x] figure out a webpack-native way to generate tsserver.web.js if possible
- [ ] fill in missing environment files like lib.dom.d.ts
- [ ] path rewriting is pretty loosey-goosey; likely to be incorrect some of the time
   - invert the logic from TypeScriptServiceClient.normalizedPath for requests
   - invert the function from webServer.ts for responses (maybe)
   - something with getWorkspaceRootForResource (or anything else that checks `resouce.scheme`)
- [ ] cancellation should only retain one cancellation checker
   - the one that matches the current request id
   - but that means tracking (or retrieving from tsserver) the request id (aka seq?)
   - and correctly setting/resetting it on the cancellation token too.

### Final

- [ ] rewrite paths in all other request/response messages
- [ ] put files one level down from virtual root
- [ ] shut down listener created by tsserver
- [ ] think about implementing all the other ServerHost methods
- [ ] add tests, dprint, etc to repo

### Done
- [x] need to update 0.2 -> 0.7.* API (once it's working properly)
- [x] including reshuffling the webpack hack if needed
- [x] need to use the settings recommended by Sheetal
- [x] ProjectService always requests a typesMap.json at the cwd
- [x] sync-api-client says fs is rooted at memfs:/sample-folder; the protocol 'memfs:' is confusing our file parsing I think
- [x] nothing ever seems to find tsconfig.json
- [x] messages aren't actually coming through, just the message from the first request
     - fixed by simplifying the listener setup for now
- [x] once messages work, you can probably log by postMessage({ type: 'log', body: "some logging text" })
- [x] implement realpath, modifiedtime, resolvepath, then turn semantic mode on
- [x] file watching implemented with saved map of filename to callback, and forwarding

### Also

- [ ] ATA will eventually need a host interface, or an improvement of the existing one (?)

## Notes

messages received by extension AND host use paths like ^/memfs/ts-nul-authority/sample-folder/file.ts
- problem: pretty sure the extension doesn't know what to do with that: it's not putting down error spans in file.ts
- question: why is the extension requesting quickinfo in that URI format? And it works! (probably because the result is a tooltip, not an in-file span)
- problem: weird concatenations with memfs:/ in the middle
- problem: weird concatenations with ^/memfs/ts-nul-authority in the middle

question: where is the population of sample-folder with a bunch of files happening?

question: Is that location writable while it's running?

but readFile is getting called with things like memfs:/sample-folder/memfs:/typesMap.json
     directoryExists with /sample-folder/node_modules/@types and /node_modules/@types
     same for watchDirectory
     watchDirectory with /sample-folder/^ and directoryExists with /sample-folder/^/memfs/ts-nul-authority/sample-folder/workspaces/
     watchFile with /sample-folder/memfs:/sample-folder/memfs:/lib.es2020.full.d.ts

### LATER:

OK, so the paths that tsserver has look like this: ^/scheme/mount/whatever.ts
but the paths the filesystem has look like this: scheme:/whatever.ts (not sure about 'mount', that's only when cloning from the fs)
so you have to shave off the scheme that the host combined with the path and put on the scheme that the vfs is using.

### LATER 2:

Some commands ask for getExecutingFilePath or getCurrentDirectory and cons up a path themselves.
This works, because URI.from({ scheme, path }) matches what the fs has in it
Problem: In *some* messages (all?), vscode then refers to /x.ts and ^/vscode-test-web/mount/x.ts (or ^/memfs/ts-nul-authority/x.ts)

