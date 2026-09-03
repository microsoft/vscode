/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { computeChatEditorTopologySnapshot, IChatEditorTopologySnapshot, shouldLogChatEditorTopologySnapshot } from '../../../browser/telemetry/chatEditorTopologyTelemetry.js';
import { ChatEditorInput } from '../../../browser/widgetHosts/editor/chatEditorInput.js';

suite('ChatEditorTopologyTelemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('counts open and visible Chat Editors across groups', () => {
		assert.deepStrictEqual(computeChatEditorTopologySnapshot([
			{
				editorTypeIds: [ChatEditorInput.TypeID, 'workbench.input.text'],
				activeEditorTypeId: ChatEditorInput.TypeID,
			},
			{
				editorTypeIds: ['workbench.input.text'],
				activeEditorTypeId: 'workbench.input.text',
			},
			{
				editorTypeIds: [ChatEditorInput.TypeID, ChatEditorInput.TypeID],
				activeEditorTypeId: ChatEditorInput.TypeID,
			},
			{
				editorTypeIds: [],
				activeEditorTypeId: undefined,
			},
		]), {
			openChatEditorCount: 3,
			visibleChatEditorCount: 2,
			chatEditorGroupCount: 2,
			visibleEditorCount: 3,
			editorGroupCount: 4,
		});
	});

	test('logs only distinct snapshots entering, changing, or leaving Chat Editor topology', () => {
		const noChat: IChatEditorTopologySnapshot = {
			openChatEditorCount: 0,
			visibleChatEditorCount: 0,
			chatEditorGroupCount: 0,
			visibleEditorCount: 1,
			editorGroupCount: 1,
		};
		const oneChat: IChatEditorTopologySnapshot = {
			openChatEditorCount: 1,
			visibleChatEditorCount: 1,
			chatEditorGroupCount: 1,
			visibleEditorCount: 1,
			editorGroupCount: 1,
		};
		const twoVisibleChats: IChatEditorTopologySnapshot = {
			openChatEditorCount: 2,
			visibleChatEditorCount: 2,
			chatEditorGroupCount: 2,
			visibleEditorCount: 2,
			editorGroupCount: 2,
		};

		assert.deepStrictEqual([
			shouldLogChatEditorTopologySnapshot(undefined, noChat),
			shouldLogChatEditorTopologySnapshot(noChat, oneChat),
			shouldLogChatEditorTopologySnapshot(oneChat, { ...oneChat }),
			shouldLogChatEditorTopologySnapshot(oneChat, twoVisibleChats),
			shouldLogChatEditorTopologySnapshot(oneChat, { ...oneChat, visibleEditorCount: 2, editorGroupCount: 2 }),
			shouldLogChatEditorTopologySnapshot(twoVisibleChats, noChat),
			shouldLogChatEditorTopologySnapshot(noChat, { ...noChat, editorGroupCount: 2 }),
		], [false, true, false, true, true, true, false]);
	});
});
