/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { transaction } from '../../../../../base/common/observable.js';
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { SessionsListNotification } from '../../browser/views/sessionsListNotification.js';
import { renderSessionsListFixture } from './sessionsListFixtureUtils.js';

function addReplayButton({ container, disposableStore }: ComponentFixtureContext, show: () => void): void {
	container.classList.remove('disable-animations');
	const replay = disposableStore.add(new Button(container, { ...defaultButtonStyles, secondary: true, small: true }));
	replay.label = 'Replay Countdown';
	replay.element.style.width = 'auto';
	replay.element.style.margin = '12px';
	disposableStore.add(replay.onDidClick(show));
}

function renderNotification(context: ComponentFixtureContext, width: number, message: string, animated = false): void {
	const { container, disposableStore, theme } = context;
	container.style.width = `${width}px`;
	container.style.height = animated ? '132px' : '88px';
	container.style.position = 'relative';
	container.style.background = 'var(--vscode-sideBar-background)';
	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
	const notification = disposableStore.add(instantiationService.createInstance(SessionsListNotification, container, () => { }));
	const show = () => notification.show(message, async () => { });
	show();
	if (animated) {
		addReplayButton(context, show);
	} else {
		container.querySelector('.sessions-list-notification')!.dispatchEvent(new MouseEvent('mouseenter'));
	}
}

async function renderNotificationOverSessions(context: ComponentFixtureContext, animated: boolean): Promise<void> {
	const { container, disposableStore } = context;
	container.style.width = '320px';
	container.classList.add('agent-sessions-viewpane');
	const listContainer = DOM.append(container, DOM.$('div'));
	const fixture = await renderSessionsListFixture({ ...context, container: listContainer }, {
		header: {},
		settings: { [ChatSessionArchiveActionWordingSettingId]: ChatSessionArchiveActionWording.MarkAsDone },
		view: { width: 320, height: 520, showArchived: false },
		groups: [{ id: 'release', name: 'Release work', sessions: ['auth', 'reconnect'] }],
		sessions: [
			{ id: 'auth', title: 'Fix authentication redirect loop', workspace: 'vscode', minutesAgo: 4, changesSummary: { files: 4, additions: 132, deletions: 18 } },
			{ id: 'reconnect', title: 'Add reconnect backoff', workspace: 'agent-host-protocol', minutesAgo: 12 },
			{ id: 'tests', title: 'Investigate flaky integration tests', workspace: 'vscode', minutesAgo: 2, status: SessionStatus.InProgress, description: 'Running the integration suite' },
			{ id: 'keyboard', title: 'Improve keyboard navigation', workspace: 'vscode', minutesAgo: 24, isRead: false, changesSummary: { files: 3, additions: 42, deletions: 9 } },
			{ id: 'settings', title: 'Simplify workspace settings', workspace: 'vscode', minutesAgo: 46 },
			{ id: 'scroll', title: 'Keep the active session visible', workspace: 'vscode', minutesAgo: 85 },
			{ id: 'docs', title: 'Update getting started guide', workspace: 'vscode-docs', minutesAgo: 18 },
			{ id: 'links', title: 'Repair broken documentation links', workspace: 'vscode-docs', minutesAgo: 52 },
			{ id: 'examples', title: 'Add configuration examples', workspace: 'vscode-docs', minutesAgo: 120 },
			{ id: 'done-a', title: 'Clean up unused imports', workspace: 'vscode', minutesAgo: 90, isArchived: true },
			{ id: 'done-b', title: 'Update test snapshots', workspace: 'vscode', minutesAgo: 100, isArchived: true },
			{ id: 'done-c', title: 'Fix release note formatting', workspace: 'vscode-docs', minutesAgo: 150, isArchived: true },
		],
	});
	fixture.list.layout(fixture.listHost.clientHeight, 320);
	const content = fixture.listHost.parentElement!;
	const notification = disposableStore.add(fixture.instantiationService.createInstance(SessionsListNotification, content, () => fixture.list.focus()));
	const setDone = (done: boolean) => {
		transaction(tx => {
			for (const id of ['done-a', 'done-b', 'done-c']) {
				fixture.sessions.get(id)!.isArchived.set(done, tx);
			}
		});
		fixture.list.update();
	};
	const show = () => {
		setDone(true);
		notification.show('3 marked done', async () => setDone(false));
	};
	show();
	if (animated) {
		addReplayButton(context, show);
	} else {
		content.querySelector('.sessions-list-notification')!.dispatchEvent(new MouseEvent('mouseenter'));
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	BulkDoneNotificationWithSessions: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderNotificationOverSessions(context, false),
	}),
	BulkDoneNotificationWithSessionsAnimated: defineComponentFixture({
		labels: { kind: 'animated' },
		virtualTime: { enabled: false },
		render: context => renderNotificationOverSessions(context, true),
	}),
	BulkDoneNotification: defineComponentFixture({
		render: context => renderNotification(context, 320, '12 marked done'),
	}),
	BulkDoneNotificationAnimated: defineComponentFixture({
		labels: { kind: 'animated' },
		virtualTime: { enabled: false },
		render: context => renderNotification(context, 320, '12 marked done', true),
	}),
	BulkDoneNotificationNarrow: defineComponentFixture({
		render: context => renderNotification(context, 220, '12 marked done'),
	}),
	BulkArchiveNotification: defineComponentFixture({
		render: context => renderNotification(context, 320, '12 archived'),
	}),
});
