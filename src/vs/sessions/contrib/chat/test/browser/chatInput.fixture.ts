/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderChatInput } from '../../../../../workbench/test/browser/componentFixtures/chat/renderChatInput.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';

// Loaded here (rather than in the workbench-layer fixture) so the
// `.interactive-input-part` padding (32px each side) that the `isSessionsWindow`
// layout path accounts for is available without a layering violation.
import '../../browser/media/chatView.css';

/**
 * Wraps the fixture context so the chat input renders inside the sessions window
 * DOM ancestry the sessions CSS expects:
 * `.agent-sessions-workbench > .part.sessionspart > .interactive-session`.
 * This is what scopes the `.interactive-input-part` 32px horizontal padding that
 * the `isSessionsWindow` layout path accounts for. Returns a derived context whose
 * `container` is the `.part.sessionspart` element the input should render into.
 */
function sessionsWindowContext(context: ComponentFixtureContext): ComponentFixtureContext {
	context.container.classList.add('agent-sessions-workbench');
	const sessionsPart = document.createElement('div');
	sessionsPart.classList.add('part', 'sessionspart');
	context.container.appendChild(sessionsPart);
	return { ...context, container: sessionsPart };
}

export default defineThemedFixtureGroup({ path: 'sessions/chat/input/' }, {
	SessionsWindow: defineComponentFixture({
		render: context => renderChatInput(sessionsWindowContext(context), {
			isSessionsWindow: true,
			value: 'word word word word word word word word word word word word word word word word word word word word word word word word',
		})
	}),
	// Partial multi-line selection so the reverse-rounded selection corners are
	// rendered. These cut-out pieces use `.monaco-editor-background`, which must
	// remain opaque so the selection corners render correctly.
	SessionsWindowSelection: defineComponentFixture({
		render: context => renderChatInput(sessionsWindowContext(context), {
			isSessionsWindow: true,
			value: 'asdasd asdasd asdasd\nasd\nasdasd asdasd asdasd asdasd',
			selection: { startLineNumber: 1, startColumn: 3, endLineNumber: 3, endColumn: 8 },
		})
	}),
});
