---
name: endgame-status
description: Report VS Code endgame status, focusing on test-plan progress, tester activity, release-branch PRs, and release-build availability.
---

# Endgame Status

Keep reports concise, linked, and read-only unless the user requests changes. Refresh GitHub and build data before each report, and give the observation time.

## Find the Current Plan

- Read [Running the Endgame](https://github.com/microsoft/vscode/wiki/Running-the-Endgame), the guide to champion duties, coordination, scheduling, and endgame plans.
- Search `repo:microsoft/vscode is:issue is:open "Endgame"` (for example, `gh search issues 'repo:microsoft/vscode is:issue is:open "Endgame"' --json number,title,url`). Confirm the release from the plan's title, milestone, and schedule rather than assuming the newest issue is the right one. If the user names a release, search for that version too; recovery plans can coexist with the main endgame.
- Derive the milestone and release branch from the selected plan. Distinguish documented process, this plan's explicit deviations, and historical practice. Do not hardcode a release number or weekly schedule.
- Use the plan's checklist to recommend the next actionable tasks as endgame progresses. Prioritize due or overdue unchecked items, verify prerequisites and current evidence, and link each recommendation to the plan or relevant issue/build. Do not treat a checked box alone as proof of publication.

## Test-Plan Progress

While testing is underway, make TPIs the main focus.

- Collect **all states** of issues labeled `testplan-item` in the milestone from both `microsoft/vscode` and `microsoft/vscode-internalbacklog` when authorized. Some TPIs exist only in the internal backlog; searching the public repository alone is incomplete. Disclose inaccessible sources or a user-selected cohort.
- Identify testers from the tester checklist, assignees, and assignment history; distinguish testers from authors and maintainers.
- Inspect the full timeline, current tester checkboxes, comments, and linked issues/PRs. Attribute activity to the tester who performed it, not to everyone assigned to an active issue. Follow cross-references to check their authors and relevance.
- Count relevant tester comments, linked bug reports, tester-checkbox completion, completion-related unassignment, and substantive testing events as activity. Initial/bulk assignment is not progress. For example, a tester who filed bugs referencing a TPI has started testing even if their tester checkbox is unchecked and they left no comment on the TPI itself.
- For progress summaries, count **tester assignment slots**, not issues: each tester/platform checklist entry is one slot, including unnamed slots needing volunteers. Where no tester checklist exists, use one slot per identified assigned tester. Do not double-count checklist entries through the assignee list or count ordinary scenario checkboxes.
- Classify each slot as **Completed** with a checked tester box or explicit completion evidence; **In Progress** with relevant activity from that slot's tester but no completion evidence; otherwise **Not Started**. Another tester's activity or issue closure alone does not establish that a slot is complete. Unnamed, unchecked slots are Not Started.
- When TPI progress is the focus of the status report and **5 or more TPIs are open**, summarize the progress numbers and, if available, use the `endgame-tpi-progress` skill from the `endgame-tpi` plugin to open the **Endgame TPI Progress** canvas (`vscode-endgame-tpi`) with a full progress-over-time chart. If unavailable, add a brief note directly below the numbers that the optional Endgame TPI plugin is needed, linking to the [plugin installation guide](https://code.visualstudio.com/docs/copilot/customization/agent-plugins). Do not install it automatically or generate a replacement app; the status report must not depend on the canvas.
- With **fewer than 5 open TPIs**, list each open TPI with its assigned testers and remaining tester slots. Skip the canvas and plugin note unless the user explicitly requests a chart.
- Flag unchecked **tester/platform slots with no named tester** on unfinished TPIs as needing volunteers. Omit this callout entirely when there are none. Do not mistake ordinary scenario checkboxes for unassigned tester slots or request volunteers for closed TPIs.
- If all tester checkboxes in a TPI are checked but the issue is open, note that testing is likely finished and the issue may just need closing.

## After Testing Day

Once the testing day in the current plan has passed, list all open issues remaining on the milestone across both trackers when authorized, separated into:

- **Candidates / release fixes:** issues labeled `candidate` and/or linked to an open PR targeting the release branch. Link the PR and state which evidence puts the issue in this group.
- **Likely On Deck:** issues with neither signal that likely need their milestone changed to `On Deck`. Flag known blockers or unclear release intent rather than assuming they can be deferred.

Include each issue's link and assignees. Account for TPIs and the endgame tracking issue too, but identify those as testing/process follow-up rather than suggesting they move to On Deck. These are recommendations only; do not change milestones without authorization.

## Release Changes

Use **one table** for all unpublished release changes: open PRs targeting the release branch and merged PRs not yet included in a published release-branch build. Include columns for PR/change, author, and status (for example, awaiting review, CI failing/running, or merged awaiting publication). Do not split open and merged PRs into separate lists or tables. Once testing is complete, make this the main focus.

For bot-created cherry-picks/backports, follow the original PR link or cherry-picked commit to identify the original PR's author and credit that person instead of the bot when possible. Link the original PR as attribution evidence. If the original author cannot be verified, retain the known attribution and state the uncertainty rather than guessing.

Only list changes not yet included in a released build. Verify inclusion against the published build's source revision, including backport/cherry-pick equivalents when necessary; merge status or a successful build alone is not proof of publication. State when inclusion cannot be verified.

## Builds and Handoff

- Briefly report the latest release-branch build and latest published build, with run links, quality, source revision, and build/Sanity status when available. Highlight failures, pending publication, or merged fixes still missing from the published build. Do not imply skipped Sanity tests passed.
- Keep build success, publication to Insiders, internal Stable release, and public Stable rollout distinct.
- Surface immediate blockers, overdue plan tasks, and coordination needed with the other champion. Show deadlines in both Pacific and Zurich local time, accounting for DST; do not treat planned times as verified publication timestamps.
- Do not retry builds, reassign testers, edit issues, or publish releases without authorization. Keep private source details and internal findings out of public reports.
