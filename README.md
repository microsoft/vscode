# Visual Studio Code - Open Source ("Code - OSS")

[![Feature Requests](https://img.shields.io/github/issues/microsoft/vscode/feature-request.svg)](https://github.com/microsoft/vscode/issues?q=is%3Aopen+is%3Aissue+label%3Afeature-request+sort%3Areactions-%2B1-desc)
[![Bugs](https://img.shields.io/github/issues/microsoft/vscode/bug.svg)](https://github.com/microsoft/vscode/issues?utf8=✓&q=is%3Aissue+is%3Aopen+label%3Abug)
[![Build Status](https://dev.azure.com/vscode/public/_sigs/build/status/microsoft.vscode?branchName=main)](https://dev.azure.com/vscode/public/_build/latest?definitionId=12)
[![Gitter](https://img.shields.io/badge/chat-on%20gitter-yellow.svg)](https://gitter.im/Microsoft/vscode)

## Overview

This repository (**`Code - OSS`**) serves as the primary hub where Microsoft develops the [Visual Studio Code](https://code.visualstudio.com) product in transparent collaboration with the global community. 

Beyond source code management, this repository acts as a central command for:
*   🚀 **Strategic Direction:** Our public [Roadmap](https://github.com/microsoft/vscode/wiki/Roadmap) for long-term goals.
*   📅 **Execution Plans:** Detailed [Monthly Iteration Plans](https://github.com/microsoft/vscode/wiki/Iteration-Plans).
*   🏁 **Quality Assurance:** Rigorous [Endgame Plans](https://github.com/microsoft/vscode/wiki/Running-the-Endgame) for stable releases.

All source code in this repo is licensed under the [MIT License](https://github.com/microsoft/vscode/blob/main/LICENSE.txt).

---

## Visual Studio Code vs. Code - OSS

<p align="center">
  <img alt="VS Code in action" src="https://user-images.githubusercontent.com/35271042/118224532-3842c400-b438-11eb-923d-a5f66fa6785a.png" width="80%">
</p>

[Visual Studio Code](https://code.visualstudio.com) is a specialized distribution of the `Code - OSS` repository. While the core engine is open-source, the final product includes Microsoft-specific customizations (such as proprietary icons, gallery integration, and telemetry) released under a traditional [Microsoft product license](https://code.visualstudio.com/License/).

### Key Features
*   **Core Workflow:** Seamlessly integrates the edit-build-debug cycle.
*   **Intelligence:** Advanced IntelliSense, code navigation, and refactoring support.
*   **Extensibility:** A robust plugin architecture that allows for limitless customization.
*   **Multi-Platform:** Fully optimized for Windows, macOS, and Linux.

---

## Contribution Ecosystem

We believe in community-driven innovation. You can impact the future of VS Code through several channels:

| Method | Description |
| :--- | :--- |
| **Bug Reporting** | Identify and [file issues](https://github.com/microsoft/vscode/issues) to help us stabilize the core. |
| **Code Review** | Participate in [Pull Request reviews](https://github.com/microsoft/vscode/pulls) to ensure code quality. |
| **Documentation** | Enhance the [official docs](https://github.com/microsoft/vscode-docs) by fixing typos or adding technical content. |
| **Localization** | Help us reach a global audience via [Translation projects](https://aka.ms/vscodeloc). |

### Technical Onboarding
If you're ready to contribute to the codebase, please refer to our **[Contributor Guide](https://github.com/microsoft/vscode/wiki/How-to-Contribute)**:
1.  [Environment Setup](https://github.com/microsoft/vscode/wiki/How-to-Contribute) - Build and run from source.
2.  [Development Workflow](https://github.com/microsoft/vscode/wiki/How-to-Contribute#debugging) - Debugging and automated testing.
3.  [Coding Guidelines](https://github.com/microsoft/vscode/wiki/Coding-Guidelines) - Standards for clean, maintainable code.
4.  [Issue Selection](https://github.com/microsoft/vscode/wiki/How-to-Contribute#where-to-contribute) - Finding "Good First Issues" to start.

---

## Development & Feedback

### Community & Support
*   **Technical Questions:** Join the conversation on [Stack Overflow](https://stackoverflow.com/questions/tagged/vscode).
*   **Feature Advocacy:** Upvote [popular requests](https://github.com/microsoft/vscode/issues?q=is%3Aopen+is%3Aissue+label%3Afeature-request+sort%3Areactions-%2B1-desc).
*   **Dev Community:** Engage on [GitHub Discussions](https://github.com/microsoft/vscode-discussions/discussions) or [Slack](https://aka.ms/vscode-dev-community).
*   **Social:** Follow [@code](https://x.com/code) for the latest updates.

### Development Environments
*   **Dev Containers:** Use the **Dev Containers: Clone Repository in Container Volume...** command for an isolated, pre-configured environment.
*   **GitHub Codespaces:** Instant cloud-based development using the [Codespaces extension](https://marketplace.visualstudio.com/items?itemName=GitHub.codespaces).

> [!IMPORTANT]
> A full build requires at least **4 cores and 8 GB of RAM** for optimal performance. See the [Dev Container README](.devcontainer/README.md) for details.

---

## Code of Conduct & Licensing

This project adheres to the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For inquiries, contact [opencode@microsoft.com](mailto:opencode@microsoft.com).

Copyright (c) Microsoft Corporation. Licensed under the [MIT License](LICENSE.txt).
