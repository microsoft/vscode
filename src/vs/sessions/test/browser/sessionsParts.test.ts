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
import { IWindowSessionViewHost } from '../../services/sessions/browser/sessionsPartService.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';

suite('Sessions - Sessions Parts', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('the view of a session shown in a window of its own is that window\'s, though the main window shows another chat of its session', () => {
		const gridSession = upcastPartial<IActiveSession>({ sessionId: 'session' });
		const windowSession = upcastPartial<IActiveSession>({ sessionId: 'session' });
		const mainView = upcastPartial<SessionView>({});
		const windowView = upcastPartial<SessionView>({ getSession: () => windowSession });
		const parts: SessionsParts = Object.assign(Object.create(SessionsParts.prototype), {
			_mainPart: { getSessionView: (sessionId: string | undefined) => sessionId === 'session' ? mainView : undefined, getViewOfSession: () => undefined },
			_windowViews: new Map<SessionView, IWindowSessionViewHost>([[windowView, upcastPartial<IWindowSessionViewHost>({})]]),
		});
		const name = (view: SessionView | undefined) => view === windowView ? 'window' : view === mainView ? 'main' : undefined;

		assert.deepStrictEqual({
			windowSession: name(parts.getSessionView(windowSession)),
			gridSession: name(parts.getSessionView(gridSession)),
			sessionId: name(parts.getSessionView('session')),
		}, { windowSession: 'window', gridSession: 'main', sessionId: 'main' });
	});

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
			_windowViews: new Map<SessionView, IWindowSessionViewHost>(),
		});
		const name = (view: SessionView | undefined) => view === paneView ? 'pane' : view === mainView ? 'main' : undefined;

		assert.deepStrictEqual({
			grid: name(parts.getSessionView(gridSession)),
			pane: name(parts.getSessionView(paneSession)),
			editor: name(parts.getSessionView(editorSession)),
		}, { grid: 'main', pane: 'pane', editor: undefined });
	});
});
