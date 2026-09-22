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
