This page describes how we track issues in the `vscode` repository.

## Inbox tracking and Issue triage
New issues or pull requests submitted by the community are triaged by a team member. The team rotates the inbox tracker on a weekly basis.

### Inbox Tracking

The [Inbox query](https://github.com/Microsoft/vscode/issues?utf8=%E2%9C%93&q=is%3Aopen+no%3Aassignee+-label%3Afeature-request+-label%3Atestplan-item+) contains all the
- **open issues or pull requests** that
- are **not feature requests** nor **test plan items** and
- have **no owner assignment**.

The **inbox tracker** should do the following initial triage:
- Is the issue **invalid**? Close it and justify the reason.
- Is the issue **a general question**, like *How can I compile TypeScript*? Close it and redirect the user to [Stack Overflow](http://stackoverflow.com/questions/tagged/vscode) with [this message](https://gist.github.com/joaomoreno/960b4f643b2ff09bcdf7).
- Is it a feature request? Tag it accordingly and assign to owner. The owner will unassign himself if he does not plan to work on the feature.
- Else, assign the issue to an **owner**.

**Everyone** should do the following secondary triage to their assigned issues (the **inbox tracker** may do some of these steps too, if obvious):
- If an issue needs more info, assign the `needs more info` and ask for more information in a comment.
- If the issue is a bug, add the `bug` label.
- If the issue is a feature request, add the label `feature request` and @-mention if someone from the team should be aware of the feature request.
- If needed, edit the title to improve it.
- If possible, assign the issue with a feature/topic area label.
- If the issue is important, assign an `important` label and optionally mention @microsoft/vscode to get the attention of the entire team.
- If the issue needs to be fixed in this release, assign it to the current milestone (eg: blocks a scenario, completes a new feature, etc.). Else, assign it to the **Backlog**.
- If needed, follow-up with the author.

### Planning
During planning we review the open issues and assign the ones we plan to work on to the current milestone. Issues that do not make it for the current milestone are either assigned to the next milestone or they are moved back to the backlog milestone.

## Filing bugs as development team member
When team members files a bug they perform steps of the inbox tracker for the issue they filed. Therefore bugs filed by the development team do not need to be triged by the inbox tracker.

## Verification

Issues need to be verified.

You can easily find the issues that need verification or reassignment from your part with the following query (remember to replace your username and the iteration name):

https://github.com/issues?utf8=%E2%9C%93&q=is%3Aissue+assignee%3Ajoaomoreno+is%3Aclosed+-label%3Averified+-label%3Atestplan-item+milestone%3A%22Feb+2016%22+

- Once an issue is fixed its state is changed to `closed`
- If you are the issue's resolver, please reassign the issue to someone else for verification
- Once an issue is verified the `verified` label is added to it
- Invalid, duplicates, etc should also be added the `verified` label so they get out of the queries

## Duplicates
Duplicate bugs are closed with a comment `duplicates #issue`. Please try to reference an earlier issue **unless** a later issue is more appropriate (has more context, better scenarios, repro steps, etc.).

## Moving issues to another repository
Use the [issue mover](https://github-issue-mover.appspot.com/) tool to move bugs to another repository.

## Consistent labels across vscode repositories

Visual Studio Code consists of multiple repositories and we should use consistent work flows and labels across all our repositories.

To establish consistent labels across all our repositories use the [Label Manager](http://www.dorukdestan.com/github-label-manager/) tool.

## Consistent milestones across vscode repositories

To enable planning across repositories all the Visual Studio Code related repositories need to define the same milestones.

## Iteration Planning
We use issues for iteration plans and the wiki for the test plan.
- Iteration Plans have a label `iteration-plan` with `tasks` [ ] for the different items. The individual items are tracked in existing issues (bugs, feature requests). If there is no existing issue then a new issue with the label `plan-item` is created. Here is an [example](https://github.com/Microsoft/vscode/issues/917).
- We use a wiki page for a test plan. Here is an [example](https://github.com/Microsoft/vscode/wiki/December-Test-Plan).