/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource, Disposable, LanguageModelChat, LanguageModelChatMessage, ProgressLocation, QuickInputButton, QuickPickItem, ThemeIcon, Uri, l10n, lm, window, workspace } from 'vscode';
import { Repository } from './repository';
import { relativePath, truncate } from './util';

/**
 * A single commit proposed by the model: a message and the files that belong to it.
 */
interface ProposedCommit {
	readonly message: string;
	readonly files: readonly string[];
}

/**
 * A proposed commit after its files have been matched against the actual changes
 * of the repository. The message is mutable because it can be edited in the preview.
 */
interface ResolvedCommit {
	message: string;
	readonly uris: Uri[];
}

interface ResolvedCommitItem extends QuickPickItem {
	readonly commit: ResolvedCommit;
}

// Keep the payload sent to the model bounded.
const MAX_DIFF_CHARS_PER_FILE = 4000;

// Keep the file list of the commit preview readable.
const MAX_PREVIEW_DETAIL_CHARS = 200;

/**
 * Prototype: ask the Copilot backend to split the current changes into a set of
 * logically-grouped commits, let the user review the plan and then create the
 * commits that were confirmed.
 */
export async function composeCommits(repository: Repository): Promise<void> {
	// 1. Collect the changed files (unstaged + untracked + already staged).
	const changedUris = [
		...repository.indexGroup.resourceStates,
		...repository.workingTreeGroup.resourceStates,
		...repository.untrackedGroup.resourceStates,
	].map(state => state.resourceUri);

	if (changedUris.length === 0) {
		window.showInformationMessage(l10n.t('There are no changes to compose commits from.'));
		return;
	}

	// 2. Pick a Copilot model.
	const [model] = await lm.selectChatModels({ vendor: 'copilot' });
	if (!model) {
		window.showErrorMessage(l10n.t('No Copilot language model is available.'));
		return;
	}

	const tokenSource = new CancellationTokenSource();
	try {
		const proposals = await window.withProgress({
			location: ProgressLocation.SourceControl,
			title: l10n.t('Composing commits with Copilot...'),
		}, async () => {
			// 3. Build a compact description of each change (path + truncated diff).
			const diffs = await collectDiffs(repository, changedUris);

			// 4. Ask the model to group the files into commits.
			return await requestCommitPlan(model, diffs, tokenSource);
		});

		const { commits, unassigned } = resolveProposals(repository, proposals, changedUris);
		if (commits.length === 0) {
			window.showInformationMessage(l10n.t('Copilot did not propose any commits.'));
			return;
		}

		// 5. Let the user review the plan before anything is committed.
		const confirmed = await confirmCommitPlan(repository, commits, unassigned);
		if (!confirmed || confirmed.length === 0) {
			return;
		}

		await window.withProgress({
			location: ProgressLocation.SourceControl,
			title: l10n.t('Creating commits...'),
		}, async () => {
			// 6. Start from a clean index, then stage + commit each group in turn.
			if (repository.indexGroup.resourceStates.length > 0) {
				await repository.revert(repository.indexGroup.resourceStates.map(r => r.resourceUri));
			}

			for (const commit of confirmed) {
				await repository.add(commit.uris);
				await repository.commit(commit.message, { all: false });
			}
		});
	} catch (err) {
		window.showErrorMessage(l10n.t('Failed to compose commits: {0}', err instanceof Error ? err.message : String(err)));
	} finally {
		tokenSource.dispose();
	}
}

/**
 * Match the files of each proposal against the actual changes of the repository,
 * dropping files the model made up and reporting the changes it left out.
 */
function resolveProposals(repository: Repository, proposals: readonly ProposedCommit[], changedUris: readonly Uri[]): { commits: ResolvedCommit[]; unassigned: Uri[] } {
	const remaining = new Map(changedUris.map(uri => [uri.fsPath, uri]));
	const commits: ResolvedCommit[] = [];

	for (const proposal of proposals) {
		const uris: Uri[] = [];

		for (const file of proposal.files) {
			const fsPath = Uri.joinPath(Uri.file(repository.root), file).fsPath;
			const uri = remaining.get(fsPath);

			// Unknown files, and files claimed by an earlier commit, are ignored.
			if (uri) {
				remaining.delete(fsPath);
				uris.push(uri);
			}
		}

		if (uris.length > 0) {
			commits.push({ message: proposal.message, uris });
		}
	}

	return { commits, unassigned: [...remaining.values()] };
}

/**
 * Show a preview of the proposed commits - their messages and the files grouped
 * into each of them - and let the user confirm, deselect or rename them.
 * Returns `undefined` when the user cancels.
 */
