# VS Code Smoke Testing
This repository contains the smoke test automation code with Spectron for Visual Studio Code.

The following command is used to run the tests: `.\scripts\run.ps1 -latest "path\to\Code.exe"` on Windows (from PowerShell) and `./scripts/run.sh path/to/binary` on Unix system.

If you want to include 'Data Migration' area tests use  `.\scripts\run.ps1 -latest "path\to\Code.exe" -stable "path\to\CurrentStable.exe"` and `./scripts/run.sh path/to/binary path/to/currentStable` respectively.

# Contributing

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
