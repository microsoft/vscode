/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { SessionStatus, type SessionSummary } from '../../common/state/sessionState.js';
import { CompletionItemKind } from '../../common/state/protocol/commands.js';
import { MessageAttachmentKind, type MessageAttachment } from '../../common/state/protocol/state.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostCompletions, CompletionTriggerCharacter } from '../../node/agentHostCompletions.js';
import { AgentHostFileCompletionProvider, extractAtToken } from '../../node/agentHostFileCompletionProvider.js';
import { AgentHostWorkspaceFiles } from '../../node/agentHostWorkspaceFiles.js';

class FakeWorkspaceFiles extends AgentHostWorkspaceFiles {
	constructor(private readonly _files: readonly URI[]) {
		super(new NullLogService());
	}
	override async getFiles(): Promise<readonly URI[]> {
		return this._files;
	}
}

function assertResourceUri(attachment: MessageAttachment, expected: string): void {
	assert.strictEqual(attachment.type, MessageAttachmentKind.Resource);
	assert.strictEqual(attachment.type === MessageAttachmentKind.Resource && attachment.uri, expected);
}

suite('AgentHostFileCompletionProvider', () => {

	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('announces "@" as a trigger character via IAgentHostCompletions', () => {
		const completions = disposables.add(new AgentHostCompletions(new NullLogService()));
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const workspaceFiles = disposables.add(new FakeWorkspaceFiles([]));
		disposables.add(completions.registerProvider(new AgentHostFileCompletionProvider(stateManager, workspaceFiles)));
		assert.deepStrictEqual([...completions.triggerCharacters], [CompletionTriggerCharacter.File]);
	});

	suite('extractAtToken', () => {
		test('returns undefined when there is no @', () => {
			assert.strictEqual(extractAtToken('hello world', 5), undefined);
		});

		test('returns undefined when offset is in plain text after whitespace', () => {
			assert.strictEqual(extractAtToken('look at the file', 7), undefined);
		});

		test('extracts a lone @ at end of string', () => {
			assert.deepStrictEqual(extractAtToken('look at @', 9), { token: '', rangeStart: 8, rangeEnd: 9 });
		});

		test('extracts an @-token after a space', () => {
			assert.deepStrictEqual(extractAtToken('look at @foo', 12), { token: 'foo', rangeStart: 8, rangeEnd: 12 });
		});

		test('extracts an @-token at start of string', () => {
			assert.deepStrictEqual(extractAtToken('@foo', 4), { token: 'foo', rangeStart: 0, rangeEnd: 4 });
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
			assert.deepStrictEqual(extractAtToken('look at @foo', 11), { token: 'fo', rangeStart: 8, rangeEnd: 11 });
		});

		test('returns undefined for out-of-range offset', () => {
			assert.strictEqual(extractAtToken('hi', 99), undefined);
			assert.strictEqual(extractAtToken('hi', -1), undefined);
		});
	});

	suite('provideCompletionItems', () => {

		function makeSummary(resource: string, workingDirectory: string | undefined): SessionSummary {
			return {
				resource,
				provider: 'copilot',
				title: 't',
				status: SessionStatus.Idle,
				createdAt: 0,
				modifiedAt: 0,
				project: { uri: 'file:///project', displayName: 'Project' },
				workingDirectory,
			};
		}

		function setup(opts: { workingDirectory?: URI; files?: readonly URI[] }) {
			const sessionUri = URI.from({ scheme: 'copilot', path: '/test' }).toString();
			const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			stateManager.createSession(makeSummary(sessionUri, opts.workingDirectory?.toString()));
			const workspaceFiles = disposables.add(new FakeWorkspaceFiles(opts.files ?? []));
			const provider = new AgentHostFileCompletionProvider(stateManager, workspaceFiles);
			return { sessionUri, provider };
		}

		test('returns [] when session has no working directory', async () => {
			const { sessionUri, provider } = setup({});
			const result = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, session: sessionUri, text: '@', offset: 1 },
				CancellationToken.None,
			);
			assert.deepStrictEqual(result, []);
		});

		test('returns [] for non-file working directory', async () => {
			const { sessionUri, provider } = setup({ workingDirectory: URI.parse('vscode-vfs://github/foo/bar') });
			const result = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, session: sessionUri, text: '@', offset: 1 },
				CancellationToken.None,
			);
			assert.deepStrictEqual(result, []);
		});

		test('returns [] when there is no @-token at the cursor', async () => {
			const wd = URI.file('/wd');
			const files = [URI.joinPath(wd, 'foo.ts')];
			const { sessionUri, provider } = setup({ workingDirectory: wd, files });
			const result = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, session: sessionUri, text: 'hello world', offset: 5 },
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
				{ kind: CompletionItemKind.UserMessage, session: sessionUri, text: 'see @util', offset: 9 },
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

		test('returns the first MAX_RESULTS files in enumeration order for an empty token', async () => {
			const wd = URI.file('/wd');
			const files = Array.from({ length: 100 }, (_, i) => URI.joinPath(wd, `file${i}.ts`));
			const { sessionUri, provider } = setup({ workingDirectory: wd, files });
			const result = await provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, session: sessionUri, text: '@', offset: 1 },
				CancellationToken.None,
			);
			assert.strictEqual(result.length, 50);
			assertResourceUri(result[0].attachment, files[0].toString());
			assertResourceUri(result[49].attachment, files[49].toString());
		});
	});
});
