/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../base/common/uri.js';
import { upcastPartial } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { SessionView } from '../../browser/parts/sessionView.js';
import { SessionsParts } from '../../browser/parts/sessionsParts.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';

suite('Sessions - Sessions Parts', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('a session scoped to a chat has the view that shows exactly it, such as a pane of its own in the grid, and none while no view shows it, such as a chat window\'s chat editor: not the main window\'s view of its session', () => {
		const gridSession = upcastPartial<IActiveSession>({ sessionId: 'session' });
		const paneSession = upcastPartial<IActiveSession>({ sessionId: 'session', scopedChatResource: URI.parse('test:/pane') });
		const editorSession = upcastPartial<IActiveSession>({ sessionId: 'session', scopedChatResource: URI.parse('test:/editor') });
		const mainView = upcastPartial<SessionView>({});
		const paneView = upcastPartial<SessionView>({});
		const parts: SessionsParts = Object.assign(Object.create(SessionsParts.prototype), {
			_mainPart: {
				getSessionView: (sessionId: string | undefined) => sessionId === 'session' ? mainView : undefined,
				getViewOfSession: (session: IActiveSession) => session === gridSession ? mainView : session === paneSession ? paneView : undefined,
			},
		});
		const name = (view: SessionView | undefined) => view === paneView ? 'pane' : view === mainView ? 'main' : undefined;

		assert.deepStrictEqual({
			grid: name(parts.getSessionView(gridSession)),
			pane: name(parts.getSessionView(paneSession)),
			editor: name(parts.getSessionView(editorSession)),
		}, { grid: 'main', pane: 'pane', editor: undefined });
	});
});
