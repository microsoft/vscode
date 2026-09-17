<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# VS Code Team Workflows

This built-in extension contributes packaged workflow data, not an executable
extension or an ExP client. It has no entry point, activation event, verifier,
credentials, or background agent.

The **Feature with Experiment** template contains eleven checkpoints: Plan,
Implementation, Draft PR, Draft PR ready, PR open, PR merged, Test Plan Item,
Write Release Notes, Experiment set up, Experiment started, and Experiment
analysed. Core **Feature** and **Bug Fix** end after the checked PR merge;
team-specific test planning and release-note instructions belong to this
extension, not to the core definitions.

**Test Plan Item** waits for the first Friday **on or after the actual PR
merge's local date**, at 09:00. Friday is inclusive: a Friday merge after 09:00
is eligible immediately. **Write Release Notes** waits for the following Monday
at 09:00, relative to that intended Friday, not when test planning actually
starts or finishes. Both bind `mergedAt` from the checked v2 PR-merge receipt,
never a date supplied in agent proof.

The initiating client must supply the user's local IANA timezone in workflow
`inputs.timeZone` (for example `Europe/Zurich`), captured once with
`Intl.DateTimeFormat().resolvedOptions().timeZone`. Its string schema uses the
generic `format: "iana-time-zone"` marker (`WorkflowSchemaFormat.IanaTimeZone`),
so clients can seed missing fields without recognizing this extension or an
input name. It is a required bounded string, validated as a named timezone,
and is persisted with the run inputs. The remote host must not fill it
from its own timezone; restart/resume must not recapture it. Calendar arithmetic
uses that named timezone, including daylight-saving changes between Friday and
Monday, rather than adding 72 hours to an instant.

The provider-neutral core calendar check uses the existing host-owned
start-condition wait/retry mechanism. Its durable wait state stores the target
instant. If the host was offline at the scheduled time, work resumes as overdue
when it is available, without selecting a later week. Stop boundaries, pause,
cancel, and source revocation still apply. There is no sleeping tool or chat
turn, daemon, new permission, or mandatory human approval.

Test-plan completion is **checked** only for issue existence in the bound
repository, not its content or relation to the PR. Release-note completion is
**reported**, with a saved-resource URI and summary; neither content quality,
file existence, nor publication is independently verified.

All three ExP completions are **reported**. An agent must explicitly submit
schema-valid proof using available approved ExP tooling; the workflow does not
verify ExP server state. Missing tooling or access is a blocker, not success.
The instructions refer to existing `manage-experiments`, `exp-access`,
`ab-experiment-analysis`, and `analyze-scorecard` guidance when installed.
Installing this data extension does not install those tools or grant access.

Before assigning **Experiment started**, the core GitHub check must independently
establish that a published, non-draft, non-prerelease release contains the checked
merge receipt's integrated commit. That SHA is GitHub's post-merge commit, not the
pre-squash or pre-rebase PR head. The check uses the shared GitHub credentials,
transport, conditional cache, request coalescing, and rate-limit coordination.

Release observation includes older releases, resolves lightweight and annotated
tags, and requests bounded ancestry metadata rather than every comparison commit.
Each observation checks the newest page and at most one older page, carrying an
incomplete search forward in durable wait state. A candidate release and tag are
revalidated before success. A negative or truncated search waits; missing facts,
authentication failures, and unprovable cherry-picks never become successful
checks. Transient GitHub failures back off and become visible blockers if they
persist. Polling continues only while the owning workflow host is running.

The release condition is **checked**; starting ExP is still **reported**.
Neither grants new tool permissions or bypasses existing runtime policy.
Checkpoint and template edits affect future runs, not existing snapshots.

The manifest contributions `workflowCheckpointTypes` and `workflowTemplates` are
arrays of relative packaged JSONC paths. The normal built-in extension packaging
discovers this directory automatically, including for web builds.
