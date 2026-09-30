# GitHub Authentication for Visual Studio Code

**Notice:** This extension is bundled with Visual Studio Code. It can be disabled but not uninstalled.

## Features

This extension provides support for authenticating to GitHub. It registers the `github` Authentication Provider that can be leveraged by other extensions. This also provides the GitHub authentication used by Settings Sync.

## GitHub Enterprise

For GitHub Enterprise Cloud (GHE.com) or GitHub Enterprise Server, set your instance URL:

```json
{
	"github-enterprise.uri": "https://github.example.com"
}
```

GitHub.com accounts do not need this setting.
