# Local Testing: Mock Policy Server

Use the mock policy server to serve arbitrary Copilot policy responses locally.
It mocks the four `defaultChatAgent` endpoints that `DefaultAccountService` calls.

## Quick start

```sh
npm run mock-policy-server          # http://127.0.0.1:3000
```

Open the GUI, edit the JSON response for any endpoint, **Save**, then click
**Wire all endpoints** (writes `product.overrides.json`). Reload Code OSS,
sign in, and run **Developer: Sync Account Policy** to pull the mocked data.

Click **Unwire** when done — it restores the original `product.overrides.json`
from a backup. Use **Copy overrides JSON** if you prefer to paste manually.

## Schema validation (Managed Settings tab)

Expand the **Schema** section, point the path at a local
`managed-settings-schema.json`, and click **Load**. The path is saved in
localStorage across reloads. Click **Validate** to check for unknown keys.
