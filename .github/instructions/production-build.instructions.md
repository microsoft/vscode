---
description: Fork-specific production Windows installer build (unsigned, size-optimized). Use when the user asks to build a prod installer, release build, VSCodeSetup.exe, or package Code OSS with DIAL/BYOK.
applyTo: 'build/**,product.json,extensions/dial-chat-model-provider/**,extensions/copilot/**'
---

> **Fork notice:** This is [sergey-zinchenko/vscode](https://github.com/sergey-zinchenko/vscode), not vanilla [microsoft/vscode](https://github.com/microsoft/vscode). Read [FORK.md](../../FORK.md) before making changes.

# Production installer build (fork)

Full guide: [build/custom/PRODUCTION-BUILD.md](../../build/custom/PRODUCTION-BUILD.md)

## Critical fork facts

1. **DIAL** lives in `extensions/dial-chat-model-provider/` (not a VSIX). Run `npm run compile-dial` before packaging — output goes to `dist/`.
2. **Size optimization:** set `$env:CI = 'true'` before `vscode-win32-x64-min-ci` so packaging strips `*.js.map` (~200 MB installer vs ~240 MB).
3. **Copilot SDK:** never add `@github/copilot/sdk/index.js` to `build/.moduleignore`.
4. **Win32 patch:** `patchWin32DependenciesTask` in `build/gulpfile.vscode.ts` must skip Linux/Darwin `.node` files (Copilot SDK vendor trees).
5. **Dev vs prod:** `scripts\code.bat` is not a valid smoke test for installer builds.

## Minimal Windows x64 command sequence

```powershell
cd E:\vscode
$commit = git rev-parse HEAD

npm run compile-dial
Remove-Item -Recurse -Force .build\extensions -ErrorAction SilentlyContinue
npm run gulp compile-non-native-extensions-build
npm run gulp compile-copilot-extension-build   # retry with shims.txt stub if ENOENT
npm run gulp compile-extension-media-build

node --experimental-strip-types -e "import { writeISODate } from './build/lib/date.ts'; writeISODate('out-build');"
node build/next/index.ts bundle --minify --mangle-privates --nls --out out-vscode-min --target desktop --source-map-base-url "https://main.vscode-cdn.net/sourcemaps/$commit/core"

$env:CI = 'true'
npm run gulp vscode-win32-x64-min-ci
npm run gulp vscode-win32-x64-inno-updater
npm run gulp vscode-win32-x64-user-setup
```

## Output paths

- Installer: `.build\win32-x64\user-setup\VSCodeSetup.exe`
- Portable: `..\VSCode-win32-x64\`
- Verify DIAL: `resources\app\extensions\dial-chat-model-provider\dist\extension.js`
- Verify Copilot SDK: `resources\app\extensions\copilot\node_modules\@github\copilot\sdk\index.js`

## Copilot shims.txt workaround

```powershell
Set-Content "extensions\copilot\node_modules\@github\copilot\shims.txt" "Shims created successfully" -NoNewline
npm run gulp compile-copilot-extension-build
```
