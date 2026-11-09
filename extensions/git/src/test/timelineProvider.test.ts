/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CancellationTokenSource, commands, extensions, TimelineItem, TimelineTriggerKind, Uri, workspace } from 'vscode';
import type { GitExtensionImpl } from '../api/extension';
import { CommandCenter } from '../commands';
import type { Model } from '../model';
import { getWorkspaceTimelinePage, GitTimelineProvider } from '../timelineProvider';

suite('git timeline', () => {
	interface TestCommit {
		readonly hash: string;
		readonly timestamp: number;
	}

	/**
	 * Pages through the workspace timeline of the given repository histories, requesting each page like the provider
	 * does with `git log -n <limit + 1> --skip <skip>`.
	 */
	function getPages(histories: Record<string, TestCommit[]>, limit: number): string[][] {
		const pages: string[][] = [];
		let skipByRoot: Record<string, number> | undefined;
		do {
			const logs = Object.entries(histories)
				.filter(([root]) => skipByRoot === undefined || skipByRoot[root] !== undefined)
				.map(([root, commits]) => {
					const skip = skipByRoot?.[root] ?? 0;
					return { root, skip, commits: commits.slice(skip, skip + limit + 1) };
				});

			const { page, nextSkip } = getWorkspaceTimelinePage(logs, limit, commit => commit.timestamp);
			pages.push(page.map(({ commit }) => commit.hash));
			skipByRoot = nextSkip;
		} while (skipByRoot !== undefined && pages.length < 10);

		return pages;
	}

	test('workspace timeline pages through repositories newest first', () => {
		assert.deepStrictEqual(getPages({
			'/a': [{ hash: 'a3', timestamp: 6 }, { hash: 'a2', timestamp: 4 }, { hash: 'a1', timestamp: 1 }],
			'/b': [{ hash: 'b3', timestamp: 5 }, { hash: 'b2', timestamp: 3 }, { hash: 'b1', timestamp: 2 }],
		}, 2), [['a3', 'b3'], ['a2', 'b2'], ['b1', 'a1']]);
	});

	test('workspace timeline does not skip commits whose log order differs from their timestamps', () => {
		// e.g. author dates when commits were rebased
		assert.deepStrictEqual(getPages({
			'/a': [{ hash: 'A', timestamp: 100 }, { hash: 'B', timestamp: 1 }, { hash: 'C', timestamp: 90 }],
			'/b': [{ hash: 'D', timestamp: 95 }],
		}, 2), [['A', 'D'], ['B', 'C']]);
	});

	suite('file timeline pagination', () => {
		let root: string;
		let uri: Uri;
		let provider: GitTimelineProvider;
		const tokenSource = new CancellationTokenSource();
		const contents = ['base\n', 'base\nsecond\n', 'base\nsecond\nthird\n'];
		const commits: string[] = [];

		suiteSetup(async () => {
			const extension = extensions.getExtension<GitExtensionImpl>('vscode.git');
			assert.ok(extension);
			await extension.activate();
			const model = extension.exports.model;
			assert.ok(model);

			root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-git-timeline-'));
			uri = Uri.file(path.join(root, 'tracked.txt'));
			await model.git.init(root, { defaultBranch: 'main' });
			await model.git.exec(root, ['config', 'user.name', 'Timeline Tester']);
			await model.git.exec(root, ['config', 'user.email', 'timeline@example.com']);
			await model.git.exec(root, ['config', 'commit.gpgsign', 'false']);
			await model.git.exec(root, ['config', 'core.autocrlf', 'false']);
			for (const content of contents) {
				await fs.promises.writeFile(uri.fsPath, content);
				await model.git.exec(root, ['add', 'tracked.txt']);
				await model.git.exec(root, ['commit', '-m', `Version ${commits.length + 1}`]);
				commits.push((await model.git.exec(root, ['rev-parse', 'HEAD'])).stdout.trim());
			}
			assert.ok(await extension.exports.getAPI(1).openRepository(Uri.file(root)));

			// Avoid registering a second Git timeline provider in the test host.
			const timelineModel: Pick<Model, 'repositories' | 'getRepository' | 'onDidOpenRepository' | 'onDidCloseRepository' | 'onDidChangeRepository' | 'getSourceControlHistoryItemDetailsProviders'> = {
				repositories: [],
				getRepository: hint => model.getRepository(hint),
				onDidOpenRepository: model.onDidOpenRepository,
				onDidCloseRepository: model.onDidCloseRepository,
				onDidChangeRepository: model.onDidChangeRepository,
				getSourceControlHistoryItemDetailsProviders: () => []
			};
			provider = new GitTimelineProvider(timelineModel as Model, {
				resolveTimelineOpenDiffCommand: CommandCenter.prototype.resolveTimelineOpenDiffCommand
			} satisfies Pick<CommandCenter, 'resolveTimelineOpenDiffCommand'> as CommandCenter);
		});

		suiteTeardown(async () => {
			provider?.dispose();
			tokenSource.dispose();
			if (root) {
				await commands.executeCommand('git.close', Uri.file(root));
				await fs.promises.rm(root, { recursive: true, force: true });
			}
		});

		async function getDiffContents(item: TimelineItem): Promise<string[]> {
			const command = item.command;
			assert.ok(command?.arguments);
			assert.strictEqual(command.command, 'vscode.diff');
			const [originalUri, modifiedUri] = command.arguments;
			assert.ok(originalUri instanceof Uri && modifiedUri instanceof Uri);
			const [original, modified] = await Promise.all([
				workspace.openTextDocument(originalUri),
				workspace.openTextDocument(modifiedUri)
			]);
			return [original.getText(), modified.getText()];
		}

		test('compares the last item on the first page with the next commit', async () => {
			const timeline = await provider.provideTimeline(uri, { limit: 2, triggerKind: TimelineTriggerKind.Automatic }, tokenSource.token);
			assert.deepStrictEqual({
				cursor: timeline.cursor,
				diffs: await Promise.all(timeline.items.map(getDiffContents))
			}, {
				cursor: commits[0],
				diffs: [[contents[1], contents[2]], [contents[0], contents[1]]]
			});
		});

		test('compares the last item on subsequent pages with the next commit', async () => {
			const timeline = await provider.provideTimeline(uri, { limit: 1, cursor: commits[1], triggerKind: TimelineTriggerKind.Automatic }, tokenSource.token);
			assert.deepStrictEqual({
				cursor: timeline.cursor,
				diffs: await Promise.all(timeline.items.map(getDiffContents))
			}, {
				cursor: commits[0],
				diffs: [[contents[0], contents[1]]]
			});
		});

		test('compares the initial commit with the empty tree on the final page', async () => {
			const timeline = await provider.provideTimeline(uri, { limit: 1, cursor: commits[0], triggerKind: TimelineTriggerKind.Automatic }, tokenSource.token);
			assert.deepStrictEqual({
				cursor: timeline.cursor,
				diffs: await Promise.all(timeline.items.map(getDiffContents))
			}, {
				cursor: undefined,
				diffs: [['', contents[0]]]
			});
		});
	});
});
