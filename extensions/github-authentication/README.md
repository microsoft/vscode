# GitHub Authentication for Visual Studio Code

**Notice:** This extension is bundled with Visual Studio Code. It can be disabled but not uninstalled.

## Features

This extension provides support for authenticating to GitHub. It registers the `github` Authentication Provider that can be leveraged by other extensions. This also provides the GitHub authentication used by Settings Sync.

## GitHub Enterprise

For GitHub Enterprise Cloud (GHE.com) or GitHub Enterprise Server, add your instance URLs to your settings:

```json
{
	"github-enterprise.uris": [
		"https://octocat.ghe.com",
		"https://github.example.com"
	]
}
```

The list order does not select a default instance. When signing in without a specific instance, you can choose from your configured instances.

The `github-enterprise.uris` setting replaces the deprecated `github-enterprise.uri`. If the list is not set, the older setting still applies. An explicitly empty list (`[]`) configures no enterprise instances.

Use **Manage Extension Account Preferences...** to choose which account an extension uses, or **Use a new account...** to sign in to another instance. Enterprise account labels include the instance name to distinguish accounts with the same username.

Removing an instance hides its accounts without deleting saved sign-ins. You may be asked to select your enterprise account again after this update.

Workspace and folder instance settings only apply in trusted workspaces.

GitHub.com accounts do not need this setting.
