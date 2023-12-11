# Microsoft Authentication for Visual Studio Code

**Notice:** This extension is bundled with Visual Studio Code. It can be disabled but not uninstalled.

## Features

This extension provides support for authenticating to Microsoft. It registers the `microsoft` Authentication Provider that can be leveraged by other extensions. This also provides the Microsoft authentication used by Settings Sync.

Additionally, it provides the `microsoft-sovereign-cloud` Authentication Provider that can be used to sign in to other Azure clouds like Azure for US Government or Azure China. Use the setting `microsoft-sovereign-cloud.endpoint` to select the authentication endpoint the provider should use. Please note that different scopes may also be required in different environments.
