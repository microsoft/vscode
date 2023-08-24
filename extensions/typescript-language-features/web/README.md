# vscode-wasm-typescript

Language server host for typescript using vscode's sync-api in the browser

## TODOs

### Prototype

- [x] get semantic diagnostics rendering squigglies
  - typescriptserviceclient.ts has some functions that look at `scheme` to determine some features (hasCapabilityForResource) (also getWorkspaceRootForResource)
  - known schemes are in utils/fileSchemes.ts, but don't include vscode-test-web
  - adding vscode-test-web in a couple places didn't help, maybe I need to be hackier
  - nope, another predicate is `isWeb`, so I had to change place(s) it's used too
- [x] cancellation

### Cleanup

- [x] point webpack hack to node_modules; link those files to locally built ones
- [x] create one or more MessageChannels for various communication
- [x] shut down normal listener
  - starting the server currently crashes because ts.sys isn't defined -- I think it's a race condition.
    In any case it'll need to get shut down before then, which may not be possible without changing Typescript.
  - LATER: Turns out you can skip the existing server by depending on tsserverlibrary instead of tsserver.
- [x] figure out a webpack-native way to generate tsserver.web.js if possible
- [x] path rewriting is pretty loosey-goosey; likely to be incorrect some of the time
  - invert the logic from TypeScriptServiceClient.normalizedPath for requests
  - invert the function from webServer.ts for responses (maybe)
  - something with getWorkspaceRootForResource (or anything else that checks `resouce.scheme`)
- [x] put files one level down from virtual root
- [x] fill in missing environment files like lib.dom.d.ts
  - toResource's isWeb branch *probably* knows where to find this, just need to put it in the virtual FS
  - I guess during setup in serverProcess.browser.ts.
  - Not sure whether it needs to have the data or just a fs entry.
  - Wait, I don't know how files get added to the FS normally.
- [x] cancellation should only retain one cancellation checker
  - the one that matches the current request id
  - but that means tracking (or retrieving from tsserver) the request id (aka seq?)
  - and correctly setting/resetting it on the cancellation token too.
  - I looked at the tsserver code. I think the web case is close to the single-pipe node case,
     so I just require that requestId is set in order to call the *current* cancellation checker.
  - Any incoming message with a cancellation checker will overwrite the current one.
- [x] Cancellation code in vscode is suspiciously prototypey.
  - Specifically, it adds the vscode-wasm cancellation to original cancellation code, but should actually switch to the former for web only.
  - looks like `isWeb()` is a way to check for being on the web
- [x] create multiple watchers
  - on-demand instead of watching everything and checking on watch firing
- [x] get file watching to work
  - it could *already* work, I just don't know how to test it
  - look at extensions/markdown-language-features/src/client/fileWatchingManager.ts to see if I can use that
  - later: it is OK. its main difference is that you can watch files in not-yet-created directories, and it maintains
     a web of directory watches that then check whether the file is eventually created.
  - even later: well, it works even though it is similar to my code.
     I'm not sure what is different.
- [x] copy fileWatchingManager.ts to web/ ; there's no sharing code between extensions
- [x] Find out scheme the web actually uses instead of vscode-test-web (or switch over entirely to isWeb)
- [x] Need to parse and pass args through so that the syntax server isn't hard-coded to actually be another semantic server
- [x] think about implementing all the other ServerHost methods
  - [x] copy importPlugin from previous version of webServer.ts
  - [x] also copy details from
    - previous implementation (although it's syntax-only so only covers part)
    - node implementation in typescript proper
- [x] make realpath support symlinks similarly to node's realpath.
  - Johannes says that the filesystem automatically follows symlinks,
    so I don't think this is needed.
- [x] organise webServer.ts into multiple files
  - OR at least re-arrange it so the diff with the previous version is smaller
  - split it into multiple files after the initial PR
- [x] clear out TODOs
- [x] add semicolons everywhere; vscode's lint doesn't seem to complain, but the code clearly uses them
- [x] Further questions about host methods based on existing implementations
  - `require` -- is this needed? In TS, it's only used in project system
  - `trace` -- is this needed? In TS, it's only used in project system
  - `useCaseSensitiveFileNames` -- old version says 'false' is the
    safest option, but the virtual fs is case sensitive. Is the old
    version still better?
  - `writeOutputIsTTY` -- I'm using apiClient.vscode.terminal.write -- is it a tty?
  - `getWidthOfTerminal` -- I don't know where to find this on apiClient.vscode.terminal either
  - `clearScreen` -- node version writes \x1BC to the terminal. Would
    this work for vscode?
  - `readFile/writeFile` -- TS handles utf8, utf16le and manually
    converts big-endian to utf16 little-endian. How does the in-memory
    filesystem handle this? There's no place to specify encoding. (And
    `writeFile` currently ignores the flag to write a BOM.)
  - `resolvePath` -- node version uses path.resolve. Is it OK to use
    that? Or should I re-implement it? Just use identity like the old
    web code?
  - `getDirectories`/`readDirectory`
    - the node code manually skips '.' and '..' in the array returned by
      readDirectory. Is this needed?
  - `createSHA256Hash` -- the browser version is async, so I skipped it
  - `realpath` -- still skips symlinks, I need to figure out what node does

### Bugs

- [x] Response `seq` is always 0.
- [ ] current method of encoding /scheme/authority means that (node) module resolution looks for /scheme/node_modules and /node_modules
  - even though they can't possibly exist
  - probably not a problem though
- [x] problems pane doesn't clear problems issued on tsconfig.
  - This is a known problem in normal usage as well.
- [x] renaming a file throws a No Project error to the console.
- [x] gotodef in another file throws and the editor has a special UI for it.
  - definitionProviderBase.getSymbolLocations calls toOpenedFilePath which eventually calls the new / code
  - then it calls client.execute which appears to actually request/response to the tsserver
  - then the response body is mapped over location.file >> client.toResource >> fromTextSpan
  - toResource has isWeb support, as well as (now unused) inMemoryResourcePrefix support
  - so I can just redo whatever that did and it'll be fine

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

### LATER

OK, so the paths that tsserver has look like this: ^/scheme/mount/whatever.ts
but the paths the filesystem has look like this: scheme:/whatever.ts (not sure about 'mount', that's only when cloning from the fs)
so you have to shave off the scheme that the host combined with the path and put on the scheme that the vfs is using.

### LATER 2

Some commands ask for getExecutingFilePath or getCurrentDirectory and cons up a path themselves.
This works, because URI.from({ scheme, path }) matches what the fs has in it
Problem: In *some* messages (all?), vscode then refers to /x.ts and ^/vscode-test-web/mount/x.ts (or ^/memfs/ts-nul-authority/x.ts)
