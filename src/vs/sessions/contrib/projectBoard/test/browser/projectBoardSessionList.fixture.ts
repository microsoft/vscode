/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ChatInteractivity, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { createListHarness, createTestSession } from '../../../sessions/test/browser/sessionsListTestUtils.js';
import { getProjectBoardCardId } from '../../common/projectBoardModel.js';
import { ProjectBoardChatSidePanel } from '../../browser/projectBoardChatSidePanel.js';
import { IProjectBoardDraft, ProjectBoardChatWindows } from '../../browser/projectBoardNavigation.js';
import { ProjectBoardService } from '../../browser/projectBoardService.js';
import { ProjectBoardState } from '../../browser/projectBoardState.js';
import { ProjectBoardCatalogService } from '../../browser/projectBoardCatalog.js';
import { DEFAULT_PROJECT_BOARD_ID, IProjectBoardCatalogService } from '../../common/projectBoardCatalog.js';

function renderBoard({ container, disposableStore, theme }: ComponentFixtureContext, width: number, collapseChats = false): void {
	container.classList.add('kanban-custom-view');
	container.style.width = `${width}px`;
	container.style.height = '650px';
	container.style.overflow = 'auto';
	const statuses = [SessionStatus.InProgress, SessionStatus.NeedsInput, SessionStatus.Completed];
	const sessions = ['Investigate rendering performance', 'Update session navigation', 'Review accessibility'].map((title, index): ISession => {
		const base = createTestSession(title, { resourceId: `board-${index}`, workspaceLabel: index === 1 ? 'vscode-tools' : 'vscode', status: statuses[index] }).session;
		const chats = ['Main conversation', 'Follow-up investigation'].map((name, chatIndex): IChat => ({
			resource: URI.parse(`test-chat:board-${index}-${chatIndex}`),
			createdAt: new Date(2026, 8, 16, 12),
			workspace: base.workspace,
			title: constObservable(name),
			status: constObservable(statuses[index]),
			isRead: constObservable(index === 2),
			isArchived: constObservable(false),
			interactivity: constObservable(ChatInteractivity.Full),
			updatedAt: constObservable(new Date(2026, 8, 16, 12)),
			description: constObservable(undefined),
			changes: constObservable([]),
			changesets: constObservable([]),
			checkpoints: constObservable(undefined),
			modelId: constObservable(undefined),
			modelSource: constObservable(undefined),
			mode: constObservable(undefined),
			lastTurnEnd: constObservable(undefined),
			capabilities: constObservable({ canRename: false, canDelete: false }),
		}));
		return {
			...base,
			updatedAt: constObservable(new Date(2026, 8, 16, 12)),
			chats: observableValue('chats', chats),
			mainChat: constObservable(chats[0]),
			capabilities: constObservable({ supportsMultipleChats: true }),
		};
	});
	const themeServices = createEditorServices(disposableStore, { colorTheme: theme });
	const themeService = themeServices.get(IThemeService);
	const { instantiationService } = createListHarness(disposableStore, sessions);
	instantiationService.stub(IThemeService, themeService);
	instantiationService.stub(IChatSessionsService, { getMaterializedSessionResource: () => undefined });
	instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
		override readonly newSession = constObservable<ISession | undefined>(undefined);
		override readonly onDidChangeSessions = Event.None;
		override getSessions() { return sessions; }
	});
	instantiationService.stubInstance(ProjectBoardChatWindows, {
		drafts: observableValue<readonly IProjectBoardDraft[]>('drafts', []),
		async open() { },
		dispose() { },
	});
	instantiationService.stubInstance(ProjectBoardChatSidePanel, { close() { }, dispose() { } });
	const catalog = disposableStore.add(instantiationService.createInstance(ProjectBoardCatalogService));
	instantiationService.stub(IProjectBoardCatalogService, catalog);
	const state = disposableStore.add(instantiationService.createInstance(ProjectBoardState, DEFAULT_PROJECT_BOARD_ID));
	state.setDisplayOption('showSessionList', true);
	state.moveCards(sessions[0].chats.get().map(chat => getProjectBoardCardId(sessions[0], chat)), { rowId: 'general', columnId: 'p0' });
	state.moveCards(sessions[1].chats.get().map(chat => getProjectBoardCardId(sessions[1], chat)), { rowId: 'general', columnId: 'p1' });
	const service = disposableStore.add(instantiationService.createInstance(ProjectBoardService));
	const view = disposableStore.add(service.createView(container));
	view.layout(width, 650);
	if (collapseChats) {
		for (const twistie of container.querySelectorAll<HTMLElement>('.monaco-tl-twistie.collapsible')) {
			twistie.click();
		}
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/projectBoard/' }, {
	SessionList: defineComponentFixture({ render: context => renderBoard(context, 1250) }),
	SessionListCollapsed: defineComponentFixture({ render: context => renderBoard(context, 1250, true) }),
	SessionListNarrow: defineComponentFixture({ render: context => renderBoard(context, 760) }),
});
