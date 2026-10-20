/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns
import { SessionsListNotice } from '../../../../../sessions/contrib/sessions/browser/views/sessionsListNotice.js';
// eslint-disable-next-line local/code-import-patterns
import { renderSessionsListFixture } from '../../../../../sessions/contrib/sessions/test/browser/sessionsListFixtureUtils.js';
import { CODEX_CONTINUATION_DISABLE_LABEL, CODEX_CONTINUATION_LABEL, CODEX_CONTINUATION_MESSAGE } from '../../../../contrib/chat/browser/agentSessions/agentHost/codexContinuationGuide.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

const options = {
	description: CODEX_CONTINUATION_MESSAGE,
	label: CODEX_CONTINUATION_LABEL,
	disableLabel: CODEX_CONTINUATION_DISABLE_LABEL,
	dismiss: () => { }, run: () => { }, disable: () => { }, focusSessionsList: () => { },
};

function renderNotice({ container, disposableStore, theme }: ComponentFixtureContext): void {
	container.style.width = '360px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';
	const instantiation = createEditorServices(disposableStore, { colorTheme: theme });
	container.appendChild(disposableStore.add(instantiation.createInstance(SessionsListNotice, options)).domNode);
}

async function renderInList(context: ComponentFixtureContext): Promise<void> {
	const fixture = await renderSessionsListFixture(context, {
		header: {}, view: { width: 400, height: 520 },
		sessions: [
			{ id: 'active', title: 'Fix authentication redirect', workspace: 'vscode', minutesAgo: 4 },
			{ id: 'tests', title: 'Investigate integration tests', workspace: 'vscode', minutesAgo: 12 },
		],
	});
	const notice = context.disposableStore.add(fixture.instantiationService.createInstance(SessionsListNotice, options));
	fixture.listHost.parentElement!.appendChild(notice.domNode);
	fixture.list.layout(fixture.listHost.clientHeight, 400);
}

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	CodexContinuationNotice: defineComponentFixture({ render: renderNotice, additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	CodexContinuationNoticeInSessionsView: defineComponentFixture({ render: renderInList, additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
});
