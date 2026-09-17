<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Shared workflow definitions and checks

The provider-neutral runner snapshots workflow definitions and bound inputs,
persists checked/reported receipts, and owns start-condition waits. It dispatches
no agent turn until the start condition is satisfied and the current run controls
and source authorization allow dispatch.

Core **Feature** and **Bug Fix** contain six checkpoints, ending at **PR merged**.
File, issue, pull-request, and release checks are reusable core capabilities.
VS Code team test-plan/release-note instructions and the eleven-checkpoint
**Feature with Experiment** template are packaged in
`extensions/workflow-experiments`, not core definitions.

## Merge timestamps

`vscode.workflow/pr-merged@2` uses `vscode.github/pull-request-merged@2` to record
the actual GitHub `mergedAt` as a normalized UTC timestamp alongside the
repository, pull request, head SHA, and integrated commit. Missing or invalid
GitHub timestamps block; proof dates and observation time are not substitutes.
The v1 type/check remain available for existing references and frozen snapshots
whose output schema does not contain `mergedAt`.

## Calendar start condition

`vscode.calendar/weekday-on-or-after@1` accepts:

- `inputs.anchor`: an ISO timestamp with an explicit timezone, bound to an
  earlier **checked** checkpoint output. Literal, run-input, and reported
  timestamp anchors are rejected, including equal-looking values.
- `inputs.timeZone`: a frozen IANA timezone name captured by the initiating
  client in the user's local environment. There is no host-default fallback.
- `options.weekday`: 0 (Sunday) through 6 (Saturday).
- `options.hour`: 0–23; `minute`: 0–59 (defaults to 0).
- `options.offsetDays`: 0–6 (defaults to 0), added to the intended weekday's
  local calendar date.

Timezone string properties use `format: "iana-time-zone"`, exposed as
`WorkflowSchemaFormat.IanaTimeZone`. This is the generic client-local default
seam: setup seeds missing marked inputs with
`Intl.DateTimeFormat().resolvedOptions().timeZone` and preserves already
selected input values. Clients need not recognize any extension ID or input
name. Shared validation accepts named IANA zones, not numeric UTC offsets or a
missing value. The selected value and its schema persist in the run/snapshot.

The target is the first specified weekday on or after the anchor's local date,
including the same day even when the anchor is later than the target hour.
The offset is calendar arithmetic, not elapsed 24-hour periods. Repeated local
times use the earlier instant; nonexistent local times block instead of silently
moving the date. The check makes no network request and grants no permission.

The team template binds both anchors directly to `/mergedAt` of `pr-merged`.
Friday uses `{ weekday: 5, hour: 9, offsetDays: 0 }`; the following Monday uses
`{ weekday: 5, hour: 9, offsetDays: 3 }`. Both checkpoints bind `timeZone` from
the same persisted workflow input. No completion/observation time anchors the
Monday, so delayed execution cannot move it to another week.

The check returns the target `dueAt` and frozen schedule in durable wait state,
then a checked start-condition receipt when due. The existing runner bounds
retry intervals, resumes overdue work after downtime, and continues to honor
stop/pause/cancel and dispatch authorization. This does not introduce a daemon,
sleeping chat turn, new tool permission, or approval requirement.
