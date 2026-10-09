# Copilot Host compatibility on Mission Control

The native VS Code Agent Host exposes the following Copilot Host extension methods on its authenticated Mission Control listener:

| Method | Request | Result |
| --- | --- | --- |
| `extensions/listProjects` | `{}` | `{ projects: Project[] }` |
| `extensions/addProject` | `{ path: string }` | `{ project: Project }` |
| `extensions/cloneProject` | `{ url: string, branch?: string, depth?: number, targetRoot?: string }` | `{ project: Project }` |
| `extensions/removeProject` | `{ id: string }` | `{ removed: boolean }` |
| `extensions/setSessionApproveAll` | `{ channel: string, enabled: boolean }` | `null` |
| `extensions/getPlan` | `{ channel: string }` | `{ plan: { exists, content, path }, todos, dependencies }` |

## Projects

Availability is advertised as `_meta["copilot.projectManagement"] = { available: true }`. The catalogue is published in `config.values.copilot.projects`, with changes delivered through `root/configChanged`. Each project carries an opaque, restart-stable `id`, a display `name`, an absolute host `path`, its `pinned` or `cloned` `origin`, a `git` flag, and its `ready`, `cloning`, or `failed` `status`. Cloning entries additionally carry `progress`; failed entries carry `error`. Git projects can carry a credential-free `remoteUrl` and `defaultBranch`.

Clones default to `<user-home>/<owner>/<repository>`. An explicit `targetRoot` must be an existing granted directory. HTTPS and SSH repository URLs are accepted; local file URLs must address a repository inside the existing grants. An occupied destination is never overwritten. GitHub SSH URLs use the configured GitHub HTTPS origin, and GitHub clones can use the authenticated bearer through an origin-scoped, process-local credential helper. Credentials are not embedded in arguments or repository configuration. A shallow clone without an explicit branch retains an all-branches fetch refspec.

Cloning returns a provisional entry immediately. Clients must observe that exact project in the live catalogue, or poll `listProjects`, until it becomes `ready` or `failed`. A caller disconnecting does not cancel cloning. Unpinning an in-flight project cancels its clone; unpinning a settled project leaves its files intact. Explicit destructive removal flags are rejected rather than deleting user content or bypassing worktree safety checks.

Ready runtime entries are persisted in the user-data directory. Shared workspace roots are published as boot-time pins; boot pins are reconciled with current sharing grants rather than persisted, and withdrawn pins no longer grant remote filesystem access. Ready projects extend filesystem grants only to their own directories, not to the entire home folder.

## Sessions and authorization

Session requests address the exact host-advertised session URI and route through its owning provider. Copilot approval changes apply the SDK permission mode before publishing the native `autoApprove` configuration selection. Runtime and enterprise policy refusals are returned to the caller. Approval changes require a live Copilot runtime; deferred or unloaded sessions are rejected without publishing an unapplied selection. A host-wide global auto-approval setting must be disabled locally before the legacy toggle can select manual approval.

Plan reads use the live Copilot SDK's plan and SQL todo APIs. The result includes both todo rows and dependency edges. Native plan and todo changes publish `copilot.planHint` and `copilot.todosHint` session metadata, including source event IDs, so clients can refetch the plan.

All requests require relay identity authentication. Passive connections may list projects and read plans, but cannot mutate projects or approval modes. Catalogue actions share the global protocol sequence and are recorded/replayed by the owning relay listener without modifying shared host configuration or notifying local configuration listeners. Root snapshots and updates expose only the host-owned project namespace; private host configuration and VS Code host-management methods remain unavailable through Mission Control.
