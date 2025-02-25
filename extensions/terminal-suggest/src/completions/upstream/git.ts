// import { ai } from "../../fig/ai/ai";

const filterMessages = (out: string): string => {
	return out.startsWith("warning:") || out.startsWith("error:")
		? out.split("\n").slice(1).join("\n")
		: out;
};

const postProcessTrackedFiles: Fig.Generator["postProcess"] = (
	out,
	context
) => {
	const output = filterMessages(out);

	if (output.startsWith("fatal:")) {
		return [];
	}

	const files = output.split("\n").map((file) => {
		const arr = file.trim().split(" ");

		return { working: arr[0], file: arr.slice(1).join(" ").trim() };
	});

	return [
		...files.map((item) => {
			const file = item.file.replace(/^"|"$/g, "");
			let ext = "";

			try {
				ext = file.split(".").slice(-1)[0];
			} catch (e) { }

			if (file.endsWith("/")) {
				ext = "folder";
			}

			return {
				name: file,
				icon: `fig://icon?type=${ext}&color=ff0000&badge=${item.working}`,
				description: "Changed tracked files",
				// If the current file already is already added
				// we want to lower the priority
				priority: context.some((ctx) => ctx.includes(file)) ? 50 : 100,
			};
		}),
	];
};

interface PostProcessBranchesOptions {
	insertWithoutRemotes?: true;
}

const postProcessBranches =
	(options: PostProcessBranchesOptions = {}): Fig.Generator["postProcess"] =>
		(out): (Fig.Suggestion | null)[] => {
			const { insertWithoutRemotes = false } = options;

			const output = filterMessages(out);

			if (output.startsWith("fatal:")) {
				return [];
			}

			const seen = new Set<string>();
			return output
				.split("\n")
				.filter((line) => !line.trim().startsWith("HEAD"))
				.map((branch) => {
					let name = branch.trim();
					const parts = branch.match(/\S+/g);
					if (!parts) {
						return null;
					}
					if (parts.length > 1) {
						if (parts[0] === "*") {
							// We are in a detached HEAD state
							if (branch.includes("HEAD detached")) {
								return null;
							}
							// Current branch
							return {
								name: branch.replace("*", "").trim(),
								description: "Current branch",
								priority: 100,
								icon: "⭐️",
							};
						} else if (parts[0] === "+") {
							// Branch checked out in another worktree.
							name = branch.replace("+", "").trim();
						}
					}

					let description = "Branch";

					if (insertWithoutRemotes && name.startsWith("remotes/")) {
						name = name.slice(name.indexOf("/", 8) + 1);
						description = "Remote branch";
					}

					const space = name.indexOf(" ");
					if (space !== -1) {
						name = name.slice(0, space);
					}

					return {
						name,
						description,
						icon: "fig://icon?type=git",
						priority: 75,
					};
				})
				.filter((suggestion) => {
					if (!suggestion || seen.has(suggestion.name)) return false;
					seen.add(suggestion.name);
					return true;
				});
		};

export const gitGenerators: Record<string, Fig.Generator> = {
	// Commit history
	commits: {
		script: ["git", "--no-optional-locks", "log", "--oneline"],
		postProcess: function (out) {
			const output = filterMessages(out);

			if (output.startsWith("fatal:")) {
				return [];
			}

			return output.split("\n").map((line) => {
				return {
					name: line.substring(0, 7),
					icon: "fig://icon?type=node",
					description: line.substring(7),
				};
			});
		},
	},

	// user aliases
	aliases: {
		script: ["git", "--no-optional-locks", "config", "--get-regexp", "^alias."],
		cache: {
			strategy: "stale-while-revalidate",
		},
		postProcess: (out) => {
			const suggestions = out.split("\n").map((aliasLine) => {
				const [name, ...parts] = aliasLine.slice("alias.".length).split(" ");
				const value = parts.join(" ");
				return {
					name,
					description: `Alias for '${value}'`,
					icon: "fig://icon?type=commandkey",
				};
			});
			const seen = new Set();
			return suggestions.filter((suggestion) => {
				if (seen.has(suggestion.name)) {
					return false;
				}
				seen.add(suggestion.name);
				return true;
			});
		},
	},

	revs: {
		script: ["git", "rev-list", "--all", "--oneline"],
		postProcess: function (out) {
			const output = filterMessages(out);

			if (output.startsWith("fatal:")) {
				return [];
			}

			return output.split("\n").map((line) => {
				return {
					name: line.substring(0, 7),
					icon: "fig://icon?type=node",
					description: line.substring(7),
				};
			});
		},
	},

	// Saved stashes
	// TODO: maybe only print names of stashes
	stashes: {
		script: ["git", "--no-optional-locks", "stash", "list"],
		postProcess: function (out) {
			const output = filterMessages(out);

			if (output.startsWith("fatal:")) {
				return [];
			}

			return output.split("\n").map((file) => {
				return {
					// account for conventional commit messages
					name: file.split(":").slice(2).join(":"),
					insertValue: file.split(":")[0],
					icon: `fig://icon?type=node`,
				};
			});
		},
	},

	// Tree-ish
	// This needs to be fleshed out properly....
	// e.g. what is difference to commit-ish?
	// Refer to this:https://stackoverflow.com/questions/23303549/what-are-commit-ish-and-tree-ish-in-git/40910185
	// https://mirrors.edge.kernel.org/pub/software/scm/git/docs/#_identifier_terminology

	treeish: {
		script: ["git", "--no-optional-locks", "diff", "--cached", "--name-only"],
		postProcess: function (out, tokens) {
			const output = filterMessages(out);

			if (output.startsWith("fatal:")) {
				return [];
			}

			return output.split("\n").map((file) => {
				return {
					name: file,
					insertValue: (!tokens.includes("--") ? "-- " : "") + file,
					icon: `fig://icon?type=file`,
					description: "Staged file",
				};
			});
		},
	},

	// All branches
	remoteLocalBranches: {
		script: [
			"git",
			"--no-optional-locks",
			"branch",
			"-a",
			"--no-color",
			"--sort=-committerdate",
		],
		postProcess: postProcessBranches({ insertWithoutRemotes: true }),
	},

	localBranches: {
		script: [
			"git",
			"--no-optional-locks",
			"branch",
			"--no-color",
			"--sort=-committerdate",
		],
		postProcess: postProcessBranches({ insertWithoutRemotes: true }),
	},

	// custom generator to display local branches by default or
	// remote branches if '-r' flag is used. See branch -d for use
	localOrRemoteBranches: {
		custom: async (tokens, executeShellCommand) => {
			const pp = postProcessBranches({ insertWithoutRemotes: true });
			if (tokens.includes("-r")) {
				return pp?.(
					(
						await executeShellCommand({
							command: "git",
							args: [
								"--no-optional-locks",
								"-r",
								"--no-color",
								"--sort=-committerdate",
							],
						})
					).stdout,
					tokens
				);
			} else {
				return pp?.(
					(
						await executeShellCommand({
							command: "git",
							args: [
								"--no-optional-locks",
								"branch",
								"--no-color",
								"--sort=-committerdate",
							],
						})
					).stdout,
					tokens
				);
			}
		},
	},

	remotes: {
		script: ["git", "--no-optional-locks", "remote", "-v"],
		postProcess: function (out) {
			const remoteURLs = out.split("\n").reduce<Record<string, string>>((dict, line) => {
				const pair = line.split("\t");
				const remote = pair[0];
				const url = pair[1].split(" ")[0];

				dict[remote] = url;
				return dict;
			}, {});

			return Object.keys(remoteURLs).map((remote) => {
				const url = remoteURLs[remote];
				let icon = "box";
				if (url.includes("github.com")) {
					icon = "github";
				}

				if (url.includes("gitlab.com")) {
					icon = "gitlab";
				}

				if (url.includes("heroku.com")) {
					icon = "heroku";
				}
				return {
					name: remote,
					icon: `fig://icon?type=${icon}`,
					description: "Remote",
				};
			});
		},
	},

	tags: {
		script: [
			"git",
			"--no-optional-locks",
			"tag",
			"--list",
			"--sort=-committerdate",
		],
		postProcess: function (output) {
			return output.split("\n").map((tag) => ({
				name: tag,
				icon: "🏷️",
			}));
		},
	},

	// Files for staging
	files_for_staging: {
		script: ["git", "--no-optional-locks", "status", "--short"],
		postProcess: (out, context) => {
			// This whole function is a mess

			const output = filterMessages(out);

			if (output.startsWith("fatal:")) {
				return [];
			}
			let files = output.split("\n").map((file) => {
				// From "git --no-optional-locks status --short"
				// M  dev/github.ts // test file that was added
				//  M dev/kubectl.ts // test file that was not added
				// A  test2.txt // new added and tracked file
				// ?? test.txt // new untracked file
				const alreadyAdded = ["M", "A"].includes(file.charAt(0));

				file = file.trim();
				const arr = file.split(" ");

				return {
					working: arr[0],
					file: arr.slice(1).join(" ").trim(),
					alreadyAdded,
				};
			});

			const paths = output.split("\n").map((file) => {
				const arr = file
					.slice(0, file.lastIndexOf("/") + 1)
					.trim()
					.split(" ");
				return arr.slice(1).join(" ").trim();
			});

			const dirArr = [];
			if (paths.length >= 2) {
				let currentDir = paths[0];
				let count = 1;
				for (let i = 1; i < paths.length; i++) {
					if (paths[i].includes(currentDir) && i + 1 !== paths.length) {
						count++;
					} else {
						if (count >= 2) {
							dirArr.push(currentDir);
						}
						count = 1;
					}
					currentDir = paths[i];
				}
			}

			// Filter out the files that the user has already input in the current edit buffer
			files = files.filter((item) => {
				const file = item.file.replace(/^"|"$/g, "");
				return !context.some((ctx) => {
					return (
						ctx === file ||
						// Need to add support for proper globbing one day
						(ctx.endsWith("*") && file.startsWith(ctx.slice(0, -1))) ||
						(ctx.startsWith("*") && file.endsWith(ctx.slice(1)))
					);
				});
			});

			return [
				...dirArr.map((name) => {
					return {
						name: name + "*",
						description: "Wildcard",
						icon: "fig://icon?type=asterisk",
					};
				}),
				...files.map((item) => {
					const file = item.file.replace(/^"|"$/g, "");
					let ext = "";
					try {
						ext = file.split(".").slice(-1)[0];
					} catch (e) { }

					if (file.endsWith("/")) {
						ext = "folder";
					}

					// If the current file is already added
					// we want to lower the priority
					const priority = item.alreadyAdded ? 50 : 100;
					return {
						name: file,
						icon: `fig://icon?type=${ext}&color=ff0000&badge=${item.working}`,
						description: "Changed file",
						priority,
					};
				}),
			];
		},
	},

	getStagedFiles: {
		script: [
			"bash",
			"-c",
			"git --no-optional-locks status --short | sed -ne '/^M /p' -e '/A /p'",
		],
		postProcess: postProcessTrackedFiles,
	},

	getUnstagedFiles: {
		script: ["git", "--no-optional-locks", "diff", "--name-only"],
		splitOn: "\n",
	},

	getChangedTrackedFiles: {
		script: function (context) {
			if (context.includes("--staged") || context.includes("--cached")) {
				return [
					"bash",
					"-c",
					`git --no-optional-locks status --short | sed -ne '/^M /p' -e '/A /p'`,
				];
			} else {
				return [
					"bash",
					"-c",
					`git --no-optional-locks status --short | sed -ne '/M /p' -e '/A /p'`,
				];
			}
		},
		postProcess: postProcessTrackedFiles,
	},
};

const configSuggestions: Fig.Suggestion[] = [
	{
		name: "add.ignore-errors",
		description:
			"Tells 'git add' to continue adding files when some files cannot be added due to indexing errors. Equivalent to the `--ignore-errors` option of git-add[1]. `add.ignore-errors` is deprecated, as it does not follow the usual naming convention for configuration variables",
		deprecated: true,
		hidden: true,
	},
	{
		name: "add.interactive.useBuiltin",
		description:
			"Set to `false` to fall back to the original Perl implementation of the interactive version of git-add[1] instead of the built-in version. Is `true` by default",
	},
	{
		name: "advice.addEmbeddedRepo",
		description:
			"Advice on what to do when you've accidentally added one git repo inside of another",
	},
	{
		name: "advice.addEmptyPathspec",
		description:
			"Advice shown if a user runs the add command without providing the pathspec parameter",
	},
	{
		name: "advice.addIgnoredFile",
		description:
			"Advice shown if a user attempts to add an ignored file to the index",
	},
	{
		name: "advice.ambiguousFetchRefspec",
		description:
			"Advice shown when fetch refspec for multiple remotes map to the same remote-tracking branch namespace and causes branch tracking set-up to fail",
	},
	{
		name: "advice.amWorkDir",
		description:
			"Advice that shows the location of the patch file when git-am[1] fails to apply it",
	},
	{
		name: "advice.checkoutAmbiguousRemoteBranchName",
		description:
			"Advice shown when the argument to git-checkout[1] and git-switch[1] ambiguously resolves to a remote tracking branch on more than one remote in situations where an unambiguous argument would have otherwise caused a remote-tracking branch to be checked out. See the `checkout.defaultRemote` configuration variable for how to set a given remote to used by default in some situations where this advice would be printed",
	},
	{
		name: "advice.commitBeforeMerge",
		description:
			"Advice shown when git-merge[1] refuses to merge to avoid overwriting local changes",
	},
	{
		name: "advice.detachedHead",
		description:
			"Advice shown when you used git-switch[1] or git-checkout[1] to move to the detach HEAD state, to instruct how to create a local branch after the fact",
	},
	{
		name: "advice.fetchShowForcedUpdates",
		description:
			"Advice shown when git-fetch[1] takes a long time to calculate forced updates after ref updates, or to warn that the check is disabled",
	},
	{
		name: "advice.ignoredHook",
		description:
			"Advice shown if a hook is ignored because the hook is not set as executable",
	},
	{
		name: "advice.implicitIdentity",
		description:
			"Advice on how to set your identity configuration when your information is guessed from the system username and domain name",
	},
	{
		name: "advice.nestedTag",
		description:
			"Advice shown if a user attempts to recursively tag a tag object",
	},
	{
		name: "advice.pushAlreadyExists",
		description:
			"Shown when git-push[1] rejects an update that does not qualify for fast-forwarding (e.g., a tag.)",
	},
	{
		name: "advice.pushFetchFirst",
		description:
			"Shown when git-push[1] rejects an update that tries to overwrite a remote ref that points at an object we do not have",
	},
	{
		name: "advice.pushNeedsForce",
		description:
			"Shown when git-push[1] rejects an update that tries to overwrite a remote ref that points at an object that is not a commit-ish, or make the remote ref point at an object that is not a commit-ish",
	},
	{
		name: "advice.pushNonFFCurrent",
		description:
			"Advice shown when git-push[1] fails due to a non-fast-forward update to the current branch",
	},
	{
		name: "advice.pushNonFFMatching",
		description:
			"Advice shown when you ran git-push[1] and pushed 'matching refs' explicitly (i.e. you used ':', or specified a refspec that isn't your current branch) and it resulted in a non-fast-forward error",
	},
	{
		name: "advice.pushRefNeedsUpdate",
		description:
			"Shown when git-push[1] rejects a forced update of a branch when its remote-tracking ref has updates that we do not have locally",
	},
	{
		name: "advice.pushUnqualifiedRefname",
		description:
			"Shown when git-push[1] gives up trying to guess based on the source and destination refs what remote ref namespace the source belongs in, but where we can still suggest that the user push to either refs/heads/* or refs/tags/* based on the type of the source object",
	},
	{
		name: "advice.pushUpdateRejected",
		description:
			"Set this variable to 'false' if you want to disable 'pushNonFFCurrent', 'pushNonFFMatching', 'pushAlreadyExists', 'pushFetchFirst', 'pushNeedsForce', and 'pushRefNeedsUpdate' simultaneously",
	},
	{
		name: "advice.resetNoRefresh",
		description:
			"Advice to consider using the `--no-refresh` option to git-reset[1] when the command takes more than 2 seconds to refresh the index after reset",
	},
	{
		name: "advice.resolveConflict",
		description:
			"Advice shown by various commands when conflicts prevent the operation from being performed",
	},
	{
		name: "advice.rmHints",
		description:
			"In case of failure in the output of git-rm[1], show directions on how to proceed from the current state",
	},
	{
		name: "advice.sequencerInUse",
		description: "Advice shown when a sequencer command is already in progress",
	},
	{
		name: "advice.skippedCherryPicks",
		description:
			"Shown when git-rebase[1] skips a commit that has already been cherry-picked onto the upstream branch",
	},
	{
		name: "advice.statusAheadBehind",
		description:
			"Shown when git-status[1] computes the ahead/behind counts for a local ref compared to its remote tracking ref, and that calculation takes longer than expected. Will not appear if `status.aheadBehind` is false or the option `--no-ahead-behind` is given",
	},
	{
		name: "advice.statusHints",
		description:
			"Show directions on how to proceed from the current state in the output of git-status[1], in the template shown when writing commit messages in git-commit[1], and in the help message shown by git-switch[1] or git-checkout[1] when switching branch",
	},
	{
		name: "advice.statusUoption",
		description:
			"Advise to consider using the `-u` option to git-status[1] when the command takes more than 2 seconds to enumerate untracked files",
	},
	{
		name: "advice.submoduleAlternateErrorStrategyDie",
		description:
			'Advice shown when a submodule.alternateErrorStrategy option configured to "die" causes a fatal error',
	},
	{
		name: "advice.submodulesNotUpdated",
		description:
			"Advice shown when a user runs a submodule command that fails because `git submodule update --init` was not run",
	},
	{
		name: "advice.suggestDetachingHead",
		description:
			"Advice shown when git-switch[1] refuses to detach HEAD without the explicit `--detach` option",
	},
	{
		name: "advice.updateSparsePath",
		description:
			"Advice shown when either git-add[1] or git-rm[1] is asked to update index entries outside the current sparse checkout",
	},
	{
		name: "advice.waitingForEditor",
		description:
			"Print a message to the terminal whenever Git is waiting for editor input from the user",
	},
	{
		name: "alias.*",
		insertValue: "alias.{cursor}",
		description:
			"Command aliases for the git[1] command wrapper - e.g. after defining `alias.last = cat-file commit HEAD`, the invocation `git last` is equivalent to `git cat-file commit HEAD`. To avoid confusion and troubles with script usage, aliases that hide existing Git commands are ignored. Arguments are split by spaces, the usual shell quoting and escaping is supported. A quote pair or a backslash can be used to quote them",
	},
	{
		name: "am.keepcr",
		description:
			"If true, git-am will call git-mailsplit for patches in mbox format with parameter `--keep-cr`. In this case git-mailsplit will not remove `\\r` from lines ending with `\\r\\n`. Can be overridden by giving `--no-keep-cr` from the command line. See git-am[1], git-mailsplit[1]",
	},
	{
		name: "am.threeWay",
		description:
			"By default, `git am` will fail if the patch does not apply cleanly. When set to true, this setting tells `git am` to fall back on 3-way merge if the patch records the identity of blobs it is supposed to apply to and we have those blobs available locally (equivalent to giving the `--3way` option from the command line). Defaults to `false`. See git-am[1]",
	},
	{
		name: "apply.ignoreWhitespace",
		description:
			"When set to 'change', tells 'git apply' to ignore changes in whitespace, in the same way as the `--ignore-space-change` option. When set to one of: no, none, never, false tells 'git apply' to respect all whitespace differences. See git-apply[1]",
	},
	{
		name: "apply.whitespace",
		description:
			"Tells 'git apply' how to handle whitespaces, in the same way as the `--whitespace` option. See git-apply[1]",
	},
	{
		name: "blame.blankBoundary",
		description:
			"Show blank commit object name for boundary commits in git-blame[1]. This option defaults to false",
	},
	{
		name: "blame.coloring",
		description:
			"This determines the coloring scheme to be applied to blame output. It can be 'repeatedLines', 'highlightRecent', or 'none' which is the default",
	},
	{
		name: "blame.date",
		description:
			"Specifies the format used to output dates in git-blame[1]. If unset the iso format is used. For supported values, see the discussion of the `--date` option at git-log[1]",
	},
	{
		name: "blame.ignoreRevsFile",
		description:
			"Ignore revisions listed in the file, one unabbreviated object name per line, in git-blame[1]. Whitespace and comments beginning with `#` are ignored. This option may be repeated multiple times. Empty file names will reset the list of ignored revisions. This option will be handled before the command line option `--ignore-revs-file`",
	},
	{
		name: "blame.markIgnoredLines",
		description:
			"Mark lines that were changed by an ignored revision that we attributed to another commit with a '?' in the output of git-blame[1]",
	},
	{
		name: "blame.markUnblamableLines",
		description:
			"Mark lines that were changed by an ignored revision that we could not attribute to another commit with a '*' in the output of git-blame[1]",
	},
	{
		name: "blame.showEmail",
		description:
			"Show the author email instead of author name in git-blame[1]. This option defaults to false",
	},
	{
		name: "blame.showRoot",
		description:
			"Do not treat root commits as boundaries in git-blame[1]. This option defaults to false",
	},
	{
		name: "branch.<name>.description",
		insertValue: "branch.{cursor}.description",
		description:
			"Branch description, can be edited with `git branch --edit-description`. Branch description is automatically added in the format-patch cover letter or request-pull summary",
	},
	{
		name: "branch.<name>.merge",
		insertValue: "branch.{cursor}.merge",
		description:
			"Defines, together with branch.<name>.remote, the upstream branch for the given branch. It tells 'git fetch'/'git pull'/'git rebase' which branch to merge and can also affect 'git push' (see push.default). When in branch <name>, it tells 'git fetch' the default refspec to be marked for merging in FETCH_HEAD. The value is handled like the remote part of a refspec, and must match a ref which is fetched from the remote given by \"branch.<name>.remote\". The merge information is used by 'git pull' (which at first calls 'git fetch') to lookup the default branch for merging. Without this option, 'git pull' defaults to merge the first refspec fetched. Specify multiple values to get an octopus merge. If you wish to setup 'git pull' so that it merges into <name> from another branch in the local repository, you can point branch.<name>.merge to the desired branch, and use the relative path setting `.` (a period) for branch.<name>.remote",
	},
	{
		name: "branch.<name>.mergeOptions",
		insertValue: "branch.{cursor}.mergeOptions",
		description:
			"Sets default options for merging into branch <name>. The syntax and supported options are the same as those of git-merge[1], but option values containing whitespace characters are currently not supported",
	},
	{
		name: "branch.<name>.pushRemote",
		insertValue: "branch.{cursor}.pushRemote",
		description:
			"When on branch <name>, it overrides `branch.<name>.remote` for pushing. It also overrides `remote.pushDefault` for pushing from branch <name>. When you pull from one place (e.g. your upstream) and push to another place (e.g. your own publishing repository), you would want to set `remote.pushDefault` to specify the remote to push to for all branches, and use this option to override it for a specific branch",
	},
	{
		name: "branch.<name>.rebase",
		insertValue: "branch.{cursor}.rebase",
		description:
			'When true, rebase the branch <name> on top of the fetched branch, instead of merging the default branch from the default remote when "git pull" is run. See "pull.rebase" for doing this in a non branch-specific manner',
	},
	{
		name: "branch.<name>.remote",
		insertValue: "branch.{cursor}.remote",
		description:
			"When on branch <name>, it tells 'git fetch' and 'git push' which remote to fetch from/push to. The remote to push to may be overridden with `remote.pushDefault` (for all branches). The remote to push to, for the current branch, may be further overridden by `branch.<name>.pushRemote`. If no remote is configured, or if you are not on any branch and there is more than one remote defined in the repository, it defaults to `origin` for fetching and `remote.pushDefault` for pushing. Additionally, `.` (a period) is the current local repository (a dot-repository), see `branch.<name>.merge`'s final note below",
	},
	{
		name: "branch.autoSetupMerge",
		description:
			"Tells 'git branch', 'git switch' and 'git checkout' to set up new branches so that git-pull[1] will appropriately merge from the starting point branch. Note that even if this option is not set, this behavior can be chosen per-branch using the `--track` and `--no-track` options. The valid settings are: `false` -- no automatic setup is done; `true` -- automatic setup is done when the starting point is a remote-tracking branch; `always` -- automatic setup is done when the starting point is either a local branch or remote-tracking branch; `inherit` -- if the starting point has a tracking configuration, it is copied to the new branch; `simple` -- automatic setup is done only when the starting point is a remote-tracking branch and the new branch has the same name as the remote branch. This option defaults to true",
	},
	{
		name: "branch.autoSetupRebase",
		description:
			"When a new branch is created with 'git branch', 'git switch' or 'git checkout' that tracks another branch, this variable tells Git to set up pull to rebase instead of merge (see \"branch.<name>.rebase\"). When `never`, rebase is never automatically set to true. When `local`, rebase is set to true for tracked branches of other local branches. When `remote`, rebase is set to true for tracked branches of remote-tracking branches. When `always`, rebase will be set to true for all tracking branches. See \"branch.autoSetupMerge\" for details on how to set up a branch to track another branch. This option defaults to never",
	},
	{
		name: "branch.sort",
		description:
			'This variable controls the sort ordering of branches when displayed by git-branch[1]. Without the "--sort=<value>" option provided, the value of this variable will be used as the default. See git-for-each-ref[1] field names for valid values',
	},
	{
		name: "browser.<tool>.cmd",
		insertValue: "browser.{cursor}.cmd",
		description:
			"Specify the command to invoke the specified browser. The specified command is evaluated in shell with the URLs passed as arguments. (See git-web{litdd}browse[1].)",
	},
	{
		name: "browser.<tool>.path",
		insertValue: "browser.{cursor}.path",
		description:
			"Override the path for the given tool that may be used to browse HTML help (see `-w` option in git-help[1]) or a working repository in gitweb (see git-instaweb[1])",
	},
	{
		name: "checkout.defaultRemote",
		description:
			"When you run `git checkout <something>` or `git switch <something>` and only have one remote, it may implicitly fall back on checking out and tracking e.g. `origin/<something>`. This stops working as soon as you have more than one remote with a `<something>` reference. This setting allows for setting the name of a preferred remote that should always win when it comes to disambiguation. The typical use-case is to set this to `origin`",
	},
	{
		name: "checkout.guess",
		description:
			"Provides the default value for the `--guess` or `--no-guess` option in `git checkout` and `git switch`. See git-switch[1] and git-checkout[1]",
	},
	{
		name: "checkout.thresholdForParallelism",
		description:
			"When running parallel checkout with a small number of files, the cost of subprocess spawning and inter-process communication might outweigh the parallelization gains. This setting allows to define the minimum number of files for which parallel checkout should be attempted. The default is 100",
	},
	{
		name: "checkout.workers",
		description:
			"The number of parallel workers to use when updating the working tree. The default is one, i.e. sequential execution. If set to a value less than one, Git will use as many workers as the number of logical cores available. This setting and `checkout.thresholdForParallelism` affect all commands that perform checkout. E.g. checkout, clone, reset, sparse-checkout, etc",
	},
	{
		name: "clean.requireForce",
		description:
			"A boolean to make git-clean do nothing unless given -f, -i or -n. Defaults to true",
	},
	{
		name: "clone.defaultRemoteName",
		description:
			"The name of the remote to create when cloning a repository. Defaults to `origin`, and can be overridden by passing the `--origin` command-line option to git-clone[1]",
	},
	{
		name: "clone.filterSubmodules",
		description:
			"If a partial clone filter is provided (see `--filter` in git-rev-list[1]) and `--recurse-submodules` is used, also apply the filter to submodules",
	},
	{
		name: "clone.rejectShallow",
		description:
			"Reject to clone a repository if it is a shallow one, can be overridden by passing option `--reject-shallow` in command line. See git-clone[1]",
	},
	{
		name: "color.advice",
		description:
			"A boolean to enable/disable color in hints (e.g. when a push failed, see `advice.*` for a list). May be set to `always`, `false` (or `never`) or `auto` (or `true`), in which case colors are used only when the error output goes to a terminal. If unset, then the value of `color.ui` is used (`auto` by default)",
	},
	{
		name: "color.advice.hint",
		description: "Use customized color for hints",
	},
	{
		name: "color.blame.highlightRecent",
		description:
			"Specify the line annotation color for `git blame --color-by-age` depending upon the age of the line",
	},
	{
		name: "color.blame.repeatedLines",
		description:
			"Use the specified color to colorize line annotations for `git blame --color-lines`, if they come from the same commit as the preceding line. Defaults to cyan",
	},
	{
		name: "color.branch",
		description:
			"A boolean to enable/disable color in the output of git-branch[1]. May be set to `always`, `false` (or `never`) or `auto` (or `true`), in which case colors are used only when the output is to a terminal. If unset, then the value of `color.ui` is used (`auto` by default)",
	},
	{
		name: "color.branch.<slot>",
		insertValue: "color.branch.{cursor}",
		description:
			"Use customized color for branch coloration. `<slot>` is one of `current` (the current branch), `local` (a local branch), `remote` (a remote-tracking branch in refs/remotes/), `upstream` (upstream tracking branch), `plain` (other refs)",
	},
	{
		name: "color.decorate.<slot>",
		insertValue: "color.decorate.{cursor}",
		description:
			"Use customized color for 'git log --decorate' output. `<slot>` is one of `branch`, `remoteBranch`, `tag`, `stash` or `HEAD` for local branches, remote-tracking branches, tags, stash and HEAD, respectively and `grafted` for grafted commits",
	},
	{
		name: "color.diff",
		description:
			"Whether to use ANSI escape sequences to add color to patches. If this is set to `always`, git-diff[1], git-log[1], and git-show[1] will use color for all patches. If it is set to `true` or `auto`, those commands will only use color when output is to the terminal. If unset, then the value of `color.ui` is used (`auto` by default)",
	},
	{
		name: "color.diff.<slot>",
		insertValue: "color.diff.{cursor}",
		description:
			"Use customized color for diff colorization. `<slot>` specifies which part of the patch to use the specified color, and is one of `context` (context text - `plain` is a historical synonym), `meta` (metainformation), `frag` (hunk header), 'func' (function in hunk header), `old` (removed lines), `new` (added lines), `commit` (commit headers), `whitespace` (highlighting whitespace errors), `oldMoved` (deleted lines), `newMoved` (added lines), `oldMovedDimmed`, `oldMovedAlternative`, `oldMovedAlternativeDimmed`, `newMovedDimmed`, `newMovedAlternative` `newMovedAlternativeDimmed` (See the '<mode>' setting of '--color-moved' in git-diff[1] for details), `contextDimmed`, `oldDimmed`, `newDimmed`, `contextBold`, `oldBold`, and `newBold` (see git-range-diff[1] for details)",
	},
	{
		name: "color.grep",
		description:
			"When set to `always`, always highlight matches. When `false` (or `never`), never. When set to `true` or `auto`, use color only when the output is written to the terminal. If unset, then the value of `color.ui` is used (`auto` by default)",
	},
	{
		name: "color.grep.<slot>",
		insertValue: "color.grep.{cursor}",
		description:
			"Use customized color for grep colorization. `<slot>` specifies which part of the line to use the specified color, and is one of",
	},
	{
		name: "color.interactive",
		description:
			'When set to `always`, always use colors for interactive prompts and displays (such as those used by "git-add --interactive" and "git-clean --interactive"). When false (or `never`), never. When set to `true` or `auto`, use colors only when the output is to the terminal. If unset, then the value of `color.ui` is used (`auto` by default)',
	},
	{
		name: "color.interactive.<slot>",
		insertValue: "color.interactive.{cursor}",
		description:
			"Use customized color for 'git add --interactive' and 'git clean --interactive' output. `<slot>` may be `prompt`, `header`, `help` or `error`, for four distinct types of normal output from interactive commands",
	},
	{
		name: "color.pager",
		description:
			"A boolean to specify whether `auto` color modes should colorize output going to the pager. Defaults to true; set this to false if your pager does not understand ANSI color codes",
	},
	{
		name: "color.push",
		description:
			"A boolean to enable/disable color in push errors. May be set to `always`, `false` (or `never`) or `auto` (or `true`), in which case colors are used only when the error output goes to a terminal. If unset, then the value of `color.ui` is used (`auto` by default)",
	},
	{
		name: "color.push.error",
		description: "Use customized color for push errors",
	},
	{
		name: "color.remote",
		description:
			'If set, keywords at the start of the line are highlighted. The keywords are "error", "warning", "hint" and "success", and are matched case-insensitively. May be set to `always`, `false` (or `never`) or `auto` (or `true`). If unset, then the value of `color.ui` is used (`auto` by default)',
	},
	{
		name: "color.remote.<slot>",
		insertValue: "color.remote.{cursor}",
		description:
			"Use customized color for each remote keyword. `<slot>` may be `hint`, `warning`, `success` or `error` which match the corresponding keyword",
	},
	{
		name: "color.showBranch",
		description:
			"A boolean to enable/disable color in the output of git-show-branch[1]. May be set to `always`, `false` (or `never`) or `auto` (or `true`), in which case colors are used only when the output is to a terminal. If unset, then the value of `color.ui` is used (`auto` by default)",
	},
	{
		name: "color.status",
		description:
			"A boolean to enable/disable color in the output of git-status[1]. May be set to `always`, `false` (or `never`) or `auto` (or `true`), in which case colors are used only when the output is to a terminal. If unset, then the value of `color.ui` is used (`auto` by default)",
	},
	{
		name: "color.status.<slot>",
		insertValue: "color.status.{cursor}",
		description:
			"Use customized color for status colorization. `<slot>` is one of `header` (the header text of the status message), `added` or `updated` (files which are added but not committed), `changed` (files which are changed but not added in the index), `untracked` (files which are not tracked by Git), `branch` (the current branch), `nobranch` (the color the 'no branch' warning is shown in, defaulting to red), `localBranch` or `remoteBranch` (the local and remote branch names, respectively, when branch and tracking information is displayed in the status short-format), or `unmerged` (files which have unmerged changes)",
	},
	{
		name: "color.transport",
		description:
			"A boolean to enable/disable color when pushes are rejected. May be set to `always`, `false` (or `never`) or `auto` (or `true`), in which case colors are used only when the error output goes to a terminal. If unset, then the value of `color.ui` is used (`auto` by default)",
	},
	{
		name: "color.transport.rejected",
		description: "Use customized color when a push was rejected",
	},
	{
		name: "color.ui",
		description:
			"This variable determines the default value for variables such as `color.diff` and `color.grep` that control the use of color per command family. Its scope will expand as more commands learn configuration to set a default for the `--color` option. Set it to `false` or `never` if you prefer Git commands not to use color unless enabled explicitly with some other configuration or the `--color` option. Set it to `always` if you want all output not intended for machine consumption to use color, to `true` or `auto` (this is the default since Git 1.8.4) if you want such output to use color when written to the terminal",
	},
	{
		name: "column.branch",
		description:
			"Specify whether to output branch listing in `git branch` in columns. See `column.ui` for details",
	},
	{
		name: "column.clean",
		description:
			"Specify the layout when list items in `git clean -i`, which always shows files and directories in columns. See `column.ui` for details",
	},
	{
		name: "column.status",
		description:
			"Specify whether to output untracked files in `git status` in columns. See `column.ui` for details",
	},
	{
		name: "column.tag",
		description:
			"Specify whether to output tag listing in `git tag` in columns. See `column.ui` for details",
	},
	{
		name: "column.ui",
		description:
			"Specify whether supported commands should output in columns. This variable consists of a list of tokens separated by spaces or commas:",
	},
	{
		name: "commit.cleanup",
		description:
			"This setting overrides the default of the `--cleanup` option in `git commit`. See git-commit[1] for details. Changing the default can be useful when you always want to keep lines that begin with comment character `#` in your log message, in which case you would do `git config commit.cleanup whitespace` (note that you will have to remove the help lines that begin with `#` in the commit log template yourself, if you do this)",
	},
	{
		name: "commit.status",
		description:
			"A boolean to enable/disable inclusion of status information in the commit message template when using an editor to prepare the commit message. Defaults to true",
	},
	{
		name: "commit.template",
		description:
			"Specify the pathname of a file to use as the template for new commit messages",
	},
	{
		name: "commit.verbose",
		description:
			"A boolean or int to specify the level of verbose with `git commit`. See git-commit[1]",
	},
	{
		name: "commitGraph.generationVersion",
		description:
			"Specifies the type of generation number version to use when writing or reading the commit-graph file. If version 1 is specified, then the corrected commit dates will not be written or read. Defaults to 2",
	},
	{
		name: "commitGraph.maxNewFilters",
		description:
			"Specifies the default value for the `--max-new-filters` option of `git commit-graph write` (c.f., git-commit-graph[1])",
	},
	{
		name: "commitGraph.readChangedPaths",
		description:
			"If true, then git will use the changed-path Bloom filters in the commit-graph file (if it exists, and they are present). Defaults to true. See git-commit-graph[1] for more information",
	},
	{
		name: "committer.email",
		description:
			"The `user.name` and `user.email` variables determine what ends up in the `author` and `committer` field of commit objects. If you need the `author` or `committer` to be different, the `author.name`, `author.email`, `committer.name` or `committer.email` variables can be set. Also, all of these can be overridden by the `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, `GIT_COMMITTER_EMAIL` and `EMAIL` environment variables",
	},
	{
		name: "completion.commands",
		description:
			"This is only used by git-completion.bash to add or remove commands from the list of completed commands. Normally only porcelain commands and a few select others are completed. You can add more commands, separated by space, in this variable. Prefixing the command with '-' will remove it from the existing list",
	},
	{
		name: "core.abbrev",
		description:
			'Set the length object names are abbreviated to. If unspecified or set to "auto", an appropriate value is computed based on the approximate number of packed objects in your repository, which hopefully is enough for abbreviated object names to stay unique for some time. If set to "no", no abbreviation is made and the object names are shown in their full length. The minimum length is 4',
	},
	{
		name: "core.alternateRefsCommand",
		description:
			"When advertising tips of available history from an alternate, use the shell to execute the specified command instead of git-for-each-ref[1]. The first argument is the absolute path of the alternate. Output must contain one hex object id per line (i.e., the same as produced by `git for-each-ref --format='%(objectname)'`)",
	},
	{
		name: "core.alternateRefsPrefixes",
		description:
			"When listing references from an alternate, list only references that begin with the given prefix. Prefixes match as if they were given as arguments to git-for-each-ref[1]. To list multiple prefixes, separate them with whitespace. If `core.alternateRefsCommand` is set, setting `core.alternateRefsPrefixes` has no effect",
	},
	{
		name: "core.askPass",
		description:
			"Some commands (e.g. svn and http interfaces) that interactively ask for a password can be told to use an external program given via the value of this variable. Can be overridden by the `GIT_ASKPASS` environment variable. If not set, fall back to the value of the `SSH_ASKPASS` environment variable or, failing that, a simple password prompt. The external program shall be given a suitable prompt as command-line argument and write the password on its STDOUT",
	},
	{
		name: "core.attributesFile",
		description:
			"In addition to `.gitattributes` (per-directory) and `.git/info/attributes`, Git looks into this file for attributes (see gitattributes[5]). Path expansions are made the same way as for `core.excludesFile`. Its default value is `$XDG_CONFIG_HOME/git/attributes`. If `$XDG_CONFIG_HOME` is either not set or empty, `$HOME/.config/git/attributes` is used instead",
	},
	{
		name: "core.autocrlf",
		description:
			'Setting this variable to "true" is the same as setting the `text` attribute to "auto" on all files and core.eol to "crlf". Set to true if you want to have `CRLF` line endings in your working directory and the repository has LF line endings. This variable can be set to \'input\', in which case no output conversion is performed',
	},
	{
		name: "core.bare",
		description:
			"If true this repository is assumed to be 'bare' and has no working directory associated with it. If this is the case a number of commands that require a working directory will be disabled, such as git-add[1] or git-merge[1]",
	},
	{
		name: "core.bigFileThreshold",
		description:
			"The size of files considered \"big\", which as discussed below changes the behavior of numerous git commands, as well as how such files are stored within the repository. The default is 512 MiB. Common unit suffixes of 'k', 'm', or 'g' are supported",
	},
	{
		name: "core.checkRoundtripEncoding",
		description:
			"A comma and/or whitespace separated list of encodings that Git performs UTF-8 round trip checks on if they are used in an `working-tree-encoding` attribute (see gitattributes[5]). The default value is `SHIFT-JIS`",
	},
	{
		name: "core.checkStat",
		description:
			"When missing or is set to `default`, many fields in the stat structure are checked to detect if a file has been modified since Git looked at it. When this configuration variable is set to `minimal`, sub-second part of mtime and ctime, the uid and gid of the owner of the file, the inode number (and the device number, if Git was compiled to use it), are excluded from the check among these fields, leaving only the whole-second part of mtime (and ctime, if `core.trustCtime` is set) and the filesize to be checked",
	},
	{
		name: "core.commentChar",
		description:
			"Commands such as `commit` and `tag` that let you edit messages consider a line that begins with this character commented, and removes them after the editor returns (default '#')",
	},
	{
		name: "core.commitGraph",
		description:
			"If true, then git will read the commit-graph file (if it exists) to parse the graph structure of commits. Defaults to true. See git-commit-graph[1] for more information",
	},
	{
		name: "core.compression",
		description:
			"An integer -1..9, indicating a default compression level. -1 is the zlib default. 0 means no compression, and 1..9 are various speed/size tradeoffs, 9 being slowest. If set, this provides a default to other compression variables, such as `core.looseCompression` and `pack.compression`",
	},
	{
		name: "core.createObject",
		description:
			"You can set this to 'link', in which case a hardlink followed by a delete of the source are used to make sure that object creation will not overwrite existing objects",
	},
	{
		name: "core.deltaBaseCacheLimit",
		description:
			"Maximum number of bytes per thread to reserve for caching base objects that may be referenced by multiple deltified objects. By storing the entire decompressed base objects in a cache Git is able to avoid unpacking and decompressing frequently used base objects multiple times",
	},
	{
		name: "core.editor",
		description:
			"Commands such as `commit` and `tag` that let you edit messages by launching an editor use the value of this variable when it is set, and the environment variable `GIT_EDITOR` is not set. See git-var[1]",
	},
	{
		name: "core.eol",
		description:
			"Sets the line ending type to use in the working directory for files that are marked as text (either by having the `text` attribute set, or by having `text=auto` and Git auto-detecting the contents as text). Alternatives are 'lf', 'crlf' and 'native', which uses the platform's native line ending. The default value is `native`. See gitattributes[5] for more information on end-of-line conversion. Note that this value is ignored if `core.autocrlf` is set to `true` or `input`",
	},
	{
		name: "core.excludesFile",
		description:
			"Specifies the pathname to the file that contains patterns to describe paths that are not meant to be tracked, in addition to `.gitignore` (per-directory) and `.git/info/exclude`. Defaults to `$XDG_CONFIG_HOME/git/ignore`. If `$XDG_CONFIG_HOME` is either not set or empty, `$HOME/.config/git/ignore` is used instead. See gitignore[5]",
	},
	{
		name: "core.fileMode",
		description:
			"Tells Git if the executable bit of files in the working tree is to be honored",
	},
	{
		name: "core.filesRefLockTimeout",
		description:
			"The length of time, in milliseconds, to retry when trying to lock an individual reference. Value 0 means not to retry at all; -1 means to try indefinitely. Default is 100 (i.e., retry for 100ms)",
	},
	{
		name: "core.fsmonitor",
		description:
			"If set to true, enable the built-in file system monitor daemon for this working directory (git-fsmonitor{litdd}daemon[1])",
	},
	{
		name: "core.fsmonitorHookVersion",
		description:
			'Sets the protocol version to be used when invoking the "fsmonitor" hook',
	},
	{
		name: "core.fsync",
		description:
			"A comma-separated list of components of the repository that should be hardened via the core.fsyncMethod when created or modified. You can disable hardening of any component by prefixing it with a '-'. Items that are not hardened may be lost in the event of an unclean system shutdown. Unless you have special requirements, it is recommended that you leave this option empty or pick one of `committed`, `added`, or `all`",
	},
	{
		name: "core.fsyncMethod",
		description:
			"A value indicating the strategy Git will use to harden repository data using fsync and related primitives",
	},
	{
		name: "core.fsyncObjectFiles",
		description:
			"This boolean will enable 'fsync()' when writing object files. This setting is deprecated. Use core.fsync instead",
	},
	{
		name: "core.gitProxy",
		description:
			'A "proxy command" to execute (as \'command host port\') instead of establishing direct connection to the remote server when using the Git protocol for fetching. If the variable value is in the "COMMAND for DOMAIN" format, the command is applied only on hostnames ending with the specified domain string. This variable may be set multiple times and is matched in the given order; the first match wins',
	},
	{
		name: "core.hideDotFiles",
		description:
			"(Windows-only) If true, mark newly-created directories and files whose name starts with a dot as hidden. If 'dotGitOnly', only the `.git/` directory is hidden, but no other files starting with a dot. The default mode is 'dotGitOnly'",
	},
	{
		name: "core.hooksPath",
		description:
			"By default Git will look for your hooks in the `$GIT_DIR/hooks` directory. Set this to different path, e.g. `/etc/git/hooks`, and Git will try to find your hooks in that directory, e.g. `/etc/git/hooks/pre-receive` instead of in `$GIT_DIR/hooks/pre-receive`",
	},
	{
		name: "core.ignoreCase",
		description:
			'Internal variable which enables various workarounds to enable Git to work better on filesystems that are not case sensitive, like APFS, HFS+, FAT, NTFS, etc. For example, if a directory listing finds "makefile" when Git expects "Makefile", Git will assume it is really the same file, and continue to remember it as "Makefile"',
	},
	{
		name: "core.ignoreStat",
		description:
			'If true, Git will avoid using lstat() calls to detect if files have changed by setting the "assume-unchanged" bit for those tracked files which it has updated identically in both the index and working tree',
	},
	{
		name: "core.logAllRefUpdates",
		description:
			'Enable the reflog. Updates to a ref <ref> is logged to the file "`$GIT_DIR/logs/<ref>`", by appending the new and old SHA-1, the date/time and the reason of the update, but only when the file exists. If this configuration variable is set to `true`, missing "`$GIT_DIR/logs/<ref>`" file is automatically created for branch heads (i.e. under `refs/heads/`), remote refs (i.e. under `refs/remotes/`), note refs (i.e. under `refs/notes/`), and the symbolic ref `HEAD`. If it is set to `always`, then a missing reflog is automatically created for any ref under `refs/`',
	},
	{
		name: "core.looseCompression",
		description:
			"An integer -1..9, indicating the compression level for objects that are not in a pack file. -1 is the zlib default. 0 means no compression, and 1..9 are various speed/size tradeoffs, 9 being slowest. If not set, defaults to core.compression. If that is not set, defaults to 1 (best speed)",
	},
	{
		name: "core.multiPackIndex",
		description:
			"Use the multi-pack-index file to track multiple packfiles using a single index. See git-multi-pack-index[1] for more information. Defaults to true",
	},
	{
		name: "core.notesRef",
		description:
			"When showing commit messages, also show notes which are stored in the given ref. The ref must be fully qualified. If the given ref does not exist, it is not an error but means that no notes should be printed",
	},
	{
		name: "core.packedGitLimit",
		description:
			"Maximum number of bytes to map simultaneously into memory from pack files. If Git needs to access more than this many bytes at once to complete an operation it will unmap existing regions to reclaim virtual address space within the process",
	},
	{
		name: "core.packedGitWindowSize",
		description:
			"Number of bytes of a pack file to map into memory in a single mapping operation. Larger window sizes may allow your system to process a smaller number of large pack files more quickly. Smaller window sizes will negatively affect performance due to increased calls to the operating system's memory manager, but may improve performance when accessing a large number of large pack files",
	},
	{
		name: "core.packedRefsTimeout",
		description:
			"The length of time, in milliseconds, to retry when trying to lock the `packed-refs` file. Value 0 means not to retry at all; -1 means to try indefinitely. Default is 1000 (i.e., retry for 1 second)",
	},
	{
		name: "core.pager",
		description:
			"Text viewer for use by Git commands (e.g., 'less'). The value is meant to be interpreted by the shell. The order of preference is the `$GIT_PAGER` environment variable, then `core.pager` configuration, then `$PAGER`, and then the default chosen at compile time (usually 'less')",
	},
	{
		name: "core.precomposeUnicode",
		description:
			"This option is only used by Mac OS implementation of Git. When core.precomposeUnicode=true, Git reverts the unicode decomposition of filenames done by Mac OS. This is useful when sharing a repository between Mac OS and Linux or Windows. (Git for Windows 1.7.10 or higher is needed, or Git under cygwin 1.7). When false, file names are handled fully transparent by Git, which is backward compatible with older versions of Git",
	},
	{
		name: "core.preferSymlinkRefs",
		description:
			'Instead of the default "symref" format for HEAD and other symbolic reference files, use symbolic links. This is sometimes needed to work with old scripts that expect HEAD to be a symbolic link',
	},
	{
		name: "core.preloadIndex",
		description: "Enable parallel index preload for operations like 'git diff'",
	},
	{
		name: "core.protectHFS",
		description:
			"If set to true, do not allow checkout of paths that would be considered equivalent to `.git` on an HFS+ filesystem. Defaults to `true` on Mac OS, and `false` elsewhere",
	},
	{
		name: "core.protectNTFS",
		description:
			'If set to true, do not allow checkout of paths that would cause problems with the NTFS filesystem, e.g. conflict with 8.3 "short" names. Defaults to `true` on Windows, and `false` elsewhere',
	},
	{
		name: "core.quotePath",
		description:
			'Commands that output paths (e.g. \'ls-files\', \'diff\'), will quote "unusual" characters in the pathname by enclosing the pathname in double-quotes and escaping those characters with backslashes in the same way C escapes control characters (e.g. `\\t` for TAB, `\\n` for LF, `\\\\` for backslash) or bytes with values larger than 0x80 (e.g. octal `\\302\\265` for "micro" in UTF-8). If this variable is set to false, bytes higher than 0x80 are not considered "unusual" any more. Double-quotes, backslash and control characters are always escaped regardless of the setting of this variable. A simple space character is not considered "unusual". Many commands can output pathnames completely verbatim using the `-z` option. The default value is true',
	},
	{
		name: "core.repositoryFormatVersion",
		description:
			"Internal variable identifying the repository format and layout version",
	},
	{
		name: "core.restrictinheritedhandles",
		description:
			"Windows-only: override whether spawned processes inherit only standard file handles (`stdin`, `stdout` and `stderr`) or all handles. Can be `auto`, `true` or `false`. Defaults to `auto`, which means `true` on Windows 7 and later, and `false` on older Windows versions",
	},
	{
		name: "core.safecrlf",
		description:
			'If true, makes Git check if converting `CRLF` is reversible when end-of-line conversion is active. Git will verify if a command modifies a file in the work tree either directly or indirectly. For example, committing a file followed by checking out the same file should yield the original file in the work tree. If this is not the case for the current setting of `core.autocrlf`, Git will reject the file. The variable can be set to "warn", in which case Git will only warn about an irreversible conversion but continue the operation',
	},
	{
		name: "core.sharedRepository",
		description:
			"When 'group' (or 'true'), the repository is made shareable between several users in a group (making sure all the files and objects are group-writable). When 'all' (or 'world' or 'everybody'), the repository will be readable by all users, additionally to being group-shareable. When 'umask' (or 'false'), Git will use permissions reported by umask(2). When '0xxx', where '0xxx' is an octal number, files in the repository will have this mode value. '0xxx' will override user's umask value (whereas the other options will only override requested parts of the user's umask value). Examples: '0660' will make the repo read/write-able for the owner and group, but inaccessible to others (equivalent to 'group' unless umask is e.g. '0022'). '0640' is a repository that is group-readable but not group-writable. See git-init[1]. False by default",
	},
	{
		name: "core.sparseCheckout",
		description:
			'Enable "sparse checkout" feature. See git-sparse-checkout[1] for more information',
	},
	{
		name: "core.sparseCheckoutCone",
		description:
			'Enables the "cone mode" of the sparse checkout feature. When the sparse-checkout file contains a limited set of patterns, this mode provides significant performance advantages. The "non-cone mode" can be requested to allow specifying more flexible patterns by setting this variable to \'false\'. See git-sparse-checkout[1] for more information',
	},
	{
		name: "core.splitIndex",
		description:
			"If true, the split-index feature of the index will be used. See git-update-index[1]. False by default",
	},
	{
		name: "core.sshCommand",
		description:
			"If this variable is set, `git fetch` and `git push` will use the specified command instead of `ssh` when they need to connect to a remote system. The command is in the same form as the `GIT_SSH_COMMAND` environment variable and is overridden when the environment variable is set",
	},
	{
		name: "core.symlinks",
		description:
			"If false, symbolic links are checked out as small plain files that contain the link text. git-update-index[1] and git-add[1] will not change the recorded type to regular file. Useful on filesystems like FAT that do not support symbolic links",
	},
	{
		name: "core.trustctime",
		description:
			"If false, the ctime differences between the index and the working tree are ignored; useful when the inode change time is regularly modified by something outside Git (file system crawlers and some backup systems). See git-update-index[1]. True by default",
	},
	{
		name: "core.unsetenvvars",
		description:
			"Windows-only: comma-separated list of environment variables' names that need to be unset before spawning any other process. Defaults to `PERL5LIB` to account for the fact that Git for Windows insists on using its own Perl interpreter",
	},
	{
		name: "core.untrackedCache",
		description:
			"Determines what to do about the untracked cache feature of the index. It will be kept, if this variable is unset or set to `keep`. It will automatically be added if set to `true`. And it will automatically be removed, if set to `false`. Before setting it to `true`, you should check that mtime is working properly on your system. See git-update-index[1]. `keep` by default, unless `feature.manyFiles` is enabled which sets this setting to `true` by default",
	},
	{
		name: "core.useReplaceRefs",
		description:
			"If set to `false`, behave as if the `--no-replace-objects` option was given on the command line. See git[1] and git-replace[1] for more information",
	},
	{
		name: "core.warnAmbiguousRefs",
		description:
			"If true, Git will warn you if the ref name you passed it is ambiguous and might match multiple refs in the repository. True by default",
	},
	{
		name: "core.whitespace",
		description:
			"A comma separated list of common whitespace problems to notice. 'git diff' will use `color.diff.whitespace` to highlight them, and 'git apply --whitespace=error' will consider them as errors. You can prefix `-` to disable any of them (e.g. `-trailing-space`):",
	},
	{
		name: "core.worktree",
		description:
			"Set the path to the root of the working tree. If `GIT_COMMON_DIR` environment variable is set, core.worktree is ignored and not used for determining the root of working tree. This can be overridden by the `GIT_WORK_TREE` environment variable and the `--work-tree` command-line option. The value can be an absolute path or relative to the path to the .git directory, which is either specified by --git-dir or GIT_DIR, or automatically discovered. If --git-dir or GIT_DIR is specified but none of --work-tree, GIT_WORK_TREE and core.worktree is specified, the current working directory is regarded as the top level of your working tree",
	},
	{
		name: "credential.helper",
		description:
			"Specify an external helper to be called when a username or password credential is needed; the helper may consult external storage to avoid prompting the user for the credentials. This is normally the name of a credential helper with possible arguments, but may also be an absolute path with arguments or, if preceded by `!`, shell commands",
	},
	{
		name: "credential.useHttpPath",
		description:
			'When acquiring credentials, consider the "path" component of an http or https URL to be important. Defaults to false. See gitcredentials[7] for more information',
	},
	{
		name: "credential.username",
		description:
			"If no username is set for a network authentication, use this username by default. See credential.<context>.* below, and gitcredentials[7]",
	},
	{
		name: "credentialCache.ignoreSIGHUP",
		description:
			"Tell git-credential-cache--daemon to ignore SIGHUP, instead of quitting",
	},
	{
		name: "credentialStore.lockTimeoutMS",
		description:
			"The length of time, in milliseconds, for git-credential-store to retry when trying to lock the credentials file. Value 0 means not to retry at all; -1 means to try indefinitely. Default is 1000 (i.e., retry for 1s)",
	},
	{
		name: "credential.<url>.helper",
		insertValue: "credential.{cursor}.helper",
		description:
			"Specify an external helper to be called when a username or password credential is needed; the helper may consult external storage to avoid prompting the user for the credentials. This is normally the name of a credential helper with possible arguments, but may also be an absolute path with arguments or, if preceded by `!`, shell commands",
	},
	{
		name: "credential.<url>.useHttpPath",
		insertValue: "credential.{cursor}.useHttpPath",
		description:
			'When acquiring credentials, consider the "path" component of an http or https URL to be important. Defaults to false. See gitcredentials[7] for more information',
	},
	{
		name: "credential.<url>.username",
		insertValue: "credential.{cursor}.username",
		description:
			"If no username is set for a network authentication, use this username by default. See credential.<context>.* below, and gitcredentials[7]",
	},
	{
		name: "credentialCache.<url>.ignoreSIGHUP",
		insertValue: "credentialCache.{cursor}.ignoreSIGHUP",
		description:
			"Tell git-credential-cache--daemon to ignore SIGHUP, instead of quitting",
	},
	{
		name: "credentialStore.<url>.lockTimeoutMS",
		insertValue: "credentialStore.{cursor}.lockTimeoutMS",
		description:
			"The length of time, in milliseconds, for git-credential-store to retry when trying to lock the credentials file. Value 0 means not to retry at all; -1 means to try indefinitely. Default is 1000 (i.e., retry for 1s)",
	},
	{
		name: "diff.<driver>.binary",
		insertValue: "diff.{cursor}.binary",
		description:
			"Set this option to true to make the diff driver treat files as binary. See gitattributes[5] for details",
	},
	{
		name: "diff.<driver>.cachetextconv",
		insertValue: "diff.{cursor}.cachetextconv",
		description:
			"Set this option to true to make the diff driver cache the text conversion outputs. See gitattributes[5] for details",
	},
	{
		name: "diff.<driver>.command",
		insertValue: "diff.{cursor}.command",
		description:
			"The custom diff driver command. See gitattributes[5] for details",
	},
	{
		name: "diff.<driver>.textconv",
		insertValue: "diff.{cursor}.textconv",
		description:
			"The command that the diff driver should call to generate the text-converted version of a file. The result of the conversion is used to generate a human-readable diff. See gitattributes[5] for details",
	},
	{
		name: "diff.<driver>.wordRegex",
		insertValue: "diff.{cursor}.wordRegex",
		description:
			"The regular expression that the diff driver should use to split words in a line. See gitattributes[5] for details",
	},
	{
		name: "diff.<driver>.xfuncname",
		insertValue: "diff.{cursor}.xfuncname",
		description:
			"The regular expression that the diff driver should use to recognize the hunk header. A built-in pattern may also be used. See gitattributes[5] for details",
	},
	{
		name: "diff.algorithm",
		description: "Choose a diff algorithm",
	},
	{
		name: "diff.autoRefreshIndex",
		description:
			"When using 'git diff' to compare with work tree files, do not consider stat-only change as changed. Instead, silently run `git update-index --refresh` to update the cached stat information for paths whose contents in the work tree match the contents in the index. This option defaults to true. Note that this affects only 'git diff' Porcelain, and not lower level 'diff' commands such as 'git diff-files'",
	},
	{
		name: "diff.colorMoved",
		description:
			"If set to either a valid `<mode>` or a true value, moved lines in a diff are colored differently, for details of valid modes see '--color-moved' in git-diff[1]. If simply set to true the default color mode will be used. When set to false, moved lines are not colored",
	},
	{
		name: "diff.colorMovedWS",
		description:
			"When moved lines are colored using e.g. the `diff.colorMoved` setting, this option controls the `<mode>` how spaces are treated for details of valid modes see '--color-moved-ws' in git-diff[1]",
	},
	{
		name: "diff.context",
		description:
			"Generate diffs with <n> lines of context instead of the default of 3. This value is overridden by the -U option",
	},
	{
		name: "diff.dirstat",
		description:
			"A comma separated list of `--dirstat` parameters specifying the default behavior of the `--dirstat` option to git-diff[1] and friends. The defaults can be overridden on the command line (using `--dirstat=<param1,param2,...>`). The fallback defaults (when not changed by `diff.dirstat`) are `changes,noncumulative,3`. The following parameters are available:",
	},
	{
		name: "diff.external",
		description:
			'If this config variable is set, diff generation is not performed using the internal diff machinery, but using the given command. Can be overridden with the `GIT_EXTERNAL_DIFF\' environment variable. The command is called with parameters as described under "git Diffs" in git[1]. Note: if you want to use an external diff program only on a subset of your files, you might want to use gitattributes[5] instead',
	},
	{
		name: "diff.guitool",
		description:
			"Controls which diff tool is used by git-difftool[1] when the -g/--gui flag is specified. This variable overrides the value configured in `merge.guitool`. The list below shows the valid built-in values. Any other value is treated as a custom diff tool and requires that a corresponding difftool.<guitool>.cmd variable is defined",
	},
	{
		name: "diff.ignoreSubmodules",
		description:
			"Sets the default value of --ignore-submodules. Note that this affects only 'git diff' Porcelain, and not lower level 'diff' commands such as 'git diff-files'. 'git checkout' and 'git switch' also honor this setting when reporting uncommitted changes. Setting it to 'all' disables the submodule summary normally shown by 'git commit' and 'git status' when `status.submoduleSummary` is set unless it is overridden by using the --ignore-submodules command-line option. The 'git submodule' commands are not affected by this setting. By default this is set to untracked so that any untracked submodules are ignored",
	},
	{
		name: "diff.indentHeuristic",
		description:
			"Set this option to `false` to disable the default heuristics that shift diff hunk boundaries to make patches easier to read",
	},
	{
		name: "diff.interHunkContext",
		description:
			"Show the context between diff hunks, up to the specified number of lines, thereby fusing the hunks that are close to each other. This value serves as the default for the `--inter-hunk-context` command line option",
	},
	{
		name: "diff.mnemonicPrefix",
		description:
			'If set, \'git diff\' uses a prefix pair that is different from the standard "a/" and "b/" depending on what is being compared. When this configuration is in effect, reverse diff output also swaps the order of the prefixes:',
	},
	{
		name: "diff.noprefix",
		description:
			"If set, 'git diff' does not show any source or destination prefix",
	},
	{
		name: "diff.orderFile",
		description:
			"File indicating how to order files within a diff. See the '-O' option to git-diff[1] for details. If `diff.orderFile` is a relative pathname, it is treated as relative to the top of the working tree",
	},
	{
		name: "diff.relative",
		description:
			"If set to 'true', 'git diff' does not show changes outside of the directory and show pathnames relative to the current directory",
	},
	{
		name: "diff.renameLimit",
		description:
			"The number of files to consider in the exhaustive portion of copy/rename detection; equivalent to the 'git diff' option `-l`. If not set, the default value is currently 1000. This setting has no effect if rename detection is turned off",
	},
	{
		name: "diff.renames",
		description:
			'Whether and how Git detects renames. If set to "false", rename detection is disabled. If set to "true", basic rename detection is enabled. If set to "copies" or "copy", Git will detect copies, as well. Defaults to true. Note that this affects only \'git diff\' Porcelain like git-diff[1] and git-log[1], and not lower level commands such as git-diff-files[1]',
	},
	{
		name: "diff.statGraphWidth",
		description:
			"Limit the width of the graph part in --stat output. If set, applies to all commands generating --stat output except format-patch",
	},
	{
		name: "diff.submodule",
		description:
			'Specify the format in which differences in submodules are shown. The "short" format just shows the names of the commits at the beginning and end of the range. The "log" format lists the commits in the range like git-submodule[1] `summary` does. The "diff" format shows an inline diff of the changed contents of the submodule. Defaults to "short"',
	},
	{
		name: "diff.suppressBlankEmpty",
		description:
			"A boolean to inhibit the standard behavior of printing a space before each empty output line. Defaults to false",
	},
	{
		name: "diff.tool",
		description:
			"Controls which diff tool is used by git-difftool[1]. This variable overrides the value configured in `merge.tool`. The list below shows the valid built-in values. Any other value is treated as a custom diff tool and requires that a corresponding difftool.<tool>.cmd variable is defined",
	},
	{
		name: "diff.wordRegex",
		description:
			'A POSIX Extended Regular Expression used to determine what is a "word" when performing word-by-word difference calculations. Character sequences that match the regular expression are "words", all other characters are *ignorable* whitespace',
	},
	{
		name: "diff.wsErrorHighlight",
		description:
			"Highlight whitespace errors in the `context`, `old` or `new` lines of the diff. Multiple values are separated by comma, `none` resets previous values, `default` reset the list to `new` and `all` is a shorthand for `old,new,context`. The whitespace errors are colored with `color.diff.whitespace`. The command line option `--ws-error-highlight=<kind>` overrides this setting",
	},
	{
		name: "difftool.<tool>.cmd",
		insertValue: "difftool.{cursor}.cmd",
		description:
			"Specify the command to invoke the specified diff tool. The specified command is evaluated in shell with the following variables available: 'LOCAL' is set to the name of the temporary file containing the contents of the diff pre-image and 'REMOTE' is set to the name of the temporary file containing the contents of the diff post-image",
	},
	{
		name: "difftool.<tool>.path",
		insertValue: "difftool.{cursor}.path",
		description:
			"Override the path for the given tool. This is useful in case your tool is not in the PATH",
	},
	{
		name: "difftool.prompt",
		description: "Prompt before each invocation of the diff tool",
	},
	{
		name: "extensions.objectFormat",
		description:
			"Specify the hash algorithm to use. The acceptable values are `sha1` and `sha256`. If not specified, `sha1` is assumed. It is an error to specify this key unless `core.repositoryFormatVersion` is 1",
	},
	{
		name: "extensions.worktreeConfig",
		description:
			"If enabled, then worktrees will load config settings from the `$GIT_DIR/config.worktree` file in addition to the `$GIT_COMMON_DIR/config` file. Note that `$GIT_COMMON_DIR` and `$GIT_DIR` are the same for the main working tree, while other working trees have `$GIT_DIR` equal to `$GIT_COMMON_DIR/worktrees/<id>/`. The settings in the `config.worktree` file will override settings from any other config files",
	},
	{
		name: "fastimport.unpackLimit",
		description:
			"If the number of objects imported by git-fast-import[1] is below this limit, then the objects will be unpacked into loose object files. However if the number of imported objects equals or exceeds this limit then the pack will be stored as a pack. Storing the pack from a fast-import can make the import operation complete faster, especially on slow filesystems. If not set, the value of `transfer.unpackLimit` is used instead",
	},
	{
		name: "feature.*",
		insertValue: "feature.{cursor}",
		description:
			"The config settings that start with `feature.` modify the defaults of a group of other config settings. These groups are created by the Git developer community as recommended defaults and are subject to change. In particular, new config options may be added with different defaults",
	},
	{
		name: "feature.experimental",
		description:
			"Enable config options that are new to Git, and are being considered for future defaults. Config settings included here may be added or removed with each release, including minor version updates. These settings may have unintended interactions since they are so new. Please enable this setting if you are interested in providing feedback on experimental features. The new default values are:",
	},
	{
		name: "feature.manyFiles",
		description:
			"Enable config options that optimize for repos with many files in the working directory. With many files, commands such as `git status` and `git checkout` may be slow and these new defaults improve performance:",
	},
	{
		name: "fetch.fsck.<msg-id>",
		insertValue: "fetch.fsck.{cursor}",
		description:
			"Acts like `fsck.<msg-id>`, but is used by git-fetch-pack[1] instead of git-fsck[1]. See the `fsck.<msg-id>` documentation for details",
	},
	{
		name: "fetch.fsck.skipList",
		description:
			"Acts like `fsck.skipList`, but is used by git-fetch-pack[1] instead of git-fsck[1]. See the `fsck.skipList` documentation for details",
	},
	{
		name: "fetch.fsckObjects",
		description:
			"If it is set to true, git-fetch-pack will check all fetched objects. See `transfer.fsckObjects` for what's checked. Defaults to false. If not set, the value of `transfer.fsckObjects` is used instead",
	},
	{
		name: "fetch.negotiationAlgorithm",
		description:
			'Control how information about the commits in the local repository is sent when negotiating the contents of the packfile to be sent by the server. Set to "consecutive" to use an algorithm that walks over consecutive commits checking each one. Set to "skipping" to use an algorithm that skips commits in an effort to converge faster, but may result in a larger-than-necessary packfile; or set to "noop" to not send any information at all, which will almost certainly result in a larger-than-necessary packfile, but will skip the negotiation step. Set to "default" to override settings made previously and use the default behaviour. The default is normally "consecutive", but if `feature.experimental` is true, then the default is "skipping". Unknown values will cause \'git fetch\' to error out',
	},
	{
		name: "fetch.output",
		description:
			"Control how ref update status is printed. Valid values are `full` and `compact`. Default value is `full`. See section OUTPUT in git-fetch[1] for detail",
	},
	{
		name: "fetch.parallel",
		description:
			"Specifies the maximal number of fetch operations to be run in parallel at a time (submodules, or remotes when the `--multiple` option of git-fetch[1] is in effect)",
	},
	{
		name: "fetch.prune",
		description:
			"If true, fetch will automatically behave as if the `--prune` option was given on the command line. See also `remote.<name>.prune` and the PRUNING section of git-fetch[1]",
	},
	{
		name: "fetch.pruneTags",
		description:
			"If true, fetch will automatically behave as if the `refs/tags/*:refs/tags/*` refspec was provided when pruning, if not set already. This allows for setting both this option and `fetch.prune` to maintain a 1=1 mapping to upstream refs. See also `remote.<name>.pruneTags` and the PRUNING section of git-fetch[1]",
	},
	{
		name: "fetch.recurseSubmodules",
		description:
			"This option controls whether `git fetch` (and the underlying fetch in `git pull`) will recursively fetch into populated submodules. This option can be set either to a boolean value or to 'on-demand'. Setting it to a boolean changes the behavior of fetch and pull to recurse unconditionally into submodules when set to true or to not recurse at all when set to false. When set to 'on-demand', fetch and pull will only recurse into a populated submodule when its superproject retrieves a commit that updates the submodule's reference. Defaults to 'on-demand', or to the value of 'submodule.recurse' if set",
	},
	{
		name: "fetch.showForcedUpdates",
		description:
			"Set to false to enable `--no-show-forced-updates` in git-fetch[1] and git-pull[1] commands. Defaults to true",
	},
	{
		name: "fetch.unpackLimit",
		description:
			"If the number of objects fetched over the Git native transfer is below this limit, then the objects will be unpacked into loose object files. However if the number of received objects equals or exceeds this limit then the received pack will be stored as a pack, after adding any missing delta bases. Storing the pack from a push can make the push operation complete faster, especially on slow filesystems. If not set, the value of `transfer.unpackLimit` is used instead",
	},
	{
		name: "fetch.writeCommitGraph",
		description:
			"Set to true to write a commit-graph after every `git fetch` command that downloads a pack-file from a remote. Using the `--split` option, most executions will create a very small commit-graph file on top of the existing commit-graph file(s). Occasionally, these files will merge and the write may take longer. Having an updated commit-graph file helps performance of many Git commands, including `git merge-base`, `git push -f`, and `git log --graph`. Defaults to false",
	},
	{
		name: "filter.<driver>.clean",
		insertValue: "filter.{cursor}.clean",
		description:
			"The command which is used to convert the content of a worktree file to a blob upon checkin. See gitattributes[5] for details",
	},
	{
		name: "filter.<driver>.smudge",
		insertValue: "filter.{cursor}.smudge",
		description:
			"The command which is used to convert the content of a blob object to a worktree file upon checkout. See gitattributes[5] for details",
	},
	{
		name: "format.attach",
		description:
			"Enable multipart/mixed attachments as the default for 'format-patch'. The value can also be a double quoted string which will enable attachments as the default and set the value as the boundary. See the --attach option in git-format-patch[1]",
	},
	{
		name: "format.cc",
		description:
			"Additional recipients to include in a patch to be submitted by mail. See the --to and --cc options in git-format-patch[1]",
	},
	{
		name: "format.coverFromDescription",
		description:
			"The default mode for format-patch to determine which parts of the cover letter will be populated using the branch's description. See the `--cover-from-description` option in git-format-patch[1]",
	},
	{
		name: "format.coverLetter",
		description:
			'A boolean that controls whether to generate a cover-letter when format-patch is invoked, but in addition can be set to "auto", to generate a cover-letter only when there\'s more than one patch. Default is false',
	},
	{
		name: "format.encodeEmailHeaders",
		description:
			'Encode email headers that have non-ASCII characters with "Q-encoding" (described in RFC 2047) for email transmission. Defaults to true',
	},
	{
		name: "format.filenameMaxLength",
		description:
			"The maximum length of the output filenames generated by the `format-patch` command; defaults to 64. Can be overridden by the `--filename-max-length=<n>` command line option",
	},
	{
		name: "format.from",
		description:
			'Provides the default value for the `--from` option to format-patch. Accepts a boolean value, or a name and email address. If false, format-patch defaults to `--no-from`, using commit authors directly in the "From:" field of patch mails. If true, format-patch defaults to `--from`, using your committer identity in the "From:" field of patch mails and including a "From:" field in the body of the patch mail if different. If set to a non-boolean value, format-patch uses that value instead of your committer identity. Defaults to false',
	},
	{
		name: "format.headers",
		description:
			"Additional email headers to include in a patch to be submitted by mail. See git-format-patch[1]",
	},
	{
		name: "format.notes",
		description:
			"Provides the default value for the `--notes` option to format-patch. Accepts a boolean value, or a ref which specifies where to get notes. If false, format-patch defaults to `--no-notes`. If true, format-patch defaults to `--notes`. If set to a non-boolean value, format-patch defaults to `--notes=<ref>`, where `ref` is the non-boolean value. Defaults to false",
	},
	{
		name: "format.numbered",
		description:
			'A boolean which can enable or disable sequence numbers in patch subjects. It defaults to "auto" which enables it only if there is more than one patch. It can be enabled or disabled for all messages by setting it to "true" or "false". See --numbered option in git-format-patch[1]',
	},
	{
		name: "format.outputDirectory",
		description:
			"Set a custom directory to store the resulting files instead of the current working directory. All directory components will be created",
	},
	{
		name: "format.pretty",
		description:
			"The default pretty format for log/show/whatchanged command, See git-log[1], git-show[1], git-whatchanged[1]",
	},
	{
		name: "format.signature",
		description:
			'The default for format-patch is to output a signature containing the Git version number. Use this variable to change that default. Set this variable to the empty string ("") to suppress signature generation',
	},
	{
		name: "format.signatureFile",
		description:
			"Works just like format.signature except the contents of the file specified by this variable will be used as the signature",
	},
	{
		name: "format.signOff",
		description:
			"A boolean value which lets you enable the `-s/--signoff` option of format-patch by default. *Note:* Adding the `Signed-off-by` trailer to a patch should be a conscious act and means that you certify you have the rights to submit this work under the same open source license. Please see the 'SubmittingPatches' document for further discussion",
	},
	{
		name: "format.subjectPrefix",
		description:
			"The default for format-patch is to output files with the '[PATCH]' subject prefix. Use this variable to change that prefix",
	},
	{
		name: "format.suffix",
		description:
			"The default for format-patch is to output files with the suffix `.patch`. Use this variable to change that suffix (make sure to include the dot if you want it)",
	},
	{
		name: "format.thread",
		description:
			"The default threading style for 'git format-patch'. Can be a boolean value, or `shallow` or `deep`. `shallow` threading makes every mail a reply to the head of the series, where the head is chosen from the cover letter, the `--in-reply-to`, and the first patch mail, in this order. `deep` threading makes every mail a reply to the previous one. A true boolean value is the same as `shallow`, and a false value disables threading",
	},
	{
		name: "format.useAutoBase",
		description:
			'A boolean value which lets you enable the `--base=auto` option of format-patch by default. Can also be set to "whenAble" to allow enabling `--base=auto` if a suitable base is available, but to skip adding base info otherwise without the format dying',
	},
	{
		name: "fsck.<msg-id>",
		insertValue: "fsck.{cursor}",
		description:
			"During fsck git may find issues with legacy data which wouldn't be generated by current versions of git, and which wouldn't be sent over the wire if `transfer.fsckObjects` was set. This feature is intended to support working with legacy repositories containing such data",
	},
	{
		name: "fsck.skipList",
		description:
			"The path to a list of object names (i.e. one unabbreviated SHA-1 per line) that are known to be broken in a non-fatal way and should be ignored. On versions of Git 2.20 and later comments ('#'), empty lines, and any leading and trailing whitespace is ignored. Everything but a SHA-1 per line will error out on older versions",
	},
	{
		name: "gc.<pattern>.reflogExpire",
		insertValue: "gc.{cursor}.reflogExpire",
		description:
			'\'git reflog expire\' removes reflog entries older than this time; defaults to 90 days. The value "now" expires all entries immediately, and "never" suppresses expiration altogether. With "<pattern>" (e.g. "refs/stash") in the middle the setting applies only to the refs that match the <pattern>',
	},
	{
		name: "gc.<pattern>.reflogExpireUnreachable",
		insertValue: "gc.{cursor}.reflogExpireUnreachable",
		description:
			'\'git reflog expire\' removes reflog entries older than this time and are not reachable from the current tip; defaults to 30 days. The value "now" expires all entries immediately, and "never" suppresses expiration altogether. With "<pattern>" (e.g. "refs/stash") in the middle, the setting applies only to the refs that match the <pattern>',
	},
	{
		name: "gc.aggressiveDepth",
		description:
			"The depth parameter used in the delta compression algorithm used by 'git gc --aggressive'. This defaults to 50, which is the default for the `--depth` option when `--aggressive` isn't in use",
	},
	{
		name: "gc.aggressiveWindow",
		description:
			"The window size parameter used in the delta compression algorithm used by 'git gc --aggressive'. This defaults to 250, which is a much more aggressive window size than the default `--window` of 10",
	},
	{
		name: "gc.auto",
		description:
			"When there are approximately more than this many loose objects in the repository, `git gc --auto` will pack them. Some Porcelain commands use this command to perform a light-weight garbage collection from time to time. The default value is 6700",
	},
	{
		name: "gc.autoDetach",
		description:
			"Make `git gc --auto` return immediately and run in background if the system supports it. Default is true",
	},
	{
		name: "gc.autoPackLimit",
		description:
			"When there are more than this many packs that are not marked with `*.keep` file in the repository, `git gc --auto` consolidates them into one larger pack. The default value is 50. Setting this to 0 disables it. Setting `gc.auto` to 0 will also disable this",
	},
	{
		name: "gc.bigPackThreshold",
		description:
			"If non-zero, all packs larger than this limit are kept when `git gc` is run. This is very similar to `--keep-largest-pack` except that all packs that meet the threshold are kept, not just the largest pack. Defaults to zero. Common unit suffixes of 'k', 'm', or 'g' are supported",
	},
	{
		name: "gc.cruftPacks",
		description:
			"Store unreachable objects in a cruft pack (see git-repack[1]) instead of as loose objects. The default is `false`",
	},
	{
		name: "gc.logExpiry",
		description:
			"If the file gc.log exists, then `git gc --auto` will print its content and exit with status zero instead of running unless that file is more than 'gc.logExpiry' old. Default is \"1.day\". See `gc.pruneExpire` for more ways to specify its value",
	},
	{
		name: "gc.packRefs",
		description:
			"Running `git pack-refs` in a repository renders it unclonable by Git versions prior to 1.5.1.2 over dumb transports such as HTTP. This variable determines whether 'git gc' runs `git pack-refs`. This can be set to `notbare` to enable it within all non-bare repos or it can be set to a boolean value. The default is `true`",
	},
	{
		name: "gc.pruneExpire",
		description:
			"When 'git gc' is run, it will call 'prune --expire 2.weeks.ago' (and 'repack --cruft --cruft-expiration 2.weeks.ago' if using cruft packs via `gc.cruftPacks` or `--cruft`). Override the grace period with this config variable. The value \"now\" may be used to disable this grace period and always prune unreachable objects immediately, or \"never\" may be used to suppress pruning. This feature helps prevent corruption when 'git gc' runs concurrently with another process writing to the repository; see the \"NOTES\" section of git-gc[1]",
	},
	{
		name: "gc.rerereResolved",
		description:
			"Records of conflicted merge you resolved earlier are kept for this many days when 'git rerere gc' is run. You can also use more human-readable \"1.month.ago\", etc. The default is 60 days. See git-rerere[1]",
	},
	{
		name: "gc.rerereUnresolved",
		description:
			"Records of conflicted merge you have not resolved are kept for this many days when 'git rerere gc' is run. You can also use more human-readable \"1.month.ago\", etc. The default is 15 days. See git-rerere[1]",
	},
	{
		name: "gc.worktreePruneExpire",
		description:
			"When 'git gc' is run, it calls 'git worktree prune --expire 3.months.ago'. This config variable can be used to set a different grace period. The value \"now\" may be used to disable the grace period and prune `$GIT_DIR/worktrees` immediately, or \"never\" may be used to suppress pruning",
	},
	{
		name: "gc.writeCommitGraph",
		description:
			"If true, then gc will rewrite the commit-graph file when git-gc[1] is run. When using `git gc --auto` the commit-graph will be updated if housekeeping is required. Default is true. See git-commit-graph[1] for details",
	},
	{
		name: "gitcvs.allBinary",
		description:
			"This is used if `gitcvs.usecrlfattr` does not resolve the correct '-kb' mode to use. If true, all unresolved files are sent to the client in mode '-kb'. This causes the client to treat them as binary files, which suppresses any newline munging it otherwise might do. Alternatively, if it is set to \"guess\", then the contents of the file are examined to decide if it is binary, similar to `core.autocrlf`",
	},
	{
		name: "gitcvs.commitMsgAnnotation",
		description:
			'Append this string to each commit message. Set to empty string to disable this feature. Defaults to "via git-CVS emulator"',
	},
	{
		name: "gitcvs.dbDriver",
		description:
			"Used Perl DBI driver. You can specify any available driver for this here, but it might not work. git-cvsserver is tested with 'DBD::SQLite', reported to work with 'DBD::Pg', and reported *not* to work with 'DBD::mysql'. Experimental feature. May not contain double colons (`:`). Default: 'SQLite'. See git-cvsserver[1]",
	},
	{
		name: "gitcvs.dbName",
		description:
			"Database used by git-cvsserver to cache revision information derived from the Git repository. The exact meaning depends on the used database driver, for SQLite (which is the default driver) this is a filename. Supports variable substitution (see git-cvsserver[1] for details). May not contain semicolons (`;`). Default: '%Ggitcvs.%m.sqlite'",
	},
	{
		name: "gitcvs.dbTableNamePrefix",
		description:
			"Database table name prefix. Prepended to the names of any database tables used, allowing a single database to be used for several repositories. Supports variable substitution (see git-cvsserver[1] for details). Any non-alphabetic characters will be replaced with underscores",
	},
	{
		name: "gitcvs.dbUser",
		description:
			"Database user and password. Only useful if setting `gitcvs.dbDriver`, since SQLite has no concept of database users and/or passwords. 'gitcvs.dbUser' supports variable substitution (see git-cvsserver[1] for details)",
	},
	{
		name: "gitcvs.enabled",
		description:
			"Whether the CVS server interface is enabled for this repository. See git-cvsserver[1]",
	},
	{
		name: "gitcvs.logFile",
		description:
			"Path to a log file where the CVS server interface well... logs various stuff. See git-cvsserver[1]",
	},
	{
		name: "gitcvs.usecrlfattr",
		description:
			"If true, the server will look up the end-of-line conversion attributes for files to determine the `-k` modes to use. If the attributes force Git to treat a file as text, the `-k` mode will be left blank so CVS clients will treat it as text. If they suppress text conversion, the file will be set with '-kb' mode, which suppresses any newline munging the client might otherwise do. If the attributes do not allow the file type to be determined, then `gitcvs.allBinary` is used. See gitattributes[5]",
	},
	{
		name: "gitweb.snapshot",
		description: "See gitweb.conf[5] for description",
	},
	{
		name: "gitweb.url",
		description: "See gitweb[1] for description",
	},
	{
		name: "gpg.<format>.program",
		insertValue: "gpg.{cursor}.program",
		description:
			'Use this to customize the program used for the signing format you chose. (see `gpg.program` and `gpg.format`) `gpg.program` can still be used as a legacy synonym for `gpg.openpgp.program`. The default value for `gpg.x509.program` is "gpgsm" and `gpg.ssh.program` is "ssh-keygen"',
	},
	{
		name: "gpg.format",
		description:
			'Specifies which key format to use when signing with `--gpg-sign`. Default is "openpgp". Other possible values are "x509", "ssh"',
	},
	{
		name: "gpg.minTrustLevel",
		description:
			"Specifies a minimum trust level for signature verification. If this option is unset, then signature verification for merge operations require a key with at least `marginal` trust. Other operations that perform signature verification require a key with at least `undefined` trust. Setting this option overrides the required trust-level for all operations. Supported values, in increasing order of significance:",
	},
	{
		name: "gpg.program",
		description:
			'Use this custom program instead of "`gpg`" found on `$PATH` when making or verifying a PGP signature. The program must support the same command-line interface as GPG, namely, to verify a detached signature, "`gpg --verify $signature - <$file`" is run, and the program is expected to signal a good signature by exiting with code 0, and to generate an ASCII-armored detached signature, the standard input of "`gpg -bsau $key`" is fed with the contents to be signed, and the program is expected to send the result to its standard output',
	},
	{
		name: "gpg.ssh.allowedSignersFile",
		description:
			'A file containing ssh public keys which you are willing to trust. The file consists of one or more lines of principals followed by an ssh public key. e.g.: `user1@example.com,user2@example.com ssh-rsa AAAAX1...` See ssh-keygen(1) "ALLOWED SIGNERS" for details. The principal is only used to identify the key and is available when verifying a signature',
	},
	{
		name: "gpg.ssh.defaultKeyCommand",
		description:
			"This command that will be run when user.signingkey is not set and a ssh signature is requested. On successful exit a valid ssh public key prefixed with `key::` is expected in the first line of its output. This allows for a script doing a dynamic lookup of the correct public key when it is impractical to statically configure `user.signingKey`. For example when keys or SSH Certificates are rotated frequently or selection of the right key depends on external factors unknown to git",
	},
	{
		name: "gpg.ssh.revocationFile",
		description:
			'Either a SSH KRL or a list of revoked public keys (without the principal prefix). See ssh-keygen(1) for details. If a public key is found in this file then it will always be treated as having trust level "never" and signatures will show as invalid',
	},
	{
		name: "grep.column",
		description: "If set to true, enable the `--column` option by default",
	},
	{
		name: "grep.extendedRegexp",
		description:
			"If set to true, enable `--extended-regexp` option by default. This option is ignored when the `grep.patternType` option is set to a value other than 'default'",
	},
	{
		name: "grep.fallbackToNoIndex",
		description:
			"If set to true, fall back to git grep --no-index if git grep is executed outside of a git repository. Defaults to false",
	},
	{
		name: "grep.lineNumber",
		description: "If set to true, enable `-n` option by default",
	},
	{
		name: "grep.patternType",
		description:
			"Set the default matching behavior. Using a value of 'basic', 'extended', 'fixed', or 'perl' will enable the `--basic-regexp`, `--extended-regexp`, `--fixed-strings`, or `--perl-regexp` option accordingly, while the value 'default' will use the `grep.extendedRegexp` option to choose between 'basic' and 'extended'",
	},
	{
		name: "grep.threads",
		description:
			"Number of grep worker threads to use. See `grep.threads` in git-grep[1] for more information",
	},
	{
		name: "gui.blamehistoryctx",
		description:
			"Specifies the radius of history context in days to show in gitk[1] for the selected commit, when the `Show History Context` menu item is invoked from 'git gui blame'. If this variable is set to zero, the whole history is shown",
	},
	{
		name: "gui.commitMsgWidth",
		description:
			'Defines how wide the commit message window is in the git-gui[1]. "75" is the default',
	},
	{
		name: "gui.copyBlameThreshold",
		description:
			"Specifies the threshold to use in 'git gui blame' original location detection, measured in alphanumeric characters. See the git-blame[1] manual for more information on copy detection",
	},
	{
		name: "gui.diffContext",
		description:
			'Specifies how many context lines should be used in calls to diff made by the git-gui[1]. The default is "5"',
	},
	{
		name: "gui.displayUntracked",
		description:
			'Determines if git-gui[1] shows untracked files in the file list. The default is "true"',
	},
	{
		name: "gui.encoding",
		description:
			"Specifies the default character encoding to use for displaying of file contents in git-gui[1] and gitk[1]. It can be overridden by setting the 'encoding' attribute for relevant files (see gitattributes[5]). If this option is not set, the tools default to the locale encoding",
	},
	{
		name: "gui.fastCopyBlame",
		description:
			"If true, 'git gui blame' uses `-C` instead of `-C -C` for original location detection. It makes blame significantly faster on huge repositories at the expense of less thorough copy detection",
	},
	{
		name: "gui.matchTrackingBranch",
		description:
			'Determines if new branches created with git-gui[1] should default to tracking remote branches with matching names or not. Default: "false"',
	},
	{
		name: "gui.newBranchTemplate",
		description:
			"Is used as suggested name when creating new branches using the git-gui[1]",
	},
	{
		name: "gui.pruneDuringFetch",
		description:
			'"true" if git-gui[1] should prune remote-tracking branches when performing a fetch. The default value is "false"',
	},
	{
		name: "gui.spellingDictionary",
		description:
			'Specifies the dictionary used for spell checking commit messages in the git-gui[1]. When set to "none" spell checking is turned off',
	},
	{
		name: "gui.trustmtime",
		description:
			"Determines if git-gui[1] should trust the file modification timestamp or not. By default the timestamps are not trusted",
	},
	{
		name: "guitool.<name>.argPrompt",
		insertValue: "guitool.{cursor}.argPrompt",
		description:
			"Request a string argument from the user, and pass it to the tool through the `ARGS` environment variable. Since requesting an argument implies confirmation, the 'confirm' option has no effect if this is enabled. If the option is set to 'true', 'yes', or '1', the dialog uses a built-in generic prompt; otherwise the exact value of the variable is used",
	},
	{
		name: "guitool.<name>.cmd",
		insertValue: "guitool.{cursor}.cmd",
		description:
			"Specifies the shell command line to execute when the corresponding item of the git-gui[1] `Tools` menu is invoked. This option is mandatory for every tool. The command is executed from the root of the working directory, and in the environment it receives the name of the tool as `GIT_GUITOOL`, the name of the currently selected file as 'FILENAME', and the name of the current branch as 'CUR_BRANCH' (if the head is detached, 'CUR_BRANCH' is empty)",
	},
	{
		name: "guitool.<name>.confirm",
		insertValue: "guitool.{cursor}.confirm",
		description: "Show a confirmation dialog before actually running the tool",
	},
	{
		name: "guitool.<name>.needsFile",
		insertValue: "guitool.{cursor}.needsFile",
		description:
			"Run the tool only if a diff is selected in the GUI. It guarantees that 'FILENAME' is not empty",
	},
	{
		name: "guitool.<name>.noConsole",
		insertValue: "guitool.{cursor}.noConsole",
		description:
			"Run the command silently, without creating a window to display its output",
	},
	{
		name: "guitool.<name>.noRescan",
		insertValue: "guitool.{cursor}.noRescan",
		description:
			"Don't rescan the working directory for changes after the tool finishes execution",
	},
	{
		name: "guitool.<name>.prompt",
		insertValue: "guitool.{cursor}.prompt",
		description:
			"Specifies the general prompt string to display at the top of the dialog, before subsections for 'argPrompt' and 'revPrompt'. The default value includes the actual command",
	},
	{
		name: "guitool.<name>.revPrompt",
		insertValue: "guitool.{cursor}.revPrompt",
		description:
			"Request a single valid revision from the user, and set the `REVISION` environment variable. In other aspects this option is similar to 'argPrompt', and can be used together with it",
	},
	{
		name: "guitool.<name>.revUnmerged",
		insertValue: "guitool.{cursor}.revUnmerged",
		description:
			"Show only unmerged branches in the 'revPrompt' subdialog. This is useful for tools similar to merge or rebase, but not for things like checkout or reset",
	},
	{
		name: "guitool.<name>.title",
		insertValue: "guitool.{cursor}.title",
		description:
			"Specifies the title to use for the prompt dialog. The default is the tool name",
	},
	{
		name: "help.autoCorrect",
		description:
			"If git detects typos and can identify exactly one valid command similar to the error, git will try to suggest the correct command or even run the suggestion automatically. Possible config values are: - 0 (default): show the suggested command. - positive number: run the suggested command after specified",
	},
	{
		name: "help.browser",
		description:
			"Specify the browser that will be used to display help in the 'web' format. See git-help[1]",
	},
	{
		name: "help.format",
		description:
			"Override the default help format used by git-help[1]. Values 'man', 'info', 'web' and 'html' are supported. 'man' is the default. 'web' and 'html' are the same",
	},
	{
		name: "help.htmlPath",
		description:
			"Specify the path where the HTML documentation resides. File system paths and URLs are supported. HTML pages will be prefixed with this path when help is displayed in the 'web' format. This defaults to the documentation path of your Git installation",
	},
	{
		name: "http.cookieFile",
		description:
			"The pathname of a file containing previously stored cookie lines, which should be used in the Git http session, if they match the server. The file format of the file to read cookies from should be plain HTTP headers or the Netscape/Mozilla cookie file format (see `curl(1)`). NOTE that the file specified with http.cookieFile is used only as input unless http.saveCookies is set",
	},
	{
		name: "http.curloptResolve",
		description:
			"Hostname resolution information that will be used first by libcurl when sending HTTP requests. This information should be in one of the following formats:",
	},
	{
		name: "http.delegation",
		description:
			"Control GSSAPI credential delegation. The delegation is disabled by default in libcurl since version 7.21.7. Set parameter to tell the server what it is allowed to delegate when it comes to user credentials. Used with GSS/kerberos. Possible values are:",
	},
	{
		name: "http.emptyAuth",
		description:
			"Attempt authentication without seeking a username or password. This can be used to attempt GSS-Negotiate authentication without specifying a username in the URL, as libcurl normally requires a username for authentication",
	},
	{
		name: "http.extraHeader",
		description:
			"Pass an additional HTTP header when communicating with a server. If more than one such entry exists, all of them are added as extra headers. To allow overriding the settings inherited from the system config, an empty value will reset the extra headers to the empty list",
	},
	{
		name: "http.followRedirects",
		description:
			"Whether git should follow HTTP redirects. If set to `true`, git will transparently follow any redirect issued by a server it encounters. If set to `false`, git will treat all redirects as errors. If set to `initial`, git will follow redirects only for the initial request to a remote, but not for subsequent follow-up HTTP requests. Since git uses the redirected URL as the base for the follow-up requests, this is generally sufficient. The default is `initial`",
	},
	{
		name: "http.lowSpeedLimit",
		description:
			"If the HTTP transfer speed is less than 'http.lowSpeedLimit' for longer than 'http.lowSpeedTime' seconds, the transfer is aborted. Can be overridden by the `GIT_HTTP_LOW_SPEED_LIMIT` and `GIT_HTTP_LOW_SPEED_TIME` environment variables",
	},
	{
		name: "http.maxRequests",
		description:
			"How many HTTP requests to launch in parallel. Can be overridden by the `GIT_HTTP_MAX_REQUESTS` environment variable. Default is 5",
	},
	{
		name: "http.minSessions",
		description:
			"The number of curl sessions (counted across slots) to be kept across requests. They will not be ended with curl_easy_cleanup() until http_cleanup() is invoked. If USE_CURL_MULTI is not defined, this value will be capped at 1. Defaults to 1",
	},
	{
		name: "http.noEPSV",
		description:
			'A boolean which disables using of EPSV ftp command by curl. This can helpful with some "poor" ftp servers which don\'t support EPSV mode. Can be overridden by the `GIT_CURL_FTP_NO_EPSV` environment variable. Default is false (curl will use EPSV)',
	},
	{
		name: "http.pinnedPubkey",
		description:
			"Public key of the https service. It may either be the filename of a PEM or DER encoded public key file or a string starting with 'sha256//' followed by the base64 encoded sha256 hash of the public key. See also libcurl 'CURLOPT_PINNEDPUBLICKEY'. git will exit with an error if this option is set but not supported by cURL",
	},
	{
		name: "http.postBuffer",
		description:
			"Maximum size in bytes of the buffer used by smart HTTP transports when POSTing data to the remote system. For requests larger than this buffer size, HTTP/1.1 and Transfer-Encoding: chunked is used to avoid creating a massive pack file locally. Default is 1 MiB, which is sufficient for most requests",
	},
	{
		name: "http.proxy",
		description:
			"Override the HTTP proxy, normally configured using the 'http_proxy', 'https_proxy', and 'all_proxy' environment variables (see `curl(1)`). In addition to the syntax understood by curl, it is possible to specify a proxy string with a user name but no password, in which case git will attempt to acquire one in the same way it does for other credentials. See gitcredentials[7] for more information. The syntax thus is '[protocol://][user[:password]@]proxyhost[:port]'. This can be overridden on a per-remote basis; see remote.<name>.proxy",
	},
	{
		name: "http.proxyAuthMethod",
		description:
			"Set the method with which to authenticate against the HTTP proxy. This only takes effect if the configured proxy string contains a user name part (i.e. is of the form 'user@host' or 'user@host:port'). This can be overridden on a per-remote basis; see `remote.<name>.proxyAuthMethod`. Both can be overridden by the `GIT_HTTP_PROXY_AUTHMETHOD` environment variable. Possible values are:",
	},
	{
		name: "http.proxySSLCAInfo",
		description:
			"Pathname to the file containing the certificate bundle that should be used to verify the proxy with when using an HTTPS proxy. Can be overridden by the `GIT_PROXY_SSL_CAINFO` environment variable",
	},
	{
		name: "http.proxySSLCert",
		description:
			"The pathname of a file that stores a client certificate to use to authenticate with an HTTPS proxy. Can be overridden by the `GIT_PROXY_SSL_CERT` environment variable",
	},
	{
		name: "http.proxySSLCertPasswordProtected",
		description:
			"Enable Git's password prompt for the proxy SSL certificate. Otherwise OpenSSL will prompt the user, possibly many times, if the certificate or private key is encrypted. Can be overridden by the `GIT_PROXY_SSL_CERT_PASSWORD_PROTECTED` environment variable",
	},
	{
		name: "http.proxySSLKey",
		description:
			"The pathname of a file that stores a private key to use to authenticate with an HTTPS proxy. Can be overridden by the `GIT_PROXY_SSL_KEY` environment variable",
	},
	{
		name: "http.saveCookies",
		description:
			"If set, store cookies received during requests to the file specified by http.cookieFile. Has no effect if http.cookieFile is unset",
	},
	{
		name: "http.schannelCheckRevoke",
		description:
			'Used to enforce or disable certificate revocation checks in cURL when http.sslBackend is set to "schannel". Defaults to `true` if unset. Only necessary to disable this if Git consistently errors and the message is about checking the revocation status of a certificate. This option is ignored if cURL lacks support for setting the relevant SSL option at runtime',
	},
	{
		name: "http.schannelUseSSLCAInfo",
		description:
			"As of cURL v7.60.0, the Secure Channel backend can use the certificate bundle provided via `http.sslCAInfo`, but that would override the Windows Certificate Store. Since this is not desirable by default, Git will tell cURL not to use that bundle by default when the `schannel` backend was configured via `http.sslBackend`, unless `http.schannelUseSSLCAInfo` overrides this behavior",
	},
	{
		name: "http.sslBackend",
		description:
			'Name of the SSL backend to use (e.g. "openssl" or "schannel"). This option is ignored if cURL lacks support for choosing the SSL backend at runtime',
	},
	{
		name: "http.sslCAInfo",
		description:
			"File containing the certificates to verify the peer with when fetching or pushing over HTTPS. Can be overridden by the `GIT_SSL_CAINFO` environment variable",
	},
	{
		name: "http.sslCAPath",
		description:
			"Path containing files with the CA certificates to verify the peer with when fetching or pushing over HTTPS. Can be overridden by the `GIT_SSL_CAPATH` environment variable",
	},
	{
		name: "http.sslCert",
		description:
			"File containing the SSL certificate when fetching or pushing over HTTPS. Can be overridden by the `GIT_SSL_CERT` environment variable",
	},
	{
		name: "http.sslCertPasswordProtected",
		description:
			"Enable Git's password prompt for the SSL certificate. Otherwise OpenSSL will prompt the user, possibly many times, if the certificate or private key is encrypted. Can be overridden by the `GIT_SSL_CERT_PASSWORD_PROTECTED` environment variable",
	},
	{
		name: "http.sslKey",
		description:
			"File containing the SSL private key when fetching or pushing over HTTPS. Can be overridden by the `GIT_SSL_KEY` environment variable",
	},
	{
		name: "http.sslTry",
		description:
			"Attempt to use AUTH SSL/TLS and encrypted data transfers when connecting via regular FTP protocol. This might be needed if the FTP server requires it for security reasons or you wish to connect securely whenever remote FTP server supports it. Default is false since it might trigger certificate verification errors on misconfigured servers",
	},
	{
		name: "http.sslVerify",
		description:
			"Whether to verify the SSL certificate when fetching or pushing over HTTPS. Defaults to true. Can be overridden by the `GIT_SSL_NO_VERIFY` environment variable",
	},
	{
		name: "http.sslVersion",
		description:
			"The SSL version to use when negotiating an SSL connection, if you want to force the default. The available and default version depend on whether libcurl was built against NSS or OpenSSL and the particular configuration of the crypto library in use. Internally this sets the 'CURLOPT_SSL_VERSION' option; see the libcurl documentation for more details on the format of this option and for the ssl version supported. Currently the possible values of this option are:",
	},
	{
		name: "http.userAgent",
		description:
			"The HTTP USER_AGENT string presented to an HTTP server. The default value represents the version of the client Git such as git/1.7.1. This option allows you to override this value to a more common value such as Mozilla/4.0. This may be necessary, for instance, if connecting through a firewall that restricts HTTP connections to a set of common USER_AGENT strings (but not including those like git/1.7.1). Can be overridden by the `GIT_HTTP_USER_AGENT` environment variable",
	},
	{
		name: "http.version",
		description:
			"Use the specified HTTP protocol version when communicating with a server. If you want to force the default. The available and default version depend on libcurl. Currently the possible values of this option are:",
	},
	{
		name: "http.<url>.cookieFile",
		insertValue: "http.{cursor}.cookieFile",
		description:
			"The pathname of a file containing previously stored cookie lines, which should be used in the Git http session, if they match the server. The file format of the file to read cookies from should be plain HTTP headers or the Netscape/Mozilla cookie file format (see `curl(1)`). NOTE that the file specified with http.cookieFile is used only as input unless http.saveCookies is set",
	},
	{
		name: "http.<url>.curloptResolve",
		insertValue: "http.{cursor}.curloptResolve",
		description:
			"Hostname resolution information that will be used first by libcurl when sending HTTP requests. This information should be in one of the following formats:",
	},
	{
		name: "http.<url>.delegation",
		insertValue: "http.{cursor}.delegation",
		description:
			"Control GSSAPI credential delegation. The delegation is disabled by default in libcurl since version 7.21.7. Set parameter to tell the server what it is allowed to delegate when it comes to user credentials. Used with GSS/kerberos. Possible values are:",
	},
	{
		name: "http.<url>.emptyAuth",
		insertValue: "http.{cursor}.emptyAuth",
		description:
			"Attempt authentication without seeking a username or password. This can be used to attempt GSS-Negotiate authentication without specifying a username in the URL, as libcurl normally requires a username for authentication",
	},
	{
		name: "http.<url>.extraHeader",
		insertValue: "http.{cursor}.extraHeader",
		description:
			"Pass an additional HTTP header when communicating with a server. If more than one such entry exists, all of them are added as extra headers. To allow overriding the settings inherited from the system config, an empty value will reset the extra headers to the empty list",
	},
	{
		name: "http.<url>.followRedirects",
		insertValue: "http.{cursor}.followRedirects",
		description:
			"Whether git should follow HTTP redirects. If set to `true`, git will transparently follow any redirect issued by a server it encounters. If set to `false`, git will treat all redirects as errors. If set to `initial`, git will follow redirects only for the initial request to a remote, but not for subsequent follow-up HTTP requests. Since git uses the redirected URL as the base for the follow-up requests, this is generally sufficient. The default is `initial`",
	},
	{
		name: "http.<url>.lowSpeedLimit",
		insertValue: "http.{cursor}.lowSpeedLimit",
		description:
			"If the HTTP transfer speed is less than 'http.lowSpeedLimit' for longer than 'http.lowSpeedTime' seconds, the transfer is aborted. Can be overridden by the `GIT_HTTP_LOW_SPEED_LIMIT` and `GIT_HTTP_LOW_SPEED_TIME` environment variables",
	},
	{
		name: "http.<url>.maxRequests",
		insertValue: "http.{cursor}.maxRequests",
		description:
			"How many HTTP requests to launch in parallel. Can be overridden by the `GIT_HTTP_MAX_REQUESTS` environment variable. Default is 5",
	},
	{
		name: "http.<url>.minSessions",
		insertValue: "http.{cursor}.minSessions",
		description:
			"The number of curl sessions (counted across slots) to be kept across requests. They will not be ended with curl_easy_cleanup() until http_cleanup() is invoked. If USE_CURL_MULTI is not defined, this value will be capped at 1. Defaults to 1",
	},
	{
		name: "http.<url>.noEPSV",
		insertValue: "http.{cursor}.noEPSV",
		description:
			'A boolean which disables using of EPSV ftp command by curl. This can helpful with some "poor" ftp servers which don\'t support EPSV mode. Can be overridden by the `GIT_CURL_FTP_NO_EPSV` environment variable. Default is false (curl will use EPSV)',
	},
	{
		name: "http.<url>.pinnedPubkey",
		insertValue: "http.{cursor}.pinnedPubkey",
		description:
			"Public key of the https service. It may either be the filename of a PEM or DER encoded public key file or a string starting with 'sha256//' followed by the base64 encoded sha256 hash of the public key. See also libcurl 'CURLOPT_PINNEDPUBLICKEY'. git will exit with an error if this option is set but not supported by cURL",
	},
	{
		name: "http.<url>.postBuffer",
		insertValue: "http.{cursor}.postBuffer",
		description:
			"Maximum size in bytes of the buffer used by smart HTTP transports when POSTing data to the remote system. For requests larger than this buffer size, HTTP/1.1 and Transfer-Encoding: chunked is used to avoid creating a massive pack file locally. Default is 1 MiB, which is sufficient for most requests",
	},
	{
		name: "http.<url>.proxy",
		insertValue: "http.{cursor}.proxy",
		description:
			"Override the HTTP proxy, normally configured using the 'http_proxy', 'https_proxy', and 'all_proxy' environment variables (see `curl(1)`). In addition to the syntax understood by curl, it is possible to specify a proxy string with a user name but no password, in which case git will attempt to acquire one in the same way it does for other credentials. See gitcredentials[7] for more information. The syntax thus is '[protocol://][user[:password]@]proxyhost[:port]'. This can be overridden on a per-remote basis; see remote.<name>.proxy",
	},
	{
		name: "http.<url>.proxyAuthMethod",
		insertValue: "http.{cursor}.proxyAuthMethod",
		description:
			"Set the method with which to authenticate against the HTTP proxy. This only takes effect if the configured proxy string contains a user name part (i.e. is of the form 'user@host' or 'user@host:port'). This can be overridden on a per-remote basis; see `remote.<name>.proxyAuthMethod`. Both can be overridden by the `GIT_HTTP_PROXY_AUTHMETHOD` environment variable. Possible values are:",
	},
	{
		name: "http.<url>.proxySSLCAInfo",
		insertValue: "http.{cursor}.proxySSLCAInfo",
		description:
			"Pathname to the file containing the certificate bundle that should be used to verify the proxy with when using an HTTPS proxy. Can be overridden by the `GIT_PROXY_SSL_CAINFO` environment variable",
	},
	{
		name: "http.<url>.proxySSLCert",
		insertValue: "http.{cursor}.proxySSLCert",
		description:
			"The pathname of a file that stores a client certificate to use to authenticate with an HTTPS proxy. Can be overridden by the `GIT_PROXY_SSL_CERT` environment variable",
	},
	{
		name: "http.<url>.proxySSLCertPasswordProtected",
		insertValue: "http.{cursor}.proxySSLCertPasswordProtected",
		description:
			"Enable Git's password prompt for the proxy SSL certificate. Otherwise OpenSSL will prompt the user, possibly many times, if the certificate or private key is encrypted. Can be overridden by the `GIT_PROXY_SSL_CERT_PASSWORD_PROTECTED` environment variable",
	},
	{
		name: "http.<url>.proxySSLKey",
		insertValue: "http.{cursor}.proxySSLKey",
		description:
			"The pathname of a file that stores a private key to use to authenticate with an HTTPS proxy. Can be overridden by the `GIT_PROXY_SSL_KEY` environment variable",
	},
	{
		name: "http.<url>.saveCookies",
		insertValue: "http.{cursor}.saveCookies",
		description:
			"If set, store cookies received during requests to the file specified by http.cookieFile. Has no effect if http.cookieFile is unset",
	},
	{
		name: "http.<url>.schannelCheckRevoke",
		insertValue: "http.{cursor}.schannelCheckRevoke",
		description:
			'Used to enforce or disable certificate revocation checks in cURL when http.sslBackend is set to "schannel". Defaults to `true` if unset. Only necessary to disable this if Git consistently errors and the message is about checking the revocation status of a certificate. This option is ignored if cURL lacks support for setting the relevant SSL option at runtime',
	},
	{
		name: "http.<url>.schannelUseSSLCAInfo",
		insertValue: "http.{cursor}.schannelUseSSLCAInfo",
		description:
			"As of cURL v7.60.0, the Secure Channel backend can use the certificate bundle provided via `http.sslCAInfo`, but that would override the Windows Certificate Store. Since this is not desirable by default, Git will tell cURL not to use that bundle by default when the `schannel` backend was configured via `http.sslBackend`, unless `http.schannelUseSSLCAInfo` overrides this behavior",
	},
	{
		name: "http.<url>.sslBackend",
		insertValue: "http.{cursor}.sslBackend",
		description:
			'Name of the SSL backend to use (e.g. "openssl" or "schannel"). This option is ignored if cURL lacks support for choosing the SSL backend at runtime',
	},
	{
		name: "http.<url>.sslCAInfo",
		insertValue: "http.{cursor}.sslCAInfo",
		description:
			"File containing the certificates to verify the peer with when fetching or pushing over HTTPS. Can be overridden by the `GIT_SSL_CAINFO` environment variable",
	},
	{
		name: "http.<url>.sslCAPath",
		insertValue: "http.{cursor}.sslCAPath",
		description:
			"Path containing files with the CA certificates to verify the peer with when fetching or pushing over HTTPS. Can be overridden by the `GIT_SSL_CAPATH` environment variable",
	},
	{
		name: "http.<url>.sslCert",
		insertValue: "http.{cursor}.sslCert",
		description:
			"File containing the SSL certificate when fetching or pushing over HTTPS. Can be overridden by the `GIT_SSL_CERT` environment variable",
	},
	{
		name: "http.<url>.sslCertPasswordProtected",
		insertValue: "http.{cursor}.sslCertPasswordProtected",
		description:
			"Enable Git's password prompt for the SSL certificate. Otherwise OpenSSL will prompt the user, possibly many times, if the certificate or private key is encrypted. Can be overridden by the `GIT_SSL_CERT_PASSWORD_PROTECTED` environment variable",
	},
	{
		name: "http.<url>.sslKey",
		insertValue: "http.{cursor}.sslKey",
		description:
			"File containing the SSL private key when fetching or pushing over HTTPS. Can be overridden by the `GIT_SSL_KEY` environment variable",
	},
	{
		name: "http.<url>.sslTry",
		insertValue: "http.{cursor}.sslTry",
		description:
			"Attempt to use AUTH SSL/TLS and encrypted data transfers when connecting via regular FTP protocol. This might be needed if the FTP server requires it for security reasons or you wish to connect securely whenever remote FTP server supports it. Default is false since it might trigger certificate verification errors on misconfigured servers",
	},
	{
		name: "http.<url>.sslVerify",
		insertValue: "http.{cursor}.sslVerify",
		description:
			"Whether to verify the SSL certificate when fetching or pushing over HTTPS. Defaults to true. Can be overridden by the `GIT_SSL_NO_VERIFY` environment variable",
	},
	{
		name: "http.<url>.sslVersion",
		insertValue: "http.{cursor}.sslVersion",
		description:
			"The SSL version to use when negotiating an SSL connection, if you want to force the default. The available and default version depend on whether libcurl was built against NSS or OpenSSL and the particular configuration of the crypto library in use. Internally this sets the 'CURLOPT_SSL_VERSION' option; see the libcurl documentation for more details on the format of this option and for the ssl version supported. Currently the possible values of this option are:",
	},
	{
		name: "http.<url>.userAgent",
		insertValue: "http.{cursor}.userAgent",
		description:
			"The HTTP USER_AGENT string presented to an HTTP server. The default value represents the version of the client Git such as git/1.7.1. This option allows you to override this value to a more common value such as Mozilla/4.0. This may be necessary, for instance, if connecting through a firewall that restricts HTTP connections to a set of common USER_AGENT strings (but not including those like git/1.7.1). Can be overridden by the `GIT_HTTP_USER_AGENT` environment variable",
	},
	{
		name: "http.<url>.version",
		insertValue: "http.{cursor}.version",
		description:
			"Use the specified HTTP protocol version when communicating with a server. If you want to force the default. The available and default version depend on libcurl. Currently the possible values of this option are:",
	},
	{
		name: "i18n.commitEncoding",
		description:
			"Character encoding the commit messages are stored in; Git itself does not care per se, but this information is necessary e.g. when importing commits from emails or in the gitk graphical history browser (and possibly at other places in the future or in other porcelains). See e.g. git-mailinfo[1]. Defaults to 'utf-8'",
	},
	{
		name: "i18n.logOutputEncoding",
		description:
			"Character encoding the commit messages are converted to when running 'git log' and friends",
	},
	{
		name: "imap.authMethod",
		description:
			"Specify authenticate method for authentication with IMAP server. If Git was built with the NO_CURL option, or if your curl version is older than 7.34.0, or if you're running git-imap-send with the `--no-curl` option, the only supported method is 'CRAM-MD5'. If this is not set then 'git imap-send' uses the basic IMAP plaintext LOGIN command",
	},
	{
		name: "imap.folder",
		description:
			'The folder to drop the mails into, which is typically the Drafts folder. For example: "INBOX.Drafts", "INBOX/Drafts" or "[Gmail]/Drafts". Required',
	},
	{
		name: "imap.host",
		description:
			"A URL identifying the server. Use an `imap://` prefix for non-secure connections and an `imaps://` prefix for secure connections. Ignored when imap.tunnel is set, but required otherwise",
	},
	{
		name: "imap.pass",
		description: "The password to use when logging in to the server",
	},
	{
		name: "imap.port",
		description:
			"An integer port number to connect to on the server. Defaults to 143 for imap:// hosts and 993 for imaps:// hosts. Ignored when imap.tunnel is set",
	},
	{
		name: "imap.preformattedHTML",
		description:
			"A boolean to enable/disable the use of html encoding when sending a patch. An html encoded patch will be bracketed with <pre> and have a content type of text/html. Ironically, enabling this option causes Thunderbird to send the patch as a plain/text, format=fixed email. Default is `false`",
	},
	{
		name: "imap.sslverify",
		description:
			"A boolean to enable/disable verification of the server certificate used by the SSL/TLS connection. Default is `true`. Ignored when imap.tunnel is set",
	},
	{
		name: "imap.tunnel",
		description:
			"Command used to setup a tunnel to the IMAP server through which commands will be piped instead of using a direct network connection to the server. Required when imap.host is not set",
	},
	{
		name: "imap.user",
		description: "The username to use when logging in to the server",
	},
	{
		name: "includeIf.<condition>.path",
		insertValue: "includeIf.{cursor}.path",
		description:
			'Special variables to include other configuration files. See the "CONFIGURATION FILE" section in the main git-config[1] documentation, specifically the "Includes" and "Conditional Includes" subsections',
	},
	{
		name: "index.recordEndOfIndexEntries",
		description:
			"Specifies whether the index file should include an \"End Of Index Entry\" section. This reduces index load time on multiprocessor machines but produces a message \"ignoring EOIE extension\" when reading the index using Git versions before 2.20. Defaults to 'true' if index.threads has been explicitly enabled, 'false' otherwise",
	},
	{
		name: "index.recordOffsetTable",
		description:
			"Specifies whether the index file should include an \"Index Entry Offset Table\" section. This reduces index load time on multiprocessor machines but produces a message \"ignoring IEOT extension\" when reading the index using Git versions before 2.20. Defaults to 'true' if index.threads has been explicitly enabled, 'false' otherwise",
	},
	{
		name: "index.sparse",
		description:
			"When enabled, write the index using sparse-directory entries. This has no effect unless `core.sparseCheckout` and `core.sparseCheckoutCone` are both enabled. Defaults to 'false'",
	},
	{
		name: "index.threads",
		description:
			"Specifies the number of threads to spawn when loading the index. This is meant to reduce index load time on multiprocessor machines. Specifying 0 or 'true' will cause Git to auto-detect the number of CPU's and set the number of threads accordingly. Specifying 1 or 'false' will disable multithreading. Defaults to 'true'",
	},
	{
		name: "index.version",
		description:
			"Specify the version with which new index files should be initialized. This does not affect existing repositories. If `feature.manyFiles` is enabled, then the default is 4",
	},
	{
		name: "init.defaultBranch",
		description:
			"Allows overriding the default branch name e.g. when initializing a new repository",
	},
	{
		name: "init.templateDir",
		description:
			'Specify the directory from which templates will be copied. (See the "TEMPLATE DIRECTORY" section of git-init[1].)',
	},
	{
		name: "instaweb.browser",
		description:
			"Specify the program that will be used to browse your working repository in gitweb. See git-instaweb[1]",
	},
	{
		name: "instaweb.httpd",
		description:
			"The HTTP daemon command-line to start gitweb on your working repository. See git-instaweb[1]",
	},
	{
		name: "instaweb.local",
		description:
			"If true the web server started by git-instaweb[1] will be bound to the local IP (127.0.0.1)",
	},
	{
		name: "instaweb.modulePath",
		description:
			"The default module path for git-instaweb[1] to use instead of /usr/lib/apache2/modules. Only used if httpd is Apache",
	},
	{
		name: "instaweb.port",
		description:
			"The port number to bind the gitweb httpd to. See git-instaweb[1]",
	},
	{
		name: "interactive.diffFilter",
		description:
			"When an interactive command (such as `git add --patch`) shows a colorized diff, git will pipe the diff through the shell command defined by this configuration variable. The command may mark up the diff further for human consumption, provided that it retains a one-to-one correspondence with the lines in the original diff. Defaults to disabled (no filtering)",
	},
	{
		name: "interactive.singleKey",
		description:
			"In interactive commands, allow the user to provide one-letter input with a single key (i.e., without hitting enter). Currently this is used by the `--patch` mode of git-add[1], git-checkout[1], git-restore[1], git-commit[1], git-reset[1], and git-stash[1]. Note that this setting is silently ignored if portable keystroke input is not available; requires the Perl module Term::ReadKey",
	},
	{
		name: "log.abbrevCommit",
		description:
			"If true, makes git-log[1], git-show[1], and git-whatchanged[1] assume `--abbrev-commit`. You may override this option with `--no-abbrev-commit`",
	},
	{
		name: "log.date",
		description:
			"Set the default date-time mode for the 'log' command. Setting a value for log.date is similar to using 'git log''s `--date` option. See git-log[1] for details",
	},
	{
		name: "log.decorate",
		description:
			"Print out the ref names of any commits that are shown by the log command. If 'short' is specified, the ref name prefixes 'refs/heads/', 'refs/tags/' and 'refs/remotes/' will not be printed. If 'full' is specified, the full ref name (including prefix) will be printed. If 'auto' is specified, then if the output is going to a terminal, the ref names are shown as if 'short' were given, otherwise no ref names are shown. This is the same as the `--decorate` option of the `git log`",
	},
	{
		name: "log.diffMerges",
		description:
			"Set default diff format to be used for merge commits. See `--diff-merges` in git-log[1] for details. Defaults to `separate`",
	},
	{
		name: "log.excludeDecoration",
		description:
			"Exclude the specified patterns from the log decorations. This is similar to the `--decorate-refs-exclude` command-line option, but the config option can be overridden by the `--decorate-refs` option",
	},
	{
		name: "log.follow",
		description:
			"If `true`, `git log` will act as if the `--follow` option was used when a single <path> is given. This has the same limitations as `--follow`, i.e. it cannot be used to follow multiple files and does not work well on non-linear history",
	},
	{
		name: "log.graphColors",
		description:
			"A list of colors, separated by commas, that can be used to draw history lines in `git log --graph`",
	},
	{
		name: "log.initialDecorationSet",
		description:
			"By default, `git log` only shows decorations for certain known ref namespaces. If 'all' is specified, then show all refs as decorations",
	},
	{
		name: "log.mailmap",
		description:
			"If true, makes git-log[1], git-show[1], and git-whatchanged[1] assume `--use-mailmap`, otherwise assume `--no-use-mailmap`. True by default",
	},
	{
		name: "log.showRoot",
		description:
			"If true, the initial commit will be shown as a big creation event. This is equivalent to a diff against an empty tree. Tools like git-log[1] or git-whatchanged[1], which normally hide the root commit will now show it. True by default",
	},
	{
		name: "log.showSignature",
		description:
			"If true, makes git-log[1], git-show[1], and git-whatchanged[1] assume `--show-signature`",
	},
	{
		name: "lsrefs.unborn",
		description:
			'May be "advertise" (the default), "allow", or "ignore". If "advertise", the server will respond to the client sending "unborn" (as described in gitprotocol-v2[5]) and will advertise support for this feature during the protocol v2 capability advertisement. "allow" is the same as "advertise" except that the server will not advertise support for this feature; this is useful for load-balanced servers that cannot be updated atomically (for example), since the administrator could configure "allow", then after a delay, configure "advertise"',
	},
	{
		name: "mailinfo.scissors",
		description:
			'If true, makes git-mailinfo[1] (and therefore git-am[1]) act by default as if the --scissors option was provided on the command-line. When active, this features removes everything from the message body before a scissors line (i.e. consisting mainly of ">8", "8<" and "-")',
	},
	{
		name: "mailmap.blob",
		description:
			"Like `mailmap.file`, but consider the value as a reference to a blob in the repository. If both `mailmap.file` and `mailmap.blob` are given, both are parsed, with entries from `mailmap.file` taking precedence. In a bare repository, this defaults to `HEAD:.mailmap`. In a non-bare repository, it defaults to empty",
	},
	{
		name: "mailmap.file",
		description:
			"The location of an augmenting mailmap file. The default mailmap, located in the root of the repository, is loaded first, then the mailmap file pointed to by this variable. The location of the mailmap file may be in a repository subdirectory, or somewhere outside of the repository itself. See git-shortlog[1] and git-blame[1]",
	},
	{
		name: "maintenance.<task>.enabled",
		insertValue: "maintenance.{cursor}.enabled",
		description:
			"This boolean config option controls whether the maintenance task with name `<task>` is run when no `--task` option is specified to `git maintenance run`. These config values are ignored if a `--task` option exists. By default, only `maintenance.gc.enabled` is true",
	},
	{
		name: "maintenance.<task>.schedule",
		insertValue: "maintenance.{cursor}.schedule",
		description:
			'This config option controls whether or not the given `<task>` runs during a `git maintenance run --schedule=<frequency>` command. The value must be one of "hourly", "daily", or "weekly"',
	},
	{
		name: "maintenance.auto",
		description:
			"This boolean config option controls whether some commands run `git maintenance run --auto` after doing their normal work. Defaults to true",
	},
	{
		name: "maintenance.commit-graph.auto",
		description:
			"This integer config option controls how often the `commit-graph` task should be run as part of `git maintenance run --auto`. If zero, then the `commit-graph` task will not run with the `--auto` option. A negative value will force the task to run every time. Otherwise, a positive value implies the command should run when the number of reachable commits that are not in the commit-graph file is at least the value of `maintenance.commit-graph.auto`. The default value is 100",
	},
	{
		name: "maintenance.incremental-repack.auto",
		description:
			"This integer config option controls how often the `incremental-repack` task should be run as part of `git maintenance run --auto`. If zero, then the `incremental-repack` task will not run with the `--auto` option. A negative value will force the task to run every time. Otherwise, a positive value implies the command should run when the number of pack-files not in the multi-pack-index is at least the value of `maintenance.incremental-repack.auto`. The default value is 10",
	},
	{
		name: "maintenance.loose-objects.auto",
		description:
			"This integer config option controls how often the `loose-objects` task should be run as part of `git maintenance run --auto`. If zero, then the `loose-objects` task will not run with the `--auto` option. A negative value will force the task to run every time. Otherwise, a positive value implies the command should run when the number of loose objects is at least the value of `maintenance.loose-objects.auto`. The default value is 100",
	},
	{
		name: "maintenance.strategy",
		description:
			"This string config option provides a way to specify one of a few recommended schedules for background maintenance. This only affects which tasks are run during `git maintenance run --schedule=X` commands, provided no `--task=<task>` arguments are provided. Further, if a `maintenance.<task>.schedule` config value is set, then that value is used instead of the one provided by `maintenance.strategy`. The possible strategy strings are:",
	},
	{
		name: "man.<tool>.cmd",
		insertValue: "man.{cursor}.cmd",
		description:
			"Specify the command to invoke the specified man viewer. The specified command is evaluated in shell with the man page passed as argument. (See git-help[1].)",
	},
	{
		name: "man.<tool>.path",
		insertValue: "man.{cursor}.path",
		description:
			"Override the path for the given tool that may be used to display help in the 'man' format. See git-help[1]",
	},
	{
		name: "man.viewer",
		description:
			"Specify the programs that may be used to display help in the 'man' format. See git-help[1]",
	},
	{
		name: "merge.<driver>.driver",
		insertValue: "merge.{cursor}.driver",
		description:
			"Defines the command that implements a custom low-level merge driver. See gitattributes[5] for details",
	},
	{
		name: "merge.<driver>.name",
		insertValue: "merge.{cursor}.name",
		description:
			"Defines a human-readable name for a custom low-level merge driver. See gitattributes[5] for details",
	},
	{
		name: "merge.<driver>.recursive",
		insertValue: "merge.{cursor}.recursive",
		description:
			"Names a low-level merge driver to be used when performing an internal merge between common ancestors. See gitattributes[5] for details",
	},
	{
		name: "merge.autoStash",
		description:
			"When set to true, automatically create a temporary stash entry before the operation begins, and apply it after the operation ends. This means that you can run merge on a dirty worktree. However, use with care: the final stash application after a successful merge might result in non-trivial conflicts. This option can be overridden by the `--no-autostash` and `--autostash` options of git-merge[1]. Defaults to false",
	},
	{
		name: "merge.branchdesc",
		description:
			"In addition to branch names, populate the log message with the branch description text associated with them. Defaults to false",
	},
	{
		name: "merge.conflictStyle",
		description:
			'Specify the style in which conflicted hunks are written out to working tree files upon merge. The default is "merge", which shows a `<<<<<<<` conflict marker, changes made by one side, a `=======` marker, changes made by the other side, and then a `>>>>>>>` marker. An alternate style, "diff3", adds a `|||||||` marker and the original text before the `=======` marker. The "merge" style tends to produce smaller conflict regions than diff3, both because of the exclusion of the original text, and because when a subset of lines match on the two sides they are just pulled out of the conflict region. Another alternate style, "zdiff3", is similar to diff3 but removes matching lines on the two sides from the conflict region when those matching lines appear near either the beginning or end of a conflict region',
	},
	{
		name: "merge.defaultToUpstream",
		description:
			"If merge is called without any commit argument, merge the upstream branches configured for the current branch by using their last observed values stored in their remote-tracking branches. The values of the `branch.<current branch>.merge` that name the branches at the remote named by `branch.<current branch>.remote` are consulted, and then they are mapped via `remote.<remote>.fetch` to their corresponding remote-tracking branches, and the tips of these tracking branches are merged. Defaults to true",
	},
	{
		name: "merge.directoryRenames",
		description:
			'Whether Git detects directory renames, affecting what happens at merge time to new files added to a directory on one side of history when that directory was renamed on the other side of history. If merge.directoryRenames is set to "false", directory rename detection is disabled, meaning that such new files will be left behind in the old directory. If set to "true", directory rename detection is enabled, meaning that such new files will be moved into the new directory. If set to "conflict", a conflict will be reported for such paths. If merge.renames is false, merge.directoryRenames is ignored and treated as false. Defaults to "conflict"',
	},
	{
		name: "merge.ff",
		description:
			"By default, Git does not create an extra merge commit when merging a commit that is a descendant of the current commit. Instead, the tip of the current branch is fast-forwarded. When set to `false`, this variable tells Git to create an extra merge commit in such a case (equivalent to giving the `--no-ff` option from the command line). When set to `only`, only such fast-forward merges are allowed (equivalent to giving the `--ff-only` option from the command line)",
	},
	{
		name: "merge.guitool",
		description:
			"Controls which merge tool is used by git-mergetool[1] when the -g/--gui flag is specified. The list below shows the valid built-in values. Any other value is treated as a custom merge tool and requires that a corresponding mergetool.<guitool>.cmd variable is defined",
	},
	{
		name: "merge.log",
		description:
			"In addition to branch names, populate the log message with at most the specified number of one-line descriptions from the actual commits that are being merged. Defaults to false, and true is a synonym for 20",
	},
	{
		name: "merge.renameLimit",
		description:
			"The number of files to consider in the exhaustive portion of rename detection during a merge. If not specified, defaults to the value of diff.renameLimit. If neither merge.renameLimit nor diff.renameLimit are specified, currently defaults to 7000. This setting has no effect if rename detection is turned off",
	},
	{
		name: "merge.renames",
		description:
			'Whether Git detects renames. If set to "false", rename detection is disabled. If set to "true", basic rename detection is enabled. Defaults to the value of diff.renames',
	},
	{
		name: "merge.renormalize",
		description:
			'Tell Git that canonical representation of files in the repository has changed over time (e.g. earlier commits record text files with CRLF line endings, but recent ones use LF line endings). In such a repository, Git can convert the data recorded in commits to a canonical form before performing a merge to reduce unnecessary conflicts. For more information, see section "Merging branches with differing checkin/checkout attributes" in gitattributes[5]',
	},
	{
		name: "merge.stat",
		description:
			"Whether to print the diffstat between ORIG_HEAD and the merge result at the end of the merge. True by default",
	},
	{
		name: "merge.suppressDest",
		description:
			'By adding a glob that matches the names of integration branches to this multi-valued configuration variable, the default merge message computed for merges into these integration branches will omit "into <branch name>" from its title',
	},
	{
		name: "merge.tool",
		description:
			"Controls which merge tool is used by git-mergetool[1]. The list below shows the valid built-in values. Any other value is treated as a custom merge tool and requires that a corresponding mergetool.<tool>.cmd variable is defined",
	},
	{
		name: "merge.verbosity",
		description:
			"Controls the amount of output shown by the recursive merge strategy. Level 0 outputs nothing except a final error message if conflicts were detected. Level 1 outputs only conflicts, 2 outputs conflicts and file changes. Level 5 and above outputs debugging information. The default is level 2. Can be overridden by the `GIT_MERGE_VERBOSITY` environment variable",
	},
	{
		name: "merge.verifySignatures",
		description:
			"If true, this is equivalent to the --verify-signatures command line option. See git-merge[1] for details",
	},
	{
		name: "mergetool.<tool>.cmd",
		insertValue: "mergetool.{cursor}.cmd",
		description:
			"Specify the command to invoke the specified merge tool. The specified command is evaluated in shell with the following variables available: 'BASE' is the name of a temporary file containing the common base of the files to be merged, if available; 'LOCAL' is the name of a temporary file containing the contents of the file on the current branch; 'REMOTE' is the name of a temporary file containing the contents of the file from the branch being merged; 'MERGED' contains the name of the file to which the merge tool should write the results of a successful merge",
	},
	{
		name: "mergetool.<tool>.hideResolved",
		insertValue: "mergetool.{cursor}.hideResolved",
		description:
			"Allows the user to override the global `mergetool.hideResolved` value for a specific tool. See `mergetool.hideResolved` for the full description",
	},
	{
		name: "mergetool.<tool>.path",
		insertValue: "mergetool.{cursor}.path",
		description:
			"Override the path for the given tool. This is useful in case your tool is not in the PATH",
	},
	{
		name: "mergetool.<tool>.trustExitCode",
		insertValue: "mergetool.{cursor}.trustExitCode",
		description:
			"For a custom merge command, specify whether the exit code of the merge command can be used to determine whether the merge was successful. If this is not set to true then the merge target file timestamp is checked and the merge assumed to have been successful if the file has been updated, otherwise the user is prompted to indicate the success of the merge",
	},
	{
		name: "mergetool.hideResolved",
		description:
			"During a merge Git will automatically resolve as many conflicts as possible and write the 'MERGED' file containing conflict markers around any conflicts that it cannot resolve; 'LOCAL' and 'REMOTE' normally represent the versions of the file from before Git's conflict resolution. This flag causes 'LOCAL' and 'REMOTE' to be overwriten so that only the unresolved conflicts are presented to the merge tool. Can be configured per-tool via the `mergetool.<tool>.hideResolved` configuration variable. Defaults to `false`",
	},
	{
		name: "mergetool.keepBackup",
		description:
			"After performing a merge, the original file with conflict markers can be saved as a file with a `.orig` extension. If this variable is set to `false` then this file is not preserved. Defaults to `true` (i.e. keep the backup files)",
	},
	{
		name: "mergetool.keepTemporaries",
		description:
			"When invoking a custom merge tool, Git uses a set of temporary files to pass to the tool. If the tool returns an error and this variable is set to `true`, then these temporary files will be preserved, otherwise they will be removed after the tool has exited. Defaults to `false`",
	},
	{
		name: "mergetool.meld.hasOutput",
		description:
			"Older versions of `meld` do not support the `--output` option. Git will attempt to detect whether `meld` supports `--output` by inspecting the output of `meld --help`. Configuring `mergetool.meld.hasOutput` will make Git skip these checks and use the configured value instead. Setting `mergetool.meld.hasOutput` to `true` tells Git to unconditionally use the `--output` option, and `false` avoids using `--output`",
	},
	{
		name: "mergetool.meld.useAutoMerge",
		description:
			"When the `--auto-merge` is given, meld will merge all non-conflicting parts automatically, highlight the conflicting parts and wait for user decision. Setting `mergetool.meld.useAutoMerge` to `true` tells Git to unconditionally use the `--auto-merge` option with `meld`. Setting this value to `auto` makes git detect whether `--auto-merge` is supported and will only use `--auto-merge` when available. A value of `false` avoids using `--auto-merge` altogether, and is the default value",
	},
	{
		name: "mergetool.prompt",
		description:
			"Prompt before each invocation of the merge resolution program",
	},
	{
		name: "mergetool.vimdiff.layout",
		description:
			"The vimdiff backend uses this variable to control how its split windows look like. Applies even if you are using Neovim (`nvim`) or gVim (`gvim`) as the merge tool. See BACKEND SPECIFIC HINTS section",
	},
	{
		name: "mergetool.writeToTemp",
		description:
			"Git writes temporary 'BASE', 'LOCAL', and 'REMOTE' versions of conflicting files in the worktree by default. Git will attempt to use a temporary directory for these files when set `true`. Defaults to `false`",
	},
	{
		name: "notes.<name>.mergeStrategy",
		insertValue: "notes.{cursor}.mergeStrategy",
		description:
			'Which merge strategy to choose when doing a notes merge into refs/notes/<name>. This overrides the more general "notes.mergeStrategy". See the "NOTES MERGE STRATEGIES" section in git-notes[1] for more information on the available strategies',
	},
	{
		name: "notes.displayRef",
		description:
			"The (fully qualified) refname from which to show notes when showing commit messages. The value of this variable can be set to a glob, in which case notes from all matching refs will be shown. You may also specify this configuration variable several times. A warning will be issued for refs that do not exist, but a glob that does not match any refs is silently ignored",
	},
	{
		name: "notes.mergeStrategy",
		description:
			'Which merge strategy to choose by default when resolving notes conflicts. Must be one of `manual`, `ours`, `theirs`, `union`, or `cat_sort_uniq`. Defaults to `manual`. See "NOTES MERGE STRATEGIES" section of git-notes[1] for more information on each strategy',
	},
	{
		name: "notes.rewrite.<command>",
		insertValue: "notes.rewrite.{cursor}",
		description:
			'When rewriting commits with <command> (currently `amend` or `rebase`) and this variable is set to `true`, Git automatically copies your notes from the original to the rewritten commit. Defaults to `true`, but see "notes.rewriteRef" below',
	},
	{
		name: "notes.rewriteMode",
		description:
			'When copying notes during a rewrite (see the "notes.rewrite.<command>" option), determines what to do if the target commit already has a note. Must be one of `overwrite`, `concatenate`, `cat_sort_uniq`, or `ignore`. Defaults to `concatenate`',
	},
	{
		name: "notes.rewriteRef",
		description:
			"When copying notes during a rewrite, specifies the (fully qualified) ref whose notes should be copied. The ref may be a glob, in which case notes in all matching refs will be copied. You may also specify this configuration several times",
	},
	{
		name: "pack.allowPackReuse",
		description:
			"When true, and when reachability bitmaps are enabled, pack-objects will try to send parts of the bitmapped packfile verbatim. This can reduce memory and CPU usage to serve fetches, but might result in sending a slightly larger pack. Defaults to true",
	},
	{
		name: "pack.compression",
		description:
			'An integer -1..9, indicating the compression level for objects in a pack file. -1 is the zlib default. 0 means no compression, and 1..9 are various speed/size tradeoffs, 9 being slowest. If not set, defaults to core.compression. If that is not set, defaults to -1, the zlib default, which is "a default compromise between speed and compression (currently equivalent to level 6)"',
	},
	{
		name: "pack.deltaCacheLimit",
		description:
			"The maximum size of a delta, that is cached in git-pack-objects[1]. This cache is used to speed up the writing object phase by not having to recompute the final delta result once the best match for all objects is found. Defaults to 1000. Maximum value is 65535",
	},
	{
		name: "pack.deltaCacheSize",
		description:
			"The maximum memory in bytes used for caching deltas in git-pack-objects[1] before writing them out to a pack. This cache is used to speed up the writing object phase by not having to recompute the final delta result once the best match for all objects is found. Repacking large repositories on machines which are tight with memory might be badly impacted by this though, especially if this cache pushes the system into swapping. A value of 0 means no limit. The smallest size of 1 byte may be used to virtually disable this cache. Defaults to 256 MiB",
	},
	{
		name: "pack.depth",
		description:
			"The maximum delta depth used by git-pack-objects[1] when no maximum depth is given on the command line. Defaults to 50. Maximum value is 4095",
	},
	{
		name: "pack.indexVersion",
		description:
			"Specify the default pack index version. Valid values are 1 for legacy pack index used by Git versions prior to 1.5.2, and 2 for the new pack index with capabilities for packs larger than 4 GB as well as proper protection against the repacking of corrupted packs. Version 2 is the default. Note that version 2 is enforced and this config option ignored whenever the corresponding pack is larger than 2 GB",
	},
	{
		name: "pack.island",
		description:
			'An extended regular expression configuring a set of delta islands. See "DELTA ISLANDS" in git-pack-objects[1] for details',
	},
	{
		name: "pack.islandCore",
		description:
			'Specify an island name which gets to have its objects be packed first. This creates a kind of pseudo-pack at the front of one pack, so that the objects from the specified island are hopefully faster to copy into any pack that should be served to a user requesting these objects. In practice this means that the island specified should likely correspond to what is the most commonly cloned in the repo. See also "DELTA ISLANDS" in git-pack-objects[1]',
	},
	{
		name: "pack.packSizeLimit",
		description:
			"The maximum size of a pack. This setting only affects packing to a file when repacking, i.e. the git:// protocol is unaffected. It can be overridden by the `--max-pack-size` option of git-repack[1]. Reaching this limit results in the creation of multiple packfiles",
	},
	{
		name: "pack.preferBitmapTips",
		description:
			'When selecting which commits will receive bitmaps, prefer a commit at the tip of any reference that is a suffix of any value of this configuration over any other commits in the "selection window"',
	},
	{
		name: "pack.threads",
		description:
			"Specifies the number of threads to spawn when searching for best delta matches. This requires that git-pack-objects[1] be compiled with pthreads otherwise this option is ignored with a warning. This is meant to reduce packing time on multiprocessor machines. The required amount of memory for the delta search window is however multiplied by the number of threads. Specifying 0 will cause Git to auto-detect the number of CPU's and set the number of threads accordingly",
	},
	{
		name: "pack.useBitmaps",
		description:
			"When true, git will use pack bitmaps (if available) when packing to stdout (e.g., during the server side of a fetch). Defaults to true. You should not generally need to turn this off unless you are debugging pack bitmaps",
	},
	{
		name: "pack.useSparse",
		description:
			"When true, git will default to using the '--sparse' option in 'git pack-objects' when the '--revs' option is present. This algorithm only walks trees that appear in paths that introduce new objects. This can have significant performance benefits when computing a pack to send a small change. However, it is possible that extra objects are added to the pack-file if the included commits contain certain types of direct renames. Default is `true`",
	},
	{
		name: "pack.window",
		description:
			"The size of the window used by git-pack-objects[1] when no window size is given on the command line. Defaults to 10",
	},
	{
		name: "pack.windowMemory",
		description:
			'The maximum size of memory that is consumed by each thread in git-pack-objects[1] for pack window memory when no limit is given on the command line. The value can be suffixed with "k", "m", or "g". When left unconfigured (or set explicitly to 0), there will be no limit',
	},
	{
		name: "pack.writeBitmapHashCache",
		description:
			'When true, git will include a "hash cache" section in the bitmap index (if one is written). This cache can be used to feed git\'s delta heuristics, potentially leading to better deltas between bitmapped and non-bitmapped objects (e.g., when serving a fetch between an older, bitmapped pack and objects that have been pushed since the last gc). The downside is that it consumes 4 bytes per object of disk space. Defaults to true',
	},
	{
		name: "pack.writeBitmapLookupTable",
		description:
			'When true, Git will include a "lookup table" section in the bitmap index (if one is written). This table is used to defer loading individual bitmaps as late as possible. This can be beneficial in repositories that have relatively large bitmap indexes. Defaults to false',
	},
	{
		name: "pack.writeBitmaps",
		description: "This is a deprecated synonym for `repack.writeBitmaps`",
		deprecated: true,
		hidden: true,
	},
	{
		name: "pack.writeReverseIndex",
		description:
			"When true, git will write a corresponding .rev file (see: gitformat-pack[5]) for each new packfile that it writes in all places except for git-fast-import[1] and in the bulk checkin mechanism. Defaults to false",
	},
	{
		name: "pager.<cmd>",
		insertValue: "pager.{cursor}",
		description:
			"If the value is boolean, turns on or off pagination of the output of a particular Git subcommand when writing to a tty. Otherwise, turns on pagination for the subcommand using the pager specified by the value of `pager.<cmd>`. If `--paginate` or `--no-pager` is specified on the command line, it takes precedence over this option. To disable pagination for all commands, set `core.pager` or `GIT_PAGER` to `cat`",
	},
	{
		name: "pretty.<name>",
		insertValue: "pretty.{cursor}",
		description:
			'Alias for a --pretty= format string, as specified in git-log[1]. Any aliases defined here can be used just as the built-in pretty formats could. For example, running `git config pretty.changelog "format:* %H %s"` would cause the invocation `git log --pretty=changelog` to be equivalent to running `git log "--pretty=format:* %H %s"`. Note that an alias with the same name as a built-in format will be silently ignored',
	},
	{
		name: "protocol.<name>.allow",
		insertValue: "protocol.{cursor}.allow",
		description:
			"Set a policy to be used by protocol `<name>` with clone/fetch/push commands. See `protocol.allow` above for the available policies",
	},
	{
		name: "protocol.allow",
		description:
			"If set, provide a user defined default policy for all protocols which don't explicitly have a policy (`protocol.<name>.allow`). By default, if unset, known-safe protocols (http, https, git, ssh, file) have a default policy of `always`, known-dangerous protocols (ext) have a default policy of `never`, and all other protocols have a default policy of `user`. Supported policies:",
	},
	{
		name: "protocol.version",
		description:
			"If set, clients will attempt to communicate with a server using the specified protocol version. If the server does not support it, communication falls back to version 0. If unset, the default is `2`. Supported versions:",
	},
	{
		name: "pull.ff",
		description:
			"By default, Git does not create an extra merge commit when merging a commit that is a descendant of the current commit. Instead, the tip of the current branch is fast-forwarded. When set to `false`, this variable tells Git to create an extra merge commit in such a case (equivalent to giving the `--no-ff` option from the command line). When set to `only`, only such fast-forward merges are allowed (equivalent to giving the `--ff-only` option from the command line). This setting overrides `merge.ff` when pulling",
	},
	{
		name: "pull.octopus",
		description:
			"The default merge strategy to use when pulling multiple branches at once",
	},
	{
		name: "pull.rebase",
		description:
			'When true, rebase branches on top of the fetched branch, instead of merging the default branch from the default remote when "git pull" is run. See "branch.<name>.rebase" for setting this on a per-branch basis',
	},
	{
		name: "pull.twohead",
		description:
			"The default merge strategy to use when pulling a single branch",
	},
	{
		name: "push.autoSetupRemote",
		description:
			"If set to \"true\" assume `--set-upstream` on default push when no upstream tracking exists for the current branch; this option takes effect with push.default options 'simple', 'upstream', and 'current'. It is useful if by default you want new branches to be pushed to the default remote (like the behavior of 'push.default=current') and you also want the upstream tracking to be set. Workflows most likely to benefit from this option are 'simple' central workflows where all branches are expected to have the same name on the remote",
	},
	{
		name: "push.default",
		description:
			"Defines the action `git push` should take if no refspec is given (whether from the command-line, config, or elsewhere). Different values are well-suited for specific workflows; for instance, in a purely central workflow (i.e. the fetch source is equal to the push destination), `upstream` is probably what you want. Possible values are:",
	},
	{
		name: "push.followTags",
		description:
			"If set to true enable `--follow-tags` option by default. You may override this configuration at time of push by specifying `--no-follow-tags`",
	},
	{
		name: "push.gpgSign",
		description:
			"May be set to a boolean value, or the string 'if-asked'. A true value causes all pushes to be GPG signed, as if `--signed` is passed to git-push[1]. The string 'if-asked' causes pushes to be signed if the server supports it, as if `--signed=if-asked` is passed to 'git push'. A false value may override a value from a lower-priority config file. An explicit command-line flag always overrides this config option",
	},
	{
		name: "push.negotiate",
		description:
			'If set to "true", attempt to reduce the size of the packfile sent by rounds of negotiation in which the client and the server attempt to find commits in common. If "false", Git will rely solely on the server\'s ref advertisement to find commits in common',
	},
	{
		name: "push.pushOption",
		description:
			"When no `--push-option=<option>` argument is given from the command line, `git push` behaves as if each <value> of this variable is given as `--push-option=<value>`",
	},
	{
		name: "push.recurseSubmodules",
		description:
			"Make sure all submodule commits used by the revisions to be pushed are available on a remote-tracking branch. If the value is 'check' then Git will verify that all submodule commits that changed in the revisions to be pushed are available on at least one remote of the submodule. If any commits are missing, the push will be aborted and exit with non-zero status. If the value is 'on-demand' then all submodules that changed in the revisions to be pushed will be pushed. If on-demand was not able to push all necessary revisions it will also be aborted and exit with non-zero status. If the value is 'no' then default behavior of ignoring submodules when pushing is retained. You may override this configuration at time of push by specifying '--recurse-submodules=check|on-demand|no'. If not set, 'no' is used by default, unless 'submodule.recurse' is set (in which case a 'true' value means 'on-demand')",
	},
	{
		name: "push.useBitmaps",
		description:
			'If set to "false", disable use of bitmaps for "git push" even if `pack.useBitmaps` is "true", without preventing other git operations from using bitmaps. Default is true',
	},
	{
		name: "push.useForceIfIncludes",
		description:
			'If set to "true", it is equivalent to specifying `--force-if-includes` as an option to git-push[1] in the command line. Adding `--no-force-if-includes` at the time of push overrides this configuration setting',
	},
	{
		name: "rebase.abbreviateCommands",
		description:
			"If set to true, `git rebase` will use abbreviated command names in the todo list resulting in something like this:",
	},
	{
		name: "rebase.autoSquash",
		description: "If set to true enable `--autosquash` option by default",
	},
	{
		name: "rebase.autoStash",
		description:
			"When set to true, automatically create a temporary stash entry before the operation begins, and apply it after the operation ends. This means that you can run rebase on a dirty worktree. However, use with care: the final stash application after a successful rebase might result in non-trivial conflicts. This option can be overridden by the `--no-autostash` and `--autostash` options of git-rebase[1]. Defaults to false",
	},
	{
		name: "rebase.backend",
		description:
			"Default backend to use for rebasing. Possible choices are 'apply' or 'merge'. In the future, if the merge backend gains all remaining capabilities of the apply backend, this setting may become unused",
	},
	{
		name: "rebase.forkPoint",
		description: "If set to false set `--no-fork-point` option by default",
	},
	{
		name: "rebase.instructionFormat",
		description:
			"A format string, as specified in git-log[1], to be used for the todo list during an interactive rebase. The format will automatically have the long commit hash prepended to the format",
	},
	{
		name: "rebase.missingCommitsCheck",
		description:
			'If set to "warn", git rebase -i will print a warning if some commits are removed (e.g. a line was deleted), however the rebase will still proceed. If set to "error", it will print the previous warning and stop the rebase, \'git rebase --edit-todo\' can then be used to correct the error. If set to "ignore", no checking is done. To drop a commit without warning or error, use the `drop` command in the todo list. Defaults to "ignore"',
	},
	{
		name: "rebase.rescheduleFailedExec",
		description:
			"Automatically reschedule `exec` commands that failed. This only makes sense in interactive mode (or when an `--exec` option was provided). This is the same as specifying the `--reschedule-failed-exec` option",
	},
	{
		name: "rebase.stat",
		description:
			"Whether to show a diffstat of what changed upstream since the last rebase. False by default",
	},
	{
		name: "rebase.updateRefs",
		description: "If set to true enable `--update-refs` option by default",
	},
	{
		name: "receive.advertiseAtomic",
		description:
			"By default, git-receive-pack will advertise the atomic push capability to its clients. If you don't want to advertise this capability, set this variable to false",
	},
	{
		name: "receive.advertisePushOptions",
		description:
			"When set to true, git-receive-pack will advertise the push options capability to its clients. False by default",
	},
	{
		name: "receive.autogc",
		description:
			'By default, git-receive-pack will run "git-gc --auto" after receiving data from git-push and updating refs. You can stop it by setting this variable to false',
	},
	{
		name: "receive.certNonceSeed",
		description:
			'By setting this variable to a string, `git receive-pack` will accept a `git push --signed` and verifies it by using a "nonce" protected by HMAC using this string as a secret key',
	},
	{
		name: "receive.certNonceSlop",
		description:
			'When a `git push --signed` sent a push certificate with a "nonce" that was issued by a receive-pack serving the same repository within this many seconds, export the "nonce" found in the certificate to `GIT_PUSH_CERT_NONCE` to the hooks (instead of what the receive-pack asked the sending side to include). This may allow writing checks in `pre-receive` and `post-receive` a bit easier. Instead of checking `GIT_PUSH_CERT_NONCE_SLOP` environment variable that records by how many seconds the nonce is stale to decide if they want to accept the certificate, they only can check `GIT_PUSH_CERT_NONCE_STATUS` is `OK`',
	},
	{
		name: "receive.denyCurrentBranch",
		description:
			'If set to true or "refuse", git-receive-pack will deny a ref update to the currently checked out branch of a non-bare repository. Such a push is potentially dangerous because it brings the HEAD out of sync with the index and working tree. If set to "warn", print a warning of such a push to stderr, but allow the push to proceed. If set to false or "ignore", allow such pushes with no message. Defaults to "refuse"',
	},
	{
		name: "receive.denyDeleteCurrent",
		description:
			"If set to true, git-receive-pack will deny a ref update that deletes the currently checked out branch of a non-bare repository",
	},
	{
		name: "receive.denyDeletes",
		description:
			"If set to true, git-receive-pack will deny a ref update that deletes the ref. Use this to prevent such a ref deletion via a push",
	},
	{
		name: "receive.denyNonFastForwards",
		description:
			"If set to true, git-receive-pack will deny a ref update which is not a fast-forward. Use this to prevent such an update via a push, even if that push is forced. This configuration variable is set when initializing a shared repository",
	},
	{
		name: "receive.fsck.<msg-id>",
		insertValue: "receive.fsck.{cursor}",
		description:
			"Acts like `fsck.<msg-id>`, but is used by git-receive-pack[1] instead of git-fsck[1]. See the `fsck.<msg-id>` documentation for details",
	},
	{
		name: "receive.fsck.skipList",
		description:
			"Acts like `fsck.skipList`, but is used by git-receive-pack[1] instead of git-fsck[1]. See the `fsck.skipList` documentation for details",
	},
	{
		name: "receive.fsckObjects",
		description:
			"If it is set to true, git-receive-pack will check all received objects. See `transfer.fsckObjects` for what's checked. Defaults to false. If not set, the value of `transfer.fsckObjects` is used instead",
	},
	{
		name: "receive.hideRefs",
		description:
			"This variable is the same as `transfer.hideRefs`, but applies only to `receive-pack` (and so affects pushes, but not fetches). An attempt to update or delete a hidden ref by `git push` is rejected",
	},
	{
		name: "receive.keepAlive",
		description:
			"After receiving the pack from the client, `receive-pack` may produce no output (if `--quiet` was specified) while processing the pack, causing some networks to drop the TCP connection. With this option set, if `receive-pack` does not transmit any data in this phase for `receive.keepAlive` seconds, it will send a short keepalive packet. The default is 5 seconds; set to 0 to disable keepalives entirely",
	},
	{
		name: "receive.maxInputSize",
		description:
			"If the size of the incoming pack stream is larger than this limit, then git-receive-pack will error out, instead of accepting the pack file. If not set or set to 0, then the size is unlimited",
	},
	{
		name: "receive.procReceiveRefs",
		description:
			'This is a multi-valued variable that defines reference prefixes to match the commands in `receive-pack`. Commands matching the prefixes will be executed by an external hook "proc-receive", instead of the internal `execute_commands` function. If this variable is not defined, the "proc-receive" hook will never be used, and all commands will be executed by the internal `execute_commands` function',
	},
	{
		name: "receive.shallowUpdate",
		description:
			"If set to true, .git/shallow can be updated when new refs require new shallow roots. Otherwise those refs are rejected",
	},
	{
		name: "receive.unpackLimit",
		description:
			"If the number of objects received in a push is below this limit then the objects will be unpacked into loose object files. However if the number of received objects equals or exceeds this limit then the received pack will be stored as a pack, after adding any missing delta bases. Storing the pack from a push can make the push operation complete faster, especially on slow filesystems. If not set, the value of `transfer.unpackLimit` is used instead",
	},
	{
		name: "receive.updateServerInfo",
		description:
			"If set to true, git-receive-pack will run git-update-server-info after receiving data from git-push and updating refs",
	},
	{
		name: "remote.<name>.fetch",
		insertValue: "remote.{cursor}.fetch",
		description:
			'The default set of "refspec" for git-fetch[1]. See git-fetch[1]',
	},
	{
		name: "remote.<name>.mirror",
		insertValue: "remote.{cursor}.mirror",
		description:
			"If true, pushing to this remote will automatically behave as if the `--mirror` option was given on the command line",
	},
	{
		name: "remote.<name>.partialclonefilter",
		insertValue: "remote.{cursor}.partialclonefilter",
		description:
			"The filter that will be applied when fetching from this promisor remote. Changing or clearing this value will only affect fetches for new commits. To fetch associated objects for commits already present in the local object database, use the `--refetch` option of git-fetch[1]",
	},
	{
		name: "remote.<name>.promisor",
		insertValue: "remote.{cursor}.promisor",
		description:
			"When set to true, this remote will be used to fetch promisor objects",
	},
	{
		name: "remote.<name>.proxy",
		insertValue: "remote.{cursor}.proxy",
		description:
			"For remotes that require curl (http, https and ftp), the URL to the proxy to use for that remote. Set to the empty string to disable proxying for that remote",
	},
	{
		name: "remote.<name>.proxyAuthMethod",
		insertValue: "remote.{cursor}.proxyAuthMethod",
		description:
			"For remotes that require curl (http, https and ftp), the method to use for authenticating against the proxy in use (probably set in `remote.<name>.proxy`). See `http.proxyAuthMethod`",
	},
	{
		name: "remote.<name>.prune",
		insertValue: "remote.{cursor}.prune",
		description:
			"When set to true, fetching from this remote by default will also remove any remote-tracking references that no longer exist on the remote (as if the `--prune` option was given on the command line). Overrides `fetch.prune` settings, if any",
	},
	{
		name: "remote.<name>.pruneTags",
		insertValue: "remote.{cursor}.pruneTags",
		description:
			"When set to true, fetching from this remote by default will also remove any local tags that no longer exist on the remote if pruning is activated in general via `remote.<name>.prune`, `fetch.prune` or `--prune`. Overrides `fetch.pruneTags` settings, if any",
	},
	{
		name: "remote.<name>.push",
		insertValue: "remote.{cursor}.push",
		description:
			'The default set of "refspec" for git-push[1]. See git-push[1]',
	},
	{
		name: "remote.<name>.pushurl",
		insertValue: "remote.{cursor}.pushurl",
		description: "The push URL of a remote repository. See git-push[1]",
	},
	{
		name: "remote.<name>.receivepack",
		insertValue: "remote.{cursor}.receivepack",
		description:
			"The default program to execute on the remote side when pushing. See option --receive-pack of git-push[1]",
	},
	{
		name: "remote.<name>.skipDefaultUpdate",
		insertValue: "remote.{cursor}.skipDefaultUpdate",
		description:
			"If true, this remote will be skipped by default when updating using git-fetch[1] or the `update` subcommand of git-remote[1]",
	},
	{
		name: "remote.<name>.skipFetchAll",
		insertValue: "remote.{cursor}.skipFetchAll",
		description:
			"If true, this remote will be skipped by default when updating using git-fetch[1] or the `update` subcommand of git-remote[1]",
	},
	{
		name: "remote.<name>.tagOpt",
		insertValue: "remote.{cursor}.tagOpt",
		description:
			"Setting this value to --no-tags disables automatic tag following when fetching from remote <name>. Setting it to --tags will fetch every tag from remote <name>, even if they are not reachable from remote branch heads. Passing these flags directly to git-fetch[1] can override this setting. See options --tags and --no-tags of git-fetch[1]",
	},
	{
		name: "remote.<name>.uploadpack",
		insertValue: "remote.{cursor}.uploadpack",
		description:
			"The default program to execute on the remote side when fetching. See option --upload-pack of git-fetch-pack[1]",
	},
	{
		name: "remote.<name>.url",
		insertValue: "remote.{cursor}.url",
		description:
			"The URL of a remote repository. See git-fetch[1] or git-push[1]",
	},
	{
		name: "remote.<name>.vcs",
		insertValue: "remote.{cursor}.vcs",
		description:
			"Setting this to a value <vcs> will cause Git to interact with the remote with the git-remote-<vcs> helper",
	},
	{
		name: "remote.pushDefault",
		description:
			"The remote to push to by default. Overrides `branch.<name>.remote` for all branches, and is overridden by `branch.<name>.pushRemote` for specific branches",
	},
	{
		name: "remotes.<group>",
		insertValue: "remotes.{cursor}",
		description:
			'The list of remotes which are fetched by "git remote update <group>". See git-remote[1]',
	},
	{
		name: "repack.cruftThreads",
		description:
			"Parameters used by git-pack-objects[1] when generating a cruft pack and the respective parameters are not given over the command line. See similarly named `pack.*` configuration variables for defaults and meaning",
	},
	{
		name: "repack.packKeptObjects",
		description:
			"If set to true, makes `git repack` act as if `--pack-kept-objects` was passed. See git-repack[1] for details. Defaults to `false` normally, but `true` if a bitmap index is being written (either via `--write-bitmap-index` or `repack.writeBitmaps`)",
	},
	{
		name: "repack.updateServerInfo",
		description:
			"If set to false, git-repack[1] will not run git-update-server-info[1]. Defaults to true. Can be overridden when true by the `-n` option of git-repack[1]",
	},
	{
		name: "repack.useDeltaBaseOffset",
		description:
			'By default, git-repack[1] creates packs that use delta-base offset. If you need to share your repository with Git older than version 1.4.4, either directly or via a dumb protocol such as http, then you need to set this option to "false" and repack. Access from old Git versions over the native protocol are unaffected by this option',
	},
	{
		name: "repack.useDeltaIslands",
		description:
			"If set to true, makes `git repack` act as if `--delta-islands` was passed. Defaults to `false`",
	},
	{
		name: "repack.writeBitmaps",
		description:
			'When true, git will write a bitmap index when packing all objects to disk (e.g., when `git repack -a` is run). This index can speed up the "counting objects" phase of subsequent packs created for clones and fetches, at the cost of some disk space and extra time spent on the initial repack. This has no effect if multiple packfiles are created. Defaults to true on bare repos, false otherwise',
	},
	{
		name: "rerere.autoUpdate",
		description:
			"When set to true, `git-rerere` updates the index with the resulting contents after it cleanly resolves conflicts using previously recorded resolution. Defaults to false",
	},
	{
		name: "rerere.enabled",
		description:
			'Activate recording of resolved conflicts, so that identical conflict hunks can be resolved automatically, should they be encountered again. By default, git-rerere[1] is enabled if there is an `rr-cache` directory under the `$GIT_DIR`, e.g. if "rerere" was previously used in the repository',
	},
	{
		name: "revert.reference",
		description:
			"Setting this variable to true makes `git revert` behave as if the `--reference` option is given",
	},
	{
		name: "safe.bareRepository",
		description:
			"Specifies which bare repositories Git will work with. The currently supported values are:",
	},
	{
		name: "safe.directory",
		description:
			"These config entries specify Git-tracked directories that are considered safe even if they are owned by someone other than the current user. By default, Git will refuse to even parse a Git config of a repository owned by someone else, let alone run its hooks, and this config setting allows users to specify exceptions, e.g. for intentionally shared repositories (see the `--shared` option in git-init[1])",
	},
	{
		name: "sendemail.forbidSendmailVariables",
		description:
			'To avoid common misconfiguration mistakes, git-send-email[1] will abort with a warning if any configuration options for "sendmail" exist. Set this variable to bypass the check',
	},
	{
		name: "sendemail.identity",
		description:
			"A configuration identity. When given, causes values in the 'sendemail.<identity>' subsection to take precedence over values in the 'sendemail' section. The default identity is the value of `sendemail.identity`",
	},
	{
		name: "sendemail.signedoffcc",
		description: "Deprecated alias for `sendemail.signedoffbycc`",
		deprecated: true,
		hidden: true,
	},
	{
		name: "sendemail.smtpBatchSize",
		description:
			"Number of messages to be sent per connection, after that a relogin will happen. If the value is 0 or undefined, send all messages in one connection. See also the `--batch-size` option of git-send-email[1]",
	},
	{
		name: "sendemail.smtpEncryption",
		description:
			"See git-send-email[1] for description. Note that this setting is not subject to the 'identity' mechanism",
	},
	{
		name: "sendemail.smtpReloginDelay",
		description:
			"Seconds wait before reconnecting to smtp server. See also the `--relogin-delay` option of git-send-email[1]",
	},
	{
		name: "sendemail.smtpsslcertpath",
		description:
			"Path to ca-certificates (either a directory or a single file). Set it to an empty string to disable certificate verification",
	},
	{
		name: "sendemail.xmailer",
		description: "See git-send-email[1] for description",
	},
	{
		name: "sequence.editor",
		description:
			"Text editor used by `git rebase -i` for editing the rebase instruction file. The value is meant to be interpreted by the shell when it is used. It can be overridden by the `GIT_SEQUENCE_EDITOR` environment variable. When not configured the default commit message editor is used instead",
	},
	{
		name: "sendemail.<identity>.forbidSendmailVariables",
		insertValue: "sendemail.{cursor}.forbidSendmailVariables",
		description:
			'To avoid common misconfiguration mistakes, git-send-email[1] will abort with a warning if any configuration options for "sendmail" exist. Set this variable to bypass the check',
	},
	{
		name: "sendemail.<identity>.signedoffcc",
		insertValue: "sendemail.{cursor}.signedoffcc",
		description: "Deprecated alias for `sendemail.signedoffbycc`",
		deprecated: true,
		hidden: true,
	},
	{
		name: "sendemail.<identity>.smtpBatchSize",
		insertValue: "sendemail.{cursor}.smtpBatchSize",
		description:
			"Number of messages to be sent per connection, after that a relogin will happen. If the value is 0 or undefined, send all messages in one connection. See also the `--batch-size` option of git-send-email[1]",
	},
	{
		name: "sendemail.<identity>.smtpEncryption",
		insertValue: "sendemail.{cursor}.smtpEncryption",
		description:
			"See git-send-email[1] for description. Note that this setting is not subject to the 'identity' mechanism",
	},
	{
		name: "sendemail.<identity>.smtpReloginDelay",
		insertValue: "sendemail.{cursor}.smtpReloginDelay",
		description:
			"Seconds wait before reconnecting to smtp server. See also the `--relogin-delay` option of git-send-email[1]",
	},
	{
		name: "sendemail.<identity>.smtpsslcertpath",
		insertValue: "sendemail.{cursor}.smtpsslcertpath",
		description:
			"Path to ca-certificates (either a directory or a single file). Set it to an empty string to disable certificate verification",
	},
	{
		name: "sendemail.<identity>.xmailer",
		insertValue: "sendemail.{cursor}.xmailer",
		description: "See git-send-email[1] for description",
	},
	{
		name: "sequence.<identity>.editor",
		insertValue: "sequence.{cursor}.editor",
		description:
			"Text editor used by `git rebase -i` for editing the rebase instruction file. The value is meant to be interpreted by the shell when it is used. It can be overridden by the `GIT_SEQUENCE_EDITOR` environment variable. When not configured the default commit message editor is used instead",
	},
	{
		name: "showBranch.default",
		description:
			"The default set of branches for git-show-branch[1]. See git-show-branch[1]",
	},
	{
		name: "sparse.expectFilesOutsideOfPatterns",
		description:
			"Typically with sparse checkouts, files not matching any sparsity patterns are marked with a SKIP_WORKTREE bit in the index and are missing from the working tree. Accordingly, Git will ordinarily check whether files with the SKIP_WORKTREE bit are in fact present in the working tree contrary to expectations. If Git finds any, it marks those paths as present by clearing the relevant SKIP_WORKTREE bits. This option can be used to tell Git that such present-despite-skipped files are expected and to stop checking for them",
	},
	{
		name: "splitIndex.maxPercentChange",
		description:
			"When the split index feature is used, this specifies the percent of entries the split index can contain compared to the total number of entries in both the split index and the shared index before a new shared index is written. The value should be between 0 and 100. If the value is 0 then a new shared index is always written, if it is 100 a new shared index is never written. By default the value is 20, so a new shared index is written if the number of entries in the split index would be greater than 20 percent of the total number of entries. See git-update-index[1]",
	},
	{
		name: "splitIndex.sharedIndexExpire",
		description:
			'When the split index feature is used, shared index files that were not modified since the time this variable specifies will be removed when a new shared index file is created. The value "now" expires all entries immediately, and "never" suppresses expiration altogether. The default value is "2.weeks.ago". Note that a shared index file is considered modified (for the purpose of expiration) each time a new split-index file is either created based on it or read from it. See git-update-index[1]',
	},
	{
		name: "ssh.variant",
		description:
			"By default, Git determines the command line arguments to use based on the basename of the configured SSH command (configured using the environment variable `GIT_SSH` or `GIT_SSH_COMMAND` or the config setting `core.sshCommand`). If the basename is unrecognized, Git will attempt to detect support of OpenSSH options by first invoking the configured SSH command with the `-G` (print configuration) option and will subsequently use OpenSSH options (if that is successful) or no options besides the host and remote command (if it fails)",
	},
	{
		name: "stash.showIncludeUntracked",
		description:
			"If this is set to true, the `git stash show` command will show the untracked files of a stash entry. Defaults to false. See description of 'show' command in git-stash[1]",
	},
	{
		name: "stash.showPatch",
		description:
			"If this is set to true, the `git stash show` command without an option will show the stash entry in patch form. Defaults to false. See description of 'show' command in git-stash[1]",
	},
	{
		name: "stash.showStat",
		description:
			"If this is set to true, the `git stash show` command without an option will show diffstat of the stash entry. Defaults to true. See description of 'show' command in git-stash[1]",
	},
	{
		name: "status.aheadBehind",
		description:
			"Set to true to enable `--ahead-behind` and false to enable `--no-ahead-behind` by default in git-status[1] for non-porcelain status formats. Defaults to true",
	},
	{
		name: "status.branch",
		description:
			"Set to true to enable --branch by default in git-status[1]. The option --no-branch takes precedence over this variable",
	},
	{
		name: "status.displayCommentPrefix",
		description:
			"If set to true, git-status[1] will insert a comment prefix before each output line (starting with `core.commentChar`, i.e. `#` by default). This was the behavior of git-status[1] in Git 1.8.4 and previous. Defaults to false",
	},
	{
		name: "status.relativePaths",
		description:
			"By default, git-status[1] shows paths relative to the current directory. Setting this variable to `false` shows paths relative to the repository root (this was the default for Git prior to v1.5.4)",
	},
	{
		name: "status.renameLimit",
		description:
			"The number of files to consider when performing rename detection in git-status[1] and git-commit[1]. Defaults to the value of diff.renameLimit",
	},
	{
		name: "status.renames",
		description:
			'Whether and how Git detects renames in git-status[1] and git-commit[1] . If set to "false", rename detection is disabled. If set to "true", basic rename detection is enabled. If set to "copies" or "copy", Git will detect copies, as well. Defaults to the value of diff.renames',
	},
	{
		name: "status.short",
		description:
			"Set to true to enable --short by default in git-status[1]. The option --no-short takes precedence over this variable",
	},
	{
		name: "status.showStash",
		description:
			"If set to true, git-status[1] will display the number of entries currently stashed away. Defaults to false",
	},
	{
		name: "status.showUntrackedFiles",
		description:
			"By default, git-status[1] and git-commit[1] show files which are not currently tracked by Git. Directories which contain only untracked files, are shown with the directory name only. Showing untracked files means that Git needs to lstat() all the files in the whole repository, which might be slow on some systems. So, this variable controls how the commands displays the untracked files. Possible values are:",
	},
	{
		name: "status.submoduleSummary",
		description:
			"Defaults to false. If this is set to a non zero number or true (identical to -1 or an unlimited number), the submodule summary will be enabled and a summary of commits for modified submodules will be shown (see --summary-limit option of git-submodule[1]). Please note that the summary output command will be suppressed for all submodules when `diff.ignoreSubmodules` is set to 'all' or only for those submodules where `submodule.<name>.ignore=all`. The only exception to that rule is that status and commit will show staged submodule changes. To also view the summary for ignored submodules you can either use the --ignore-submodules=dirty command-line option or the 'git submodule summary' command, which shows a similar output but does not honor these settings",
	},
	{
		name: "submodule.<name>.active",
		insertValue: "submodule.{cursor}.active",
		description:
			"Boolean value indicating if the submodule is of interest to git commands. This config option takes precedence over the submodule.active config option. See gitsubmodules[7] for details",
	},
	{
		name: "submodule.<name>.branch",
		insertValue: "submodule.{cursor}.branch",
		description:
			"The remote branch name for a submodule, used by `git submodule update --remote`. Set this option to override the value found in the `.gitmodules` file. See git-submodule[1] and gitmodules[5] for details",
	},
	{
		name: "submodule.<name>.fetchRecurseSubmodules",
		insertValue: "submodule.{cursor}.fetchRecurseSubmodules",
		description:
			'This option can be used to control recursive fetching of this submodule. It can be overridden by using the --[no-]recurse-submodules command-line option to "git fetch" and "git pull". This setting will override that from in the gitmodules[5] file',
	},
	{
		name: "submodule.<name>.ignore",
		insertValue: "submodule.{cursor}.ignore",
		description:
			'Defines under what circumstances "git status" and the diff family show a submodule as modified. When set to "all", it will never be considered modified (but it will nonetheless show up in the output of status and commit when it has been staged), "dirty" will ignore all changes to the submodules work tree and takes only differences between the HEAD of the submodule and the commit recorded in the superproject into account. "untracked" will additionally let submodules with modified tracked files in their work tree show up. Using "none" (the default when this option is not set) also shows submodules that have untracked files in their work tree as changed. This setting overrides any setting made in .gitmodules for this submodule, both settings can be overridden on the command line by using the "--ignore-submodules" option. The \'git submodule\' commands are not affected by this setting',
	},
	{
		name: "submodule.<name>.update",
		insertValue: "submodule.{cursor}.update",
		description:
			"The method by which a submodule is updated by 'git submodule update', which is the only affected command, others such as 'git checkout --recurse-submodules' are unaffected. It exists for historical reasons, when 'git submodule' was the only command to interact with submodules; settings like `submodule.active` and `pull.rebase` are more specific. It is populated by `git submodule init` from the gitmodules[5] file. See description of 'update' command in git-submodule[1]",
	},
	{
		name: "submodule.<name>.url",
		insertValue: "submodule.{cursor}.url",
		description:
			"The URL for a submodule. This variable is copied from the .gitmodules file to the git config via 'git submodule init'. The user can change the configured URL before obtaining the submodule via 'git submodule update'. If neither submodule.<name>.active or submodule.active are set, the presence of this variable is used as a fallback to indicate whether the submodule is of interest to git commands. See git-submodule[1] and gitmodules[5] for details",
	},
	{
		name: "submodule.active",
		description:
			"A repeated field which contains a pathspec used to match against a submodule's path to determine if the submodule is of interest to git commands. See gitsubmodules[7] for details",
	},
	{
		name: "submodule.alternateErrorStrategy",
		description:
			"Specifies how to treat errors with the alternates for a submodule as computed via `submodule.alternateLocation`. Possible values are `ignore`, `info`, `die`. Default is `die`. Note that if set to `ignore` or `info`, and if there is an error with the computed alternate, the clone proceeds as if no alternate was specified",
	},
	{
		name: "submodule.alternateLocation",
		description:
			"Specifies how the submodules obtain alternates when submodules are cloned. Possible values are `no`, `superproject`. By default `no` is assumed, which doesn't add references. When the value is set to `superproject` the submodule to be cloned computes its alternates location relative to the superprojects alternate",
	},
	{
		name: "submodule.fetchJobs",
		description:
			"Specifies how many submodules are fetched/cloned at the same time. A positive integer allows up to that number of submodules fetched in parallel. A value of 0 will give some reasonable default. If unset, it defaults to 1",
	},
	{
		name: "submodule.propagateBranches",
		description:
			"[EXPERIMENTAL] A boolean that enables branching support when using `--recurse-submodules` or `submodule.recurse=true`. Enabling this will allow certain commands to accept `--recurse-submodules` and certain commands that already accept `--recurse-submodules` will now consider branches. Defaults to false",
	},
	{
		name: "submodule.recurse",
		description:
			"A boolean indicating if commands should enable the `--recurse-submodules` option by default. Defaults to false",
	},
	{
		name: "tag.forceSignAnnotated",
		description:
			"A boolean to specify whether annotated tags created should be GPG signed. If `--annotate` is specified on the command line, it takes precedence over this option",
	},
	{
		name: "tag.gpgSign",
		description:
			'A boolean to specify whether all tags should be GPG signed. Use of this option when running in an automated script can result in a large number of tags being signed. It is therefore convenient to use an agent to avoid typing your gpg passphrase several times. Note that this option doesn\'t affect tag signing behavior enabled by "-u <keyid>" or "--local-user=<keyid>" options',
	},
	{
		name: "tag.sort",
		description:
			'This variable controls the sort ordering of tags when displayed by git-tag[1]. Without the "--sort=<value>" option provided, the value of this variable will be used as the default',
	},
	{
		name: "tar.umask",
		description:
			'This variable can be used to restrict the permission bits of tar archive entries. The default is 0002, which turns off the world write bit. The special value "user" indicates that the archiving user\'s umask will be used instead. See umask(2) and git-archive[1]',
	},
	{
		name: "trace2.configParams",
		description:
			'A comma-separated list of patterns of "important" config settings that should be recorded in the trace2 output. For example, `core.*,remote.*.url` would cause the trace2 output to contain events listing each configured remote. May be overridden by the `GIT_TRACE2_CONFIG_PARAMS` environment variable. Unset by default',
	},
	{
		name: "trace2.destinationDebug",
		description:
			"Boolean. When true Git will print error messages when a trace target destination cannot be opened for writing. By default, these errors are suppressed and tracing is silently disabled. May be overridden by the `GIT_TRACE2_DST_DEBUG` environment variable",
	},
	{
		name: "trace2.envVars",
		description:
			'A comma-separated list of "important" environment variables that should be recorded in the trace2 output. For example, `GIT_HTTP_USER_AGENT,GIT_CONFIG` would cause the trace2 output to contain events listing the overrides for HTTP user agent and the location of the Git configuration file (assuming any are set). May be overridden by the `GIT_TRACE2_ENV_VARS` environment variable. Unset by default',
	},
	{
		name: "trace2.eventBrief",
		description:
			"Boolean. When true `time`, `filename`, and `line` fields are omitted from event output. May be overridden by the `GIT_TRACE2_EVENT_BRIEF` environment variable. Defaults to false",
	},
	{
		name: "trace2.eventNesting",
		description:
			"Integer. Specifies desired depth of nested regions in the event output. Regions deeper than this value will be omitted. May be overridden by the `GIT_TRACE2_EVENT_NESTING` environment variable. Defaults to 2",
	},
	{
		name: "trace2.eventTarget",
		description:
			"This variable controls the event target destination. It may be overridden by the `GIT_TRACE2_EVENT` environment variable. The following table shows possible values",
	},
	{
		name: "trace2.maxFiles",
		description:
			"Integer. When writing trace files to a target directory, do not write additional traces if we would exceed this many files. Instead, write a sentinel file that will block further tracing to this directory. Defaults to 0, which disables this check",
	},
	{
		name: "trace2.normalBrief",
		description:
			"Boolean. When true `time`, `filename`, and `line` fields are omitted from normal output. May be overridden by the `GIT_TRACE2_BRIEF` environment variable. Defaults to false",
	},
	{
		name: "trace2.normalTarget",
		description:
			"This variable controls the normal target destination. It may be overridden by the `GIT_TRACE2` environment variable. The following table shows possible values",
	},
	{
		name: "trace2.perfBrief",
		description:
			"Boolean. When true `time`, `filename`, and `line` fields are omitted from PERF output. May be overridden by the `GIT_TRACE2_PERF_BRIEF` environment variable. Defaults to false",
	},
	{
		name: "trace2.perfTarget",
		description:
			"This variable controls the performance target destination. It may be overridden by the `GIT_TRACE2_PERF` environment variable. The following table shows possible values",
	},
	{
		name: "transfer.advertiseSID",
		description:
			"Boolean. When true, client and server processes will advertise their unique session IDs to their remote counterpart. Defaults to false",
	},
	{
		name: "transfer.credentialsInUrl",
		description:
			"A configured URL can contain plaintext credentials in the form `<protocol>://<user>:<password>@<domain>/<path>`. You may want to warn or forbid the use of such configuration (in favor of using git-credential[1]). This will be used on git-clone[1], git-fetch[1], git-push[1], and any other direct use of the configured URL",
	},
	{
		name: "transfer.fsckObjects",
		description:
			"When `fetch.fsckObjects` or `receive.fsckObjects` are not set, the value of this variable is used instead. Defaults to false",
	},
	{
		name: "transfer.hideRefs",
		description:
			"String(s) `receive-pack` and `upload-pack` use to decide which refs to omit from their initial advertisements. Use more than one definition to specify multiple prefix strings. A ref that is under the hierarchies listed in the value of this variable is excluded, and is hidden when responding to `git push` or `git fetch`. See `receive.hideRefs` and `uploadpack.hideRefs` for program-specific versions of this config",
	},
	{
		name: "transfer.unpackLimit",
		description:
			"When `fetch.unpackLimit` or `receive.unpackLimit` are not set, the value of this variable is used instead. The default value is 100",
	},
	{
		name: "uploadarchive.allowUnreachable",
		description:
			'If true, allow clients to use `git archive --remote` to request any tree, whether reachable from the ref tips or not. See the discussion in the "SECURITY" section of git-upload-archive[1] for more details. Defaults to `false`',
	},
	{
		name: "uploadpack.allowAnySHA1InWant",
		description:
			"Allow `upload-pack` to accept a fetch request that asks for any object at all. Defaults to `false`",
	},
	{
		name: "uploadpack.allowFilter",
		description:
			"If this option is set, `upload-pack` will support partial clone and partial fetch object filtering",
	},
	{
		name: "uploadpack.allowReachableSHA1InWant",
		description:
			'Allow `upload-pack` to accept a fetch request that asks for an object that is reachable from any ref tip. However, note that calculating object reachability is computationally expensive. Defaults to `false`. Even if this is false, a client may be able to steal objects via the techniques described in the "SECURITY" section of the gitnamespaces[7] man page; it\'s best to keep private data in a separate repository',
	},
	{
		name: "uploadpack.allowRefInWant",
		description:
			"If this option is set, `upload-pack` will support the `ref-in-want` feature of the protocol version 2 `fetch` command. This feature is intended for the benefit of load-balanced servers which may not have the same view of what OIDs their refs point to due to replication delay",
	},
	{
		name: "uploadpack.allowTipSHA1InWant",
		description:
			'When `uploadpack.hideRefs` is in effect, allow `upload-pack` to accept a fetch request that asks for an object at the tip of a hidden ref (by default, such a request is rejected). See also `uploadpack.hideRefs`. Even if this is false, a client may be able to steal objects via the techniques described in the "SECURITY" section of the gitnamespaces[7] man page; it\'s best to keep private data in a separate repository',
	},
	{
		name: "uploadpack.hideRefs",
		description:
			"This variable is the same as `transfer.hideRefs`, but applies only to `upload-pack` (and so affects only fetches, not pushes). An attempt to fetch a hidden ref by `git fetch` will fail. See also `uploadpack.allowTipSHA1InWant`",
	},
	{
		name: "uploadpack.keepAlive",
		description:
			"When `upload-pack` has started `pack-objects`, there may be a quiet period while `pack-objects` prepares the pack. Normally it would output progress information, but if `--quiet` was used for the fetch, `pack-objects` will output nothing at all until the pack data begins. Some clients and networks may consider the server to be hung and give up. Setting this option instructs `upload-pack` to send an empty keepalive packet every `uploadpack.keepAlive` seconds. Setting this option to 0 disables keepalive packets entirely. The default is 5 seconds",
	},
	{
		name: "uploadpack.packObjectsHook",
		description:
			"If this option is set, when `upload-pack` would run `git pack-objects` to create a packfile for a client, it will run this shell command instead. The `pack-objects` command and arguments it _would_ have run (including the `git pack-objects` at the beginning) are appended to the shell command. The stdin and stdout of the hook are treated as if `pack-objects` itself was run. I.e., `upload-pack` will feed input intended for `pack-objects` to the hook, and expects a completed packfile on stdout",
	},
	{
		name: "uploadpackfilter.<filter>.allow",
		insertValue: "uploadpackfilter.{cursor}.allow",
		description:
			"Explicitly allow or ban the object filter corresponding to `<filter>`, where `<filter>` may be one of: `blob:none`, `blob:limit`, `object:type`, `tree`, `sparse:oid`, or `combine`. If using combined filters, both `combine` and all of the nested filter kinds must be allowed. Defaults to `uploadpackfilter.allow`",
	},
	{
		name: "uploadpackfilter.allow",
		description:
			"Provides a default value for unspecified object filters (see: the below configuration variable). If set to `true`, this will also enable all filters which get added in the future. Defaults to `true`",
	},
	{
		name: "uploadpackfilter.tree.maxDepth",
		description:
			"Only allow `--filter=tree:<n>` when `<n>` is no more than the value of `uploadpackfilter.tree.maxDepth`. If set, this also implies `uploadpackfilter.tree.allow=true`, unless this configuration variable had already been set. Has no effect if unset",
	},
	{
		name: "url.<base>.insteadOf",
		insertValue: "url.{cursor}.insteadOf",
		description:
			"Any URL that starts with this value will be rewritten to start, instead, with <base>. In cases where some site serves a large number of repositories, and serves them with multiple access methods, and some users need to use different access methods, this feature allows people to specify any of the equivalent URLs and have Git automatically rewrite the URL to the best alternative for the particular user, even for a never-before-seen repository on the site. When more than one insteadOf strings match a given URL, the longest match is used",
	},
	{
		name: "url.<base>.pushInsteadOf",
		insertValue: "url.{cursor}.pushInsteadOf",
		description:
			"Any URL that starts with this value will not be pushed to; instead, it will be rewritten to start with <base>, and the resulting URL will be pushed to. In cases where some site serves a large number of repositories, and serves them with multiple access methods, some of which do not allow push, this feature allows people to specify a pull-only URL and have Git automatically use an appropriate URL to push, even for a never-before-seen repository on the site. When more than one pushInsteadOf strings match a given URL, the longest match is used. If a remote has an explicit pushurl, Git will ignore this setting for that remote",
	},
	{
		name: "user.signingKey",
		description:
			'If git-tag[1] or git-commit[1] is not selecting the key you want it to automatically when creating a signed tag or commit, you can override the default selection with this variable. This option is passed unchanged to gpg\'s --local-user parameter, so you may specify a key using any method that gpg supports. If gpg.format is set to `ssh` this can contain the path to either your private ssh key or the public key when ssh-agent is used. Alternatively it can contain a public key prefixed with `key::` directly (e.g.: "key::ssh-rsa XXXXXX identifier"). The private key needs to be available via ssh-agent. If not set git will call gpg.ssh.defaultKeyCommand (e.g.: "ssh-add -L") and try to use the first key available. For backward compatibility, a raw key which begins with "ssh-", such as "ssh-rsa XXXXXX identifier", is treated as "key::ssh-rsa XXXXXX identifier", but this form is deprecated; use the `key::` form instead',
	},
	{
		name: "user.useConfigOnly",
		description:
			"Instruct Git to avoid trying to guess defaults for `user.email` and `user.name`, and instead retrieve the values only from the configuration. For example, if you have multiple email addresses and would like to use a different one for each repository, then with this configuration option set to `true` in the global config along with a name, Git will prompt you to set up an email before making new commits in a newly cloned repository. Defaults to `false`",
	},
	{
		name: "versionsort.prereleaseSuffix",
		description:
			"Deprecated alias for `versionsort.suffix`. Ignored if `versionsort.suffix` is set",
		deprecated: true,
		hidden: true,
	},
	{
		name: "versionsort.suffix",
		description:
			'Even when version sort is used in git-tag[1], tagnames with the same base version but different suffixes are still sorted lexicographically, resulting e.g. in prerelease tags appearing after the main release (e.g. "1.0-rc1" after "1.0"). This variable can be specified to determine the sorting order of tags with different suffixes',
	},
	{
		name: "web.browser",
		description:
			"Specify a web browser that may be used by some commands. Currently only git-instaweb[1] and git-help[1] may use it",
	},
	{
		name: "worktree.guessRemote",
		description:
			'If no branch is specified and neither `-b` nor `-B` nor `--detach` is used, then `git worktree add` defaults to creating a new branch from HEAD. If `worktree.guessRemote` is set to true, `worktree add` tries to find a remote-tracking branch whose name uniquely matches the new branch name. If such a branch exists, it is checked out and set as "upstream" for the new branch. If no such match can be found, it falls back to creating a new branch from the current HEAD',
	},
];

const addOptions: Fig.Option[] = [
	{
		name: ["-n", "--dry-run"],
		description:
			"Don’t actually add the file(s), just show if they exist and/or will be ignored",
	},
	{ name: ["-v", "--verbose"], description: "Be verbose" },
	{
		name: ["-f", "--force"],
		description: "Allow adding otherwise ignored files",
	},
	{
		name: ["-i", "--interactive"],
		description:
			"Add modified contents in the working tree interactively to the index. Optional path arguments may be supplied to limit operation to a subset of the working tree. See “Interactive mode” for details",
	},
	{
		name: ["-p", "--patch"],
		description:
			"Interactively choose hunks of patch between the index and the work tree and add them to the index. This gives the user a chance to review the difference before adding modified contents to the index",
	},
	{
		name: ["-e", "--edit"],
		description:
			"Open the diff vs. the index in an editor and let the user edit it. After the editor was closed, adjust the hunk headers and apply the patch to the index",
	},
	{
		name: ["-u", "--update"],
		description:
			"Update the index just where it already has an entry matching <pathspec>. This removes as well as modifies index entries to match the working tree, but adds no new files",
	},
	{
		name: ["-A", "--all", "--no-ignore-removal"],
		description:
			"Update the index not only where the working tree has a file matching <pathspec> but also where the index already has an entry. This adds, modifies, and removes index entries to match the working tree",
	},
	{
		name: ["--no-all", "--ignore-removal"],
		description:
			"Update the index by adding new files that are unknown to the index and files modified in the working tree, but ignore files that have been removed from the working tree. This option is a no-op when no <pathspec> is used",
	},
	{
		name: ["-N", "--intent-to-add"],
		description:
			"Record only the fact that the path will be added later. An entry for the path is placed in the index with no content. This is useful for, among other things, showing the unstaged content of such files with git diff and committing them with git commit -a",
	},
	{
		name: "--refresh",
		description:
			"Don’t add the file(s), but only refresh their stat() information in the index",
	},
	{
		name: "--ignore-errors",
		description:
			"If some files could not be added because of errors indexing them, do not abort the operation, but continue adding the others. The command shall still exit with non-zero status. The configuration variable add.ignoreErrors can be set to true to make this the default behaviour",
	},
	{
		name: "--ignore-missing",
		description:
			"This option can only be used together with --dry-run. By using this option the user can check if any of the given files would be ignored, no matter if they are already present in the work tree or not",
	},
	{
		name: "--no-warn-embedded-repo",
		description:
			"By default, git add will warn when adding an embedded repository to the index without using git submodule add to create an entry in .gitmodules. This option will suppress the warning (e.g., if you are manually performing operations on submodules)",
	},
	{
		name: "--renormalize",
		description:
			"Apply the 'clean' process freshly to all tracked files to forcibly add them again to the index. This is useful after changing core.autocrlf configuration or the text attribute in order to correct files added with wrong CRLF/LF line endings. This option implies -u",
	},
	{
		name: "--chmod",
		description:
			"Override the executable bit of the added files. The executable bit is only changed in the index, the files on disk are left unchanged",
		requiresSeparator: true,
		args: {
			suggestions: ["+x", "-x"],
		},
	},
	{
		name: "--pathspec-from-file",
		description:
			"Pathspec is passed in <file> instead of commandline args. If <file> is exactly - then standard input is used. Pathspec elements are separated by LF or CR/LF. Pathspec elements can be quoted as explained for the configuration variable core.quotePath (see git-config[1]). See also --pathspec-file-nul and global --literal-pathspecs",
		args: {
			name: "File",
			description: "File with pathspec",
			template: "filepaths",
		},
	},
	{
		name: "--pathspec-file-nul",
		description:
			"Only meaningful with --pathspec-from-file. Pathspec elements are separated with NUL character and all other characters are taken literally (including newlines and quotes)",
	},
	{
		name: "--",
		description:
			"This option can be used to separate command-line options from the list of files",
	},
];

const headSuggestions = [
	{
		name: "HEAD",
		icon: "🔻",
		description: "The most recent commit",
	},
	{
		name: "HEAD~<N>",
		description: "A specific number of commits",
		insertValue: "HEAD~",
	},
];

/** Git finds these commands as "git-<name>" on your PATH */
const optionalCommands: Record<string, Omit<Fig.Subcommand, "name">> = {
	open: {
		description: "Open in your browser",
		options: [
			{
				name: ["-c", "--commit"],
				description: "Open current commit",
			},
			{
				name: ["-i", "--issue"],
				description: "Open issues page",
			},
			{
				name: ["-s", "--suffix"],
				description: "Append this suffix",
				args: {
					name: "string",
				},
			},
			{
				name: ["-p", "--print"],
				description: "Just print the URL",
			},
		],
	},
	recent: {
		description: "Show recent local branches",
		options: [
			{
				name: "-n",
				description: "Specify a number of branches to show",
				args: {
					name: "int",
				},
			},
		],
	},
	flow: {
		description: "Extensions to follow Vincent Driessen's branching model",
		loadSpec: "git-flow",
	},
};

const daemonServices: Fig.Suggestion[] = [
	{
		name: "upload-pack",
		description:
			"This serves git fetch-pack and git ls-remote clients. It is enabled by default, but a repository can disable it by setting daemon.uploadpack configuration item to false",
	},
	{
		name: "upload-archive",
		description:
			"This serves git archive --remote. It is disabled by default, but a repository can enable it by setting daemon.uploadarch configuration item to true",
	},
	{
		name: "receive-pack",
		description:
			"This serves git send-pack clients, allowing anonymous push. It is disabled by default, as there is no authentication in the protocol (in other words, anybody can push anything into the repository, including removal of refs). This is solely meant for a closed LAN setting where everybody is friendly. This service can be enabled by setting daemon.receivepack configuration item to true",
	},
];

const completionSpec: Fig.Spec = {
	name: "git",
	description: "Distributed version control system",
	generateSpec: async (_, executeShellCommand) => {
		const { stdout } = await executeShellCommand({
			command: "git",
			args: ["help", "-a"],
		});
		const lines = stdout.trim().split("\n");
		const start = lines.findIndex((val) => val.match(/external commands/i));
		const commands: string[] = [];
		for (let i = start + 1; i < lines.length; i += 1) {
			const line = lines[i].trim();
			if (!line) {
				break;
			}
			const command = line.split(/\s+/)[0];
			commands.push(command);
		}
		return {
			name: "git",
			subcommands: commands.map((name) => ({
				name,
				...(optionalCommands[name] ?? { description: `Run git-${name}` }),
			})),
		};
	},
	args: {
		name: "alias",
		description: "Custom user defined git alias",
		parserDirectives: {
			alias: async (token, exec) => {
				const { stdout, status } = await exec({
					command: "git",
					args: ["config", "--get", `alias.${token}`],
				});
				if (status !== 0) {
					throw new Error("Failed parsing alias");
				}
				return stdout;
			},
		},
		isOptional: true,
		generators: gitGenerators.aliases,
	},
	options: [
		{
			name: "--version",
			description: "Output version",
		},
		{
			name: "--help",
			description: "Output help",
		},
		{
			name: "-C",
			args: {
				name: "path",
				template: "folders",
			},
			description: "Run as if git was started in <path>",
		},
		{
			name: "-c",
			insertValue: "-c {cursor}",
			description: "Pass a config parameter to the command",
			args: {
				name: "name=value",
			},
		},
		{
			name: "--exec-path",
			args: {
				name: "path",
				isOptional: true,
				template: "folders",
			},
			description: "Get or set GIT_EXEC_PATH for core Git programs",
		},
		{
			name: "--html-path",
			description: "Print Git’s HTML documentation path",
		},
		{
			name: "--man-path",
			description: "Print the manpath for this version of Git",
		},
		{
			name: "--info-path",
			description: "Print the info path documenting this version of Git",
		},
		{
			name: ["-p", "--paginate"],
			description: "Pipe output into `less` or custom $PAGER",
		},
		{
			name: "--no-pager",
			description: "Do not pipe Git output into a pager",
		},
		{
			name: "--no-replace-objects",
			description: "Do not use replacement refs",
		},
		{
			name: "--no-optional-locks",
			description: "Do not perform optional operations that require lock files",
		},
		{
			name: "--bare",
			description: "Treat the repository as a bare repository",
		},
		{
			name: "--git-dir",
			args: {
				name: "path",
				template: "folders",
			},
			description: "Set the path to the repository dir (`.git`)",
		},
		{
			name: "--work-tree",
			args: {
				name: "path",
				template: "folders",
			},
			description: "Set working tree path",
		},
		{
			name: "--namespace",
			args: {
				name: "name",
			},
			description: "Set the Git namespace",
		},
	],
	subcommands: [
		{
			name: "archive",
			description: "Create an archive of files from a named tree",
			args: [
				{
					name: "tree-ish",
					generators: gitGenerators.treeish,
				},
				{
					name: "path",
					template: "filepaths",
					isVariadic: true,
					isOptional: true,
				},
			],
			options: [
				{
					name: "--format",
					description: "Archive format",
					args: {
						name: "fmt",
						suggestions: ["tar", "zip"],
					},
				},
				{
					name: "--prefix",
					description: "Prepend prefix to each pathname in the archive",
					args: {
						name: "prefix",
					},
				},
				{
					name: "--add-file",
					description: "Add untracked file to archive",
					args: {
						name: "file",
						template: "filepaths",
					},
				},
				{
					name: ["-o", "--output"],
					description: "Write the archive to this file",
					args: {
						name: "file",
						template: "filepaths",
					},
				},
				{
					name: "--worktree-attributes",
					description: "Read .gitattributes in working directory",
				},
				{
					name: ["-v", "--verbose"],
					description: "Report archived files on stderr",
				},
				{
					name: "-NUM",
					insertValue: "-",
					description: "Set compression level",
				},
				{
					name: ["-l", "--list"],
					description: "List supported archive formats",
				},
				{
					name: "--remote",
					description: "Retrieve the archive from remote repository <repo>",
					args: {
						name: "repo",
					},
				},
				{
					name: "--exec",
					description: "Path to the remote git-upload-archive command",
					args: {
						name: "command",
					},
				},
			],
		},
		{
			name: "blame",
			args: {
				name: "file",
				template: "filepaths",
			},
			options: [
				{
					name: "--incremental",
					description: "Show blame entries as we find them, incrementally",
				},
				{
					name: "-b",
					description:
						"Do not show object names of boundary commits (Default: off)",
				},
				{
					name: "--root",
					description: "Do not treat root commits as boundaries (Default: off)",
				},
				{
					name: "--show-stats",
					description: "Show work cost statistics",
				},
				{
					name: "--progress",
					description: "Force progress reporting",
				},
				{
					name: "--score-debug",
					description: "Show output score for blame entries",
				},
				{
					name: ["-f", "--show-name"],
					description: "Show original filename (Default: auto)",
				},
				{
					name: ["-n", "--show-number"],
					description: "Show original linenumber (Default: off)",
				},
				{
					name: ["-p", "--porcelain"],
					description: "Show in a format designed for machine consumption",
				},
				{
					name: "--line-porcelain",
					description: "Show porcelain format with per-line commit information",
				},
				{
					name: "-c",
					description:
						"Use the same output mode as git-annotate (Default: off)",
				},
				{
					name: "-t",
					description: "Show raw timestamp (Default: off)",
				},
				{
					name: "-l",
					description: "Show long commit SHA1 (Default: off)",
				},
				{
					name: "-s",
					description: "Suppress author name and timestamp (Default: off)",
				},
				{
					name: ["-e", "--show-email"],
					description: "Show author email instead of name (Default: off)",
				},
				{
					name: "-w",
					description: "Ignore whitespace differences",
				},
				{
					name: "--ignore-rev",
					description: "Ignore <rev> when blaming",
					args: {
						name: "rev",
						generators: gitGenerators.revs,
					},
				},
				{
					name: "--ignore-revs-file",
					description: "Ignore revisions from <file>",
					args: {
						name: "file",
						template: "filepaths",
					},
				},
				{
					name: "--color-lines",
					description:
						"Color redundant metadata from previous line differently",
				},
				{ name: "--color-by-age", description: "Color lines by age" },
				{
					name: "--minimal",
					description: "Spend extra cycles to find better match",
				},
				{
					name: "-S",
					description:
						"Use revisions from <file> instead of calling git-rev-list",
					args: {
						name: "file",
						template: "filepaths",
					},
				},
				{
					name: "--contents",
					description: "Use <file>'s contents as the final image",
					args: {
						name: "file",
						template: "filepaths",
					},
				},
				{
					name: "-C",
					insertValue: "-C{cursor}",
					description: "Find line copies within and across files",
				},
				{
					name: "-M",
					insertValue: "-M{cursor}",
					description: "Find line movements within and across files",
				},
				{
					name: "-L",
					description:
						"Process only line range <start>,<end> or function :<funcname>",
					args: {
						name: "start,end",
					},
				},
				{
					name: "--abbrev",
					requiresSeparator: true,
					description: "Use <n> digits to display object names",
					args: {
						name: "n",
						isOptional: true,
					},
				},
			],
		},
		{
			name: "commit",
			description: "Record changes to the repository",
			args: {
				name: "pathspec",
				isOptional: true,
				isVariadic: true,
				template: "filepaths",
			},
			options: [
				{
					name: ["-m", "--message"],
					// insertValue: "-m '{cursor}'",
					description: "Use the given message as the commit message",
					args: {
						name: "message",
						// 		generators: ai({
						// 			name: "git commit -m",
						// 			prompt: async ({ executeCommand }) => {
						// 				const { stdout } = await executeCommand({
						// 					command: "git",
						// 					args: [
						// 						"log",
						// 						"--pretty=format:%s",
						// 						"--abbrev-commit",
						// 						"--max-count=20",
						// 					],
						// 				});

						// 				return (
						// 					'Generate a git commit message summary based on this git diff, the "summary" must be no more ' +
						// 					"than 70-75 characters, and it must describe both what the patch changes, as well as why the " +
						// 					`patch might be necessary.\n\nHere are some examples from the repo:\n${stdout}`
						// 				);
						// 			},
						// 			message: async ({ executeCommand }) =>
						// 				(
						// 					await executeCommand({
						// 						command: "git",
						// 						args: ["diff", "--staged"],
						// 					})
						// 				).stdout,
						// 			splitOn: "\n",
						// 		}),
						// 	},
					},
				},
				{
					name: ["-a", "--all"],
					description: "Stage all modified and deleted paths",
				},
				{
					name: "-am",
					insertValue: "-am '{cursor}'",
					description: "Stage all and use given text as commit message",
					args: {
						name: "message",
					},
				},
				{
					name: ["-v", "--verbose"],
					description: "Show unified diff of all file changes",
				},
				{
					name: ["-p", "--patch"],
					description:
						"Use the interactive patch selection interface to chose which changes to commi",
				},
				{
					name: ["-C", "--reuse-message"],
					description:
						"Take an existing commit object, and reuse the log message and the authorship",
					args: {
						name: "commit",
						generators: gitGenerators.commits,
					},
				},
				{
					name: ["-c", "--reedit-message"],
					description:
						"Like -C, but with -c the editor is invoked, so that the user can further edit",
					args: {
						name: "commit",
						generators: gitGenerators.commits,
					},
				},
				{
					name: "--fixup",
					description:
						"Construct a commit message for use with rebase --autosquash. The commit messa",
					args: {
						name: "commit",
						generators: gitGenerators.commits,
					},
				},
				{
					name: "--squash",
					description:
						"Construct a commit message for use with rebase --autosquash. The commit messa",
					args: {
						name: "commit",
						generators: gitGenerators.commits,
					},
				},
				{
					name: "--reset-author",
					description:
						"When used with -C/-c/--amend options, or when committing after a conflicting",
				},
				{
					name: "--short",
					description:
						"When doing a dry-run, give the output in the short-format. See git-status[1]",
				},
				{
					name: "--branch",
					description: "Show the branch and tracking info even in short-format",
				},
				{
					name: "--porcelain",
					description:
						"When doing a dry-run, give the output in a porcelain-ready format. See git-st",
				},
				{
					name: "--long",
					description:
						"When doing a dry-run, give the output in the long-format. Implies --dry-run",
				},
				{
					name: ["-z", "--null"],
					description:
						"When showing short or porcelain status output, print the filename verbatim an",
				},
				{
					name: ["-F", "--file"],
					description:
						"Take the commit message from the given file. Use - to read the message from t",
					args: {
						name: "file",
						template: "filepaths",
					},
				},
				{
					name: "--author",
					description:
						"Override the commit author. Specify an explicit author using the standard A U",
					args: {
						name: "author",
					},
				},
				{
					name: "--date",
					description: "Override the author date used in the commit",
					args: {
						name: "date",
					},
				},
				{
					name: ["-t", "--template"],
					description:
						"When editing the commit message, start the editor with the contents in the gi",
					args: {
						name: "file",
						template: "filepaths",
					},
				},
				{
					name: ["-s", "--signoff"],
					description:
						"Add a Signed-off-by trailer by the committer at the end of the commit log mes",
				},
				{
					name: "--no-signoff",
					description:
						"Don't add a Signed-off-by trailer by the committer at the end of the commit l",
				},
				{
					name: ["-n", "--no-verify"],
					description:
						"This option bypasses the pre-commit and commit-msg hooks. See also githooks[5]",
				},
				{
					name: "--allow-empty",
					description:
						"Usually recording a commit that has the exact same tree as its sole parent co",
				},
				{
					name: "--allow-empty-message",
					description:
						"Like --allow-empty this command is primarily for use by foreign SCM interface",
				},
				{
					name: "--cleanup",
					description:
						"This option determines how the supplied commit message should be cleaned up b",
					args: {
						name: "mode",
						description:
							"Determines how the supplied commit messaged should be cleaned up before committing",
						suggestions: [
							{
								name: "strip",
								description:
									"Strip leading and trailing empty lines, trailing whitepace, commentary and collapse consecutive empty lines",
							},
							{
								name: "whitespace",
								description: "Same as strip except #commentary is not removed",
							},
							{
								name: "verbatim",
								description: "Do not change the message at all",
							},
							{
								name: "scissors",
								description:
									"Same as whitespace except that everything from (and including) the line found below is truncated",
							},
							{
								name: "default",
								description:
									"Same as strip if the message is to be edited. Otherwise whitespace",
							},
						],
					},
				},
				{
					name: ["-e", "--edit"],
					description:
						"The message taken from file with -F, command line with -m, and from commit ob",
				},
				{
					name: "--no-edit",
					description:
						"Use the selected commit message without launching an editor. For example, git",
				},
				{
					name: "--amend",
					description:
						"Replace the tip of the current branch by creating a new commit. The recorded",
				},
				{
					name: "--no-post-rewrite",
					description: "Bypass the post-rewrite hook",
				},
				{
					name: ["-i", "--include"],
					description:
						"Before making a commit out of staged contents so far, stage the contents of p",
				},
				{
					name: ["-o", "--only"],
					description:
						"Make a commit by taking the updated working tree contents of the paths specif",
				},
				{
					name: "--pathspec-from-file",
					description:
						"Pathspec is passed in instead of commandline args. If is exactly - then stand",
					args: {
						name: "file",
						template: "filepaths",
					},
				},
				{
					name: "--pathspec-file-nul",
					description:
						"Only meaningful with --pathspec-from-file. Pathspec elements are separated wi",
				},
				{
					name: ["-u", "--untracked-files"],
					description:
						"Show untracked files. The mode parameter is optional (defaults to all), and i",
					args: {
						name: "mode",
						suggestions: ["no", "normal", "all"],
						isOptional: true,
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Suppress commit summary message",
				},
				{
					name: "--dry-run",
					description:
						"Do not create a commit, but show a list of paths that are to be committed, pa",
				},
				{
					name: "--status",
					description:
						"Include the output of git-status[1] in the commit message template when using",
				},
				{
					name: "--no-status",
					description:
						"Do not include the output of git-status[1] in the commit message template whe",
				},
				{
					name: ["-S", "--gpg-sign"],
					description:
						"GPG-sign commits. The keyid argument is optional and defaults to the committe",
					args: {
						name: "keyid",
						isOptional: true,
					},
				},
				{
					name: "--no-gpg-sign",
					description: "Dont GPG-sign commits",
				},
				{
					name: "--",
					description: "Do not interpret any more arguments as options",
				},
			],
		},
		{
			name: "config",
			description: "Change Git configuration",
			options: [
				{
					name: "--local",
					description: "Default: write to the repository .git/config file",
					args: {
						isVariadic: true,
						suggestions: [
							{
								name: "user.name",
								description: "Set config for username",
								insertValue: "user.name '{cursor}'",
							},
							{
								name: "user.email",
								description: "Set config for email",
								insertValue: "user.email '{cursor}'",
							},
						],
					},
				},
				{
					name: "--global",
					description:
						"For writing options: write to global ~/.gitconfig file rather than the repository .git/config",
				},
				{
					name: "--replace-all",
					description:
						"Default behavior is to replace at most one line. This replaces all lines matc",
				},
				{
					name: "--add",
					description:
						"Adds a new line to the option without altering any existing values. This is t",
				},
				{
					name: "--get",
					description:
						"Get the value for a given key (optionally filtered by a regex matching the va",
				},
				{
					name: "--get-all",
					description:
						"Like get, but returns all values for a multi-valued key",
				},
				{
					name: "--get-regexp",
					description:
						"Like --get-all, but interprets the name as a regular expression and writes ou",
					args: {
						name: "regexp",
					},
				},
				{
					name: "--get-urlmatch",
					description:
						"When given a two-part name section.key, the value for section..key whose part",
					args: [
						{
							name: "name",
						},
						{
							name: "url",
						},
					],
				},
				{
					name: "--system",
					description:
						"For writing options: write to system-wide $(prefix)/etc/gitconfig rather than",
				},
				{
					name: "--worktree",
					description:
						"Similar to --local except that.git/config.worktree is read from or written to",
				},
				{
					name: ["-f", "--file"],
					description:
						"Use the given config file instead of the one specified by GIT_CONFIG",
					args: {
						name: "config-file",
						template: "filepaths",
					},
				},
				{
					name: "--blob",
					description:
						"Similar to --file but use the given blob instead of a file. E.g. you can use",
					args: {
						name: "blob",
					},
				},
				{
					name: "--remove-section",
					description: "Remove the given section from the configuration file",
				},
				{
					name: "--rename-section",
					description: "Rename the given section to a new name",
				},
				{
					name: "--unset",
					description: "Remove the line matching the key from config file",
				},
				{
					name: "--unset-all",
					description: "Remove all lines matching the key from config file",
				},
				{
					name: ["-l", "--list"],
					description:
						"List all variables set in config file, along with their values",
				},
				{
					name: "--fixed-value",
					description:
						"When used with the value-pattern argument, treat value-pattern as an exact st",
				},
				{
					name: "--type",
					description:
						"Git config will ensure that any input or output is valid under the given type",
					args: {
						name: "type",
						suggestions: [
							"bool",
							"int",
							"bool-or-int",
							"path",
							"expiry-date",
							"color",
						],
					},
				},
				{
					name: "--no-type",
					description:
						"Un-sets the previously set type specifier (if one was previously set). This o",
				},
				{
					name: ["-z", "--null"],
					description:
						"For all options that output values and/or keys, always end values with the nu",
				},
				{
					name: "--name-only",
					description:
						"Output only the names of config variables for --list or --get-regexp",
				},
				{
					name: "--show-origin",
					description:
						"Augment the output of all queried config options with the origin type (file",
				},
				{
					name: "--show-scope",
					description:
						"Similar to --show-origin in that it augments the output of all queried config",
				},
				{
					name: "--get-colorbool",
					description:
						'Find the color setting for name (e.g. color.diff) and output "true" or "false',
					args: {
						name: "name",
					},
				},
				{
					name: "--get-color",
					description:
						"Find the color configured for name (e.g. color.diff.new) and output it as the",
					args: [
						{
							name: "name",
						},
						{
							name: "default",
							isOptional: true,
						},
					],
				},
				{
					name: ["-e", "--edit"],
					description:
						"Opens an editor to modify the specified config file; either --system, --globa",
				},
				{
					name: "--includes",
					description:
						"Respect include.* directives in config files when looking up values. Defaults",
				},
				{
					name: "--no-includes",
					description:
						"Respect include.* directives in config files when looking up values. Defaults",
				},
				{
					name: "--default",
					description:
						"When using --get, and the requested variable is not found, behave as if were",
					args: {
						name: "value",
						isOptional: true,
					},
				},
			],
			args: [
				{
					name: "setting",
					// All git config keys are valid
					suggestCurrentToken: true,
					suggestions: configSuggestions.map((suggestion) => ({
						...suggestion,
						icon: "⚙️",
					})),
					generators: {
						script: ["git", "config", "--get-regexp", ".*"],
						// This is inefficient but it doesn't need to be faster - most
						// of the time, you don't need to run `git config` commands,
						// and when you do it's typically one or two at most.
						postProcess: (out) =>
							out
								.trim()
								.split("\n")
								.map((line) => line.slice(0, line.indexOf(" ")))
								.filter(
									(line) =>
										line.startsWith("alias.") ||
										line.startsWith("branch.") ||
										line.startsWith("remote.") ||
										!configSuggestions.find(({ name }) => line === name)
								)
								.map((name) => ({ name, icon: "⚙️" })),
					},
				},
				{
					name: "value",
				},
			],
		},
		{
			name: "rebase",
			description: "Reapply commits on top of another base tip",
			options: [
				{
					name: "--onto",
					description:
						"Starting point at which to create the new commits. If the --onto option is not specified, the starting point is <upstream>. May be any valid commit, and not just an existing branch name. As a special case, you may use 'A...B' as a shortcut for the merge base of A and B if there is exactly one merge base. You can leave out at most one of A and B, in which case it defaults to HEAD",
					args: {
						name: "newbase",
						generators: gitGenerators.commits,
					},
				},
				{
					name: "--keep-base",
					description:
						"Set the starting point at which to create the new commits to the merge base of <upstream> <branch>. Running git rebase --keep-base <upstream> <branch> is equivalent to running git rebase --onto <upstream>…​ <upstream>. This option is useful in the case where one is developing a feature on top of an upstream branch. While the feature is being worked on, the upstream branch may advance and it may not be the best idea to keep rebasing on top of the upstream but to keep the base commit as-is. Although both this option and --fork-point find the merge base between <upstream> and <branch>, this option uses the merge base as the starting point on which new commits will be created, whereas --fork-point uses the merge base to determine the set of commits which will be rebased",
				},
				{
					name: "--continue",
					description:
						"Restart the rebasing process after having resolved a merge conflict",
				},
				{
					name: "--abort",
					description:
						"Abort the rebase operation and reset HEAD to the original branch. If <branch> was provided when the rebase operation was started, then HEAD will be reset to <branch>. Otherwise HEAD will be reset to where it was when the rebase operation was started",
				},
				{
					name: "--quit",
					description:
						"Abort the rebase operation but HEAD is not reset back to the original branch. The index and working tree are also left unchanged as a result. If a temporary stash entry was created using --autostash, it will be saved to the stash list",
				},
				{
					name: "--apply",
					description:
						"Use applying strategies to rebase (calling git-am internally). This option may become a no-op in the future once the merge backend handles everything the apply one does",
				},
				{
					name: "--empty",
					description:
						"How to handle commits that are not empty to start and are not clean cherry-picks of any upstream commit, but which become empty after rebasing (because they contain a subset of already upstream changes). With drop (the default), commits that become empty are dropped. With keep, such commits are kept. With ask (implied by --interactive), the rebase will halt when an empty commit is applied allowing you to choose whether to drop it, edit files more, or just commit the empty changes. Other options, like --exec, will use the default of drop unless -i/--interactive is explicitly specified. Note that commits which start empty are kept (unless --no-keep-empty is specified), and commits which are clean cherry-picks (as determined by git log --cherry-mark ...) are detected and dropped as a preliminary step (unless --reapply-cherry-picks is passed)",
					args: {
						isOptional: true,
						suggestions: ["drop", "keep", "ask"],
					},
				},
				{
					name: "--no-keep-empty",
					description:
						"Do not keep commits that start empty before the rebase (i.e. that do not change anything from its parent) in the result. The default is to keep commits which start empty, since creating such commits requires passing the --allow-empty override flag to git commit, signifying that a user is very intentionally creating such a commit and thus wants to keep it. Usage of this flag will probably be rare, since you can get rid of commits that start empty by just firing up an interactive rebase and removing the lines corresponding to the commits you don’t want. This flag exists as a convenient shortcut, such as for cases where external tools generate many empty commits and you want them all removed. For commits which do not start empty but become empty after rebasing, see the --empty flag",
				},
				{
					name: "--keep-empty",
					description:
						"Keep commits that start empty before the rebase (i.e. that do not change anything from its parent) in the result. The default is to keep commits which start empty, since creating such commits requires passing the --allow-empty override flag to git commit, signifying that a user is very intentionally creating such a commit and thus wants to keep it. Usage of this flag will probably be rare, since you can get rid of commits that start empty by just firing up an interactive rebase and removing the lines corresponding to the commits you don’t want. This flag exists as a convenient shortcut, such as for cases where external tools generate many empty commits and you want them all removed. For commits which do not start empty but become empty after rebasing, see the --empty flag",
				},
				{
					name: "--reapply-cherry-picks",
					description:
						"Reapply all clean cherry-picks of any upstream commit instead of preemptively dropping them. (If these commits then become empty after rebasing, because they contain a subset of already upstream changes, the behavior towards them is controlled by the --empty flag). By default (or if --no-reapply-cherry-picks is given), these commits will be automatically dropped. Because this necessitates reading all upstream commits, this can be expensive in repos with a large number of upstream commits that need to be read. --reapply-cherry-picks allows rebase to forgo reading all upstream commits, potentially improving performance",
				},
				{
					name: "--no-reapply-cherry-picks",
					description:
						"Do not reapply all clean cherry-picks of any upstream commit instead of preemptively dropping them",
				},
				{
					name: "--allow-empty-message",
					description:
						"No-op. Rebasing commits with an empty message used to fail and this option would override that behavior, allowing commits with empty messages to be rebased. Now commits with an empty message do not cause rebasing to halt",
				},
				{
					name: "--skip",
					description:
						"Restart the rebasing process by skipping the current patch",
				},
				{
					name: "--edit-todo",
					description: "Edit the todo list during an interactive rebase",
				},
				{
					name: "--show-current-patch",
					description:
						"Show the current patch in an interactive rebase or when rebase is stopped because of conflicts. This is the equivalent of git show REBASE_HEAD",
				},
				{
					name: ["-m", "--merge"],
					description:
						"Use merging strategies to rebase. When the recursive (default) merge strategy is used, this allows rebase to be aware of renames on the upstream side. This is the default. Note that a rebase merge works by replaying each commit from the working branch on top of the <upstream> branch. Because of this, when a merge conflict happens, the side reported as ours is the so-far rebased series, starting with <upstream>, and theirs is the working branch. In other words, the sides are swapped",
				},
				{
					name: ["-s", "--strategy"],
					isRepeatable: true,
					description:
						"Use the given merge strategy. If there is no -s option git merge-recursive is used instead. This implies --merge. Because git rebase replays each commit from the working branch on top of the <upstream> branch using the given strategy, using the ours strategy simply empties all patches from the <branch>, which makes little sense",
					args: {
						name: "strategy",
						isVariadic: true,
						suggestions: ["resolve", "recursive", "octopus", "ours", "subtree"],
					},
				},
				{
					name: ["-X", "--strategy-option"],
					description:
						"Pass the <strategy-option> through to the merge strategy. This implies --merge and, if no strategy has been specified, -s recursive. Note the reversal of ours and theirs as noted above for the -m option",
					args: {
						name: "option",
						suggestions: [
							"ours",
							"theirs",
							"patience",
							"diff-algorithm",
							"diff-algorithm=patience",
							"diff-algorithm=minimal",
							"diff-algorithm=histogram",
							"diff-algorithm=myers",
							"ignore-space-change",
							"ignore-all-space",
							"ignore-space-at-eol",
							"ignore-cr-at-eol",
							"renormalize",
							"no-renormalize",
							"no-renames",
							"find-renames",
							"subtree",
						],
					},
				},
				{
					name: "--rerere-autoupdate",
					description:
						"Allow the rerere mechanism to update the index with the result of auto-conflict resolution if possible",
				},
				{
					name: "--no-rerere-autoupdate",
					description:
						"Allow the rerere mechanism to update the index with the result of auto-conflict resolution if possible",
				},
				{
					name: ["-S", "--gpg-sign"],
					description:
						"GPG-sign commits. The keyid argument is optional and defaults to the committer identity; if specified, it must be stuck to the option without a space. --no-gpg-sign is useful to countermand both commit.gpgSign configuration variable, and earlier --gpg-sign",
					args: {
						name: "keyid",
						isOptional: true,
					},
				},
				{
					name: "--no-gpg-sign",
					description:
						"Do not GPG-sign commits.--no-gpg-sign is useful to countermand both commit.gpgSign configuration variable, and earlier --gpg-sign",
				},
				{
					name: ["-q", "--quiet"],
					description: "Be quiet. Implies --no-stat",
				},
				{
					name: ["-v", "--verbose"],
					description: "Be verbose. Implies --stat",
				},
				{
					name: "--stat",
					description:
						"Show a diffstat of what changed upstream since the last rebase. The diffstat is also controlled by the configuration option rebase.stat",
				},
				{
					name: ["-n", "--no-stat"],
					description: "Do not show a diffstat as part of the rebase process",
				},
				{
					name: "--no-verify",
					description:
						"This option bypasses the pre-rebase hook. See also githooks[5]",
				},
				{
					name: "--verify",
					description:
						"Allows the pre-rebase hook to run, which is the default. This option can be used to override --no-verify. See also githooks[5]",
				},
				{
					name: "-C",
					description:
						"Ensure at least <n> lines of surrounding context match before and after each change. When fewer lines of surrounding context exist they all must match. By default no context is ever ignored. Implies --apply",
					args: {
						name: "n",
					},
				},
				{
					name: ["--no-ff", "--force-rebase", "-f"],
					description:
						"Individually replay all rebased commits instead of fast-forwarding over the unchanged ones. This ensures that the entire history of the rebased branch is composed of new commits. You may find this helpful after reverting a topic branch merge, as this option recreates the topic branch with fresh commits so it can be remerged successfully without needing to 'revert the reversion' (see the revert-a-faulty-merge How-To for details)",
				},
				{
					name: "--fork-point",
					description:
						"Use reflog to find a better common ancestor between <upstream> and <branch> when calculating which commits have been introduced by <branch>. When --fork-point is active, fork_point will be used instead of <upstream> to calculate the set of commits to rebase, where fork_point is the result of git merge-base --fork-point <upstream> <branch> command (see git-merge-base[1]). If fork_point ends up being empty, the <upstream> will be used as a fallback. If <upstream> is given on the command line, then the default is --no-fork-point, otherwise the default is --fork-point. If your branch was based on <upstream> but <upstream> was rewound and your branch contains commits which were dropped, this option can be used with --keep-base in order to drop those commits from your branch",
				},
				{
					name: "--no-fork-point",
					description:
						"Do not use reflog to find a better common ancestor between <upstream> and <branch> when calculating which commits have been introduced by <branch>. When --fork-point is active, fork_point will be used instead of <upstream> to calculate the set of commits to rebase, where fork_point is the result of git merge-base --fork-point <upstream> <branch> command (see git-merge-base[1]). If fork_point ends up being empty, the <upstream> will be used as a fallback. If <upstream> is given on the command line, then the default is --no-fork-point, otherwise the default is --fork-point. If your branch was based on <upstream> but <upstream> was rewound and your branch contains commits which were dropped, this option can be used with --keep-base in order to drop those commits from your branch",
				},
				{
					name: "--ignore-whitespace",
					description:
						"Ignore whitespace differences when trying to reconcile differences. Currently, each backend implements an approximation of this behavior: apply backend: When applying a patch, ignore changes in whitespace in context lines. Unfortunately, this means that if the 'old' lines being replaced by the patch differ only in whitespace from the existing file, you will get a merge conflict instead of a successful patch application. merge backend: Treat lines with only whitespace changes as unchanged when merging. Unfortunately, this means that any patch hunks that were intended to modify whitespace and nothing else will be dropped, even if the other side had no changes that conflicted",
				},
				{
					name: "--whitespace",
					description:
						"This flag is passed to the git apply program (see git-apply[1]) that applies the patch. Implies --apply",
					args: {
						name: "option",
					},
				},
				{
					name: "--committer-date-is-author-date",
					description:
						"Instead of using the current time as the committer date, use the author date of the commit being rebased as the committer date. This option implies --force-rebase",
				},
				{
					name: ["--ignore-date", "--reset-author-date"],
					description:
						"Instead of using the author date of the original commit, use the current time as the author date of the rebased commit. This option implies --force-rebase",
				},
				{
					name: "--signoff",
					description:
						"Add a Signed-off-by trailer to all the rebased commits. Note that if --interactive is given then only commits marked to be picked, edited or reworded will have the trailer added",
				},
				{
					name: ["-i", "--interactive"],
					description:
						"Make a list of the commits which are about to be rebased. Let the user edit that list before rebasing. This mode can also be used to split commits (see SPLITTING COMMITS below). The commit list format can be changed by setting the configuration option rebase.instructionFormat. A customized instruction format will automatically have the long commit hash prepended to the format",
				},
				{
					name: ["-r", "--rebase-merges"],
					description:
						"By default, a rebase will simply drop merge commits from the todo list, and put the rebased commits into a single, linear branch. With --rebase-merges, the rebase will instead try to preserve the branching structure within the commits that are to be rebased, by recreating the merge commits. Any resolved merge conflicts or manual amendments in these merge commits will have to be resolved/re-applied manually. By default, or when no-rebase-cousins was specified, commits which do not have <upstream> as direct ancestor will keep their original branch point, i.e. commits that would be excluded by git-log[1]'s --ancestry-path option will keep their original ancestry by default. If the rebase-cousins mode is turned on, such commits are instead rebased onto <upstream> (or <onto>, if specified). The --rebase-merges mode is similar in spirit to the deprecated --preserve-merges but works with interactive rebases, where commits can be reordered, inserted and dropped at will. It is currently only possible to recreate the merge commits using the recursive merge strategy; Different merge strategies can be used only via explicit exec git merge -s <strategy> [...] commands",
					args: {
						name: "mode",
						isOptional: true,
						suggestions: ["rebase-cousins", "no-rebase-cousins"],
					},
				},
				{
					name: ["-x", "--exec"],
					insertValue: "-x '{cursor}'",
					description:
						"Append 'exec <cmd>' after each line creating a commit in the final history. <cmd> will be interpreted as one or more shell commands. Any command that fails will interrupt the rebase, with exit code 1. You may execute several commands by either using one instance of --exec with several commands: git rebase -i --exec 'cmd1 && cmd2 && ...' or by giving more than one --exec: git rebase -i --exec 'cmd1' --exec 'cmd2' --exec ... If --autosquash is used, 'exec' lines will not be appended for the intermediate commits, and will only appear at the end of each squash/fixup series. This uses the --interactive machinery internally, but it can be run without an explicit --interactive",
					args: {
						name: "cmd",
					},
				},
				{
					name: "--root",
					description:
						"Rebase all commits reachable from <branch>, instead of limiting them with an <upstream>. This allows you to rebase the root commit(s) on a branch. When used with --onto, it will skip changes already contained in <newbase> (instead of <upstream>) whereas without --onto it will operate on every change. When used together with both --onto and --preserve-merges, all root commits will be rewritten to have <newbase> as parent instead",
				},
				{
					name: "--autosquash",
					description:
						"When the commit log message begins with 'squash! …​' (or 'fixup! …​'), and there is already a commit in the todo list that matches the same ..., automatically modify the todo list of rebase -i so that the commit marked for squashing comes right after the commit to be modified, and change the action of the moved commit from pick to squash (or fixup). A commit matches the ... if the commit subject matches, or if the ... refers to the commit’s hash. As a fall-back, partial matches of the commit subject work, too. The recommended way to create fixup/squash commits is by using the --fixup/--squash options of git-commit[1]",
				},
				{
					name: "--no-autosquash",
					description:
						"When the commit log message begins with 'squash! …' (or 'fixup! …'), and there is already a commit in the todo list that matches the same ..., automatically modify the todo list of rebase -i so that the commit marked for squashing comes right after the commit to be modified, and change the action of the moved commit from pick to squash (or fixup). A commit matches the ... if the commit subject matches, or if the ... refers to the commit’s hash. As a fall-back, partial matches of the commit subject work, too. The recommended way to create fixup/squash commits is by using the --fixup/--squash options of git-commit[1]",
				},
				{
					name: "--autostash",
					description:
						"Automatically create a temporary stash entry before the operation begins, and apply it after the operation ends. This means that you can run rebase on a dirty worktree. However, use with care: the final stash application after a successful rebase might result in non-trivial conflicts",
				},
				{
					name: "--no-autostash",
					description:
						"Do not automatically create a temporary stash entry before the operation begins, and apply it after the operation ends. This means that you can run rebase on a dirty worktree. However, use with care: the final stash application after a successful rebase might result in non-trivial conflicts",
				},
				{
					name: "--reschedule-failed-exec",
					description:
						"Automatically reschedule exec commands that failed. This only makes sense in interactive mode (or when an --exec option was provided)",
				},
				{
					name: "--no-reschedule-failed-exec",
					description:
						"Do not automatically reschedule exec commands that failed. This only makes sense in interactive mode (or when an --exec option was provided)",
				},
			],
			args: [
				{
					name: "base",
					generators: gitGenerators.localBranches,
					suggestions: [
						{
							name: "-",
							description: "Use the last ref as the base",
						},
					],
					filterStrategy: "fuzzy",
					isOptional: true,
				},
				{
					name: "new base",
					generators: gitGenerators.localBranches,
					filterStrategy: "fuzzy",
					isOptional: true,
				},
			],
		},
		{
			name: "add",
			description: "Add file contents to the index",
			options: addOptions,
			args: {
				name: "pathspec",
				isVariadic: true,
				isOptional: true,

				// We have a special setting for dot in the vuejs app

				// suggestions: [
				//     {
				//         name: ".",
				//         description: "current directory",
				//         insertValue: ".",
				//         icon: "fig://icon?type=folder"
				//     }
				// ],
				generators: [gitGenerators.files_for_staging, { template: "folders" }],
			},
		},
		{
			name: "stage",
			description: "Add file contents to the staging area",
			options: addOptions,
			args: {
				name: "pathspec",
				isVariadic: true,
				isOptional: true,

				// We have a special setting for dot in the vuejs app

				// suggestions: [
				//     {
				//         name: ".",
				//         description: "current directory",
				//         insertValue: ".",
				//         icon: "fig://icon?type=folder"
				//     }
				// ],
				generators: gitGenerators.files_for_staging,
			},
		},
		{
			name: "status",
			description: "Show the working tree status",
			options: [
				{
					name: ["-s", "--short"],
					description: "Give the output in the short-format",
				},
				{
					name: ["-v", "--verbose"],
					description: "Be verbose",
				},
				{
					name: ["-b", "--branch"],
					description: "Show branch information",
				},
				{
					name: "--show-stash",
					description: "Show stash information",
				},
				{
					name: "--porcelain",
					description: "Give the output in the short-format",
					args: {
						name: "version",
						isOptional: true,
					},
				},
				{
					name: "--ahead-behind",
					description: "Display full ahead/behind values",
				},
				{
					name: "--no-ahead-behind",
					description: "Do not display full ahead/behind values",
				},
				{
					name: "--column",
					description: "Display full ahead/behind values",
					args: {
						name: "options",
						description: "Defaults to always",
						isOptional: true,
					},
				},
				{
					name: "--no-column",
					description: "Do not display untracked files in columns",
					args: {
						name: "options",
						description: "Defaults to never",
						isOptional: true,
					},
				},
				{
					name: "--long",
					description: "Show status in long format (default)",
				},
				{
					name: ["-z", "--null"],
					description: "Terminate entries with NUL",
				},
				{
					name: ["-u", "--untracked-files"],
					description: "Show untracked files",
					args: {
						isOptional: true,
						suggestions: [
							{
								name: "all",
								description: "(Default)",
							},
							{
								name: "normal",
							},
							{
								name: "no",
							},
						],
					},
				},
				{
					name: "--ignore-submodules",
					description: "Ignore changes to submodules when looking for changes",
					args: {
						name: "when",
						isOptional: true,
						suggestions: [
							{
								name: "all",
								description: "(Default)",
							},
							{
								name: "dirty",
							},
							{
								name: "untracked",
							},
							{
								name: "none",
							},
						],
					},
				},
				{
					name: "--ignored",
					description: "Show ignored files",
					args: {
						isOptional: true,
						suggestions: [
							{
								name: "traditional",
								description: "(Default)",
							},
							{
								name: "matching",
							},
							{
								name: "no",
							},
						],
					},
				},
				{
					name: "--no-renames",
					description: "Do not detect renames",
				},
				{
					name: "--renames",
					description:
						"Turn on rename detection regardless of user configuration",
				},
				{
					name: "--find-renames",
					description:
						"Turn on rename detection, optionally setting the similarity threshold",
					args: {
						name: "n",
						isOptional: true,
					},
				},
			],
			args: {
				name: "pathspec",
				isVariadic: true,
				isOptional: true,

				// We have a special setting for dot in the vuejs app

				// suggestions: [
				//     {
				//         name: ".",
				//         description: "current directory",
				//         insertValue: ".",
				//         icon: "fig://icon?type=folder"
				//     }
				// ],
				generators: gitGenerators.files_for_staging,
			},
		},
		{
			name: "clean",
			description: "Shows which files would be removed from working directory",
			options: [
				{
					name: "-d",
					description:
						"Normally, when no <path> is specified, git clean will not recurse into untracked directories to avoid removing too much. Specify -d to have it recurse into such directories as well. If any paths are specified, -d is irrelevant; all untracked files matching the specified paths (with exceptions for nested git directories mentioned under --force) will be removed",
				},
				{
					name: ["-f", "--force"],
					description:
						"If the Git configuration variable clean.requireForce is not set to false, git clean will refuse to delete files or directories unless given -f or -i",
				},
				{
					name: ["-i", "--interactive"],
					description: "Show what would be done and clean files interactively",
				},
				{
					name: ["-n", "--dry-run"],
					description:
						"Don’t actually remove anything, just show what would be done",
				},
				{
					name: ["-q", "--quiet"],
					description:
						"Be quiet, only report errors, but not the files that are successfully removed",
				},
				{
					name: ["-e", "--exclude"],
					description:
						"Use the given exclude pattern in addition to the standard ignore rules",
					args: {
						name: "pattern",
					},
				},
				{
					name: "-x",
					description:
						"Don’t use the standard ignore rules (see gitignore(5)), but still use the ignore rules given with -e options from the command line. This allows removing all untracked files, including build products. This can be used (possibly in conjunction with git restore or git reset) to create a pristine working directory to test a clean build",
				},
				{
					name: "-X",
					description:
						"Remove only files ignored by Git. This may be useful to rebuild everything from scratch, but keep manually created files",
				},
			],
			args: {
				name: "path",
				template: "filepaths",
			},
		},
		{
			name: "revert",
			description:
				"Create new commit that undoes all of the changes made in <commit>, then apply it to the current branch",
			args: {
				name: "commit",
				isOptional: true,
				generators: gitGenerators.commits,
			},
		},
		{
			name: "ls-remote",
			description: "List references in a remote repository",
		},
		{
			name: "push",
			description: "Update remote refs",
			options: [
				{
					name: "--all",
					description:
						"Push all branches (i.e. refs under refs/heads/); cannot be used with other <refspec>",
				},
				{
					name: "--prune",
					description:
						"Remove remote branches that don't have a local counterpart",
				},
				{
					name: "--mirror",
					description:
						"Instead of naming each ref to push, specifies that all refs under refs/ be mirrored to the remote repository",
				},
				{
					name: ["-n", "--dry-run"],
					description: "Do everything except actually send the updates",
				},
				{
					name: "--porcelain",
					description:
						"Produce machine-readable output. The output status line for each ref will be tab-separated and sent to stdout instead of stderr",
				},
				{
					name: ["-d", "--delete"],
					description:
						"All listed refs are deleted from the remote repository. This is the same as prefixing all refs with a colon",
				},
				{
					name: "--tags",
					description:
						"All refs under refs/tags are pushed, in addition to refspecs explicitly listed on the command line",
				},
				{
					name: "--follow-tags",
					description:
						"Push all the refs that would be pushed without this option, and also push annotated tags in refs/tags that are missing from the remote but are pointing at commit-ish that are reachable from the refs being pushed. This can also be specified with configuration variable push.followTags",
				},
				{
					name: "--signed",
					description:
						"GPG-sign the push request to update refs on the receiving side, to allow it to be checked by the hooks and/or be logged. If false or --no-signed, no signing will be attempted. If true or --signed, the push will fail if the server does not support signed pushes. If set to if-asked, sign if and only if the server supports signed pushes. The push will also fail if the actual call to gpg --sign fails. See git-receive-pack(1) for the details on the receiving end",
					args: {
						isOptional: true,
						suggestions: ["true", "false", "if-asked"],
					},
				},
				{
					name: "--no-signed",
					description:
						"GPG-sign the push request to update refs on the receiving side, to allow it to be checked by the hooks and/or be logged. If false or --no-signed, no signing will be attempted. If true or --signed, the push will fail if the server does not support signed pushes. If set to if-asked, sign if and only if the server supports signed pushes. The push will also fail if the actual call to gpg --sign fails. See git-receive-pack(1) for the details on the receiving end",
				},
				{
					name: "--atomic",
					description:
						"Use an atomic transaction on the remote side if available. Either all refs are updated, or on error, no refs are updated. If the server does not support atomic pushes the push will fail",
				},
				{
					name: "--no-atomic",
					description:
						"Use an atomic transaction on the remote side if available. Either all refs are updated, or on error, no refs are updated. If the server does not support atomic pushes the push will fail",
				},
				{
					name: ["-f", "--force"],
					description:
						"Usually, the command refuses to update a remote ref that is not an ancestor of the local ref used to overwrite it. Also, when --force-with-lease option is used, the command refuses to update a remote ref whose current value does not match what is expected. This flag disables these checks, and can cause the remote repository to lose commits; use it with care",
				},
				{
					name: "--repo",
					requiresSeparator: true,
					description:
						"This option is equivalent to the <repository> argument. If both are specified, the command-line argument takes precedence",
					args: {
						name: "repository",
					},
				},
				{
					name: ["-u", "--set-upstream"],
					description:
						"For every branch that is up to date or successfully pushed, add upstream (tracking) reference, used by argument-less git-pull(1) and other commands",
				},
				{
					name: "--thin",
					description:
						"These options are passed to git-send-pack(1). A thin transfer significantly reduces the amount of sent data when the sender and receiver share many of the same objects in common. The default is --thin",
				},
				{
					name: "--no-thin",
					description:
						"These options are passed to git-send-pack(1). A thin transfer significantly reduces the amount of sent data when the sender and receiver share many of the same objects in common. The default is --thin",
				},
				{
					name: ["-q", "--quiet"],
					description:
						"Suppress all output, including the listing of updated refs, unless an error occurs. Progress is not reported to the standard error stream",
				},
				{ name: ["-v", "--verbose"], description: "Run verbosely" },
				{
					name: "--progress",
					description:
						"Progress status is reported on the standard error stream by default when it is attached to a terminal, unless -q is specified. This flag forces progress status even if the standard error stream is not directed to a terminal",
				},
				{
					name: "--no-recurse-submodules",
					description:
						"May be used to make sure all submodule commits used by the revisions to be pushed are available on a remote-tracking branch. If check is used Git will verify that all submodule commits that changed in the revisions to be pushed are available on at least one remote of the submodule. If any commits are missing the push will be aborted and exit with non-zero status. If on-demand is used all submodules that changed in the revisions to be pushed will be pushed. If on-demand was not able to push all necessary revisions it will also be aborted and exit with non-zero status. If only is used all submodules will be recursively pushed while the superproject is left unpushed. A value of no or using --no-recurse-submodules can be used to override the push.recurseSubmodules configuration variable when no submodule recursion is required",
				},
				{
					name: "--recurse-submodules",
					requiresSeparator: true,
					description:
						"May be used to make sure all submodule commits used by the revisions to be pushed are available on a remote-tracking branch. If check is used Git will verify that all submodule commits that changed in the revisions to be pushed are available on at least one remote of the submodule. If any commits are missing the push will be aborted and exit with non-zero status. If on-demand is used all submodules that changed in the revisions to be pushed will be pushed. If on-demand was not able to push all necessary revisions it will also be aborted and exit with non-zero status. If only is used all submodules will be recursively pushed while the superproject is left unpushed. A value of no or using --no-recurse-submodules can be used to override the push.recurseSubmodules configuration variable when no submodule recursion is required",
					args: {
						suggestions: ["check", "on-demand", "only", "no"],
					},
				},
				{
					name: "--verify",
					description:
						"Turn on the pre-push hook. The default is --verify, giving the hook a chance to prevent the push. With",
				},
				{
					name: "--no-verify",
					description:
						"Turn off the pre-push hook. The default is --verify, giving the hook a chance to prevent the push. With",
				},
				{
					name: ["-4", "--ipv4"],
					description: "Use IPv4 addresses only, ignoring IPv6 addresses",
				},
				{
					name: ["-6", "--ipv6"],
					description: "Use IPv6 addresses only, ignoring IPv4 addresses",
				},
				{
					name: ["-o", "--push-option"],

					description:
						"Transmit the given string to the server, which passes them to the pre-receive as well as the post-receive hook. The given string must not contain a NUL or LF character. When multiple --push-option=<option> are given, they are all sent to the other side in the order listed on the command line. When no --push-option=<option> is given from the command line, the values of configuration variable push.pushOption are used instead",
					args: {
						name: "option",
					},
				},
				{
					name: ["--receive-pack", "--exec"],
					description:
						"Path to the git-receive-pack program on the remote end. Sometimes useful when pushing to a remote repository over ssh, and you do not have the program in a directory on the default $PATH",
					args: {
						name: "git-receive-pack",
					},
				},
				{
					name: "--no-force-with-lease",
					description:
						"Cancel all the previous --force-with-lease on the command line",
				},
				{
					name: "--force-with-lease",
					description:
						"Protect the named ref (alone), if it is going to be updated, by requiring its current value to be the same as the specified value <expect> (which is allowed to be different from the remote-tracking branch we have for the refname, or we do not even have to have such a remote-tracking branch when this form is used). If <expect> is the empty string, then the named ref must not already exist",
					args: {
						name: "refname[:expect]",
						isOptional: true,
					},
				},
			],
			args: [
				{
					name: "remote",
					isOptional: true,
					generators: gitGenerators.remotes,
					filterStrategy: "fuzzy",
				},
				{
					name: "branch",
					isOptional: true,
					generators: gitGenerators.localBranches,
					filterStrategy: "fuzzy",
				},
			],
		},
		{
			name: "pull",
			description: "Integrate with another repository",
			options: [
				{
					name: ["--rebase", "-r"],
					isDangerous: true,
					description:
						"Fetch the remote’s copy of current branch and rebases it into the local copy",
					args: {
						isOptional: true,
						name: "remote",
						generators: gitGenerators.remotes,
						filterStrategy: "fuzzy",
						suggestions: ["false", "true", "merges", "preserve", "interactive"],
					},
				},
				{ name: "--no-rebase", description: "Override earlier --rebase" },
				{
					name: "--commit",
					description:
						"Perform the merge and commit the result. This option can be used to override --no-commit",
				},
				{
					name: "--no-commit",
					description:
						"Perform the merge and stop just before creating a merge commit, to give the user a chance to inspect and further tweak the merge result before committing",
				},
				{
					name: ["--edit", "-e"],
					description:
						"Invoke an editor before committing successful mechanical merge to further edit the auto-generated merge message, so that the user can explain and justify the merge",
				},
				{
					name: "--no-edit",
					description:
						"The --no-edit option can be used to accept the auto-generated message (this is generally discouraged). The --edit (or -e) option is still useful if you are giving a draft message with the -m option from the command line and want to edit it in the editor",
				},
				{
					name: "--cleanup",
					description:
						"This option determines how the merge message will be cleaned up before committing. See git-commit[1] for more details. In addition, if the <mode> is given a value of scissors, scissors will be appended to MERGE_MSG before being passed on to the commit machinery in the case of a merge conflict",
					requiresSeparator: true,
					args: {
						name: "mode",
						suggestions: [
							"strip",
							"whitespace",
							"verbatim",
							"scissors",
							"default",
						],
					},
				},
				{
					name: "--ff",
					description:
						"When possible resolve the merge as a fast-forward (only update the branch pointer to match the merged branch; do not create a merge commit). When not possible (when the merged-in history is not a descendant of the current history), create a merge commit",
				},
				{
					name: "--no-ff",
					description:
						"Create a merge commit in all cases, even when the merge could instead be resolved as a fast-forward",
				},
				{
					name: "--ff-only",
					description:
						"Resolve the merge as a fast-forward when possible. When not possible, refuse to merge and exit with a non-zero status",
				},
				{
					name: ["-S", "--gpg-sign"],
					description:
						"GPG-sign the resulting merge commit. The keyid argument is optional and defaults to the committer identity; if specified, it must be stuck to the option without a space",
					args: {
						name: "keyid",
						isOptional: true,
					},
				},
				{
					name: "--no-gpg-sign",
					description:
						"Is useful to countermand both commit.gpgSign configuration variable, and earlier --gpg-sign",
				},
				{
					name: "--log",
					description:
						"In addition to branch names, populate the log message with one-line descriptions from at most <n> actual commits that are being merged. See also git-fmt-merge-msg[1]",
					args: {
						name: "n",
						isOptional: true,
					},
				},
				{
					name: "--no-log",
					description:
						"Do not list one-line descriptions from the actual commits being merged",
				},
				{
					name: "--signoff",
					description:
						"Add a Signed-off-by trailer by the committer at the end of the commit log message. The meaning of a signoff depends on the project to which you’re committing. For example, it may certify that the committer has the rights to submit the work under the project’s license or agrees to some contributor representation, such as a Developer Certificate of Origin. (See http://developercertificate.org for the one used by the Linux kernel and Git projects.) Consult the documentation or leadership of the project to which you’re contributing to understand how the signoffs are used in that project",
				},
				{
					name: "--no-signoff",
					description:
						"Can be used to countermand an earlier --signoff option on the command line",
				},
				{
					name: "--stat",
					description:
						"Show a diffstat at the end of the merge. The diffstat is also controlled by the configuration option merge.stat",
				},
				{
					name: ["-n", "--no-stat"],
					description: "Do not show a diffstat at the end of the merge",
				},
				{
					name: "--squash",
					description:
						"With --squash, --commit is not allowed, and will fail. Produce the working tree and index state as if a real merge happened (except for the merge information), but do not actually make a commit, move the HEAD, or record $GIT_DIR/MERGE_HEAD (to cause the next git commit command to create a merge commit). This allows you to create a single commit on top of the current branch whose effect is the same as merging another branch (or more in case of an octopus)",
				},
				{
					name: "--no-squash",
					description:
						"Perform the merge and commit the result. This option can be used to override --squash",
				},
				{
					name: "--no-verify",
					description:
						"This option bypasses the pre-merge and commit-msg hooks. See also githooks[5]",
				},
				{
					name: ["-s", "--strategy"],
					description:
						"Use the given merge strategy; can be supplied more than once to specify them in the order they should be tried. If there is no -s option, a built-in list of strategies is used instead (git merge-recursive when merging a single head, git merge-octopus otherwise)",
					args: {
						name: "strategy",
						isVariadic: true,
						suggestions: ["resolve", "recursive", "octopus", "ours", "subtree"],
					},
				},
				{
					name: ["-X", "--strategy-option"],
					description:
						"Pass merge strategy specific option through to the merge strategy",
					args: {
						name: "option",
						suggestions: [
							"ours",
							"theirs",
							"patience",
							"diff-algorithm",
							"diff-algorithm=patience",
							"diff-algorithm=minimal",
							"diff-algorithm=histogram",
							"diff-algorithm=myers",
							"ignore-space-change",
							"ignore-all-space",
							"ignore-space-at-eol",
							"ignore-cr-at-eol",
							"renormalize",
							"no-renormalize",
							"no-renames",
							"find-renames",
							"subtree",
						],
					},
				},
				{
					name: "--verify-signatures",
					description:
						"Verify that the tip commit of the side branch being merged is signed with a valid key, i.e. a key that has a valid uid: in the default trust model, this means the signing key has been signed by a trusted key. If the tip commit of the side branch is not signed with a valid key, the merge is aborted",
				},
				{
					name: "--no-verify-signatures",
					description:
						"Do not verify that the tip commit of the side branch being merged is signed with a valid key",
				},
				{
					name: "--summary",
					description:
						"Synonym to --stat ; this is deprecated and will be removed in the future",
				},
				{
					name: "--no-summary",
					description:
						"Synonym to --no-stat ; this is deprecated and will be removed in the future",
				},
				{
					name: ["-q", "--quiet"],
					description: "Operate quietly. Implies --no-progress",
				},
				{ name: ["-v", "--verbose"], description: "Be verbose" },
				{
					name: "--autostash",
					description:
						"Automatically create a temporary stash entry before the operation begins, and apply it after the operation ends. This means that you can run the operation on a dirty worktree. However, use with care: the final stash application after a successful merge might result in non-trivial conflicts",
				},
				{
					name: "--no-autostash",
					description:
						"Do not automatically create a temporary stash entry before the operation begins, and apply it after the operation ends",
				},
				{
					name: "--allow-unrelated-histories",
					description:
						"By default, git merge command refuses to merge histories that do not share a common ancestor. This option can be used to override this safety when merging histories of two projects that started their lives independently. As that is a very rare occasion, no configuration variable to enable this by default exists and will not be added",
				},
				{
					name: "--all",
					description: "Fetch all remotes",
				},
				{
					name: ["-a", "--append"],
					description:
						"Append ref names and object names of fetched refs to the existing contents of .git/FETCH_HEAD",
				},
				{
					name: "--atomic",
					description:
						"Use an atomic transaction to update local refs. Either all refs are updated, or on error, no refs are updated",
				},
				{
					name: "--depth",
					requiresSeparator: true,
					args: {
						name: "depth",
					},
					description:
						"Limit fetching to the specified number of commits from the tip of each remote branch history",
				},
				{
					name: "--deepen",
					requiresSeparator: true,
					args: {
						name: "depth",
					},
					description:
						"Similar to --depth, except it specifies the number of commits from the current shallow boundary instead of from the tip of each remote branch history",
				},
				{
					name: "--shallow-since",
					requiresSeparator: true,
					args: {
						name: "date",
					},
					description:
						"Deepen or shorten the history of a shallow repository to include all reachable commits after <date>",
				},
				{
					name: "--shallow-exclude",
					requiresSeparator: true,
					args: {
						name: "revision",
					},
					description:
						"Deepen or shorten the history of a shallow repository to exclude commits reachable from a specified remote branch or tag. This option can be specified multiple times",
				},
				{
					name: "--unshallow",
					description:
						"If the source repository is shallow, fetch as much as possible so that the current repository has the same history as the source repository",
				},
				{
					name: "--update-shallow",
					description:
						"By default when fetching from a shallow repository, git fetch refuses refs that require updating .git/shallow",
				},
				{
					name: "--negotiation-tip",
					requiresSeparator: true,
					args: {
						name: "commit|glob",
						generators: gitGenerators.commits,
					},
					description:
						"By default, Git will report, to the server, commits reachable from all local refs to find common commits in an attempt to reduce the size of the to-be-received packfile",
				},
				{
					name: "--dry-run",
					description: "Show what would be done, without making any changes",
				},
				{
					name: ["-f", "--force"],
					description: "This option overrides that check",
				},
				{
					name: ["-k", "--keep"],
					description: "Keep downloaded pack",
				},
				{
					name: ["-p", "--prune"],
					description:
						"Before fetching, remove any remote-tracking references that no longer exist on the remote",
				},
				{
					name: ["-P", "--prune-tags"],
					description:
						"Before fetching, remove any local tags that no longer exist on the remote if --prune is enabled",
				},
				{
					name: "--no-tags",
					description:
						"By default, tags that point at objects that are downloaded from the remote repository are fetched and stored locally. This option disables this automatic tag following",
				},
				{
					name: "--refmap",
					requiresSeparator: true,
					args: {
						name: "refspec",
					},
					description:
						"When fetching refs listed on the command line, use the specified refspec (can be given more than once) to map the refs to remote-tracking branches, instead of the values of remote.*.fetch configuration variables for the remote repository",
				},
				{
					name: ["-t", "--tags"],
					description:
						"By default, tags that point at objects that are downloaded from the remote repository are fetched and stored locally. This option disables this automatic tag following",
				},
				{
					name: "--recurse-submodules",
					requiresSeparator: true,
					args: {
						name: "mode",
						isOptional: true,
						suggestions: ["yes", "on-demand", "no"],
					},
					description:
						"When fetching refs listed on the command line, use the specified refspec (can be given more than once) to map the refs to remote-tracking branches, instead of the values of remote.*.fetch configuration variables for the remote repository",
				},
				{
					name: "--no-recurse-submodules",
					description:
						"Disable recursive fetching of submodules (this has the same effect as using the --recurse-submodules=no option)",
				},
				{
					name: ["-j", "--jobs"],
					args: {
						name: "n",
					},
					description:
						"Number of parallel children to be used for all forms of fetching",
				},
				{
					name: "--set-upstream",
					description:
						"If the remote is fetched successfully, add upstream (tracking) reference, used by argument-less git-pull[1] and other commands",
				},
				{
					name: "--upload-pack",
					args: {
						name: "upload-pack",
					},
					description:
						"When given, and the repository to fetch from is handled by git fetch-pack, --exec=<upload-pack> is passed to the command to specify non-default path for the command run on the other end",
				},
				{
					name: "--progress",
					description:
						"Progress status is reported on the standard error stream by default when it is attached to a terminal, unless -q is specified",
				},
				{
					name: ["-o", "--server-option"],
					args: {
						name: "option",
					},
					description:
						"Transmit the given string to the server when communicating using protocol version 2. The given string must not contain a NUL or LF character",
				},
				{
					name: "--show-forced-updates",
					description:
						"By default, git checks if a branch is force-updated during fetch. This can be disabled through fetch.showForcedUpdates, but the --show-forced-updates option guarantees this check occurs",
				},
				{
					name: "--no-show-forced-updates",
					description:
						"By default, git checks if a branch is force-updated during fetch. Pass --no-show-forced-updates or set fetch.showForcedUpdates to false to skip this check for performance reasons",
				},
				{
					name: ["-4", "--ipv4"],
					description: "Use IPv4 addresses only, ignoring IPv6 addresses",
				},
				{
					name: ["-6", "--ipv6"],
					description: "Use IPv6 addresses only, ignoring IPv4 addresses",
				},
			],
			args: [
				{
					name: "remote",
					isOptional: true,
					generators: gitGenerators.remotes,
					filterStrategy: "fuzzy",
				},
				{
					name: "branch",
					isOptional: true,
					generators: gitGenerators.localBranches,
					filterStrategy: "fuzzy",
				},
			],
		},
		{
			name: "diff",
			description: "Show changes between commits, commit and working tree, etc",
			options: [
				{
					name: "--staged",
					description:
						"Show difference between the files in the staging area and the latest version",
				},
				{
					name: "--cached",
					description: "Show difference between staged changes and last commit",
				},
				{
					name: "--help",
					description: "Shows different options",
				},
				{
					name: "--numstat",
					description:
						"Shows number of added and deleted lines in decimal notation",
				},
				{
					name: "--name-only",
					description: "Show only names of changed files",
				},
				{
					name: "--shortstat",
					description:
						"Output only the last line of the --stat format containing total number of modified files",
				},
				{
					name: "--stat",
					description: "Generate a diffstat",
					requiresSeparator: true,
					args: {
						isOptional: true,
						name: "[=< width >[,< name-width >[,< count >]]]",
					},
				},
				{
					name: "--",
					description:
						"Separates paths from options for disambiguation purposes",
					args: {
						isVariadic: true,
						optionsCanBreakVariadicArg: false,
						template: "filepaths",
						name: "[< path >...]",
					},
				},
			],
			args: {
				name: "commit or file",
				isOptional: true,
				isVariadic: true,
				suggestions: headSuggestions,
				generators: [
					gitGenerators.commits,
					gitGenerators.remoteLocalBranches,
					gitGenerators.getChangedTrackedFiles,
				],
			},
		},
		{
			name: "reset",
			description: "Reset current HEAD to the specified state",
			options: [
				{
					name: "--keep",
					description:
						"Safe: files which are different between the current HEAD and the given commit. Will abort if there are uncommitted changes",
				},
				{
					name: "--soft",
					description:
						"Remove the last commit from the current branch, but the file changes will stay in your working tree",
				},
				{
					name: "--hard",
					description:
						"⚠️WARNING: you will lose all uncommitted changes in addition to the changes introduced in the last commit",
				},
				{
					name: "--mixed",
					description:
						"Keep the changes in your working tree but not on the index",
				},
				{
					name: "-N",
					description: "Mark removed paths as intent-to-add",
					dependsOn: ["--mixed"],
				},
				{
					name: "--merge",
					description:
						"Resets the index and updates the files in the working tree that are different" +
						" between 'commit' and HEAD",
				},
				{
					name: ["-q", "--quiet"],
					description: "Be quiet, only report errors",
					exclusiveOn: ["--no-quiet"],
				},
				{
					name: "--no-quiet",
					description: "Inverse of --quiet",
					exclusiveOn: ["-q", "--quiet"],
				},
				{
					name: "--pathspec-from-file",
					requiresSeparator: true,
					description:
						"Pathspec is passed in file <file> instead of commandline args",
					args: {
						name: "file",
						template: ["folders", "filepaths"],
						suggestions: ["-"],
					},
				},
				{
					name: "--pathspec-file-nul",
					description: "Pathspec elements are separated with NUL character",
					dependsOn: ["--pathspec-from-file"],
				},
				{
					name: ["-p", "--patch"],
					description:
						"Interactively select hunks in the difference between the index and <tree-ish>",
				},
			],
			args: {
				isOptional: true,
				isVariadic: true,
				suggestions: headSuggestions,
				generators: [
					gitGenerators.treeish,
					gitGenerators.commits,
					gitGenerators.remoteLocalBranches,
				],
			},
		},
		{
			name: "log",
			description: "Show commit logs",
			options: [
				{
					name: "--follow",
					description: "Show history of given file",
					args: {
						name: "file",
						template: "filepaths",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Suppress diff output",
				},
				{
					name: "--show-signature",
					description: "Check the validity of a signed commit",
				},
				{
					name: "--source",
					description: "Show source",
				},
				{
					name: "--oneline",
					description: "Show each commit as a single line",
				},
				{
					name: ["-p", "-u", "--patch"],
					description: "Display the full diff of each commit",
				},
				{
					name: "--stat",
					description:
						"Include which files were altered and the relative number of lines that were added or deleted from each of them",
				},
				{
					name: "--grep",
					description:
						"Search for commits with a commit message that matches <pattern>",
					requiresSeparator: true,
					args: {
						name: "pattern",
					},
				},
				{
					name: "--author",
					description: "Search for commits by a particular author",
					requiresSeparator: true,
					args: {
						name: "pattern",
					},
				},
			],
			args: [
				{
					name: "since",
					isOptional: true,
					description: "Commit ID, branch name, HEAD, or revision reference",
					generators: gitGenerators.commits,
					suggestions: headSuggestions,
				},
				{
					name: "until",
					isOptional: true,
					description: "Commit ID, branch name, HEAD, or revision reference",
					generators: gitGenerators.commits,
					suggestions: headSuggestions,
				},
			],
		},
		{
			name: "remote",
			description: "Manage remote repository",
			subcommands: [
				{
					name: "add",
					description: "Add a remote named <name> for the repository at <url>",
					args: [{ name: "name" }, { name: "repository url" }],
					options: [
						{
							name: "-t",
							description: "A refspec to track only <branch> is created",
							args: {
								name: "branch",
							},
						},
						{
							name: "-m",
							description:
								"A symbolic-ref refs/remotes/<name>/HEAD is set up to point at remote’s <master> branch",
							args: {
								name: "master",
							},
						},
						{
							name: "-f",
							description:
								"Git fetch <name> is run immediately after the remote information is set up",
						},
						{
							name: "--tags",
							description:
								"Git fetch <name> imports every tag from the remote repository",
						},
						{
							name: "--no-tags",
							description:
								"Git fetch <name> does not import tags from the remote repository",
						},
						{
							name: "--mirror",
							requiresSeparator: true,
							description: "Create fetch or push mirror",
							args: {
								suggestions: ["fetch", "push"],
							},
						},
					],
				},
				{
					name: "set-head",
					description: "Sets or deletes the default branch",
					args: [
						{
							name: "name",
							generators: gitGenerators.remotes,
							filterStrategy: "fuzzy",
						},
						{
							name: "branch",
							isOptional: true,
						},
					],
					options: [
						{
							name: ["--auto", "-a"],
							description:
								"The remote is queried to determine its HEAD, then the symbolic-ref refs/remotes/<name>/HEAD is set to the same branch",
						},
						{
							name: ["--delete", "-d"],
							description:
								"The symbolic ref refs/remotes/<name>/HEAD is deleted",
						},
					],
				},
				{
					name: "set-branches",
					description:
						"Changes the list of branches tracked by the named remote. This can be used to track a subset of the available remote branches after the initial setup for a remote",
					options: [
						{
							name: "--add",
							description:
								"Instead of replacing the list of currently tracked branches, adds to that list",
						},
					],
					args: [
						{
							name: "name",
							generators: gitGenerators.remotes,
							filterStrategy: "fuzzy",
						},
						{
							name: "branch",
							isVariadic: true,
						},
					],
				},
				{
					name: ["rm", "remove"],
					description: "Removes given remote [name]",
					args: {
						name: "remote",
						generators: gitGenerators.remotes,
						filterStrategy: "fuzzy",
					},
				},
				{
					name: "rename",
					description: "Removes given remote [name]",
					args: [
						{
							name: "old remote",
							generators: gitGenerators.remotes,
							filterStrategy: "fuzzy",
						},
						{
							name: "new remote name",
						},
					],
				},
				{
					name: "get-url",
					description: "Retrieves the URLs for a remote",
					options: [
						{
							name: "--push",
							description: "Push URLs are queried rather than fetch URLs",
						},
						{
							name: "--all",
							description: "All URLs for the remote will be listed",
						},
					],
					args: {
						name: "name",
						generators: gitGenerators.remotes,
						filterStrategy: "fuzzy",
					},
				},
				{
					name: "set-url",
					description: "Changes the URLs for the remote",
					args: [
						{
							name: "name",
							generators: gitGenerators.remotes,
							filterStrategy: "fuzzy",
						},
						{
							name: "newurl",
						},
						{
							name: "oldurl",
							isOptional: true,
						},
					],
					options: [
						{
							name: "--push",
							description: "Push URLs are manipulated instead of fetch URLs",
						},
						{
							name: "--add",
							description:
								"Instead of changing existing URLs, new URL is added",
						},
						{
							name: "--delete",
							description:
								"Instead of changing existing URLs, all URLs matching regex <url> are deleted for remote <name>",
						},
					],
				},
				{
					name: "show",
					description: "Gives some information about the remote [name]",
					args: {
						name: "name",
						isVariadic: true,
						generators: gitGenerators.remotes,
						filterStrategy: "fuzzy",
					},
					options: [
						{
							name: "-n",
							description:
								"The remote heads are not queried first with git ls-remote <name>; cached information is used instead",
						},
					],
				},
				{
					name: "prune",
					description:
						"Equivalent to git fetch --prune [name], except that no new references will be fetched",
					args: {
						name: "name",
						isVariadic: true,
						generators: gitGenerators.remotes,
						filterStrategy: "fuzzy",
					},
					options: [
						{
							name: "-n",
						},
						{
							name: "--dry-run",
							description:
								"Report what branches would be pruned, but do not actually prune them",
						},
					],
				},
				{
					name: "update",
					description:
						"Fetch updates for remotes or remote groups in the repository as defined by remotes.<group>",
					options: [
						{
							name: ["-p", "--prune"],
							description: "",
						},
					],
					args: [
						{
							name: "group",
							isOptional: true,
							isVariadic: true,
						},
						{
							name: "remote",
							isOptional: true,
							isVariadic: true,
						},
					],
				},
			],
			options: [
				{
					name: ["-v", "--verbose"],
					description:
						"Be a little more verbose and show remote url after name. NOTE: This must be placed between remote and subcommand",
				},
			],
		},
		{
			name: "fetch",
			description: "Download objects and refs from another repository",
			args: [
				{
					name: "remote",
					isOptional: true,
					generators: gitGenerators.remotes,
					filterStrategy: "fuzzy",
				},
				{
					name: "branch",
					isOptional: true,
					generators: gitGenerators.localBranches,
					filterStrategy: "fuzzy",
				},
				{
					name: "refspec",
					isOptional: true,
				},
			],
			options: [
				{
					name: "--all",
					description: "Fetch all remotes",
				},
				{
					name: ["-a", "--append"],
					description:
						"Append ref names and object names of fetched refs to the existing contents of .git/FETCH_HEAD",
				},
				{
					name: "--atomic",
					description:
						"Use an atomic transaction to update local refs. Either all refs are updated, or on error, no refs are updated",
				},
				{
					name: "--depth",
					requiresSeparator: true,
					args: {
						name: "depth",
					},
					description:
						"Limit fetching to the specified number of commits from the tip of each remote branch history",
				},
				{
					name: "--deepen",
					requiresSeparator: true,
					args: {
						name: "depth",
					},
					description:
						"Similar to --depth, except it specifies the number of commits from the current shallow boundary instead of from the tip of each remote branch history",
				},
				{
					name: "--shallow-since",
					requiresSeparator: true,
					args: {
						name: "date",
					},
					description:
						"Deepen or shorten the history of a shallow repository to include all reachable commits after <date>",
				},
				{
					name: "--shallow-exclude",
					requiresSeparator: true,
					args: {
						name: "revision",
					},
					description:
						"Deepen or shorten the history of a shallow repository to exclude commits reachable from a specified remote branch or tag. This option can be specified multiple times",
				},
				{
					name: "--unshallow",
					description:
						"If the source repository is shallow, fetch as much as possible so that the current repository has the same history as the source repository",
				},
				{
					name: "--update-shallow",
					description:
						"By default when fetching from a shallow repository, git fetch refuses refs that require updating .git/shallow",
				},
				{
					name: "--negotiation-tip",
					requiresSeparator: true,
					args: {
						name: "commit|glob",
						generators: gitGenerators.commits,
					},
					description:
						"By default, Git will report, to the server, commits reachable from all local refs to find common commits in an attempt to reduce the size of the to-be-received packfile",
				},
				{
					name: "--dry-run",
					description: "Show what would be done, without making any changes",
				},
				{
					name: "--write-fetch-head",
					description:
						"Write the list of remote refs fetched in the FETCH_HEAD file directly under $GIT_DIR. This is the default",
				},
				{
					name: "--no-write-fetch-head",
					description: "Tells Git not to write the file",
				},
				{
					name: ["-f", "--force"],
					description: "This option overrides that check",
				},
				{
					name: ["-k", "--keep"],
					description: "Keep downloaded pack",
				},
				{
					name: "--multiple",
					description:
						"Allow several <repository> and <group> arguments to be specified. No <refspec>s may be specified",
				},
				{
					name: ["--auto-maintenance", "--auto-gc"],
					description:
						"Run git maintenance run --auto at the end to perform automatic repository maintenance if",
				},
				{
					name: ["--no-auto-maintenance", "--no-auto-gc"],
					description:
						"Don't run git maintenance run --auto at the end to perform automatic repository maintenance",
				},
				{
					name: "--write-commit-graph",
					description:
						"Write a commit-graph after fetching. This overrides the config setting fetch.writeCommitGraph",
				},
				{
					name: "--no-write-commit-graph",
					description:
						"Don't write a commit-graph after fetching. This overrides the config setting fetch.writeCommitGraph",
				},
				{
					name: ["-p", "--prune"],
					description:
						"Before fetching, remove any remote-tracking references that no longer exist on the remote",
				},
				{
					name: ["-P", "--prune-tags"],
					description:
						"Before fetching, remove any local tags that no longer exist on the remote if --prune is enabled",
				},
				{
					name: ["-n", "--no-tags"],
					description:
						"By default, tags that point at objects that are downloaded from the remote repository are fetched and stored locally. This option disables this automatic tag following",
				},
				{
					name: "--refmap",
					requiresSeparator: true,
					args: {
						name: "refspec",
					},
					description:
						"When fetching refs listed on the command line, use the specified refspec (can be given more than once) to map the refs to remote-tracking branches, instead of the values of remote.*.fetch configuration variables for the remote repository",
				},
				{
					name: ["-t", "--tags"],
					description:
						"By default, tags that point at objects that are downloaded from the remote repository are fetched and stored locally. This option disables this automatic tag following",
				},
				{
					name: "--recurse-submodules",
					requiresSeparator: true,
					args: {
						name: "mode",
						isOptional: true,
						suggestions: ["yes", "on-demand", "no"],
					},
					description:
						"When fetching refs listed on the command line, use the specified refspec (can be given more than once) to map the refs to remote-tracking branches, instead of the values of remote.*.fetch configuration variables for the remote repository",
				},
				{
					name: ["-j", "--jobs"],
					args: {
						name: "n",
					},
					description:
						"Number of parallel children to be used for all forms of fetching",
				},
				{
					name: "--no-recurse-submodules",
					description:
						"Disable recursive fetching of submodules (this has the same effect as using the --recurse-submodules=no option)",
				},
				{
					name: "--set-upstream",
					description:
						"If the remote is fetched successfully, add upstream (tracking) reference, used by argument-less git-pull[1] and other commands",
				},
				{
					name: "--submodule-prefix",
					requiresSeparator: true,
					args: {
						name: "path",
					},
					description:
						'Prepend <path> to paths printed in informative messages such as ”Fetching submodule foo". This option is used internally when recursing over submodules',
				},
				{
					name: "--recurse-submodules-default",
					requiresSeparator: true,
					args: {
						name: "mode",
						isOptional: true,
						suggestions: ["yes", "on-demand"],
					},
					description:
						"This option is used internally to temporarily provide a non-negative default value for the --recurse-submodules option",
				},
				{
					name: ["-u", "--update-head-ok"],
					description:
						"By default git fetch refuses to update the head which corresponds to the current branch. This flag disables the check. This is purely for the internal use for git pull to communicate with git fetch, and unless you are implementing your own Porcelain you are not supposed to use it",
				},
				{
					name: "--upload-pack",
					args: {
						name: "upload-pack",
					},
					description:
						"When given, and the repository to fetch from is handled by git fetch-pack, --exec=<upload-pack> is passed to the command to specify non-default path for the command run on the other end",
				},
				{
					name: ["-q", "--quiet"],
					description:
						"Pass --quiet to git-fetch-pack and silence any other internally used git commands. Progress is not reported to the standard error stream",
				},
				{
					name: ["-v", "--verbose"],
					description: "Be verbose",
				},
				{
					name: "--progress",
					description:
						"Progress status is reported on the standard error stream by default when it is attached to a terminal, unless -q is specified",
				},
				{
					name: ["-o", "--server-option"],
					args: {
						name: "option",
					},
					description:
						"Transmit the given string to the server when communicating using protocol version 2. The given string must not contain a NUL or LF character",
				},
				{
					name: "--show-forced-updates",
					description:
						"By default, git checks if a branch is force-updated during fetch. This can be disabled through fetch.showForcedUpdates, but the --show-forced-updates option guarantees this check occurs",
				},
				{
					name: "--no-show-forced-updates",
					description:
						"By default, git checks if a branch is force-updated during fetch. Pass --no-show-forced-updates or set fetch.showForcedUpdates to false to skip this check for performance reasons",
				},
				{
					name: ["-4", "--ipv4"],
					description: "Use IPv4 addresses only, ignoring IPv6 addresses",
				},
				{
					name: ["-6", "--ipv6"],
					description: "Use IPv6 addresses only, ignoring IPv4 addresses",
				},
				{
					name: "--stdin",
					description:
						'Read refspecs, one per line, from stdin in addition to those provided as arguments. The "tag <name>" format is not supported',
				},
			],
		},
		{
			name: "stash",
			description: "Temporarily stores all the modified tracked files",
			requiresSubcommand: false,
			subcommands: [
				{
					name: "push", // TODO: support for no subcommand is missing
					description:
						"Save your local modifications to a new stash entry and roll them back to HEAD",
					options: [
						{
							name: ["-p", "--patch"],
							description:
								"Interactively select hunks from the diff between HEAD and the working tree to be stashed",
						},
						{
							name: ["-k", "--keep-index"],
							description:
								"All changed already added to the index are left intact",
						},
						{
							name: ["-u", "--include-untracked"],
							description:
								"All untracked files are also stashed and then cleaned up",
						},
						{
							name: ["-a", "--all"],
							description: "All ignored and untracked files are also stashed",
						},
						{
							name: ["-q", "--quiet"],
							description: "Quiet, suppress feedback messages",
						},
						{
							name: ["-m", "--message"],
							insertValue: "-m {cursor}",
							description: "Use the given <msg> as the stash message",
							args: {
								name: "message",
							},
						},
						{ name: "--pathspec-from-file", description: "" }, // TODO: pathspec file nul and add description
						{
							name: "--",
							description:
								"Separates pathsec from options for disambiguation purposes",
						},
						// TODO: pathspec
					],
				},
				{
					name: "show",
					description: "Show the changes recorded in the stash entry as a diff",
					args: {
						name: "stash",
						isOptional: true,
						generators: gitGenerators.stashes,
						filterStrategy: "fuzzy",
					},
				},
				{
					name: "save",
					description: "Temporarily stores all the modified tracked files",
					options: [
						{
							name: ["-p", "--patch"],
							description:
								"Interactively select hunks from the diff between HEAD and the working tree to be stashed",
						},
						{
							name: ["-k", "--keep-index"],
							description:
								"All changed already added to the index are left intact",
						},
						{
							name: ["-u", "--include-untracked"],
							description:
								"All untracked files are also stashed and then cleaned up",
						},
						{
							name: ["-a", "--all"],
							description: "All ignored and untracked files are also stashed",
						},
						{
							name: ["-q", "--quiet"],
							description: "Quiet, suppress feedback messages",
						},
					],
					args: {
						name: "message",
						isOptional: true,
					},
				},
				{
					name: "pop",
					description: "Restores the most recently stashed files",
					options: [
						{
							name: "--index",
							description:
								"Tries to reinstate not only the working tree's changes, but also the index's ones",
						},
						{
							name: ["-q", "--quiet"],
							description: "Quiet, suppress feedback messages",
						},
					],
					args: {
						name: "stash",
						isOptional: true,
						generators: gitGenerators.stashes,
						filterStrategy: "fuzzy",
					},
				},
				{
					name: "list",
					description: "Lists all stashed changesets",
				},
				{
					name: "drop",
					description: "Discards the most recently stashed changeset",
					options: [
						{
							name: ["-q", "--quiet"],
							description: "Quiet, suppress feedback messages",
						},
					],
					args: {
						name: "stash",
						isOptional: true,
						generators: gitGenerators.stashes,
						filterStrategy: "fuzzy",
					},
				},
				{
					name: "clear",
					description: "Remove all the stash entries",
				},
				{
					name: "apply",
					description:
						"Like pop, but do not remove the state from the stash list",
					options: [
						{
							name: "--index",
							description:
								"Tries to reinstate not only the working tree's changes, but also the index's ones",
						},
						{
							name: ["-q", "--quiet"],
							description: "Quiet, suppress feedback messages",
						},
					],
					args: {
						name: "stash",
						isOptional: true,
						generators: gitGenerators.stashes,
						filterStrategy: "fuzzy",
					},
				},
				{
					name: "branch",
					description: "Creates and checks out a new branch named",
					insertValue: "branch {cursor}",
					args: [
						{
							name: "branch",
							generators: gitGenerators.localBranches,
							filterStrategy: "fuzzy",
						},
						{
							name: "stash",
							isOptional: true,
							generators: gitGenerators.stashes,
							filterStrategy: "fuzzy",
						},
					],
				},
				{
					name: "create",
					description: "Creates a stash entry",
					args: {
						name: "message",
						isOptional: true,
					},
				},
				{
					name: "store",
					description:
						"Store a given stash in the stash ref, updating the stash reflog",
					options: [
						{
							name: ["-m", "--message"],
							insertValue: "-m {cursor}",
							description: "Use the given <msg> as the stash message",
							args: {
								name: "message",
							},
						},
						{
							name: ["-q", "--quiet"],
							description: "Quiet, suppress feedback messages",
						},
					],
					args: [
						{
							name: "message",
						},
						{
							name: "commit",
							generators: gitGenerators.commits,
						},
					],
				},
			],
		},
		{
			name: "reflog",
			description: "Show history of events with hashes",
			options: [
				{
					name: "--relative-date",
					description: "Show date info",
				},
				{
					name: "--all",
					description: "Show all refs",
				},
			],
		},
		{
			name: "clone",
			description: "Clone a repository into a new directory",
			args: [
				{
					name: "repository",
					description: "Git library to be cloned",
				},
				{
					name: "directory",
					description: "Specify the new directory name or target folder",
					template: "folders",
					isOptional: true,
				},
			],
			options: [
				{
					name: ["-l", "--local"],
					description: "Bypasses the normal git aware transport mechanism",
				},
				{
					name: "--no-hardlinks",
					description:
						"Force the cloning process from a repository on a local filesystem to copy the files under the .git/objects directory instead of using hardlinks",
				},
				{
					name: ["-s", "--shared"],
					isDangerous: true,
					description:
						"Automatically setup .git/objects/info/alternates to share the objects with the source repository",
				},
				{
					name: "--dry-run",
					description: "Do nothing; only show what would happen",
				},
				{
					name: "--reference",
					description:
						"If the reference repository is on the local machine, automatically setup",
					args: {
						name: "repository",
					},
				},
				{
					name: "--reference-if-able",
					description:
						"If the reference repository is on the local machine, automatically setup. Non existing directory is skipped with a warning",
					args: {
						name: "repository",
					},
				},
				{
					name: "--dissociate",
					description:
						"Borrow the objects from reference repositories specified with the --reference options only to reduce network transfer, and stop borrowing from them after a clone is made by making necessary local copies of borrowed objects",
				},
				{
					name: ["-q", "--quiet"],
					description:
						"Operate quietly. Progress is not reported to the standard error stream",
				},
				{
					name: ["-v", "--verbose"],
					description:
						"Run verbosely. Does not affect the reporting of progress status to the standard error stream",
				},
				{
					name: "--progress",
					description:
						"Progress status is reported on the standard error stream by default when it is attached to a terminal, unless --quiet is specified. This flag forces progress status even if the standard error stream is not directed to a terminal",
				},
				{
					name: "--server-option",
					description:
						"Transmit the given string to the server when communicating using protocol version 2. The given string must not contain a NUL or LF character. The server’s handling of server options, including unknown ones, is server-specific. When multiple --server-option=<option> are given, they are all sent to the other side in the order listed on the command line",
					requiresSeparator: true,
					args: {
						name: "option",
					},
				},
				{
					name: ["-n", "--no-checkout"],
					description:
						"No checkout of HEAD is performed after the clone is complete",
				},
				{
					name: "--bare",
					description:
						"Make a bare Git repository. That is, instead of creating <directory> and placing the administrative files in <directory>/.git, make the <directory> itself the $GIT_DIR. This obviously implies the --no-checkout because there is nowhere to check out the working tree. Also the branch heads at the remote are copied directly to corresponding local branch heads, without mapping them to refs/remotes/origin/. When this option is used, neither remote-tracking branches nor the related configuration variables are created",
				},
				{
					name: "--sparse",
					description:
						"Initialize the sparse-checkout file so the working directory starts with only the files in the root of the repository. The sparse-checkout file can be modified to grow the working directory as needed",
				},
				{
					name: "--filter",
					description:
						"Use the partial clone feature and request that the server sends a subset of reachable objects according to a given object filter. When using --filter, the supplied <filter-spec> is used for the partial clone filter. For example, --filter=blob:none will filter out all blobs (file contents) until needed by Git. Also, --filter=blob:limit=<size> will filter out all blobs of size at least <size>. For more details on filter specifications, see the --filter option in git-rev-list[1]",
					requiresSeparator: true,
					args: { name: "filter spec" },
				},
				{
					name: "--mirror",
					description:
						"Set up a mirror of the source repository. This implies --bare. Compared to --bare, --mirror not only maps local branches of the source to local branches of the target, it maps all refs (including remote-tracking branches, notes etc.) and sets up a refspec configuration such that all these refs are overwritten by a git remote update in the target repository",
				},
				{
					name: ["-o", "--origin"],
					description:
						"Instead of using the remote name origin to keep track of the upstream repository, use <name>. Overrides clone.defaultRemoteName from the config",
					args: { name: "name" },
				},
				{
					name: ["-b", "--branch"],
					description:
						"Instead of pointing the newly created HEAD to the branch pointed to by the cloned repository’s HEAD, point to <name> branch instead. In a non-bare repository, this is the branch that will be checked out. --branch can also take tags and detaches the HEAD at that commit in the resulting repository",
					args: { name: "branch name" },
				},
				{
					name: ["-u", "--upload-pack"],
					description:
						"When given, and the repository to clone from is accessed via ssh, this specifies a non-default path for the command run on the other end",
					args: {
						name: "upload pack",
					},
				},
				{
					name: "--template",
					description:
						"Specify the directory from which templates will be used",
					requiresSeparator: true,
					args: {
						name: "template directory",
					},
				},
				{
					name: ["-c", "--config"],
					description:
						"Set a configuration variable in the newly-created repository; this takes effect immediately after the repository is initialized, but before the remote history is fetched or any files checked out. The key is in the same format as expected by git-config[1] (e.g., core.eol=true). If multiple values are given for the same key, each value will be written to the config file. This makes it safe, for example, to add additional fetch refspecs to the origin remote. Due to limitations of the current implementation, some configuration variables do not take effect until after the initial fetch and checkout. Configuration variables known to not take effect are: remote.<name>.mirror and remote.<name>.tagOpt. Use the corresponding --mirror and --no-tags options instead",
					args: { name: "key=value" },
				},
				{
					name: "--depth",
					description:
						"Create a shallow clone with a history truncated to the specified number of commits. Implies --single-branch unless --no-single-branch is given to fetch the histories near the tips of all branches. If you want to clone submodules shallowly, also pass --shallow-submodules",
					args: {
						name: "depth",
					},
				},
				{
					name: "--shallow-since",
					description:
						"Create a shallow clone with a history after the specified time",
					requiresSeparator: true,
					args: {
						name: "date",
					},
				},
				{
					name: "--shallow-exclude",
					description:
						"Create a shallow clone with a history, excluding commits reachable from a specified remote branch or tag. This option can be specified multiple times",
					requiresSeparator: true,
					args: {
						name: "revision",
					},
				},
				{
					name: "--single-branch",
					description:
						"Clone only the history leading to the tip of a single branch, either specified by the --branch option or the primary branch remote’s HEAD points at. Further fetches into the resulting repository will only update the remote-tracking branch for the branch this option was used for the initial cloning. If the HEAD at the remote did not point at any branch when --single-branch clone was made, no remote-tracking branch is created",
				},
				{
					name: "--no-single-branch",
					description:
						"Do not clone only the history leading to the tip of a single branch, either specified by the --branch option or the primary branch remote’s HEAD points at. Further fetches into the resulting repository will only update the remote-tracking branch for the branch this option was used for the initial cloning. If the HEAD at the remote did not point at any branch when --single-branch clone was made, no remote-tracking branch is created",
				},
				{
					name: "--no-tags",
					description:
						"Don’t clone any tags, and set remote.<remote>.tagOpt=--no-tags in the config, ensuring that future git pull and git fetch operations won’t follow any tags. Subsequent explicit tag fetches will still work, (see git-fetch[1])",
				},
				{
					name: "--recurse-submodules",
					description:
						"After the clone is created, initialize and clone submodules within based on the provided pathspec. If no pathspec is provided, all submodules are initialized and cloned. This option can be given multiple times for pathspecs consisting of multiple entries",
					args: {
						isOptional: true,
						name: "pathspec",
					},
				},
				{
					name: "--shallow-submodules",
					description:
						"All submodules which are cloned will be shallow with a depth of 1",
				},
				{
					name: "--no-shallow-submodules",
					description: "Disable --shallow-submodules",
				},
				{
					name: "--remote-submodules",
					description:
						"All submodules which are cloned will use the status of the submodule’s remote-tracking branch to update the submodule, rather than the superproject’s recorded SHA-1. Equivalent to passing --remote to git submodule update",
				},
				{
					name: "--no-remote-submodules",
					description: "Disable --remote-submodules",
				},
				{
					name: ["-j", "--jobs"],
					description:
						"The number of submodules fetched at the same time. Defaults to the submodule.fetchJobs option",
					args: {
						name: "n",
						isOptional: true,
					},
				},
				{
					name: "--separate-git-dir",
					description:
						"Instead of placing the cloned repository where it is supposed to be, place the cloned repository at the specified directory, then make a filesystem-agnostic Git symbolic link to there. The result is Git repository can be separated from working tree",
					requiresSeparator: true,
					args: {
						name: "git dir",
					},
				},
			],
		},
		{
			name: "init",
			description:
				"Create an empty Git repository or reinitialize an existing one",
			args: {
				name: "directory",
				isOptional: true,
			},
			options: [
				{
					name: ["-q", "--quiet"],
					description: "Only print error and warning messages",
				},
				{
					name: "--bare",
					description: "Create a bare repository",
				},
				{
					name: "--object-format",
					description: "Specify the given object format",
					args: {
						name: "format",
						suggestions: ["sha1", "sha256"],
					},
				},
				{
					name: "--template",
					description:
						"Specify the directory from which templates will be used",
					args: {
						name: "template_directory",
						template: "folders",
					},
				},
				{
					name: "--separate-git-dir",
					description:
						"Instead of initializing the repository as a directory to either $GIT_DIR or ./.git/, create a text file there containing the path to the actual repository. This file acts as filesystem-agnostic Git symbolic link to the repository",
					args: {
						name: "git dir",
					},
				},
				{
					name: ["-b", "--initial-branch"],
					description: "Initial branch for new repo",
					args: {
						isOptional: true,
						name: "branch-name",
					},
				},
				{
					name: "--shared",
					description:
						"Specify that the Git repository is to be shared amongst several users. This allows users belonging to the same group to push into that repository",
					args: {
						isOptional: true,
						suggestions: [
							{
								name: "false",
								description: "Use permissions reported by umask(2)",
							},
							{
								name: "true",
								description: "Make the repository group-writable",
							},
							{
								name: "umask",
								description: "Use permissions reported by umask(2)",
							},
							{
								name: "group",
								description: "Make the repository group-writable",
							},
							{
								name: "all",
								description:
									"Same as group, but make the repository readable by all users",
							},
							{
								name: "world",
								description:
									"Same as group, but make the repository readable by all users",
							},
							{
								name: "everybody",
								description:
									"Same as group, but make the repository readable by all users",
							},
							{
								name: "0xxx",
								description:
									"0xxx is an octal number and each file will have mode 0xxx. 0xxx will override users' umask(2) value (and not only loosen permissions as group and all does)",
							},
						],
					},
				},
			],
		},
		{
			name: "mv",
			description: "Move or rename a file, a directory, or a symlink",
			args: [
				{
					name: "source",
					description: "File to move",
					template: "filepaths",
				},
				{
					name: "destination",
					description: "Location to move to",
					template: "folders",
				},
			],
			options: [
				{
					name: ["-f", "--force"],
					description:
						"Force renaming or moving of a file even if the target exists",
				},
				{
					name: "-k",
					description:
						"Skip move or rename actions which would lead to an error condition",
				},
				{
					name: ["-n", "--dry-run"],
					description: "Do nothing; only show what would happen",
				},
				{
					name: ["-v", "--verbose"],
					description: "Report the names of files as they are moved",
				},
			],
		},
		{
			name: "rm",
			description: "Remove files from the working tree and from the index",
			args: {
				isVariadic: true,
				suggestions: [
					{
						name: ".",
						description: "Current directory",
						icon: "fig://icon?type=folder",
					},
				],
				generators: gitGenerators.files_for_staging,
			},
			options: [
				{
					name: "--",
					description:
						"Used to separate command-line options from the list of files",
				},
				{ name: "--cached", description: "Only remove from the index" },
				{
					name: ["-f", "--force"],
					description: "Override the up-to-date check",
				},
				{
					name: ["-n", "--dry-run"],
					description:
						"Don’t actually remove any file(s). Instead, just show if they exist in the index and would otherwise be removed by the command",
				},
				{ name: "-r", description: "Allow recursive removal" },
			],
		},
		{
			name: "bisect",
			description: "Use binary search to find the commit that introduced a bug",
			subcommands: [
				{
					name: "start",
					description: "Reset bisect state and start bisection",
					args: [
						{
							name: "bad",
							isOptional: true,
							generators: gitGenerators.revs,
							suggestions: headSuggestions,
						},
						{
							name: "good",
							isOptional: true,
							generators: [gitGenerators.revs, gitGenerators.revs],
							suggestions: headSuggestions,
							isVariadic: true,
						},
					],
					options: [
						{
							name: "--term-new",
							description:
								"Specify the alias to mark commits as new during the bisect process",
							args: {
								name: "term",
								description:
									"Specifying: fixed, would require using git bisect fixed instead of git bisect new",
							},
						},
						{
							name: "--term-bad",
							description:
								"Specify the alias to mark commits as bad during the bisect process",
							args: {
								name: "term",
								description:
									"Specifying: broken, would require using git bisect broken instead of git bisect bad",
							},
						},
						{
							name: "--term-good",
							description:
								"Specify the alias to mark commits as good during the bisect process",
							args: {
								name: "term",
								description:
									"Specifying: fixed, would require using git bisect fixed instead of git bisect good",
							},
						},
						{
							name: "--term-old",
							description:
								"Specify the alias to mark commits as old during the bisect process",
							args: {
								name: "term",
								description:
									"Specifying: broken, would require using git bisect broken instead of git bisect old",
							},
						},
						{
							name: "--no-checkout",
							description:
								"Do not checkout the new working tree at each iteration of the bisection process. Instead just update a special reference named BISECT_HEAD to make it point to the commit that should be tested",
						},
						{
							name: "--first-parent",
							description:
								"Follow only the first parent commit upon seeing a merge commit. In detecting regressions introduced through the merging of a branch, the merge commit will be identified as introduction of the bug and its ancestors will be ignored",
						},
						{
							name: "--",
							description:
								"Stop taking subcommand arguments and options. Starts taking paths to bisect",
						},
					],
				},
				{
					name: "bad",
					description: "Mark commits as bad",
					args: {
						name: "rev",
						isOptional: true,
						generators: gitGenerators.revs,
						suggestions: headSuggestions,
					},
				},
				{
					name: "new",
					description: "Mark commits as new",
					args: {
						name: "rev",
						isOptional: true,
						generators: gitGenerators.revs,
						suggestions: headSuggestions,
					},
				},
				{
					name: "old",
					description: "Mark commits as old",
					args: {
						name: "rev",
						isOptional: true,
						generators: gitGenerators.revs,
						suggestions: headSuggestions,
						isVariadic: true,
					},
				},
				{
					name: "good",
					description: "Mark commits as good",
					args: {
						name: "rev",
						isOptional: true,
						generators: gitGenerators.revs,
						suggestions: headSuggestions,
						isVariadic: true,
					},
				},
				{
					name: "next",
					description: "Find next bisection to test and check it out",
				},
				{
					name: "terms",
					description:
						"Show the terms used for old and new commits (default: bad, good)",
					options: [
						{
							name: "--term-old",
							description: "You can get just the old (respectively new) term",
						},
						{
							name: "--term-good",
							description: "You can get just the old (respectively new) term",
						},
					],
				},
				{
					name: "skip",
					description: "Mark <rev>... untestable revisions",
					args: {
						name: "rev | range",
						isVariadic: true,
						isOptional: true,
						generators: gitGenerators.revs,
						suggestions: headSuggestions,
					},
				},
				{
					name: "reset",
					description: "Finish bisection search and go back to commit",
					args: {
						name: "commit",
						isOptional: true,
						generators: gitGenerators.commits,
						suggestions: headSuggestions,
					},
				},
				{
					name: ["visualize", "view"],
					description: "See the currently remaining suspects in gitk",
				},
				{
					name: "replay",
					description: "Replay bisection log",
					args: {
						name: "logfile",
						template: "filepaths",
					},
				},
				{
					name: "log",
					description: "Show bisect log",
				},
				{
					name: "run",
					description: "Use <cmd>... to automatically bisect",
					args: {
						name: "cmd",
						isVariadic: true,
						isCommand: true,
					},
				},
				{
					name: "help",
					args: {
						name: "Get help text",
					},
				},
			],
			args: {
				name: "paths",
				template: ["filepaths", "folders"],
			},
		},
		{ name: "grep", description: "Print lines matching a pattern" },
		{ name: "show", description: "Show various types of objects" },
		{
			name: "branch",
			description: "List, create, or delete branches",
			options: [
				{
					name: ["-a", "--all"],
					exclusiveOn: ["-r", "--remotes"],
					description: "List both remote-tracking and local branches",
				},
				{
					name: ["-d", "--delete"],
					description: "Delete fully merged branch",
					args: {
						generators: gitGenerators.localOrRemoteBranches,
						isVariadic: true,
						suggestions: [
							{
								name: ["-r", "--remotes"],
								description: "Deletes the remote-tracking branches",
							},
						],
					},
				},
				{
					name: "-D",
					description: "Delete branch (even if not merged)",
					args: {
						generators: gitGenerators.localOrRemoteBranches,
						isVariadic: true,
						suggestions: [
							{
								name: ["-r", "--remotes"],
								description: "Deletes the remote-tracking branches",
							},
						],
					},
				},
				{
					name: ["-m", "--move"],
					description: "Move/rename a branch and its reflog",
					args: [
						{
							generators: gitGenerators.localBranches,
							filterStrategy: "fuzzy",
						},
						{
							generators: gitGenerators.localBranches,
							filterStrategy: "fuzzy",
						},
					],
				},
				{
					name: "-M",
					description: "Move/rename a branch, even if target exists",
					args: [
						{
							generators: gitGenerators.localBranches,
							filterStrategy: "fuzzy",
						},
						{
							generators: gitGenerators.localBranches,
							filterStrategy: "fuzzy",
						},
					],
				},
				{ name: ["-c", "--copy"], description: "Copy a branch and its reflog" },
				{ name: "-C", description: "Copy a branch, even if target exists" },
				{ name: ["-l", "--list"], description: "List branch names" },
				{
					name: "--create-reflog",
					description: "Create the branch's reflog",
				},
				{
					name: "--edit-description",
					description: "Edit the description for the branch",
					args: {
						generators: gitGenerators.localBranches,
						filterStrategy: "fuzzy",
					},
				},
				{
					name: ["-f", "--force"],
					description: "Force creation, move/rename, deletion",
				},
				{
					name: "--merged",
					description: "Print only branches that are merged",
					args: { name: "commit" },
				},
				{
					name: "--no-merged",
					description: "Print only branches that are not merged",
					args: { name: "commit" },
				},
				{
					name: "--column",
					exclusiveOn: ["--no-column"],
					description: "List branches in columns [=<style>]",
				},
				{
					name: "--no-column",
					exclusiveOn: ["--column"],
					description: "Doesn't display branch listing in columns",
				},
				{
					name: "--sort",
					description: "Field name to sort on",
					args: { name: "key" },
				},
				{
					name: "--points-at",
					description: "Print only branches of the object",
					args: { name: "object" },
				},
				{
					name: ["-i", "--ignore-case"],
					description: "Sorting and filtering are case insensitive",
				},
				{
					name: "--format",
					description: "Format to use for the output",
					args: { name: "format" },
				},
				{
					name: ["-r", "--remotes"],
					exclusiveOn: ["-a", "--all"],
					description:
						"Lists or deletes (if used with -d) the remote-tracking branches",
				},
				{
					name: "--show-current",
					description: "Prints the name of the current branch",
				},
				{
					name: ["-v", "--verbose"],
					isRepeatable: 2,
					description:
						"Shows sha1 and commit subject line for each head, along with relationship to upstream branch when in list mode. If given twice, prints the path of the linked worktree and the name of the upstream branch",
				},
				{
					name: ["-q", "--quiet"],
					description: "Suppress non-error messages",
				},
				{
					name: "--abbrev",
					description:
						"Shows the shortest prefix that is at least <n> hexdigits long that uniquely refers the object",
					exclusiveOn: ["--no-abbrev"],
					args: {
						name: "Number",
					},
				},
				{
					name: "--no-abbrev",
					exclusiveOn: ["--abbrev"],
					description: "Displays the full sha1s in the output listing",
				},
				{
					name: ["-t", "--track"],
					exclusiveOn: ["--no-track"],
					description:
						"When creating a new branch, set up 'upstream' configuration",
					args: [
						{
							name: "branch",
							generators: gitGenerators.localBranches,
							filterStrategy: "fuzzy",
						},
						{
							name: "start point",
							isOptional: true,
							generators: gitGenerators.commits,
						},
					],
				},
				{
					name: "--no-track",
					exclusiveOn: ["--track", "-t"],
					description:
						"Do not set up 'upstream' configuration, even if the branch.autoSetupMerge configuration variable is true",
					args: [
						{
							generators: gitGenerators.localBranches,
							filterStrategy: "fuzzy",
						},
						{
							isOptional: true,
							generators: gitGenerators.localBranches,
							filterStrategy: "fuzzy",
						},
					],
				},
				{
					name: ["-u", "--set-upstream-to"],
					description: "Sets branch to upstream provided",
					args: {
						name: "upstream",
						isOptional: true,
						generators: gitGenerators.localBranches,
						filterStrategy: "fuzzy",
					},
				},
				{
					name: "--unset-upstream",
					description: "Removes the upstream information",
					args: {
						name: "upstream",
						isOptional: true,
						generators: gitGenerators.localBranches,
						filterStrategy: "fuzzy",
					},
				},
				{
					name: "--contains",
					description: "Only lists branches which contain the specified commit",
					args: {
						name: "commit",
						isOptional: true,
						generators: gitGenerators.commits,
					},
				},
				{
					name: "--no-contains",
					description:
						"Only lists branches which don't contain the specified commit",
					args: {
						name: "commit",
						isOptional: true,
						generators: gitGenerators.commits,
					},
				},
				{
					name: "--color",
					description:
						"Color branches to highlight current, local, and remote-tracking branches",
					exclusiveOn: ["--no-color"],
					args: {
						name: "when",
						isOptional: true,
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--no-color",
					description: "Turns off branch colors",
					exclusiveOn: ["--color"],
				},
			],
		},
		{
			name: "checkout",
			description: "Switch branches or restore working tree files",
			options: [
				{
					name: ["-q", "--quiet"],
					description: "Quiet, suppress feedback messages",
				},
				{
					name: "--progress",
					description:
						"Progress status is reported on the standard error stream by default when it is attached to a terminal, unless --quiet is specified. This flag enables progress reporting even if not attached to a terminal, regardless of --quiet",
				},
				{
					name: "--no-progress",
					description: "Disable progress status reporting",
				},
				{
					name: ["-f", "--force"],
					description:
						"When switching branches, proceed even if the index or the working tree differs from HEAD. This is used to throw away local changes",
				},
				{
					name: ["-2", "--ours"],
					description:
						"When checking out paths from the index, check out stage #2 (ours) for unmerged paths",
				},
				{
					name: ["-3", "--theirs"],
					description:
						"When checking out paths from the index, check out stage #3 (theirs) for unmerged paths",
				},
				{
					name: "-b",
					description:
						"Create a new branch named <new_branch> and start it at <start_point>; see git-branch[1] for details",
					args: {
						name: "New Branch",
					},
				},
				{
					name: "-B",
					description:
						"Creates the branch <new_branch> and start it at <start_point>; if it already exists, then reset it to <start_point>. This is equivalent to running 'git branch' with '-f'; see git-branch[1] for details",
					args: {
						name: "New Branch",
					},
				},
				{
					name: ["-t", "--track"],
					description:
						"When creating a new branch, set up 'upstream' configuration",
				},
				{
					name: "--no-track",
					description:
						"Do not set up 'upstream' configuration, even if the branch.autoSetupMerge configuration variable is true",
				},
				{
					name: "--guess",
					description:
						"If <branch> is not found but there does exist a tracking branch in exactly one remote (call it <remote>) with a matching name, treat as equivalent to $ git checkout -b <branch> --track <remote>/<branch>",
				},
				{ name: "--no-guess", description: "Disable --guess" },
				{
					name: "-l",
					description:
						"Create the new branch’s reflog; see git-branch[1] for details",
				},
				{
					name: ["-d", "--detach"],
					description:
						"Rather than checking out a branch to work on it, check out a commit for inspection and discardable experiments. This is the default behavior of git checkout <commit> when <commit> is not a branch name",
				},
				{
					name: "--orphan",
					description:
						"Create a new orphan branch, named <new_branch>, started from <start_point> and switch to it",
					args: {
						name: "New Branch",
					},
				},
				{
					name: "--ignore-skip-worktree-bits",
					description:
						"In sparse checkout mode, git checkout -- <paths> would update only entries matched by <paths> and sparse patterns in $GIT_DIR/info/sparse-checkout. This option ignores the sparse patterns and adds back any files in <paths>",
				},
				{
					name: ["-m", "--merge"],
					description:
						"When switching branches, if you have local modifications to one or more files that are different between the current branch and the branch to which you are switching, the command refuses to switch branches in order to preserve your modifications in context",
				},
				{
					name: "--conflict",
					description:
						"The same as --merge option above, but changes the way the conflicting hunks are presented, overriding the merge.conflictStyle configuration variable. Possible values are 'merge' (default) and 'diff3' (in addition to what is shown by 'merge' style, shows the original contents)",
					requiresSeparator: true,
					args: {
						isOptional: true,
						suggestions: ["merge", "diff3"],
					},
				},
				{
					name: ["-p", "--patch"],
					description:
						"Interactively select hunks in the difference between the <tree-ish> (or the index, if unspecified) and the working tree",
				},
				{
					name: "--ignore-other-worktrees",
					description:
						"Git checkout refuses when the wanted ref is already checked out by another worktree. This option makes it check the ref out anyway. In other words, the ref can be held by more than one worktree",
				},
				{
					name: "--overwrite-ignore",
					description:
						"Silently overwrite ignored files when switching branches. This is the default behavior",
				},
				{
					name: "--no-overwrite-ignore",
					description:
						"Use --no-overwrite-ignore to abort the operation when the new branch contains ignored files",
				},
				{
					name: "--recurse-submodules",
					description:
						"Using --recurse-submodules will update the content of all active submodules according to the commit recorded in the superproject. If local modifications in a submodule would be overwritten the checkout will fail unless -f is used. If nothing (or --no-recurse-submodules) is used, submodules working trees will not be updated. Just like git-submodule[1], this will detach HEAD of the submodule",
				},
				{
					name: "--no-recurse-submodules",
					description: "Submodules working trees will not be updated",
				},
				{
					name: "--overlay",
					description:
						"In the default overlay mode, git checkout never removes files from the index or the working tree",
				},
				{
					name: "--no-overlay",
					description:
						"When specifying --no-overlay, files that appear in the index and working tree, but not in <tree-ish> are removed, to make them match <tree-ish> exactly",
				},
				{
					name: "--pathspec-from-file",
					description:
						"Pathspec is passed in <file> instead of commandline args",
					args: {
						name: "file",
						template: "filepaths",
					},
				},
				{
					name: "--pathspec-file-nul",
					description: "Only meaningful with --pathspec-from-file",
				},
			],
			args: [
				{
					name: "branch, file, tag or commit",
					description: "Branch, file, tag or commit to switch to",
					isOptional: true,
					filterStrategy: "fuzzy",
					generators: [
						gitGenerators.remoteLocalBranches,
						gitGenerators.tags,
						{ template: ["filepaths", "folders"] },
					],
					suggestions: [
						{
							name: "-",
							description: "Switch to the last used branch",
							icon: "fig://icon?type=git",
						},
						{
							name: "--",
							description: "Do not interpret more arguments as options",
							hidden: true,
						},
					],
				},
				{
					name: "pathspec",
					description: "Limits the paths affected by the operation",
					isOptional: true,
					isVariadic: true,
					template: "filepaths",
				},
			],
		},
		{
			name: "cherry-pick",
			description: "Apply the changes introduced by some existing commits",
			args: {
				name: "commit",
				description: "Commits to cherry-pick",
				isVariadic: true,
				generators: gitGenerators.commits,
			},
			options: [
				{
					name: "--continue",
					description:
						"Continue the operation in progress using the information in .git/sequencer",
				},
				{
					name: "--skip",
					description:
						"Skip the current commit and continue with the rest of the sequence",
				},
				{
					name: "--quit",
					description: "Forget about the current operation in progress",
				},
				{
					name: "--abort",
					description:
						"Cancel the operation and return to the pre-sequence state",
				},
				{
					name: ["-e", "--edit"],
					description:
						"With this option, git cherry-pick will let you edit the commit message prior to committing",
				},
				{
					name: "--cleanup",
					description:
						"This option determines how the commit message will be cleaned up before being passed on to the commit machinery",
					args: {
						name: "mode",
						description:
							"Determines how the supplied commit messaged should be cleaned up before committing",
						suggestions: [
							{
								name: "strip",
								description:
									"Strip leading and trailing empty lines, trailing whitepace, commentary and collapse consecutive empty lines",
							},
							{
								name: "whitespace",
								description: "Same as strip except #commentary is not removed",
							},
							{
								name: "verbatim",
								description: "Do not change the message at all",
							},
							{
								name: "scissors",
								description:
									"Same as whitespace except that everything from (and including) the line found below is truncated",
							},
							{
								name: "default",
								description:
									"Same as strip if the message is to be edited. Otherwise whitespace",
							},
						],
					},
				},
				{
					name: "-x",
					description:
						'When recording the commit, append a line that says "(cherry picked from commit ...)" to the original commit message in order to indicate which commit this change was cherry-picked from',
				},
				{
					name: ["-m", "--mainline"],
					description:
						"Specifies the parent number (starting from 1) of the mainline and allows cherry-pick to replay the change relative to the specified parent",
					args: {
						name: "parent-number",
					},
				},
				{
					name: ["-n", "--no-commit"],
					description:
						"Applies changes necessary to cherry-pick each named commit to your working tree and the index without making any commit",
				},
				{
					name: ["-s", "--signoff"],
					description:
						"Add a Signed-off-by trailer at the end of the commit message",
				},
				{
					name: ["-S", "--gpg-sign"],
					exclusiveOn: ["--no-gpg-sign"],
					description: "GPG-sign commits",
					args: {
						name: "keyid",
						description: "Must be stuck to the option without a space",
						isOptional: true,
					},
				},
				{
					name: "--no-gpg-sign",
					exclusiveOn: ["-S", "--gpg-sign"],
					description:
						"Useful to countermand both commit.gpgSign configuration variable, and earlier --gpg-sign",
				},
				{
					name: "--ff",
					description:
						"If the current HEAD is the same as the parent of the cherry-pick'ed commit, the a fast forward to this commit will be performed",
				},
				{
					name: "--allow-empty",
					description:
						"Allow empty commits to be preserved automatically in a cherry-pick",
				},
				{
					name: "--allow-empty-message",
					description: "Allow commits with empty messages to be cherry picked",
				},
				{
					name: "--keep-redundant-commits",
					description: "Creates an empty commit object. Implies --allow-empty",
				},
				{
					name: "--strategy",
					description: "Use the given merge strategy. Should only be used once",
					args: {
						name: "strategy",
						suggestions: ["resolve", "recursive", "octopus", "ours", "subtree"],
					},
				},
				{
					name: ["-X", "--strategy-option"],
					description:
						"Pass the merge strategy-specific option through to the merge strategy",
					args: {
						name: "option",
						suggestions: [
							"ours",
							"theirs",
							"patience",
							"diff-algorithm",
							"diff-algorithm=patience",
							"diff-algorithm=minimal",
							"diff-algorithm=histogram",
							"diff-algorithm=myers",
							"ignore-space-change",
							"ignore-all-space",
							"ignore-space-at-eol",
							"ignore-cr-at-eol",
							"renormalize",
							"no-renormalize",
							"no-renames",
							"find-renames",
							"subtree",
						],
					},
				},
				{
					name: "--rerere-autoupdate",
					exclusiveOn: ["--no-rerere-autoupdate"],
					description:
						"Allow the rerere mechanism to update the index with the result of auto-conflict resolution if possible",
				},
				{
					name: "--no-rerere-autoupdate",
					exclusiveOn: ["--rerere-autoupdate"],
					description:
						"Do not allow the rerere mechanism to update the index with the result of auto-conflict resolution if possible",
				},
			],
		},
		{
			name: "submodule",
			description: "Initialize, update or inspect submodules",
			subcommands: [
				{
					name: "add",
					description:
						"Add the given repository as a submodule at the given path to the changeset to be committed next to the current project",
					options: [
						{
							name: "-b",
							description: "Branch of repository to add as submodule",
							args: {
								name: "branch",
							},
						},
						{
							name: ["-f", "--force"],
							description: "Allow adding an otherwise ignored submodule path",
						},
						{
							name: "--name",
							description:
								"It sets the submodule’s name to the given string instead of defaulting to its path",
							insertValue: "--name '{cursor}'",
							args: {
								name: "name",
								description: "Directory name",
							},
						},
						{
							name: "--reference",
							description: "Remote repository to be cloned",
							args: {
								name: "repository",
								description: "Remote repository to be cloned",
							},
						},
						{
							name: "--depth",
							description:
								"Create a shallow clone with a history truncated to the specified number of revisions",
							args: {
								name: "depth",
								description: "Specified number of revisions",
							},
						},
						{
							name: "--",
							description: "End of subcommand options",
						},
					],
					args: [
						{
							name: "repository",
						},
						{
							name: "path",
							isOptional: true,
							template: "filepaths",
						},
					],
				},
				{
					name: "status",
					description: "Show the status of the submodules",
					options: [
						{
							name: "--cached",
							description:
								"Will instead print the SHA-1 recorded in the superproject for each submodule",
						},
						{
							name: "--recursive",
							description:
								"Will recurse into nested submodules, and show their status as well",
						},
						{
							name: "--",
							description: "End of subcommand options",
						},
					],
					args: {
						name: "path",
						isOptional: true,
						isVariadic: true,
						template: "filepaths",
					},
				},
				{
					name: "init",
					description: "Initialize the submodules recorded in the index",
					options: [
						{
							name: "--",
							description: "End of subcommand options",
						},
					],
					args: {
						name: "path",
						isOptional: true,
						isVariadic: true,
						template: "filepaths",
					},
				},
				{
					name: "deinit",
					description: "Unregister the given submodules",
					options: [
						{
							name: ["-f", "--force"],
							description:
								"The submodule’s working tree will be removed even if it contains local modifications",
						},
						{
							name: "--all",
							description: "Unregister all submodules in the working tree",
						},
						{
							name: "--",
							description: "End of subcommand options",
						},
					],
					args: {
						name: "path",
						isOptional: true,
						isVariadic: true,
						template: "filepaths",
					},
				},
				{
					name: "update",
					description:
						"Update the registered submodules to match what the superproject expects by cloning missing submodules, fetching missing commits in submodules and updating the working tree of the submodules",
					options: [
						{
							name: "--init",
							description:
								"Initialize all submodules for which 'git submodule init' has not been called so far before updating",
						},
						{
							name: "--remote",
							description:
								"Instead of using the superproject’s recorded SHA-1 to update the submodule, use the status of the submodule’s remote-tracking branch",
						},
						{
							name: ["-N", "--no-fetch"],
							description: "Don’t fetch new objects from the remote site",
						},
						{
							name: "--no-recommend-shallow",
							description: "Ignore the suggestions",
						},
						{
							name: "--recommend-shallow",
							description:
								"The initial clone of a submodule will use the recommended submodule.<name>.shallow as provided by the .gitmodules file",
						},
						{
							name: ["-f", "--force"],
							description:
								"Throw away local changes in submodules when switching to a different commit; and always run a checkout operation in the submodule, even if the commit listed in the index of the containing repository matches the commit checked out in the submodule",
						},
						{
							name: "--checkout",
							description:
								"The commit recorded in the superproject will be checked out in the submodule on a detached HEAD",
						},
						{
							name: "--rebase",
							description:
								"The current branch of the submodule will be rebased onto the commit recorded in the superproject",
						},
						{
							name: "--merge",
							description:
								"The commit recorded in the superproject will be merged into the current branch in the submodule",
						},
						{
							name: "--reference",
							description: "Remote repository",
							args: {
								name: "repository",
							},
						},
						{
							name: "--depth",
							description:
								"Create a shallow clone with a history truncated to the specified number of revisions",
							args: {
								name: "depth",
							},
						},
						{
							name: "--recursive",
							description: "Traverse submodules recursively",
						},
						{
							name: "--jobs",
							description: "Clone new submodules in parallel with as many jobs",
							args: {
								name: "n",
							},
						},
						{
							name: "--single-branch",
							description:
								"Clone only one branch during update: HEAD or one specified by --branch",
						},
						{
							name: "--no-single-branch",
							description:
								"Don't clone only one branch during update: HEAD or one specified by --branch",
						},
						{ name: "--", description: "End of subcommand options" },
					],
					args: {
						name: "path",
						isOptional: true,
						isVariadic: true,
						template: "filepaths",
					},
				},
				{
					name: "set-branch",
					description:
						"Sets the default remote tracking branch for the submodule",
					options: [
						{
							name: ["-b", "--branch"],
							description: "Branch of repository to add as submodule",
							args: {
								name: "branch",
								description: "Remote branch to be specified",
							},
						},
						{
							name: ["-d", "--default"],
							description:
								"Removes the submodule.<name>.branch configuration key, which causes the tracking branch to default to the remote HEAD",
						},
						{
							name: "--",
							description: "End of subcommand options",
						},
					],
					args: {
						name: "path",
						description: "Path to submodule",
						template: "filepaths",
					},
				},
				{
					name: "set-url",
					description: "Sets the URL of the specified submodule to <newurl>",
					options: [
						{
							name: "--",
							description: "End of command options",
						},
					],
					args: [
						{
							name: "path",
							description: "Path to specified submodule",
							template: "filepaths",
						},
						{
							name: "newurl",
							description: "New url of submodule",
						},
					],
				},
				{
					name: "summary",
					description:
						"Show commit summary between the given commit (defaults to HEAD) and working tree/index",
					options: [
						{
							name: "--cached",
							description:
								"This command will recurse into the registered submodules, and sync any nested submodules within",
						},
						{
							name: "--files",
							description:
								"Show the series of commits in the submodule between the index of the super project and the working tree of the submodule",
						},
						{
							name: "-n",
							description:
								"Limit the summary size (number of commits shown in total). Giving 0 will disable the summary; a negative number means unlimited (the default). This limit only applies to modified submodules. The size is always limited to 1 for added/deleted/typechanged submodules",
							args: {
								name: "n",
							},
						},
						{
							name: "--summary-limit",
							description:
								"Limit the summary size (number of commits shown in total). Giving 0 will disable the summary; a negative number means unlimited (the default). This limit only applies to modified submodules. The size is always limited to 1 for added/deleted/typechanged submodules",
							args: {
								name: "n",
							},
						},
						{
							name: "--",
							description: "Everything after this is an argument",
						},
					],
					args: [
						{
							name: "commit",
							isOptional: true,
						},
						{
							name: "path",
							isOptional: true,
							isVariadic: true,
							template: "filepaths",
						},
					],
				},
				{
					name: "foreach",
					description:
						"Evaluates an arbitrary shell command in each checked out submodule",
					options: [
						{
							name: "--recursive",
							description:
								"This command will recurse into the registered submodules, and sync any nested submodules within",
						},
					],
					args: {
						name: "command",
					},
				},
				{
					name: "sync",
					description:
						"Synchronizes submodules' remote URL configuration setting to the value specified in .gitmodules",
					options: [
						{
							name: "--recursive",
							description:
								"This command will recurse into the registered submodules, and sync any nested submodules within",
						},
						{
							name: "--",
							description: "Everything after this is an argument",
						},
					],
					args: {
						name: "path",
						isOptional: true,
						isVariadic: true,
						template: "filepaths",
					},
				},
				{
					name: "absorbgitdirs",
					description:
						"If a git directory of a submodule is inside the submodule, move the git directory of the submodule into its superproject’s $GIT_DIR/modules path and then connect the git directory and its working directory by setting the core.worktree and adding a .git file pointing to the git directory embedded in the superprojects git directory",
				},
			],
			options: [
				{
					name: ["-q", "--quiet"],
					description: "Only print error messages",
				},
				{
					name: "--cached",
					description: "The commit stored in the index is used instead",
				},
			],
		},
		{
			name: "merge",
			description: "Join two or more development histories together",
			args: {
				name: "branch",
				filterStrategy: "fuzzy",
				generators: gitGenerators.remoteLocalBranches,
				isVariadic: true,
				isOptional: true,
				// A single dash can be used as arg to merge as short hand for the previous branch
				// https://github.com/git/git/blob/master/Documentation/RelNotes/1.7.6.txt#L84
				suggestions: [
					{ name: "-", description: "Shorthand for the previous branch" },
				],
			},
			options: [
				{
					name: "--commit",
					description:
						"Perform the merge and commit the result. This option can be used to override --no-commit",
				},
				{
					name: "--no-commit",
					description:
						"Perform the merge and stop just before creating a merge commit, to give the user a chance to inspect and further tweak the merge result before committing",
				},
				{
					name: ["--edit", "-e"],
					description:
						"Invoke an editor before committing successful mechanical merge to further edit the auto-generated merge message, so that the user can explain and justify the merge",
				},
				{
					name: "--no-edit",
					description:
						"The --no-edit option can be used to accept the auto-generated message (this is generally discouraged). The --edit (or -e) option is still useful if you are giving a draft message with the -m option from the command line and want to edit it in the editor",
				},
				{
					name: "--cleanup",
					description:
						"This option determines how the merge message will be cleaned up before committing. See git-commit[1] for more details. In addition, if the <mode> is given a value of scissors, scissors will be appended to MERGE_MSG before being passed on to the commit machinery in the case of a merge conflict",
					requiresSeparator: true,
					args: {
						name: "mode",
						suggestions: [
							"strip",
							"whitespace",
							"verbatim",
							"scissors",
							"default",
						],
					},
				},
				{
					name: "--ff",
					description:
						"When possible resolve the merge as a fast-forward (only update the branch pointer to match the merged branch; do not create a merge commit). When not possible (when the merged-in history is not a descendant of the current history), create a merge commit",
				},
				{
					name: "--no-ff",
					description:
						"Create a merge commit in all cases, even when the merge could instead be resolved as a fast-forward",
				},
				{
					name: "--ff-only",
					description:
						"Resolve the merge as a fast-forward when possible. When not possible, refuse to merge and exit with a non-zero status",
				},
				{
					name: ["-S", "--gpg-sign"],
					description:
						"GPG-sign the resulting merge commit. The keyid argument is optional and defaults to the committer identity; if specified, it must be stuck to the option without a space",
					args: {
						name: "keyid",
						isOptional: true,
					},
				},
				{
					name: "--no-gpg-sign",
					description:
						"Is useful to countermand both commit.gpgSign configuration variable, and earlier --gpg-sign",
				},
				{
					name: "--log",
					description:
						"In addition to branch names, populate the log message with one-line descriptions from at most <n> actual commits that are being merged. See also git-fmt-merge-msg[1]",
					args: {
						name: "n",
						isOptional: true,
					},
				},
				{
					name: "--no-log",
					description:
						"Do not list one-line descriptions from the actual commits being merged",
				},
				{
					name: "--signoff",
					description:
						"Add a Signed-off-by trailer by the committer at the end of the commit log message. The meaning of a signoff depends on the project to which you’re committing. For example, it may certify that the committer has the rights to submit the work under the project’s license or agrees to some contributor representation, such as a Developer Certificate of Origin. (See http://developercertificate.org for the one used by the Linux kernel and Git projects.) Consult the documentation or leadership of the project to which you’re contributing to understand how the signoffs are used in that project",
				},
				{
					name: "--no-signoff",
					description:
						"Can be used to countermand an earlier --signoff option on the command line",
				},
				{
					name: "--stat",
					description:
						"Show a diffstat at the end of the merge. The diffstat is also controlled by the configuration option merge.stat",
				},
				{
					name: ["-n", "--no-stat"],
					description: "Do not show a diffstat at the end of the merge",
				},
				{
					name: "--squash",
					description:
						"With --squash, --commit is not allowed, and will fail. Produce the working tree and index state as if a real merge happened (except for the merge information), but do not actually make a commit, move the HEAD, or record $GIT_DIR/MERGE_HEAD (to cause the next git commit command to create a merge commit). This allows you to create a single commit on top of the current branch whose effect is the same as merging another branch (or more in case of an octopus)",
				},
				{
					name: "--no-squash",
					description:
						"Perform the merge and commit the result. This option can be used to override --squash",
				},
				{
					name: "--no-verify",
					description:
						"This option bypasses the pre-merge and commit-msg hooks. See also githooks[5]",
				},
				{
					name: ["-s", "--strategy"],
					description:
						"Use the given merge strategy; can be supplied more than once to specify them in the order they should be tried. If there is no -s option, a built-in list of strategies is used instead (git merge-recursive when merging a single head, git merge-octopus otherwise)",
					args: {
						name: "strategy",
						isVariadic: true,
						suggestions: ["resolve", "recursive", "octopus", "ours", "subtree"],
					},
				},
				{
					name: ["-X", "--strategy-option"],
					description:
						"Pass merge strategy specific option through to the merge strategy",
					args: {
						name: "option",
						suggestions: [
							"ours",
							"theirs",
							"patience",
							"diff-algorithm",
							"diff-algorithm=patience",
							"diff-algorithm=minimal",
							"diff-algorithm=histogram",
							"diff-algorithm=myers",
							"ignore-space-change",
							"ignore-all-space",
							"ignore-space-at-eol",
							"ignore-cr-at-eol",
							"renormalize",
							"no-renormalize",
							"no-renames",
							"find-renames",
							"subtree",
						],
					},
				},
				{
					name: "--verify-signatures",
					description:
						"Verify that the tip commit of the side branch being merged is signed with a valid key, i.e. a key that has a valid uid: in the default trust model, this means the signing key has been signed by a trusted key. If the tip commit of the side branch is not signed with a valid key, the merge is aborted",
				},
				{
					name: "--no-verify-signatures",
					description:
						"Do not verify that the tip commit of the side branch being merged is signed with a valid key",
				},
				{
					name: "--summary",
					description:
						"Synonym to --stat ; this is deprecated and will be removed in the future",
				},
				{
					name: "--no-summary",
					description:
						"Synonym to --no-stat ; this is deprecated and will be removed in the future",
				},
				{
					name: ["-q", "--quiet"],
					description: "Operate quietly. Implies --no-progress",
				},
				{ name: ["-v", "--verbose"], description: "Be verbose" },
				{
					name: "--progress",
					description:
						"Turn progress on/off explicitly. If neither is specified, progress is shown if standard error is connected to a terminal. Note that not all merge strategies may support progress reporting",
				},
				{
					name: "--no-progress",
					description:
						"Turn progress on/off explicitly. If neither is specified, progress is shown if standard error is connected to a terminal. Note that not all merge strategies may support progress reporting",
				},
				{
					name: "--autostash",
					description:
						"Automatically create a temporary stash entry before the operation begins, and apply it after the operation ends. This means that you can run the operation on a dirty worktree. However, use with care: the final stash application after a successful merge might result in non-trivial conflicts",
				},
				{
					name: "--no-autostash",
					description:
						"Do not automatically create a temporary stash entry before the operation begins, and apply it after the operation ends",
				},
				{
					name: "--allow-unrelated-histories",
					description:
						"By default, git merge command refuses to merge histories that do not share a common ancestor. This option can be used to override this safety when merging histories of two projects that started their lives independently. As that is a very rare occasion, no configuration variable to enable this by default exists and will not be added",
				},
				{
					name: "-m",
					description:
						"Set the commit message to be used for the merge commit (in case one is created). If --log is specified, a shortlog of the commits being merged will be appended to the specified message. The git fmt-merge-msg command can be used to give a good default for automated git merge invocations. The automated message can include the branch description",
					args: {
						name: "message",
					},
				},
				{
					name: ["-F", "--file"],
					description:
						"Read the commit message to be used for the merge commit (in case one is created). If --log is specified, a shortlog of the commits being merged will be appended to the specified message",
					args: {
						name: "file",
						template: "filepaths",
					},
				},
				{
					name: "--rerere-autoupdate",
					description:
						"Allow the rerere mechanism to update the index with the result of auto-conflict resolution if possible",
				},
				{
					name: "--no-rerere-autoupdate",
					description:
						"Do not allow the rerere mechanism to update the index with the result of auto-conflict resolution if possible",
				},
				{
					name: "--overwrite-ignore",
					description:
						"Silently overwrite ignored files from the merge result. This is the default behavior. Use --no-overwrite-ignore to abort",
				},
				{
					name: "--no-overwrite-ignore",
					description:
						"Do not silently overwrite ignored files from the merge result",
				},
				{
					name: "--abort",
					description:
						"Abort the current conflict resolution process, and try to reconstruct the pre-merge state. If an autostash entry is present, apply it to the worktree. If there were uncommitted worktree changes present when the merge started, git merge --abort will in some cases be unable to reconstruct these changes. It is therefore recommended to always commit or stash your changes before running git merge. git merge --abort is equivalent to git reset --merge when MERGE_HEAD is present unless MERGE_AUTOSTASH is also present in which case git merge --abort applies the stash entry to the worktree whereas git reset --merge will save the stashed changes in the stash list",
				},
				{
					name: "--quit",
					description:
						"Forget about the current merge in progress. Leave the index and the working tree as-is. If MERGE_AUTOSTASH is present, the stash entry will be saved to the stash list",
				},
				{
					name: "--continue",
					description:
						"After a git merge stops due to conflicts you can conclude the merge by running git merge --continue (see 'HOW TO RESOLVE CONFLICTS' section below)",
				},
			],
		},
		{
			name: "mergetool",
			description: "Open the git tool to fix conflicts",
		},
		{
			name: "tag",
			description:
				"Create, list, delete or verify a tag object signed with GPG",
			options: [
				{ name: ["-l", "--list"], description: "List tag names" },
				{
					name: "-n",
					description: "Print <n> lines of each tag message",
					args: {
						name: "n",
						suggestions: [{ name: "1" }, { name: "2" }, { name: "3" }],
					},
				},
				{ name: ["-d", "--delete"], description: "Delete tags" },
				{ name: ["-v", "--verify"], description: "Verify tags" },
				{
					name: ["-a", "--annotate"],
					description: "Annotated tag, needs a message",
				},
				{
					name: ["-m", "--message"],
					insertValue: "-m '{cursor}'",
					description: "Tag message",
					args: { name: "message" },
				},
				{
					name: "--points-at",
					description: "List tags of the given object",
					args: {
						name: "object",
						generators: gitGenerators.commits,
						suggestions: headSuggestions,
					},
				},
			],
			args: {
				name: "tagname",
				description: "Select a tag",
				generators: gitGenerators.tags,
				isOptional: true,
			},
		},
		{
			name: "restore",
			description: "Restore working tree files",
			options: [
				{
					name: ["-s", "--source"],
					description:
						"Restore the working tree files with the content from the given tree",
					args: {
						name: "tree",
					},
				},
				{
					name: ["-p", "--patch"],
					description:
						"Interactively select hunks in the difference between the restore source and the restore location",
				},
				{
					name: ["-W", "--worktree"],
					description: "Use the worktree as the restore location",
				},
				{
					name: ["-S", "--staged"],
					description: "Use staging as the restore location",
				},
				{
					name: ["-q", "--quiet"],
					description: "Quiet, suppress feedback messages",
				},
				{
					name: "--progress",
					description:
						"Progress status is reported on the standard error stream by default when it is attached to a terminal",
				},
				{
					name: "--no-progress",
					description: "Disable progress status reporting",
				},
				{
					name: ["-2", "--ours"],
					description:
						"When restoring paths from the index, check out stage #2 (ours) for unmerged paths",
					exclusiveOn: ["--theirs"],
				},
				{
					name: ["-3", "--theirs"],
					description:
						"When re out paths from the index, check out stage #3 (theirs) for unmerged paths",
					exclusiveOn: ["--ours"],
				},
				{
					name: ["-m", "--merge"],
					description:
						"When restoring files on the working tree from the index, recreate the conflicted merge in the unmerged paths",
				},
				{
					name: "--conflict",
					description:
						"The same as --merge option, but changes the way the conflicting hunks are presented",
					args: {
						name: "style",
						suggestions: ["merge", "diff3"],
					},
				},
				{
					name: "--ignore-unmerged",
					description:
						"When restoring files on the working tree from the index, do not abort the operation if there are unmerged entries",
					exclusiveOn: ["--ours", "--theirs", "--merge", "--conflict"],
				},
				{
					name: "--ignore-skip-worktree-bits",
					description:
						"In sparse checkout mode, by default is to only update entries matched by <pathspec> and sparse patterns in $GIT_DIR/info/sparse-checkout",
				},
				{
					name: "--recurse-submodules",
					description:
						"If <pathspec> names an active submodule and the restore location includes the working tree, the submodule will only be updated if this option is given, in which case its working tree will be restored to the commit recorded in the superproject, and any local modifications overwritten",
					exclusiveOn: ["--no-recurse-submodules"],
				},
				{
					name: "--no-recurse-submodules",
					description: "Submodules working trees will not be updated",
					exclusiveOn: ["--recurse-submodules"],
				},
				{
					name: "--overlay",
					description:
						"In overlay mode, the command never removes files when restoring",
					exclusiveOn: ["--no-overlay"],
				},
				{
					name: "--no-overlay",
					description:
						"In no-overlay mode, tracked files that do not appear in the --source tree are removed, to make them match <tree> exactly",
					exclusiveOn: ["--overlay"],
				},
				{
					name: "--pathspec-from-file",
					description:
						"Pathspec is passed in <file> instead of commandline args. If <file> is exactly - then standard input is used",
					args: {
						name: "file",
						template: "filepaths",
					},
				},
				{
					name: "--pathspec-file-nul",
					description:
						"Only meaningful with --pathspec-from-file. Pathspec elements are separated with NUL character and all other characters are taken literally (including newlines and quotes)",
				},
				{
					name: "--",
					description: "Do not interpret any more arguments as options",
				},
			],
			args: {
				name: "pathspec",
				isOptional: true,
				isVariadic: true,
				generators: gitGenerators.files_for_staging,
			},
		},
		{
			name: "switch",
			description: "Switch branches",
			options: [
				{
					name: ["-c", "--create"],
					description:
						"Create a new branch named <new-branch> starting at <start-point> before switching to the branch",
					args: [
						{
							name: "new branch",
						},
						{
							name: "start point",
							isOptional: true,
							generators: gitGenerators.commits,
						},
					],
				},
				{
					name: ["-C", "--force-create"],
					description:
						"Similar to --create except that if <new-branch> already exists it will be reset to <start-point>",
					args: [
						{
							name: "new branch",
						},
						{
							name: "start point",
							isOptional: true,
							generators: gitGenerators.commits,
						},
					],
				},
				{
					name: ["-d", "--detach"],
					description:
						"Switch to a commit for inspection and discardable experiments",
				},
				{
					name: "--guess",
					description:
						"If <branch> is not found but there does exist a tracking branch in exactly one remote (call it <remote>) with a matching name",
				},
				{
					name: "--no-guess",
					description: "Disable --guess",
				},
				{
					name: ["-f", "--force"],
					description: "An alias for --discard-changes",
					isDangerous: true,
				},
				{
					name: "--discard-changes",
					description:
						"Proceed even if the index or the working tree differs from HEAD. Both the index and working tree are restored to match the switching target",
					isDangerous: true,
				},
				{
					name: ["-m", "--merge"],
					description:
						"If you have local modifications to one or more files that are different between the current branch and the branch to which you are switching, the command refuses to switch branches in order to preserve your modifications in context",
				},
				{
					name: "--conflict",
					description:
						"The same as --merge option above, but changes the way the conflicting hunks are presented, overriding the merge.conflictStyle configuration variable",
					args: {
						name: "style",
						suggestions: ["merge", "diff3"],
						default: "merge",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Quiet, suppress feedback messages",
				},
				{
					name: "--progress",
					description:
						"Progress status is reported on the standard error stream by default when it is attached to a terminal",
				},
				{
					name: "--no-progress",
					description: "Disable progress status reporting",
				},
				{
					name: ["-t", "--track"],
					exclusiveOn: ["--no-track"],
					description:
						"When creating a new branch, set up 'upstream' configuration",
					args: [
						{
							name: "branch",
							generators: gitGenerators.localBranches,
							filterStrategy: "fuzzy",
						},
						{
							name: "start point",
							isOptional: true,
							generators: gitGenerators.commits,
						},
					],
				},
				{
					name: "--no-track",
					exclusiveOn: ["--track", "-t"],
					description:
						"Do not set up 'upstream' configuration, even if the branch.autoSetupMerge configuration variable is true",
					args: [
						{
							generators: gitGenerators.localBranches,
							filterStrategy: "fuzzy",
						},
						{
							isOptional: true,
							generators: gitGenerators.localBranches,
							filterStrategy: "fuzzy",
						},
					],
				},
				{
					name: "--orphan",
					description: "Create a new orphan branch, named <new-branch>",
					args: {
						name: "new branch",
					},
				},
				{
					name: "--ignore-other-worktrees",
					description:
						"Git switch refuses when the wanted ref is already checked out by another worktree",
				},
				{
					name: "--recurse-submodules",
					exclusiveOn: ["--no-recurse-submodules"],
					description:
						"Updates the content of all active submodules according to the commit recorded in the superproject",
				},
				{
					name: "--no-recurse-submodules",
					exclusiveOn: ["--recurse-submodules"],
					description: "Submodules working trees will not be updated",
				},
			],
			args: [
				{
					name: "branch name",
					description: "Branch or commit to switch to",
					generators: gitGenerators.localBranches,
					filterStrategy: "fuzzy",
					suggestions: [
						{
							name: "-",
							description: "Switch to the last used branch",
							icon: "fig://icon?type=git",
						},
					],
				},
				{
					name: "start point",
					isOptional: true,
					generators: gitGenerators.commits,
				},
			],
		},
		{
			name: "worktree",
			description: "Manage multiple working trees",
			subcommands: [
				{
					name: "add",
					description: "Create <path> and checkout <commit-ish> into it",
					options: [
						{
							name: ["-f", "--force"],
							description:
								"By default, add refuses to create a new working tree when <commit-ish> is a branch name and is already checked out by another working tree, or if <path> is already assigned to some working tree but is missing (for instance, if <path> was deleted manually). This option overrides these safeguards. To add a missing but locked working tree path, specify --force twice",
						},
						{
							name: ["-d", "--detach"],
							description:
								'With add, detach HEAD in the new working tree. See "DETACHED HEAD" in git-checkout[1]',
						},
						{
							name: "--checkout",
							description:
								'By default, add checks out <commit-ish>, however, --no-checkout can be used to suppress checkout in order to make customizations, such as configuring sparse-checkout. See "Sparse checkout" in git-read-tree[1]',
						},
						{
							name: "--lock",
							description:
								"Keep the working tree locked after creation. This is the equivalent of git worktree lock after git worktree add, but without a race condition",
						},
						{
							name: ["-b", "-B"],
							description:
								"With add, create a new branch named <new-branch> starting at <commit-ish>, and check out <new-branch> into the new working tree. If <commit-ish> is omitted, it defaults to HEAD. By default, -b refuses to create a new branch if it already exists. -B overrides this safeguard, resetting <new-branch> to <commit-ish>",
							args: {
								name: "new-branch",
							},
						},
					],
				},
				{
					name: "list",
					description: "List details of each working tree",
					options: [
						{
							name: "--porcelain",
							description:
								"With list, output in an easy-to-parse format for scripts. This format will remain stable across Git versions and regardless of user configuration. See below for details",
						},
						{
							name: ["-v", "--verbose"],
							description:
								"With list, output additional information about worktrees (see below)",
						},
						{
							name: "--expire",
							description:
								"With list, annotate missing working trees as prunable if they are older than <time>",
							args: {
								name: "time",
							},
						},
					],
				},
				{
					name: "lock",
					description:
						"If a working tree is on a portable device or network share which is not always mounted, lock it to prevent its administrative files from being pruned automatically",
					args: {
						name: "worktree",
						description:
							"Working trees can be identified by path, either relative or absolute",
					},
					options: [
						{
							name: "--reason",
							description:
								"With lock or with add --lock, an explanation <reason> why the working tree is locked",
							args: {
								name: "reason",
							},
						},
					],
				},
				{
					name: "move",
					description: "Move a working tree to a new location",
					args: [
						{
							name: "worktree",
							description:
								"Working trees can be identified by path, either relative or absolute",
						},
						{
							name: "new-path",
							template: "filepaths",
						},
					],
					options: [
						{
							name: ["-f", "--force"],
							description:
								"Move refuses to move a locked working tree unless --force is specified twice. If the destination is already assigned to some other working tree but is missing (for instance, if <new-path> was deleted manually), then --force allows the move to proceed; use --force twice if the destination is locked",
						},
					],
				},
				{
					name: "prune",
					description: "Prune working tree information in $GIT_DIR/worktrees",
					options: [
						{
							name: ["-n", "--dry-run"],
							description:
								"With prune, do not remove anything; just report what it would remove",
						},
						{
							name: ["-v", "--verbose"],
							description: "With prune, report all removals",
						},
						{
							name: "--expire",
							description:
								"With prune, only expire unused working trees older than <time>",
							args: {
								name: "time",
							},
						},
					],
				},
				{
					name: "remove",
					description: "Remove a working tree",
					args: {
						name: "worktree",
						description:
							"Working trees can be identified by path, either relative or absolute",
					},
					options: [
						{
							name: ["-f", "--force"],
							description:
								"Remove refuses to remove an unclean working tree unless --force is used. To remove a locked working tree, specify --force twice",
						},
					],
				},
				{
					name: "repair",
					description:
						"Repair working tree administrative files, if possible, if they have become corrupted or outdated due to external factors",
					args: {
						name: "path",
						template: "filepaths",
					},
				},
				{
					name: "unlock",
					description:
						"Unlock a working tree, allowing it to be pruned, moved or deleted",
					args: {
						name: "worktree",
						description:
							"Working trees can be identified by path, either relative or absolute",
					},
				},
			],
		},
		{
			name: "apply",
			description: "Apply a patch to files and/or to the index",
			options: [
				{
					name: "--exclude",
					description: "Don't apply changes matching the given path",
					args: {
						name: "path",
					},
				},
				{
					name: "--include",
					description: "Apply changes matching the given path",
					args: {
						name: "path",
					},
				},
				{
					name: "-p",
					description:
						"Remove <num> leading slashes from traditional diff paths",
					args: {
						name: "num",
					},
				},
				{
					name: "--no-add",
					description: "Ignore additions made by the patch",
				},
				{
					name: "--stat",
					description:
						"Instead of applying the patch, output diffstat for the input",
				},
				{
					name: "--numstat",
					description:
						"Show number of added and deleted lines in decimal notation",
				},
				{
					name: "--summary",
					description:
						"Instead of applying the patch, output a summary for the input",
				},
				{
					name: "--check",
					description:
						"Instead of applying the patch, see if the patch is applicable",
				},
				{
					name: "--index",
					description: "Make sure the patch is applicable to the current index",
				},
				{
					name: ["-N", "--intent-to-add"],
					description: "Mark new files with `git add --intent-to-add`",
				},
				{
					name: "--cached",
					description: "Apply a patch without touching the working tree",
				},
				{
					name: "--unsafe-paths",
					description: "Accept a patch that touches outside the working area",
				},
				{
					name: "--apply",
					description:
						"Also apply the patch (use with --stat/--summary/--check)",
				},
				{
					name: ["-3", "--3way"],
					description: "Attempt three-way merge if a patch does not apply",
				},
				{
					name: "--build-fake-ancestor",
					description:
						"Build a temporary index based on embedded index information",
					args: {
						name: "file",
					},
				},
				{
					name: "-z",
					description: "Paths are separated with NUL character",
				},
				{
					name: "-C",
					description: "Ensure at least <n> lines of context match",
					args: {
						name: "n",
					},
				},
				{
					name: "--whitespace",
					description:
						"Detect new or modified lines that have whitespace errors",
					args: {
						name: "action",
						suggestions: [
							{
								name: "nowarn",
								description: "Turns off the trailing whitespace warning",
							},
							{
								name: "warn",
								description:
									"Outputs warnings for a few such errors, but applies the patch as-is (default)",
							},
							{
								name: "fix",
								description:
									"Outputs warnings for a few such errors, and applies the patch after fixing them",
							},
							{
								name: "error",
								description:
									"Outputs warnings for a few such errors, and refuses to apply the patch",
							},
							{
								name: "error-all",
								description: "Similar to `error` but shows all errors",
							},
						],
					},
				},
				{
					name: ["--ignore-space-change", "--ignore-whitespace"],
					description: "Ignore changes in whitespace when finding context",
				},
				{
					name: ["-R", "--reverse"],
					description: "Apply the patch in reverse",
				},
				{
					name: "--unidiff-zero",
					description: "Don't expect at least one line of context",
				},
				{
					name: "--reject",
					description: "Leave the rejected hunks in corresponding *.rej files",
				},
				{
					name: "--allow-overlap",
					description: "Allow overlapping hunks",
				},
				{
					name: ["-v", "--verbose"],
					description: "Be verbose",
				},
				{
					name: "--inaccurate-eof",
					description:
						"Tolerate incorrectly detected missing new-line at the end of file",
				},
				{
					name: "--recount",
					description: "Do not trust the line counts in the hunk headers",
				},
				{
					name: "--directory",
					description: "Prepend <root> to all filenames",
					args: {
						name: "root",
					},
				},
			],
			args: {
				name: "patch",
				isVariadic: true,
			},
		},
		{
			name: "daemon",
			description: "A really simple server for Git repositories",
			args: {
				name: "directory",
				description:
					"A directory to add to the whitelist of allowed directories. Unless --strict-paths is specified this will also include subdirectories of each named directory",
				isVariadic: true,
			},
			options: [
				{
					name: "--strict-paths",
					description:
						'Match paths exactly (i.e. don’t allow "/foo/repo" when the real path is "/foo/repo.git" or "/foo/repo/.git") and don’t do user-relative paths.  git daemon will refuse to start when this option is enabled and no whitelist is specified',
				},
				{
					name: "--base-path",
					description:
						"Remap all the path requests as relative to the given path",
					requiresSeparator: true,
					args: { name: "path", template: "folders" },
				},
				{
					name: "--base-path-relaxed",
					description:
						"If --base-path is enabled and repo lookup fails, with this option git daemon will attempt to lookup without prefixing the base path. This is useful for switching to --base-path usage, while still allowing the old paths",
				},
				{
					name: "--interpolated-path",
					requiresSeparator: true,
					description:
						"To support virtual hosting, an interpolated path template can be used to dynamically construct alternate paths. The template supports %H for the target hostname as supplied by the client but converted to all lowercase, %CH for the canonical hostname, %IP for the server’s IP address, %P for the port number, and %D for the absolute path of the named repository. After interpolation, the path is validated against the directory whitelist",
					args: { name: "path-template" },
				},
				{
					name: "--export-all",
					description:
						"Allow pulling from all directories that look like Git repositories (have the objects and refs subdirectories), even if they do not have the git-daemon-export-ok file",
				},
				{
					name: "--inetd",
					description: "Have the server run as an inetd service",
					exclusiveOn: ["--pid-file", "--user", "--group"],
				},
				{
					name: "--listen",
					description:
						"Listen on a specific IP address or hostname. IP addresses can be either an IPv4 address or an IPv6 address if supported. If IPv6 is not supported, then --listen=hostname is also not supported and --listen must be given an IPv4 address. Can be given more than once. Incompatible with --inetd option",
					requiresSeparator: true,
					args: { name: "host_or_ipaddr" },
				},
				{
					name: "--port",
					description:
						"Listen on an alternative port. Incompatible with --inetd option",
					requiresSeparator: true,
					args: { name: "port" },
				},
				{
					name: "--init-timeout",
					description:
						"Timeout (in seconds) between the moment the connection is established and the client request is received (typically a rather low value, since that should be basically immediate)",
					requiresSeparator: true,
					args: { name: "timeout" },
				},
				{
					name: "--max-connections",
					description:
						"Maximum number of concurrent clients, defaults to 32. Set it to zero for no limit",
					requiresSeparator: true,
					args: { name: "maximum" },
				},
				{
					name: "--syslog",
					description: "Short for --log-destination=syslog",
				},
				{
					name: "--log-destination",
					description:
						"Send log messages to the specified destination. Note that this option does not imply --verbose, thus by default only error conditions will be logged. The default destination is syslog if --inetd or --detach is specified, otherwise stderr",
					requiresSeparator: true,
					args: {
						name: "destination",
						suggestions: [
							{
								name: "stderr",
								description:
									"Write to standard error. Note that if --detach is specified, the process disconnects from the real standard error, making this destination effectively equivalent to none",
							},
							{
								name: "syslog",
								description: "Write to syslog, using the git-daemon identifier",
							},
							{ name: "none", description: "Disable all logging" },
						],
					},
				},
				{
					name: "--user-path",
					description:
						"Allow ~user notation to be used in requests. When specified with no parameter, requests to git://host/~alice/foo is taken as a request to access foo repository in the home directory of user alice. If --user-path=some-path is specified, the same request is taken as a request to access the some-path/foo repository in the home directory of user alice",
					requiresSeparator: true,
					args: {
						name: "path",
						template: "folders",
					},
				},
				{
					name: "--verbose",
					description:
						"Log details about the incoming connections and requested files",
				},
				{
					name: "--detach",
					description: "Detach from the shell. Implies --syslog",
				},
				{
					name: "--pid-file",
					description: "Save the process id in the provided file",
					requiresSeparator: true,
					args: { name: "file", template: "filepaths" },
					exclusiveOn: ["--inetd"],
				},
				{
					name: "--user",
					description:
						"Change daemon’s uid and gid before entering the service loop. When only --user is given without --group, the primary group ID for the user is used. The values of the option are given to getpwnam(3) and getgrnam(3) and numeric IDs are not supported",
					requiresSeparator: true,
					exclusiveOn: ["--inetd"],
					args: { name: "user" },
				},
				{
					name: "--group",
					description:
						"Change daemon’s gid before entering the service loop. The value of this option is given to getgrnam(3) and numeric IDs are not supported",
					exclusiveOn: ["--inetd"],
				},
				{
					name: "--enable",
					description: "Enable the service site-wide per default",
					requiresSeparator: true,
					args: { name: "service", suggestions: daemonServices },
				},
				{
					name: "--disable",
					description:
						"Disable the service site-wide per default. Note that a service disabled site-wide can still be enabled per repository if it is marked overridable and the repository enables the service with a configuration item",
					requiresSeparator: true,
					args: { name: "service", suggestions: daemonServices },
				},
				{
					name: "--allow-override",
					description:
						"Allow overriding the site-wide default with per repository configuration. By default, all the services may be overridden",
					requiresSeparator: true,
					args: { name: "service", suggestions: daemonServices },
				},
				{
					name: "--forbid-override",
					description:
						"Forbid overriding the site-wide default with per repository configuration. By default, all the services may be overridden",
					requiresSeparator: true,
					args: { name: "service", suggestions: daemonServices },
				},
				{
					name: "--informative-errors",
					description:
						'When informative errors are turned on, git-daemon will report more verbose errors to the client, differentiating conditions like "no such repository" from "repository not exported". This is more convenient for clients, but may leak information about the existence of unexported repositories. When informative errors are not enabled, all errors report "access denied" to the client',
					exclusiveOn: ["--no-informative-errors"],
				},
				{
					name: "--no-informative-errors",
					description:
						"Turn off informative errors. This option is the default. See --informative-errors for more information",
					exclusiveOn: ["--informative-errors"],
				},
				{
					name: "--access-hook",
					description:
						'Every time a client connects, first run an external command specified by the <path> with service name (e.g. "upload-pack"), path to the repository, hostname (%H), canonical hostname (%CH), IP address (%IP), and TCP port (%P) as its command-line arguments. The external command can decide to decline the service by exiting with a non-zero status (or to allow it by exiting with a zero status). It can also look at the $REMOTE_ADDR and $REMOTE_PORT environment variables to learn about the requestor when making this decision.\n\nThe external command can optionally write a single line to its standard output to be sent to the requestor as an error message when it declines the service',
					requiresSeparator: true,
					args: { name: "path", template: "filepaths" },
				},
			],
		},
	],
	additionalSuggestions: [
		{
			name: "commit -m 'msg'",
			description: "Git commit shortcut",
			insertValue: "commit -m '{cursor}'",
			icon: "fig://template?color=2ecc71&badge=🔥",
			// type: "shortcut",
		},
	],
};

export default completionSpec;
