# JavaScript resources

Copyright © 2025 Lotas Inc.

JavaScript resources for Python extension supporting IPyWidgets integration in Erdos. Contains custom widget manager and RequireJS for dependency management in non-notebook contexts.

## Scripts contained in this folder
The scripts in this folder must be manually placed here, by copying them over from the `node_modules` folder after running `npm install` from the extension root. For example,

```bash
cp node_modules/@jupyter-widgets/html-manager/dist/embed-amd.js resources/js/@jupyter-widgets/html-manager/dist/embed-amd.js
cp node_modules/requirejs/require.js resources/js/requirejs/require.js
cp node_modules/jupyter-matplotlib/dist/index.js resources/js/jupyter-matplotlib/dist/index.js
```

---
**NOTE**

Whenever we update the version of these modules in the `package.json` file, we must re-run `npm install` and then copy over the updated files to this folder. They will not be automatically synced.

---

## Current versions
The current versions of these modules are:
- @jupyter-widgets/html-manager: 1.0.9
- requirejs: 2.3.6
- jupyter-matplotlib: 0.11.7
