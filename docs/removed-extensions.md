# Removed Proprietary Extensions

The following proprietary extensions have been removed from the internal build to comply with open-source and Son of Anton policies:

- `ms-vscode.js-debug`: Microsoft proprietary JS debugger extension.
- `ms-vscode.js-debug-companion`: Microsoft proprietary companion for JS debugger.
- `ms-vscode.vscode-js-profile-table`: Microsoft proprietary JS profile table visualizer.
- `microsoft-authentication`: Microsoft Account and Azure AD authentication provider. Connects to `login.microsoftonline.com` and `graph.microsoft.com`.
  - Removed from build system: `build/gulpfile.extensions.ts`, `build/npm/dirs.ts`, `build/lib/extensions.ts`, `build/lib/mangle/index.ts`, `build/darwin/verify-macho.ts`, `build/darwin/create-universal-app.ts`.
  - Removed from urgent notification/progress source lists in the workbench API layer.
  - Directory retained: the extension source directory is retained for reference but is not compiled or included in any build.
