/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getOlderHostDefaultChat, getOlderHostSkillCompletion, getOlderHostSubagentChatUri } from '../../browser/agentHostOlderHostCompatibility.js';
import type { InitializeResult } from '../../common/state/protocol/common/commands.js';
import type { SimpleMessageAttachment } from '../../common/state/protocol/state.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';
import { MessageAttachmentKind, ROOT_STATE_URI, type MessageResourceAttachment, type RootState } from '../../common/state/sessionState.js';

suite('getOlderHostSkillCompletion', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('converts only the obsolete skill shape from positively identified VS Code hosts', () => {
		const host: InitializeResult = { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [], _meta: { 'vscode.agentHost': true } };
		const olderRoot: RootState = { agents: [], _meta: { hostBuild: { version: '1.146.0' } } };
		const attachment: SimpleMessageAttachment = {
			type: MessageAttachmentKind.Simple, label: '/tools:review',
			_meta: { uri: 'custom-skill:/review/SKILL.md', name: 'review', displayName: 'tools:review', argumentHint: 'Files' },
		};
		const expected: MessageResourceAttachment = { ...attachment, type: MessageAttachmentKind.Resource, uri: 'custom-skill:/review/SKILL.md', displayKind: 'skill' };
		assert.deepStrictEqual({
			native: getOlderHostSkillCompletion(attachment, host, undefined),
			olderRoot: getOlderHostSkillCompletion(attachment, undefined, olderRoot),
			unmarked: getOlderHostSkillCompletion(attachment, { ...host, _meta: {} }, { agents: [] }),
			unknown: getOlderHostSkillCompletion(attachment, undefined, undefined),
			currentResource: getOlderHostSkillCompletion(expected, host, undefined),
			command: getOlderHostSkillCompletion({ ...attachment, _meta: { ...attachment._meta, command: 'review' } }, host, undefined),
			otherKind: getOlderHostSkillCompletion({ ...attachment, displayKind: 'other' }, host, undefined),
			noResource: getOlderHostSkillCompletion({ ...attachment, _meta: {} }, host, undefined),
		}, {
			native: expected, olderRoot: expected, unmarked: undefined, unknown: undefined,
			currentResource: undefined, command: undefined, otherKind: undefined, noResource: undefined,
		});
	});
});

suite('getOlderHostDefaultChat', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const session = 'copilotcli:/session';

	function host(meta: InitializeResult['_meta'], hostBuild?: { version: string }): InitializeResult {
		return {
			protocolVersion: PROTOCOL_VERSION,
			serverSeq: 0,
			snapshots: hostBuild ? [{ resource: ROOT_STATE_URI, state: { agents: [], _meta: { hostBuild } }, fromSeq: 0 }] : [],
			_meta: meta,
		};
	}
	const olderRoot: RootState = { agents: [], _meta: { hostBuild: { version: '1.100.0' } } };

	test('returns the legacy default chat only for older VS Code hosts', () => {
		assert.deepStrictEqual({
			markedVSCodeHost: getOlderHostDefaultChat(session, host({ 'vscode.agentHost': true }), undefined),
			olderVSCodeHostWithHostBuild: getOlderHostDefaultChat(session, host({}, { version: '1.100.0' }), undefined),
			olderVSCodeHostWithRootHostBuild: getOlderHostDefaultChat(session, host({}), olderRoot),
			unmarkedHost: getOlderHostDefaultChat(session, host({}), { agents: [] }),
			unknownHost: getOlderHostDefaultChat(session, undefined, undefined),
		}, {
			markedVSCodeHost: 'ahp-chat://default/Y29waWxvdGNsaTovc2Vzc2lvbg',
			olderVSCodeHostWithHostBuild: 'ahp-chat://default/Y29waWxvdGNsaTovc2Vzc2lvbg',
			olderVSCodeHostWithRootHostBuild: 'ahp-chat://default/Y29waWxvdGNsaTovc2Vzc2lvbg',
			unmarkedHost: undefined,
			unknownHost: undefined,
		});
	});
});

suite('getOlderHostSubagentChatUri', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function host(meta: Record<string, boolean>): InitializeResult {
		return { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [{ resource: ROOT_STATE_URI, state: { agents: [] }, fromSeq: 0 }], _meta: meta };
	}

	test('derives a shaped URI only for a positively identified older VS Code host', () => {
		const session = 'copilotcli:/session';
		const derive = (initialize: InitializeResult | undefined) => getOlderHostSubagentChatUri(session, 'tc-1', initialize, undefined) !== undefined;
		assert.deepStrictEqual({
			olderVSCodeHost: derive(host({ 'vscode.agentHost': true })),
			chatUriAwareHost: derive(host({ 'vscode.agentHost': true, 'vscode.ahpChatUris': true })),
			unmarkedHost: derive(host({})),
			unknownHost: derive(undefined),
		}, { olderVSCodeHost: true, chatUriAwareHost: false, unmarkedHost: false, unknownHost: false });
	});
});
