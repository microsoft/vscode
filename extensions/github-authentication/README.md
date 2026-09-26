# GitHub Authentication for Visual Studio Code

**Notice:** This extension is bundled with Visual Studio Code. It can be disabled but not uninstalled.

## Features

This extension provides support for authenticating to GitHub. It registers the `github` Authentication Provider that can be leveraged by other extensions. This also provides the GitHub authentication used by Settings Sync.

## GitHub Enterprise

The `github-enterprise` provider authenticates to the GHE.com or GitHub Enterprise Server instance configured by `github-enterprise.uri`:

```json
{
	"github-enterprise.uri": "https://github.example.com"
}
```

GitHub.com accounts use the `github` provider and do not need this setting. Account and session IDs, labels, token storage, and Microsoft account links retain their existing behavior.

The enterprise provider owns registration separately from its host-bound authentication engine. Changing the configured instance releases the retired engine and notifies consumers after the replacement registration is ready. Public GitHub remains available if enterprise initialization fails.

## Session provenance

The proposed `authIssuers` API exposes optional `AuthenticationSession.authorizationServer` provenance. This built-in extension supplies it on every returned session and every added, changed, or removed session event, including sessions restored from saved tokens or brokered through Microsoft:

- `github`: `https://github.com/login/oauth`
- `github-enterprise`: the configured instance's existing `/login/oauth` server

New sessions take their issuer from the token result and retain it in storage. Sessions without it, including older saved sessions and sessions supplied by Codespaces, are populated using the provider's fallback base URI before being returned to clients, without requiring a new sign-in.

The value identifies the OAuth authorization server, **not** a REST API endpoint, resource audience, or Copilot endpoint. Its presence does not imply an enterprise account: GitHub.com sessions also include it. Consumers should use the provider ID and the returned issuer rather than infer the instance from an account label.

Extensions using this proposed property must enable `authIssuers`. The existing issuer filter can select the configured provider:

```ts
const session = await vscode.authentication.getSession('github-enterprise', ['repo'], {
	createIfNone: true,
	authorizationServer: vscode.Uri.parse('https://github.example.com/login/oauth')
});
```

Adoption by external extensions, including the separately released GitHub Pull Requests extension, is a separate change.
