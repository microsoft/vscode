# Rulesets

The JSON files in this folder define rulesets of microsoft/vscode, in the format of the [REST API for rulesets](https://docs.github.com/en/rest/repos/rules). They're here for versioning and maintenance only: GitHub doesn't read them, so committing or merging a change to one changes nothing on the repository. A repository admin applies them, and the [Rulesets workflow](../workflows/rulesets.yml) checks that the live rulesets still match them, every day and after every change to this folder on `main`.

| File | Ruleset |
| --- | --- |
| [main-merge-queue.json](main-merge-queue.json) | The merge queue of `main` (`~DEFAULT_BRANCH`), whose merge groups [pr.yml](../workflows/pr.yml) and [component-fixtures.yml](../workflows/component-fixtures.yml) check. Release branches have no merge queue. |

[rulesets.ts](rulesets.ts) matches a file with the live ruleset of the same `name`. Every value of the file must equal the live one, while the live ruleset may have fields that the file omits, such as its id. It compares the rules by type, and a live rule that the file lacks is a difference too.

## Change a ruleset

1. Edit its file in a pull request. The fields are those of the REST API, for example for the merge queue, the [`merge_queue` rule](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-merge-queue):

	| Field | Setting in the UI |
	| --- | --- |
	| `merge_method` | Merge method (`MERGE`, `SQUASH` or `REBASE`) |
	| `max_entries_to_build` | Build concurrency: how many merge groups run their checks at once |
	| `min_entries_to_merge`, `max_entries_to_merge` | Minimum and maximum group size |
	| `min_entries_to_merge_wait_minutes` | Wait time to meet the minimum group size. Unused when the minimum is 1. |
	| `grouping_strategy` | `ALLGREEN` when "Only merge non-failing pull requests" is on: every pull request of a group must pass. `HEADGREEN` when it's off: the last one must. |
	| `check_response_timeout_minutes` | Status check timeout |

2. Once it merged, a repository admin applies the files of an up-to-date `main` with the [GitHub CLI](https://cli.github.com/), which creates the rulesets that don't exist yet and updates the others:

	```sh
	gh auth status   # an admin of microsoft/vscode
	node .github/rulesets/rulesets.ts apply
	```

3. Check that the live rulesets match the files, including the bypass actors, which the API only shows to admins:

	```sh
	node .github/rulesets/rulesets.ts check
	```

The Rulesets workflow fails on `main` until the change is applied.

## Change a ruleset in the settings

In an emergency, an admin can change or turn off a ruleset in Settings → Rules → Rulesets. To turn one off, set its enforcement to Disabled. The Rulesets workflow then fails until its file matches the settings again: either update the file in a pull request, or apply the file to undo the change.

## Add a ruleset

Add a JSON file with a `name` that no other ruleset of the repository has, in the format of the REST API, and apply it as above. The easiest way to get the JSON of an existing ruleset is `gh api repos/microsoft/vscode/rulesets/<id>`: remove the fields that the API adds, such as `id`, `source`, `node_id`, `_links`, `created_at` and `updated_at`.
