/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildDefaultChatUri, SessionStatus, type SessionSummary } from '../../common/state/sessionState.js';
import { CompletionItemKind } from '../../common/state/protocol/commands.js';
import { MessageAttachmentKind, type MessageAttachment } from '../../common/state/protocol/state.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostCompletions, CompletionTriggerCharacter } from '../../node/agentHostCompletions.js';
import { AgentHostFileCompletionProvider, extractAtToken } from '../../node/agentHostFileCompletionProvider.js';
import { AgentHostWorkspaceFiles, IAgentHostWorkspaceFilesResult } from '../../node/agentHostWorkspaceFiles.js';

function isUriArray(value: readonly URI[] | ReadonlyMap<string, readonly URI[] | Error>): value is readonly URI[] {
	return Array.isArray(value);
}

class FakeWorkspaceFiles extends AgentHostWorkspaceFiles {
	readonly calls: URI[] = [];

	constructor(
		private readonly _results: readonly URI[] | ReadonlyMap<string, readonly URI[] | Error>,
		private readonly _truncatedRoots: ReadonlySet<string> = new Set(),
	) {
		super(new NullLogService());
	}
	override async getFiles(workingDirectory: URI, token: CancellationToken): Promise<IAgentHostWorkspaceFilesResult> {
		this.calls.push(workingDirectory);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (isUriArray(this._results)) {
			return { files: this._results, isTruncated: this._truncatedRoots.has(workingDirectory.path) };
		}
		const result = this._results.get(workingDirectory.path) ?? [];
		if (result instanceof Error) {
			throw result;
		}
		return { files: result, isTruncated: this._truncatedRoots.has(workingDirectory.path) };
	}
}

function assertResourceUri(attachment: MessageAttachment | undefined, expected: string): void {
	assert.ok(attachment, 'expected attachment to be defined');
	assert.strictEqual(attachment.type, MessageAttachmentKind.Resource);
	assert.strictEqual(attachment.type === MessageAttachmentKind.Resource && attachment.uri, expected);
}

