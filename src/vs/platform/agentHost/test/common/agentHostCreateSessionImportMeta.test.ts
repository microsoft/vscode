/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getAgentHostExtensionInitializeResultMeta, supportsAgentHostCreateSessionImport } from '../../common/agentHostExtensionProtocol.js';
import { AgentHostCreateSessionImportMetaKey, readCreateSessionImportMeta, readCreateSessionImportValue, serializeCreateSessionImport, splitCreateSessionImportChunks, withCreateSessionImportMeta, withoutCreateSessionImportMeta, withStagedCreateSessionImportMeta, type IAgentCreateSessionImportConversation } from '../../common/meta/agentHostCreateSessionImportMeta.js';
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState } from '../../common/state/protocol/state.js';

suite('Agent host createSession importConversation metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const sampleImport: IAgentCreateSessionImportConversation = {
		title: 'Migrated local conversation',
		model: { id: 'gpt-5', config: { reasoningEffort: 'high' } },
		turns: [{
			id: '11111111-1111-4111-8111-111111111111',
			startedAt: '2026-10-21T00:00:00.000Z',
			duration: 120,
			message: {
				text: 'Explain the bug',
				origin: { kind: MessageKind.User },
			},
			responseParts: [
				{ kind: ResponsePartKind.Reasoning, id: 'r-1', content: 'Checking logs' },
				{
					kind: ResponsePartKind.ToolCall,
					toolCall: {
						status: ToolCallStatus.Completed,
						toolCallId: 'tc-1',
						toolName: 'grep',
						displayName: 'grep',
						intention: 'Inspect the migration logs',
						invocationMessage: 'Searching files',
						toolInput: '{"pattern":"importConversation"}',
						confirmed: ToolCallConfirmationReason.NotNeeded,
						success: true,
						pastTenseMessage: 'Searched files',
						content: [{ type: ToolResultContentType.Text, text: '1 match' }],
					},
				},
				{ kind: ResponsePartKind.Markdown, id: 'm-1', content: 'Found the cause.' },
			],
			usage: undefined,
			state: TurnState.Complete,
		}],
	};

	test('round-trips imported conversations through JSON, preserving unrelated metadata and stripping the import key when requested', () => {
		const meta = JSON.parse(JSON.stringify(withCreateSessionImportMeta({ other: 'keep' }, sampleImport)));
		const serialized = JSON.stringify(serializeCreateSessionImport(sampleImport));
		const chunks = splitCreateSessionImportChunks(serialized, 64);
		assert.deepStrictEqual({
			read: readCreateSessionImportMeta(meta),
			stagedRead: readCreateSessionImportMeta(withStagedCreateSessionImportMeta(undefined, 'tx-1'), id => id === 'tx-1' ? chunks.join('') : undefined),
			stripped: withoutCreateSessionImportMeta(meta),
			strippedOnlyKey: withoutCreateSessionImportMeta(withCreateSessionImportMeta(undefined, { turns: [] })),
		}, {
			read: sampleImport,
			stagedRead: sampleImport,
			stripped: { other: 'keep' },
			strippedOnlyKey: undefined,
		});
	});

	test('splits chunks within bounds without breaking UTF-16 surrogate pairs', () => {
		const textWithEmoji = 'ab😀cd😀ef';
		const chunks = splitCreateSessionImportChunks(textWithEmoji, 3);
		assert.deepStrictEqual({
			chunks,
			reconstructed: chunks.join(''),
			allWithinBound: chunks.every(chunk => chunk.length <= 3),
		}, {
			chunks: ['ab', '😀c', 'd😀', 'ef'],
			reconstructed: textWithEmoji,
			allWithinBound: true,
		});
	});

	test('absent metadata reads as undefined and malformed values as invalid', () => {
		const malformed: unknown[] = [
			null,
			'turns',
			[],
			{},
			{ turns: 'not-an-array' },
			{ turns: [{}] },
			{ turns: [{ id: 't-1', message: { text: 'hi', origin: { kind: 'invalid' } }, responseParts: [], state: 'complete' }] },
			{ turns: [], model: { id: '   ' } },
			{ turns: [], model: { id: 'gpt-5', config: JSON.parse('{"__proto__":"polluted"}') } },
			{ turns: [], model: { id: 'gpt-5', config: { constructor: 'polluted' } } },
			{ turns: [], title: 42 },
			{ transferId: '' },
			{ transferId: '   ' },
			{ transferId: 123 },
			{ transferId: 'unknown-id' },
		];
		assert.deepStrictEqual({
			absent: [undefined, {}, { other: true }].map(meta => readCreateSessionImportMeta(meta)),
			malformed: malformed.map(value => readCreateSessionImportMeta({ [AgentHostCreateSessionImportMetaKey]: value }, () => undefined)),
			corruptStagedJson: readCreateSessionImportMeta(withStagedCreateSessionImportMeta(undefined, 'corrupt'), () => '{not-json'),
			directRead: readCreateSessionImportValue(JSON.parse(JSON.stringify(serializeCreateSessionImport({ turns: [] })))),
		}, {
			absent: [undefined, undefined, undefined],
			malformed: malformed.map(() => 'invalid'),
			corruptStagedJson: 'invalid',
			directRead: { turns: [] },
		});
	});

	test('the VS Code host advertises the capability; other hosts do not', () => {
		assert.deepStrictEqual([
			undefined,
			{ protocolVersion: '1', serverSeq: 0, snapshots: [] },
			{ protocolVersion: '1', serverSeq: 0, snapshots: [], _meta: { 'vscode.detachedWorktrees': true as const } },
			{ protocolVersion: '1', serverSeq: 0, snapshots: [], _meta: getAgentHostExtensionInitializeResultMeta() },
		].map(result => supportsAgentHostCreateSessionImport(result)), [false, false, false, true]);
	});
});
