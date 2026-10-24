/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyValue } from '../../../../../platform/contextkey/common/contextkey.js';
import { Menus } from '../../../../browser/menus.js';
import { describeMenuGroup } from '../../../../test/browser/sessionLayoutModeTestUtils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { SessionLayoutMode } from '../../../../common/sessionLayoutMode.js';
import { ChatWindowTerminalPosition } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { getChatWindowTerminalPlacement } from '../../browser/chatWindowEditor.js';
import { ChatWindowDefaults, ChatWindowState } from '../../browser/chatWindowState.js';
import '../../browser/chatWindow.contribution.js';

suite('Chat window - terminal position', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('is chosen from a Terminal Position menu in the More Actions menu of the terminal row only, the current position checked', () => {
		const row: Record<string, ContextKeyValue> = {
			chatIsEnabled: true,
			'sessions.chatWindow': 'test',
			'sessions.chatWindowHasEditorArea': true,
			'sessions.chatWindowTerminalRow': true,
			'sessions.chatWindowTerminalPosition': 'underEditor',
			'sessions.splitLayout': SessionLayoutMode.SideBySide,
		};
		const terminalPosition = (contextKeys: Record<string, ContextKeyValue>) => describeMenuGroup(store, MenuId.EditorTitle, '9_chatWindowTerminalPosition', contextKeys, {});
		const entry = (id: string, label: string, checked = false) => ({ id: `sessions.chatWindow.terminalPosition.${id}`, label, checked, enabled: true });

		assert.deepStrictEqual({
			row: terminalPosition(row),
			otherGroup: terminalPosition({ ...row, 'sessions.chatWindowTerminalRow': false }),
			aiDisabled: terminalPosition({ ...row, chatIsEnabled: false }),
			// Stacked, the row is always across the bottom.
			stacked: terminalPosition({ ...row, 'sessions.splitLayout': SessionLayoutMode.Stacked }),
			inLayoutMenu: MenuRegistry.getMenuItems(Menus.SessionLayout).filter(isIMenuItem).filter(item => item.command.id.startsWith('sessions.chatWindow.terminalPosition.')).length,
		}, {
			row: [{ label: 'Terminal Position', icon: undefined, entries: [entry('fullWidth', 'Across Full Width'), entry('underEditor', 'Under Editor', true), entry('underChat', 'Under Chat')] }],
			otherGroup: [],
			aiDisabled: [],
			stacked: [],
			inLayoutMenu: 0,
		});
	});

	test('puts the terminal row across the bottom while stacked, whatever position is chosen, which applies again side by side', () => {
		const storageService = store.add(new InMemoryStorageService());
		const window = new ChatWindowState({ id: 'test', title: 'Test' }, false, true, new ChatWindowDefaults({ id: 'test', title: 'Test' }, storageService));
		window.setTerminalPosition(ChatWindowTerminalPosition.UnderEditor);
		const placement = () => getChatWindowTerminalPlacement(window.terminalPosition.get(), window.splitLayout.get());
		window.setLayout(SessionLayoutMode.Stacked);
		const stacked = { placement: placement(), chosen: window.terminalPosition.get() };
		window.setLayout(SessionLayoutMode.SideBySide);
		const sideBySide = { placement: placement(), chosen: window.terminalPosition.get() };

		assert.deepStrictEqual({
			stacked, sideBySide,
			stackedAny: [ChatWindowTerminalPosition.FullWidth, ChatWindowTerminalPosition.UnderEditor, ChatWindowTerminalPosition.UnderChat].map(position => getChatWindowTerminalPlacement(position, SessionLayoutMode.Stacked)),
		}, {
			stacked: { placement: ChatWindowTerminalPosition.FullWidth, chosen: ChatWindowTerminalPosition.UnderEditor },
			sideBySide: { placement: ChatWindowTerminalPosition.UnderEditor, chosen: ChatWindowTerminalPosition.UnderEditor },
			stackedAny: [ChatWindowTerminalPosition.FullWidth, ChatWindowTerminalPosition.FullWidth, ChatWindowTerminalPosition.FullWidth],
		});
	});
});
