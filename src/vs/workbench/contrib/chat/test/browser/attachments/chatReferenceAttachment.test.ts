/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSession } from '../../../../../../platform/agentHost/common/agentService.js';
import { buildOpenSessionLinkForChatResource } from '../../../../../../platform/agentHost/common/openSessionLink.js';
import { buildChatUri, buildDefaultChatUri } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ChatAttachmentWidgetRegistry, IChatAttachmentWidgetInstance } from '../../../browser/attachments/chatAttachmentWidgetRegistry.js';
import { createChatReferenceVariableEntry, IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';

suite('ChatReferenceAttachment', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionUri = AgentSession.uri('claude', 'abc123');

	function createFakeWidget(): IChatAttachmentWidgetInstance {
		return {
			element: {} as HTMLElement,
			onDidDelete: Event.None,
			onDidOpen: Event.None,
			dispose: () => { },
		};
	}

	test('registry selects the chat-reference widget for a chat-reference entry only', () => {
		const registry = new ChatAttachmentWidgetRegistry();
		const fake = createFakeWidget();
		const disposable = registry.registerFactory('chatReference', () => fake);

		const chatReferenceEntry = createChatReferenceVariableEntry(URI.parse(buildDefaultChatUri(sessionUri)), 'turn-1', 'My Chat');
		const genericEntry: IChatRequestVariableEntry = { kind: 'generic', id: 'other', name: 'other', value: 'v' };

		assert.deepStrictEqual(
			{
				chatReferenceMatched: registry.createWidget(chatReferenceEntry, { shouldFocusClearButton: false, supportsDeletion: false }, {} as HTMLElement) === fake,
				genericMatched: registry.createWidget(genericEntry, { shouldFocusClearButton: false, supportsDeletion: false }, {} as HTMLElement) === fake,
			},
			{
				chatReferenceMatched: true,
				genericMatched: false,
			}
		);

		disposable.dispose();
	});

	test('builds the open-session link for a default chat and a peer chat', () => {
		assert.deepStrictEqual(
			{
				defaultChat: buildOpenSessionLinkForChatResource(buildDefaultChatUri(sessionUri)),
				peerChat: buildOpenSessionLinkForChatResource(buildChatUri(sessionUri, 'peer1')),
			},
			{
				defaultChat: 'agent-host-session://claude/abc123',
				peerChat: 'agent-host-session://claude/abc123?chat=peer1',
			}
		);
	});
});
