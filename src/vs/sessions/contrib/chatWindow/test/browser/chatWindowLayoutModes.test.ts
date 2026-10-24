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

suite('Chat window - the Layout menu in the Session Activity Bar', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('leads the Session Activity Bar of a chat window with an editor with one Layout button of Show Chat, Show Editor and Stacked while it shows its layout actions, without Stacked docked', () => {
		const settings = { [SESSION_ACTIVITY_BAR_SETTING]: true, [SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING]: true };
		const base: Record<string, ContextKeyValue> = {
			chatIsEnabled: true,
			agentSessionsDesktopLayout: true,
			'sessions.chatWindow': 'test',
			'sessions.chatWindowHasEditor': true,
			'sessions.chatWindowHasEditorArea': true,
			'sessions.layoutMode': SessionLayoutMode.Stacked,
			'sessions.splitLayout': SessionLayoutMode.Stacked,
		};
		const strip = (contextKeys: Record<string, ContextKeyValue>, overrides: Record<string, unknown> = {}) => describeSessionActivityBarLayout(store, contextKeys, { ...settings, ...overrides });
		const entry = (id: string, label: string, checked: boolean, enabled = true) => ({ id: `sessions.chatWindow.${id}`, label, checked, enabled });

		assert.deepStrictEqual({
			layoutActions: strip(base),
			docked: strip({ ...base, 'sessions.chatWindowDocked': true }),
			editorOnly: strip({ ...base, 'sessions.layoutMode': SessionLayoutMode.EditorOnly }),
			layoutActionsOff: strip(base, { [SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING]: false }),
			singleEditor: strip({ ...base, 'sessions.chatWindowHasEditorArea': false }).length,
			noEditor: strip({ ...base, 'sessions.chatWindowHasEditor': false, 'sessions.chatWindowHasEditorArea': false }),
			mainWindow: strip({ ...base, 'sessions.chatWindow': undefined, 'sessions.chatWindowHasEditor': false, 'sessions.chatWindowHasEditorArea': false }).flatMap(item => item.entries ?? []).filter(e => e.id.startsWith('sessions.chatWindow.')),
		}, {
			layoutActions: [{ label: 'Layout', icon: 'layout', entries: [entry('toggleChat', 'Show Chat', true), entry('toggleEditor', 'Show Editor', true), entry('toggleArrangement', 'Stacked', true)] }],
			// Docked, the editor always shows above the chat: no Stacked toggle, and where the window shows.
			docked: [{
				label: 'Layout', icon: 'layout', entries: [
					entry('toggleChat', 'Show Chat', true), entry('toggleEditor', 'Show Editor', true),
					entry('toggleDocked', 'Move to New Window', false), entry('resetDockedSize', 'Reset Size', false, false),
				]
			}],
			// The last pane shown cannot be hidden, and the two can only be arranged while both show.
			editorOnly: [{ label: 'Layout', icon: 'layout', entries: [entry('toggleChat', 'Show Chat', false), entry('toggleEditor', 'Show Editor', true, false), entry('toggleArrangement', 'Stacked', true, false)] }],
			layoutActionsOff: [],
			singleEditor: 1,
			noEditor: [],
			mainWindow: [],
		});
	});
});
