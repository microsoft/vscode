/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuItem, isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { MultiDiffEditorFilesViewAndPositionMenu } from '../../../../../workbench/contrib/multiDiffEditor/common/multiDiffEditor.js';
import { SessionChangesEditor } from '../../../changes/browser/sessionChangesEditor.js';
import '../../browser/chatWindowChangesFileList.js';

suite('Chat window - Changes editor file list', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const chatWindowItems = (menu: MenuId) => MenuRegistry.getMenuItems(menu).filter((item): item is IMenuItem => isIMenuItem(item) && !!item.when?.keys().includes('sessions.chatWindow'));

	test('the toolbar entry reuses the core command and only shows for the Changes editor of a chat window with AI enabled', () => {
		const entries = chatWindowItems(MenuId.EditorTitle);
		const when = entries[0].when!;
		const matches = (values: Record<string, unknown>) => when.evaluate({ getValue: (key: string) => values[key] } as never);

		const chatWindow = { 'sessions.chatWindow': 'chat', activeEditor: SessionChangesEditor.ID, multiDiffEditorFileListAvailable: true, [ChatContextKeys.enabled.key]: true };
		assert.deepStrictEqual(
			{
				commands: entries.map(entry => entry.command.id),
				matches: [matches(chatWindow), matches({ ...chatWindow, 'sessions.chatWindow': undefined }), matches({ ...chatWindow, multiDiffEditorFileListAvailable: false }), matches({ ...chatWindow, activeEditor: 'other' }), matches({ ...chatWindow, [ChatContextKeys.enabled.key]: false })],
			},
			{ commands: ['multiDiffEditor.toggleFileList'], matches: [true, false, false, false, false] },
		);
	});

	test('the files view and position submenu reuses the core commands', () => {
		assert.deepStrictEqual(chatWindowItems(MultiDiffEditorFilesViewAndPositionMenu).map(entry => entry.command.id), [
			'multiDiffEditor.viewFileListAsList',
			'multiDiffEditor.viewFileListAsTree',
			'multiDiffEditor.positionFileListLeft',
			'multiDiffEditor.positionFileListRight',
		]);
	});
});
