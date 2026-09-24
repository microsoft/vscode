# Native policy smoke tests

These tests exercise startup policy ingestion in the unmodified desktop product.
They set `extensions.autoUpdate` to `on` in a fresh user-data directory and check
the value, editability, and organization-managed indicator with and without
`ExtensionsAutoUpdate="off"`.

Run only on a disposable test runner. A fresh VS Code profile does not isolate
OS policy state:

- Linux uses `/etc/vscode/policy.json`. Separate CI steps create `/etc/vscode`
  with root/sudo and give the test user ownership, refusing an existing directory.
  An always-run cleanup step removes the fixture only if setup created it.
- Windows uses the tested product's HKCU policy registry key. The fixture refuses
  an existing value in either HKLM or HKCU and removes only its own value.
- macOS uses `defaults` for the tested product's policy bundle identifier. The
  fixture refuses existing system preference files or an existing user policy
  value, then removes its own user preference. This covers the native
  `CFPreferences` read path, not MDM profile installation or live notifications.

Set `VSCODE_SMOKE_TEST_POLICY=1` in the test process environment
and run `npm run smoketest-no-compile -- --tracing -g "Policy Plumbing"`.
The desktop CI steps opt in explicitly and retain the usual npm invocation.
The policy suite is disabled by default in ordinary local smoke runs because it
modifies OS-level policy state outside the temporary VS Code profile. Running
the smoke tests on a developer's machine must not accidentally overwrite or
remove that machine's policies. Opt in only on a disposable runner or container;
the fixtures additionally refuse existing policy state rather than overwrite it.
For local Linux testing, provision and clean up `/etc/vscode` inside a disposable
container, never on the host.

Each variant starts a fresh process. Cleanup runs after application shutdown.
Existing policy is never intentionally overwritten; fixture conflicts fail the
run rather than silently skipping coverage.

## Agent Host managed settings

The same `VSCODE_SMOKE_TEST_POLICY=1` opt-in also runs the Agent Host managed
settings suites. These use the real Copilot SDK/runtime and the existing mock
model server, not a mocked policy service or simulated telemetry producer.

- **OTel (all desktop platforms):** local OTel is off, inherited OTel variables
  are cleared, and the policy cache is isolated. A device policy enables
  OTLP/HTTP JSON at a loopback receiver, with a synthetic managed header.
  Separate fresh-process cases cover a bare base URL and an explicit
  `/v1/traces` URL. The receiver rejects incorrect routes and requires a
  successful native `github-copilot` `invoke_agent` span from the test turn
  with the managed header; synthetic host spans and warm-up spans cannot pass.

The CI smoke step provisions an empty managed-settings directory, refusing any
existing directory:

| Platform | Device-policy file |
| --- | --- |
| macOS | `/Library/Application Support/GitHubCopilot/managed-settings.json` |
| Linux | `/etc/github-copilot/managed-settings.json` |
| Windows | `%ProgramFiles%\GitHubCopilot\managed-settings.json` |

The fixture creates the file exclusively and removes only its own file after
application shutdown. macOS preferences and Windows registry policy are also
checked for conflicts, never changed. The smoke step registers an exit trap
(macOS/Linux) or enters `try/finally` (Windows) only after creating the directory,
so success and failure both clean up this run's fixture without touching an
existing policy directory.
Each suite uses an isolated Copilot policy cache.

Run the new cases on a **disposable runner** with the directory provisioned:

```sh
VSCODE_SMOKE_TEST_POLICY=1 npm run smoketest-no-compile -- --tracing -g "Policy Plumbing \(Agent Host"
```

These are behavioral regression tests: a locked toggle, a configuration log,
or a successful chat response without the required export does not
pass. There are no expected-failure skips or local-setting workarounds.