async function confirmCommitPlan(repository: Repository, commits: readonly ResolvedCommit[], unassigned: readonly Uri[]): Promise<ResolvedCommit[] | undefined> {
	const editButton: QuickInputButton = { iconPath: new ThemeIcon('edit'), tooltip: l10n.t('Edit Commit Message') };
	const disposables: Disposable[] = [];

	try {
		const quickPick = window.createQuickPick<ResolvedCommitItem>();
		disposables.push(quickPick);

		quickPick.title = l10n.t('Compose Commits with Copilot');
		quickPick.placeholder = unassigned.length === 0
			? l10n.t('Review the proposed commits, then press Enter to create them')
			: l10n.t('Review the proposed commits, then press Enter to create them ({0} changed files were not included)', unassigned.length);
		quickPick.canSelectMany = true;
		quickPick.ignoreFocusOut = true;

		const items = commits.map<ResolvedCommitItem>(commit => ({
			commit,
			label: commit.message,
			description: commit.uris.length === 1
				? l10n.t('1 file')
				: l10n.t('{0} files', commit.uris.length),
			detail: truncate(commit.uris.map(uri => relativePath(repository.root, uri.fsPath)).join(', '), MAX_PREVIEW_DETAIL_CHARS),
			buttons: [editButton]
		}));

		quickPick.items = items;
		quickPick.selectedItems = items;

		// Editing a commit message opens an input box, which hides the quick pick. Track
		// that so the plan is not discarded while the message is being edited.
		let editing = false;

		const result = await new Promise<ResolvedCommit[] | undefined>(resolve => {
			disposables.push(
				quickPick.onDidAccept(() => resolve(quickPick.selectedItems.map(item => item.commit))),
				quickPick.onDidHide(() => {
					if (!editing) {
						resolve(undefined);
					}
				}),
				quickPick.onDidTriggerItemButton(async e => {
					editing = true;
					const selected = new Set(quickPick.selectedItems);

					try {
						const message = await window.showInputBox({
							title: l10n.t('Edit Commit Message'),
							value: e.item.commit.message,
							prompt: l10n.t('Message of the commit that groups: {0}', e.item.detail ?? ''),
							ignoreFocusOut: true
						});

						if (message) {
							e.item.commit.message = message;
							e.item.label = message;

							// Re-assign the items so the new message is rendered.
							quickPick.items = [...items];
						}
					} finally {
						editing = false;
						quickPick.selectedItems = items.filter(item => selected.has(item));
						quickPick.show();
					}
				})
			);

			quickPick.show();
		});

		if (result && unassigned.length > 0) {
			window.showInformationMessage(l10n.t('{0} changed files were not part of the commit plan and remain uncommitted.', unassigned.length));
		}

		return result;
	} finally {
		disposables.forEach(d => d.dispose());
	}
}

async function collectDiffs(repository: Repository, uris: Uri[]): Promise<{ path: string; diff: string }[]> {
	const result: { path: string; diff: string }[] = [];

	for (const uri of uris) {
		const path = relativePath(repository.root, uri.fsPath);

		let diff: string;
		try {
			// diffWithHEAD(path) returns the textual diff for a tracked file.
			diff = await repository.diffWithHEAD(uri.fsPath);
		} catch {
			// Untracked file: fall back to its contents.
			const bytes = await workspace.fs.readFile(uri);
			diff = Buffer.from(bytes).toString('utf8');
		}

		result.push({ path, diff: truncate(diff, MAX_DIFF_CHARS_PER_FILE) });
	}

	return result;
}

async function requestCommitPlan(model: LanguageModelChat, diffs: { path: string; diff: string }[], tokenSource: CancellationTokenSource): Promise<ProposedCommit[]> {
	const changes = diffs.map(({ path, diff }) => `### ${path}\n\`\`\`diff\n${diff}\n\`\`\``).join('\n\n');

	const prompt = [
		LanguageModelChatMessage.User(
			'You are helping to organize a set of file changes into several small, logically-cohesive git commits. ' +
			'Group related files together and write a concise conventional-commit message for each group. ' +
			'Every listed file must appear in exactly one group. ' +
			'Respond with ONLY a JSON array of objects of the shape ' +
			'{ "message": string, "files": string[] } and nothing else.'
		),
		LanguageModelChatMessage.User(`Here are the changes:\n\n${changes}`),
	];

	const response = await model.sendRequest(prompt, {}, tokenSource.token);

	let text = '';
	for await (const fragment of response.text) {
		text += fragment;
	}

	return parseProposals(text);
}

function parseProposals(text: string): ProposedCommit[] {
	// The model may wrap the JSON in a markdown code fence.
	const match = text.match(/\[[\s\S]*\]/);
	if (!match) {
		return [];
	}

	try {
		const parsed = JSON.parse(match[0]) as ProposedCommit[];
		return parsed.filter(p => typeof p.message === 'string' && Array.isArray(p.files) && p.files.length > 0);
	} catch {
		return [];
	}
}
