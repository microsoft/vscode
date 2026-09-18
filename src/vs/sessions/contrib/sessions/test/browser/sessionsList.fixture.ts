/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import type { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IAutomationService, type AutomationCatalogueState } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IPreferencesService } from '../../../../../workbench/services/preferences/common/preferences.js';
import { type ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { NESTED_SESSIONS_SETTING } from '../../../../common/sessionConfig.js';
import { ISessionsListModelService, SessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ChatInteractivity, ChatOriginKind, type IChat, type ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionsGrouping, SessionsList, SessionsSorting } from '../../browser/views/sessionsList.js';
import { createListHarness, createTestSession, type ITestSessionOptions } from './sessionsListTestUtils.js';

const fixtureTime = new Date('2026-05-13T12:00:00.000Z');

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	NestedSessions: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderNestedSessions(ctx, 400),
	}),
	NestedSessionsNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderNestedSessions(ctx, 280),
	}),
});

function createFixtureSession(title: string, options: ITestSessionOptions): ISession {
	const { session } = createTestSession(title, options);
	const mainChat: IChat = {
		resource: session.mainChat.get().resource,
		createdAt: fixtureTime,
		title: session.title,
		updatedAt: constObservable(fixtureTime),
		status: session.status,
		changes: session.changes,
		checkpoints: constObservable(undefined),
		modelId: session.modelId,
		modelSource: constObservable(undefined),
		mode: session.mode,
		isArchived: session.isArchived,
		isRead: session.isRead,
		interactivity: constObservable(ChatInteractivity.Full),
		description: session.description,
		lastTurnEnd: session.lastTurnEnd,
	};
	return {
		...session,
		createdAt: fixtureTime,
		updatedAt: mainChat.updatedAt,
		mainChat: constObservable(mainChat),
		chats: constObservable([mainChat]),
	};
}

function renderNestedSessions(ctx: ComponentFixtureContext, width: number): void {
	const base = createFixtureSession('Coordinate API rollout', { resourceId: 'parent', workspaceLabel: 'Repo A' });
	const peerChat: IChat = {
		...base.mainChat.get(),
		resource: base.resource.with({ fragment: 'peer' }),
		title: constObservable('Review release notes'),
		origin: { kind: ChatOriginKind.User },
	};
	const parent: ISession = {
		...base,
		capabilities: constObservable({ ...base.capabilities.get(), supportsMultipleChats: true }),
		chats: constObservable([base.mainChat.get(), peerChat]),
	};
	const child: ISession = {
		...createFixtureSession('Update client integration', { resourceId: 'child', workspaceLabel: 'Repo B', status: SessionStatus.InProgress }),
		createdBySession: constObservable({ session: parent.resource }),
	};
	const grandchild: ISession = {
		...createFixtureSession('Confirm shared schema migration', { resourceId: 'grandchild', workspaceLabel: 'Repo C', status: SessionStatus.NeedsInput }),
		createdBySession: constObservable({ session: child.resource }),
	};
	const unrelated = createFixtureSession('Unrelated documentation cleanup', { resourceId: 'unrelated', workspaceLabel: 'Repo D' });
	const sessions = [parent, child, grandchild, unrelated];
	const { store, instantiationService } = createListHarness(ctx.disposableStore, sessions, {}, new TestConfigurationService({
		[NESTED_SESSIONS_SETTING]: true,
	}));
	instantiationService.stub(IThemeService, new TestThemeService(ctx.theme, ctx.fileIconTheme));
	instantiationService.stub(ISessionsManagementService, 'getSession', (resource: URI) => sessions.find(session => isEqual(session.resource, resource)));
	instantiationService.stub(ISessionsListModelService, 'getStatusIcon', SessionsListModelService.prototype.getStatusIcon);
	instantiationService.stub(IAutomationService, new class extends mock<IAutomationService>() {
		override readonly automations = constObservable([]);
		override readonly runs = constObservable([]);
		override readonly catalogueState = constObservable<AutomationCatalogueState>('ready');
	}());
	instantiationService.stub(ICustomViewService, new class extends mock<ICustomViewService>() {
		override readonly activeCustomView = constObservable(undefined);
		override hideCustomView(): void { }
	}());
	instantiationService.stub(IAgentHostConnectionsService, new class extends mock<IAgentHostConnectionsService>() {
		override resolveSessionResource() { return undefined; }
	}());
	instantiationService.stub(IPreferencesService, new class extends mock<IPreferencesService>() { }());

	const height = 440;
	ctx.container.classList.add('monaco-workbench');
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = `${height}px`;
	ctx.container.style.setProperty('--session-view-background', 'var(--vscode-agentsPanel-background, var(--vscode-sideBar-background))');
	ctx.container.style.setProperty('--session-view-foreground', 'var(--vscode-agentsPanel-foreground, var(--vscode-sideBar-foreground))');
	ctx.container.style.backgroundColor = 'var(--session-view-background)';

	const list = store.add(instantiationService.createInstance(SessionsList, ctx.container, {
		grouping: () => SessionsGrouping.Workspace,
		sorting: () => SessionsSorting.Created,
		onSessionOpen: () => { },
		onChatOpen: () => { },
	}));
	list.setWorkspaceGroupCapped(false);
	list.update(true);
	list.layout(height, width);
}
