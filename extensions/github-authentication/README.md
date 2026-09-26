# GitHub Authentication for Visual Studio Code

**Notice:** This extension is bundled with Visual Studio Code. It can be disabled but not uninstalled.

## Features

This extension provides support for authenticating to GitHub. It registers the `github` Authentication Provider that can be leveraged by other extensions. This also provides the GitHub authentication used by Settings Sync.

## GitHub Enterprise

The single `github-enterprise` provider authenticates to all GHE.com and GitHub Enterprise Server instances configured by `github-enterprise.uris`:

```json
{
	"github-enterprise.uris": [
		"https://octocat.ghe.com",
		"https://github.example.com"
	]
}
```

The list is unordered: its first entry is **not** a default. An explicitly configured list takes precedence over the deprecated `github-enterprise.uri`, including an empty list, which configures no enterprise instances. Only when the new setting is absent is the deprecated setting used as a one-item list.

Workspace and folder settings are ignored in untrusted workspaces; they cannot override the user's configured hosts or suppress the legacy fallback. Enrollment in an untrusted workspace updates user settings. Enterprise initialization failures leave public GitHub available and surface an enterprise-specific error; correcting the configuration retries enterprise initialization.

Session reads return all eligible sessions, filtered by scopes, account, and authorization server when supplied. They never show a host picker. Creating a session uses an explicit configured authorization server or a host-identifying account hint. Otherwise, it uses the sole configured instance or shows a standard Quick Pick when several are configured. Dismissing the picker cancels sign-in without selecting a host.

Use **Manage Extension Account Preferences...** to choose an extension's account independently of other extensions. **Use a new account...** delegates to this provider's instance picker. Enterprise account labels include their instance so identical logins on different hosts remain distinguishable.

Enterprise session and account IDs are host-qualified at the provider boundary. Existing saved tokens, native GitHub usernames, and Microsoft account links are retained in their original per-host storage; adding, reordering, or removing configured instances does not revoke tokens on another instance. URLs that would collide in a legacy keychain namespace use separate storage rather than sharing tokens. Removing an instance hides its sessions without deleting its saved credentials. Because existing enterprise account labels change, extensions may need one explicit account selection or consent after this update. A platform-wide migration of account preferences and grants to structured identity remains a separate follow-up.

On first upgrade, equivalent configured URI spellings are checked for saved tokens and Microsoft account links before choosing a storage namespace. If several legacy stores contain data, retain the previously used URI in `github-enterprise.uri` or configure only its original spelling to disambiguate without deleting credentials. Host changes notify authentication consumers after registration; restoring a configured instance does not require a consumer to poll for sessions first.

GitHub.com accounts continue to use the separate `github` provider without enterprise configuration or identity changes.

## Session provenance

The proposed `authIssuers` API exposes optional `AuthenticationSession.authorizationServer` provenance. This built-in extension supplies it on every returned session and every added, changed, or removed session event, including sessions restored from saved tokens or brokered through Microsoft:

- `github`: `https://github.com/login/oauth`
- `github-enterprise`: the selected instance's existing `/login/oauth` server

New sessions take their issuer from the token result and retain it in storage. Sessions without it, including older saved sessions and sessions supplied by Codespaces, are populated using the provider's fallback base URI before being returned to clients, without requiring a new sign-in.

The value identifies the OAuth authorization server, **not** a REST API endpoint, resource audience, or Copilot endpoint. Its presence does not imply an enterprise account: GitHub.com sessions also include it. Consumers should use the provider ID and the returned issuer rather than infer the instance from an account label.

Extensions using this proposed property must enable `authIssuers`. A client that knows its repository's instance can use the issuer filter:

```ts
const session = await vscode.authentication.getSession('github-enterprise', ['repo'], {
	createIfNone: true,
	authorizationServer: vscode.Uri.parse('https://github.example.com/login/oauth')
});
```

Clients that do not know the instance before sign-in should omit that filter and derive their API endpoints from the returned session's issuer. Do not read either enrollment setting to route an authenticated request, use the first configured instance, or parse the account label. Scope upgrades for a particular account should pass that account and its issuer together.
