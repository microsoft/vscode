# Security Policy

## Reporting security issues

Please do not report security vulnerabilities in public issues.

Preferred channel:

- GitHub Security Advisory form: `/security/advisories/new`

Fallback channel:

- Email: `sergey.zinchenko.rnd@gmail.com`

Please include:

- affected extension version (`package.json` → `version` or the VSIX filename)
- VS Code version and platform (Windows / macOS / Linux)
- clear reproduction steps
- expected vs actual behavior
- impact assessment
- any proposed fix or mitigation

## Sensitive areas of particular interest

Reports about the following are especially welcome:

- Storage of credentials (API key, OIDC tokens, client secret, initial access token) outside of `vscode.SecretStorage`.
- Sensitive values appearing in the **DIAL** output channel or any other log destination.
- OAuth / PKCE flow weaknesses (state handling, redirect URI validation, token exchange).
- Dynamic Client Registration behavior that could leak secrets or escalate scopes.
- Issues in the loopback HTTP callback server (`http://127.0.0.1:PORT/oauth-callback`).
- Vulnerable transitive dependencies that ship in the published VSIX.

## Triage and response

This project is maintained by a single maintainer on a best-effort basis.

I will:

- acknowledge valid reports as soon as possible
- reproduce and triage the issue
- prioritize fixes based on severity and exploitability
- publish a coordinated fix and notes when ready

There is no guaranteed SLA for response or fix delivery.

## Scope

This policy covers:

- Source code shipped in the published VSIX
- Settings, commands, and OAuth flow exposed to end users
- Build and packaging configuration that affects what reaches the VSIX

This policy does not directly cover vulnerabilities in third-party software (VS Code, Node.js runtime, OS keychain, Keycloak / DIAL Core, Chromium-based browsers used for sign-in), but reports that affect safe usage of this extension are welcome.

## Severity levels

- Critical: remote compromise or major confidentiality impact with minimal prerequisites (e.g. token disclosure to other extensions or to the file system).
- High: serious impact but requires specific conditions or elevated positioning.
- Moderate: meaningful but limited impact, such as partial disruption or non-actionable info leak.
- Low: minor or hard-to-exploit issues with low practical impact.

CVSS may be used as supporting input, but final priority is based on real impact for this extension's users.

## Disclosure policy

For confirmed vulnerabilities, I aim for coordinated disclosure:

- fix first
- publish advisory and release notes after a patched VSIX is available

If immediate disclosure is needed to protect users, I may publish mitigation guidance before a full fix is released.
