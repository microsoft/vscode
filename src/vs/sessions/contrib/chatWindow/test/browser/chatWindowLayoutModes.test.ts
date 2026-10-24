/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextKeyValue } from '../../../../../platform/contextkey/common/contextkey.js';
import { SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING, SESSION_ACTIVITY_BAR_SETTING } from '../../../../common/sessionConfig.js';
import { SessionLayoutMode } from '../../../../common/sessionLayoutMode.js';
import { describeSessionActivityBarLayout } from '../../../../test/browser/sessionLayoutModeTestUtils.js';
import '../../browser/chatWindow.contribution.js';

suite('Chat window - layout modes in the Session Activity Bar', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('lead the Session Activity Bar of a chat window with an editor area with one Layout button while it shows its layout actions, without side by side docked', () => {
		const settings = { [SESSION_ACTIVITY_BAR_SETTING]: true, [SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING]: true };
		const base: Record<string, ContextKeyValue> = {
			chatIsEnabled: true,
			'sessions.chatWindow': 'test',
			'sessions.chatWindowHasEditor': true,
			'sessions.chatWindowHasEditorArea': true,
			'sessions.layoutMode': SessionLayoutMode.Stacked,
		};
		const strip = (contextKeys: Record<string, ContextKeyValue>, overrides: Record<string, unknown> = {}) => describeSessionActivityBarLayout(store, contextKeys, { ...settings, ...overrides });
		const entry = (id: string, label: string, checked = false) => ({ id: `sessions.chatWindow.${id}`, label, checked });

		assert.deepStrictEqual({
			layoutActions: strip(base),
			docked: strip({ ...base, 'sessions.chatWindowDocked': true }),
			editorOnly: strip({ ...base, 'sessions.layoutMode': SessionLayoutMode.EditorOnly }).map(item => [item.label, item.entries?.filter(e => e.checked).map(e => e.label)]),
			layoutActionsOff: strip(base, { [SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING]: false }),
			singleEditor: strip({ ...base, 'sessions.chatWindowHasEditorArea': false }),
			mainWindow: strip({ ...base, 'sessions.chatWindow': undefined, 'sessions.chatWindowHasEditor': false, 'sessions.chatWindowHasEditorArea': false }),
		}, {
			layoutActions: [{
				label: 'Layout: Stacked', icon: 'split-vertical', entries: [
					entry('showChatOnly', 'Chat Only'), entry('showEditorOnly', 'Editor Only'), entry('showEditorAboveChat', 'Stacked', true), entry('showSideBySide', 'Side by Side'),
				]
			}],
			docked: [{
				label: 'Layout: Stacked', icon: 'split-vertical', entries: [
					entry('showChatOnly', 'Chat Only'), entry('showEditorOnly', 'Editor Only'), entry('showEditorAboveChat', 'Stacked', true),
				]
			}],
			editorOnly: [['Layout: Editor Only', ['Editor Only']]],
			layoutActionsOff: [],
			singleEditor: [],
			mainWindow: [],
		});
	});
});
