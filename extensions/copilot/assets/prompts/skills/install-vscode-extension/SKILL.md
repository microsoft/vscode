---
name: install-vscode-extension
description: 'How to install a VS Code extension from an extension ID. Useful when the user wants to add new capabilities to their VS Code environment by installing extensions.'
---

# Installing VS Code extensions

1. VS Code extensions are identified by their unique extension ID, which typically follows the format `publisher.extensionName`. For example, the Python extension by Microsoft has the ID `ms-python.python`.
2. To install a VS Code extension, you need to use the VS Code command `workbench.extensions.installExtension` and pass in the extension ID. The args are of the format:
```
[extensionId, { enable: true, installPreReleaseVersion: boolean }]
```
> NOTE: install the pre-release version of the extension if the user explicitly mentions it or if the current environment is VS Code Insiders. Otherwise, install the stable version.
3. Run that command via the `copilot_runVscodeCommand` tool. Make sure to pass the `skipCheck` argument as true to avoid checking if the command exists, as we know it does.