suite('AgentHostFileCompletionProvider', () => {

	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('announces "@" and "#" as trigger characters via IAgentHostCompletions', () => {
		const completions = disposables.add(new AgentHostCompletions(new NullLogService()));
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const workspaceFiles = disposables.add(new FakeWorkspaceFiles([]));
		disposables.add(completions.registerProvider(new AgentHostFileCompletionProvider(stateManager, workspaceFiles, new NullLogService())));
		assert.deepStrictEqual([...completions.triggerCharacters], [CompletionTriggerCharacter.File, CompletionTriggerCharacter.Hash]);
	});

	suite('extractAtToken', () => {
		test('returns undefined when there is no @', () => {
			assert.strictEqual(extractAtToken('hello world', 5), undefined);
		});

		test('returns undefined when offset is in plain text after whitespace', () => {
			assert.strictEqual(extractAtToken('look at the file', 7), undefined);
		});

		test('extracts a lone @ at end of string', () => {
			assert.deepStrictEqual(extractAtToken('look at @', 9), { token: '', triggerChar: '@', rangeStart: 8, rangeEnd: 9 });
		});

		test('extracts an @-token after a space', () => {
			assert.deepStrictEqual(extractAtToken('look at @foo', 12), { token: 'foo', triggerChar: '@', rangeStart: 8, rangeEnd: 12 });
		});

		test('extracts an @-token at start of string', () => {
			assert.deepStrictEqual(extractAtToken('@foo', 4), { token: 'foo', triggerChar: '@', rangeStart: 0, rangeEnd: 4 });
		});

		test('returns undefined when @ is not preceded by whitespace', () => {
			// e.g. an email-like token
			assert.strictEqual(extractAtToken('user@example', 12), undefined);
		});

		test('returns undefined when whitespace separates @ from the cursor', () => {
			assert.strictEqual(extractAtToken('@foo bar', 8), undefined);
		});

		test('honours offset (token = chars between @ and cursor)', () => {
			// Cursor is mid-token: "look at @fo|o"
			assert.deepStrictEqual(extractAtToken('look at @foo', 11), { token: 'fo', triggerChar: '@', rangeStart: 8, rangeEnd: 11 });
		});

		test('returns undefined for out-of-range offset', () => {
			assert.strictEqual(extractAtToken('hi', 99), undefined);
			assert.strictEqual(extractAtToken('hi', -1), undefined);
		});

		test('extracts a lone # at end of string', () => {
			assert.deepStrictEqual(extractAtToken('look at #', 9), { token: '', triggerChar: '#', rangeStart: 8, rangeEnd: 9 });
		});

		test('extracts a #-token after a space', () => {
			assert.deepStrictEqual(extractAtToken('look at #foo', 12), { token: 'foo', triggerChar: '#', rangeStart: 8, rangeEnd: 12 });
		});

		test('extracts a #-token at start of string', () => {
			assert.deepStrictEqual(extractAtToken('#foo', 4), { token: 'foo', triggerChar: '#', rangeStart: 0, rangeEnd: 4 });
		});

		test('returns undefined when # is not preceded by whitespace', () => {
			assert.strictEqual(extractAtToken('foo#bar', 7), undefined);
		});
	});

	suite('provideCompletionItems', () => {

		function makeSummary(resource: string, workingDirectories: readonly string[] | undefined): SessionSummary {
			return {
				resource,
				provider: 'copilot',
				title: 't',
				status: SessionStatus.Idle,
				createdAt: new Date(0).toISOString(),
				modifiedAt: new Date(0).toISOString(),
				project: { uri: 'file:///project', displayName: 'Project' },
				workingDirectories: workingDirectories ? [...workingDirectories] : undefined,
			};
		}

		function setup(opts: {
			workingDirectory?: URI;
			workingDirectories?: readonly URI[];
			files?: readonly URI[];
			results?: ReadonlyMap<string, readonly URI[] | Error>;
			truncatedRoots?: ReadonlySet<string>;
		}) {
			const sessionUri = URI.from({ scheme: 'copilot', path: '/test' }).toString();
			const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			const workingDirectories = opts.workingDirectories ?? (opts.workingDirectory ? [opts.workingDirectory] : undefined);
			stateManager.createSession(makeSummary(sessionUri, workingDirectories?.map(workingDirectory => workingDirectory.toString())));
			const workspaceFiles = disposables.add(new FakeWorkspaceFiles(opts.results ?? opts.files ?? [], opts.truncatedRoots ?? new Set()));
			const provider = new AgentHostFileCompletionProvider(stateManager, workspaceFiles, new NullLogService());
			return { sessionUri, defaultChatUri: buildDefaultChatUri(sessionUri).toString(), provider, stateManager, workspaceFiles };
		}

		test('returns [] when session has no working directory', async () => {
			const { sessionUri, provider } = setup({});
			const result = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, channel: sessionUri, text: '@', offset: 1 },
				CancellationToken.None,
			);
			assert.deepStrictEqual(result, []);
		});

		test('returns [] for non-file working directory', async () => {
			const { sessionUri, provider } = setup({ workingDirectory: URI.parse('vscode-vfs://github/foo/bar') });
			const result = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, channel: sessionUri, text: '@', offset: 1 },
				CancellationToken.None,
			);
			assert.deepStrictEqual(result, []);
		});

		test('returns [] when there is no @-token at the cursor', async () => {
			const wd = URI.file('/wd');
			const files = [URI.joinPath(wd, 'foo.ts')];
			const { sessionUri, provider } = setup({ workingDirectory: wd, files });
			const result = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, channel: sessionUri, text: 'hello world', offset: 5 },
				CancellationToken.None,
			);
			assert.deepStrictEqual(result, []);
		});

		test('ranks files by fuzzy match on basename and emits CompletionItems with File attachments', async () => {
			const wd = URI.file('/wd');
			const files = [
				URI.joinPath(wd, 'src/util.ts'),
				URI.joinPath(wd, 'test/agentHostFileCompletionProvider.test.ts'),
				URI.joinPath(wd, 'README.md'),
			];
			const { sessionUri, provider } = setup({ workingDirectory: wd, files });
			const result = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, channel: sessionUri, text: 'see @util', offset: 9 },
				CancellationToken.None,
			);
			assert.strictEqual(result.length, 1);
			assert.deepStrictEqual(result[0], {
				insertText: '@util.ts',
				rangeStart: 4,
				rangeEnd: 9,
				attachment: {
					type: MessageAttachmentKind.Resource,
					uri: URI.joinPath(wd, 'src/util.ts').toString(),
					label: 'util.ts',
					displayKind: 'document',
				},
			});
		});

		test('uses "#" as the insertText prefix when triggered with #', async () => {
			const wd = URI.file('/wd');
			const files = [URI.joinPath(wd, 'src/util.ts')];
			const { sessionUri, provider } = setup({ workingDirectory: wd, files });
			const result = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, channel: sessionUri, text: 'see #util', offset: 9 },
				CancellationToken.None,
			);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].insertText, '#util.ts');
			assert.strictEqual(result[0].rangeStart, 4);
		});

		test('returns the first MAX_RESULTS files in enumeration order for an empty token', async () => {
			const wd = URI.file('/wd');
			const files = Array.from({ length: 100 }, (_, i) => URI.joinPath(wd, `file${i}.ts`));
			const { sessionUri, provider } = setup({ workingDirectory: wd, files });
			const result = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, channel: sessionUri, text: '@', offset: 1 },
				CancellationToken.None,
			);
			assert.strictEqual(result.length, 50);
			assertResourceUri(result[0].attachment, files[0].toString());
			assertResourceUri(result[49].attachment, files[49].toString());
		});

		test('enumerates outer and sibling roots while attributing nested files to their logical root', async () => {
			const root = URI.file('/project/a');
			const nested = URI.file('/project/a/sub');
			const sibling = URI.file('/project/b');
			const parentFile = URI.joinPath(root, 'parent.ts');
			const nestedFile = URI.joinPath(nested, 'nested.ts');
			const siblingFile = URI.joinPath(sibling, 'sibling.ts');
			const results = new Map<string, readonly URI[]>([
				[root.path, [parentFile, nestedFile]],
				[sibling.path, [siblingFile]],
			]);
			const { sessionUri, provider, workspaceFiles } = setup({
				workingDirectories: [root, nested, sibling],
				results,
			});

			const completions = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, channel: sessionUri, text: '@', offset: 1 },
				CancellationToken.None,
			);

			assert.deepStrictEqual({
				enumerated: workspaceFiles.calls.map(call => call.path),
				items: completions.map(item => item.attachment.type === MessageAttachmentKind.Resource ? item.attachment.uri : undefined),
			}, {
				enumerated: [root.path, sibling.path],
				items: [parentFile.toString(), nestedFile.toString(), siblingFile.toString()],
			});
		});

		test('round-robins roots for an empty query before applying the result cap', async () => {
			const rootA = URI.file('/project/a');
			const rootB = URI.file('/project/b');
			const filesA = Array.from({ length: 60 }, (_, index) => URI.joinPath(rootA, `a-${index}.ts`));
			const fileB = URI.joinPath(rootB, 'b.ts');
			const { sessionUri, provider } = setup({
				workingDirectories: [rootA, rootB],
				results: new Map<string, readonly URI[] | Error>([
					[rootA.path, filesA],
					[rootB.path, [fileB]],
				]),
			});

			const completions = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, channel: sessionUri, text: '@', offset: 1 },
				CancellationToken.None,
			);

			assert.deepStrictEqual({
				length: completions.length,
				first: completions.slice(0, 3).map(item => item.attachment.type === MessageAttachmentKind.Resource ? item.attachment.uri : undefined),
			}, {
				length: 50,
				first: [filesA[0].toString(), fileB.toString(), filesA[1].toString()],
			});
		});

		test('includes nested logical roots beyond the first MAX_RESULTS outer-root files', async () => {
			const root = URI.file('/project');
			const nested = URI.file('/project/nested');
			const rootFiles = Array.from({ length: 60 }, (_, index) => URI.joinPath(root, `root-${index}.ts`));
			const nestedFile = URI.joinPath(nested, 'nested.ts');
			const { sessionUri, provider, workspaceFiles } = setup({
				workingDirectories: [root, nested],
				results: new Map([[root.path, [...rootFiles, nestedFile]]]),
			});

			const completions = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, channel: sessionUri, text: '@', offset: 1 },
				CancellationToken.None,
			);

			assert.deepStrictEqual({
				enumerated: workspaceFiles.calls.map(call => call.path),
				firstTwo: completions.slice(0, 2).map(item =>
					item.attachment.type === MessageAttachmentKind.Resource ? item.attachment.uri : undefined
				),
				length: completions.length,
			}, {
				enumerated: [root.path],
				firstTwo: [rootFiles[0].toString(), nestedFile.toString()],
				length: 50,
			});
		});

		test('enumerates nested fallback roots when their covering root is truncated', async () => {
			const root = URI.file('/project');
			const nested = URI.file('/project/nested');
			const rootFiles = Array.from({ length: 50 }, (_, index) => URI.joinPath(root, `root-${index}.ts`));
			const nestedFile = URI.joinPath(nested, 'nested.ts');
			const { sessionUri, provider, workspaceFiles } = setup({
				workingDirectories: [root, nested],
				results: new Map([
					[root.path, rootFiles],
					[nested.path, [nestedFile]],
				]),
				truncatedRoots: new Set([root.path]),
			});

			const completions = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, channel: sessionUri, text: '@', offset: 1 },
				CancellationToken.None,
			);

			assert.deepStrictEqual({
				enumerated: workspaceFiles.calls.map(call => call.path),
				firstTwo: completions.slice(0, 2).map(item =>
					item.attachment.type === MessageAttachmentKind.Resource ? item.attachment.uri : undefined
				),
			}, {
				enumerated: [root.path, nested.path],
				firstTwo: [rootFiles[0].toString(), nestedFile.toString()],
			});
		});

		test('deduplicates file URIs and disambiguates matching basenames', async () => {
			const rootA = URI.file('/a/src');
			const rootB = URI.file('/b/src');
			const fileA = URI.joinPath(rootA, 'index.ts');
			const fileB = URI.joinPath(rootB, 'index.ts');
			const { sessionUri, provider } = setup({
				workingDirectories: [rootA, rootB],
				results: new Map<string, readonly URI[] | Error>([
					[rootA.path, [fileA]],
					[rootB.path, [fileA, fileB]],
				]),
			});

			const completions = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, channel: sessionUri, text: '@index', offset: 6 },
				CancellationToken.None,
			);

			const items = completions.map(item => ({
				insertText: item.insertText,
				label: item.attachment.label,
				uri: item.attachment.type === MessageAttachmentKind.Resource ? item.attachment.uri : undefined,
			}));
			assert.deepStrictEqual({
				items,
				labelsAreDistinct: items[0].label !== items[1].label,
			}, {
				items: [
					{ insertText: '@index.ts', label: '/a/\u2026 \u2022 index.ts', uri: fileA.toString() },
					{ insertText: '@index.ts', label: '/b/\u2026 \u2022 index.ts', uri: fileB.toString() },
				],
				labelsAreDistinct: true,
			});
		});

		test('formats duplicate names as root and relative path', async () => {
			const copilotRoot = URI.file('/workspace/copilot-sdk');
			const vscodeRoot = URI.file('/workspace/vscode');
			const copilotFile = URI.joinPath(copilotRoot, 'nodejs/package.json');
			const vscodeFile = URI.joinPath(vscodeRoot, 'test/package.json');
			const { sessionUri, provider } = setup({
				workingDirectories: [copilotRoot, vscodeRoot],
				results: new Map([
					[copilotRoot.path, [copilotFile]],
					[vscodeRoot.path, [vscodeFile]],
				]),
			});

			const completions = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, channel: sessionUri, text: '@package', offset: 8 },
				CancellationToken.None,
			);

			assert.deepStrictEqual(completions.map(item => item.attachment.label).sort(), [
				'copilot-sdk \u2022 nodejs/package.json',
				'vscode \u2022 test/package.json',
			]);
		});

		test('globally ranks matches across roots', async () => {
			const rootA = URI.file('/project/a');
			const rootB = URI.file('/project/b');
			const weakerMatch = URI.joinPath(rootA, 'target-helper.ts');
			const exactMatch = URI.joinPath(rootB, 'target.ts');
			const { sessionUri, provider } = setup({
				workingDirectories: [rootA, rootB],
				results: new Map([
					[rootA.path, [weakerMatch]],
					[rootB.path, [exactMatch]],
				]),
			});

			const completions = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, channel: sessionUri, text: '@target', offset: 7 },
				CancellationToken.None,
			);

			assert.deepStrictEqual(completions.map(item =>
				item.attachment.type === MessageAttachmentKind.Resource ? item.attachment.uri : undefined
			), [exactMatch.toString(), weakerMatch.toString()]);
		});

		test('returns local results when another root is unsupported or fails', async () => {
			const rootA = URI.file('/project/a');
			const rootB = URI.file('/project/b');
			const fileA = URI.joinPath(rootA, 'target.ts');
			const { sessionUri, provider, workspaceFiles } = setup({
				workingDirectories: [URI.parse('vscode-vfs://github/project/remote'), rootA, rootB],
				results: new Map<string, readonly URI[] | Error>([
					[rootA.path, [fileA]],
					[rootB.path, new Error('unavailable')],
				]),
			});

			const completions = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, channel: sessionUri, text: '@target', offset: 7 },
				CancellationToken.None,
			);

			assert.deepStrictEqual({
				enumerated: workspaceFiles.calls.map(call => call.path),
				items: completions.map(item => item.insertText),
			}, {
				enumerated: [rootA.path, rootB.path],
				items: ['@target.ts'],
			});
		});

		test('cancellation from one root cancels the complete result', async () => {
			const rootA = URI.file('/project/a');
			const rootB = URI.file('/project/b');
			const { sessionUri, provider } = setup({
				workingDirectories: [rootA, rootB],
				results: new Map<string, readonly URI[] | Error>([
					[rootA.path, [URI.joinPath(rootA, 'target.ts')]],
					[rootB.path, new CancellationError()],
				]),
			});

			const completions = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, channel: sessionUri, text: '@target', offset: 7 },
				CancellationToken.None,
			);

			assert.deepStrictEqual(completions, []);
		});

		test('uses the effective per-chat root subset including an explicit empty subset', async () => {
			const rootA = URI.file('/project/a');
			const rootB = URI.file('/project/b');
			const fileA = URI.joinPath(rootA, 'a.ts');
			const fileB = URI.joinPath(rootB, 'b.ts');
			const { defaultChatUri, provider, stateManager, workspaceFiles } = setup({
				workingDirectories: [rootA, rootB],
				results: new Map([
					[rootA.path, [fileA]],
					[rootB.path, [fileB]],
				]),
			});
			stateManager.dispatchServerAction(defaultChatUri, { type: ActionType.ChatWorkingDirectorySet, directory: rootB.toString() });

			const subset = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, channel: defaultChatUri, text: '@', offset: 1 },
				CancellationToken.None,
			);
			stateManager.dispatchServerAction(defaultChatUri, { type: ActionType.ChatWorkingDirectoryRemoved, directory: rootB.toString() });
			const emptySubset = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, channel: defaultChatUri, text: '@', offset: 1 },
				CancellationToken.None,
			);

			assert.deepStrictEqual({
				enumerated: workspaceFiles.calls.map(call => call.path),
				subset: subset.map(item => item.insertText),
				emptySubset,
			}, {
				enumerated: [rootB.path],
				subset: ['@b.ts'],
				emptySubset: [],
			});
		});
	});
});
