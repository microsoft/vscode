/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource, LanguageModelChatMessage, ProgressLocation, Uri, l10n, lm, window, workspace } from 'vscode';
import { Repository } from './repository';
import { relativePath, truncate } from './util';

/**
 * A single commit proposed by the model: a message and the files that belong to it.
 */
interface ProposedCommit {
	readonly message: string;
	readonly files: readonly string[];
}

// Keep the payload sent to the model bounded.
const MAX_DIFF_CHARS_PER_FILE = 4000;

/**
 * Prototype: ask the Copilot backend to split the current changes into a set of
 * logically-grouped commits and then create those commits one after another.
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
		await window.withProgress({
			location: ProgressLocation.SourceControl,
			title: l10n.t('Composing commits with Copilot...'),
		}, async () => {
			// 3. Build a compact description of each change (path + truncated diff).
			const diffs = await collectDiffs(repository, changedUris);

			// 4. Ask the model to group the files into commits.
			const proposals = await requestCommitPlan(model, diffs, tokenSource);
			if (proposals.length === 0) {
				window.showInformationMessage(l10n.t('Copilot did not propose any commits.'));
				return;
			}

			// 5. Start from a clean index, then stage + commit each group in turn.
			if (repository.indexGroup.resourceStates.length > 0) {
				await repository.revert(repository.indexGroup.resourceStates.map(r => r.resourceUri));
			}

			for (const proposal of proposals) {
				const uris = proposal.files
					.map(file => Uri.joinPath(Uri.file(repository.root), file))
					.filter(uri => changedUris.some(changed => changed.fsPath === uri.fsPath));

				if (uris.length === 0) {
					continue;
				}

				await repository.add(uris);
				await repository.commit(proposal.message, { all: false });
			}
		});
	} catch (err) {
		window.showErrorMessage(l10n.t('Failed to compose commits: {0}', err instanceof Error ? err.message : String(err)));
	} finally {
		tokenSource.dispose();
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

async function requestCommitPlan(model: { sendRequest: (m: LanguageModelChatMessage[], o: object, t: unknown) => Promise<{ text: AsyncIterable<string> }> }, diffs: { path: string; diff: string }[], tokenSource: CancellationTokenSource): Promise<ProposedCommit[]> {
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
