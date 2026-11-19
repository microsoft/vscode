/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore, markAsSingleton } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ExtUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { getChatSessionArchiveActionWording } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IMissionControlEnvironmentService } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IAutomationDescriptor, IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationCatalogueState, IAutomationProviderDescriptor, IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IVoicePlaybackService } from '../../../../../workbench/contrib/chat/common/voicePlaybackService.js';
import { Menus } from '../../../../../workbench/contrib/sessions/browser/menus.js';
import { ISessionsListModelService } from '../../../../../workbench/contrib/sessions/browser/sessionsListModelService.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { stubSessionsService } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { ISession } from '../../../../../workbench/services/sessions/common/session.js';
import { AgentsWindowMenus } from '../../../../browser/agentsWindowMenus.js';
import { registerAutomationHistoryItemActions } from '../../browser/automationRunHistory.js';
import { TestSessionsManagementService } from '../../../sessions/test/browser/sessionsListTestUtils.js';

let fixtureHistoryMenusRegistered = false;

export function registerAutomationHistoryFixtureMenus(): void {
	if (!fixtureHistoryMenusRegistered) {
		fixtureHistoryMenusRegistered = true;
		const wording = getChatSessionArchiveActionWording(new TestConfigurationService());
		markAsSingleton(registerAutomationHistoryItemActions(wording, Menus.AutomationsHistoryItem, Menus.AutomationsHistoryItemContext, { group: '2_delete', order: 1 }));
		markAsSingleton(registerAutomationHistoryItemActions(wording, AgentsWindowMenus.AutomationsModalHistoryItem, AgentsWindowMenus.AutomationsModalHistoryContext, { group: '4_manage', order: 2 }));
	}
}

export function setupModalHistoryServices(instantiationService: TestInstantiationService, store: Pick<DisposableStore, 'add'>) {
	const sessionsChanged = store.add(new Emitter<ISessionsChangeEvent>());
	const sessions = new class extends TestSessionsManagementService {
		override readonly onDidChangeSessions = sessionsChanged.event;
	}([]);
	instantiationService.stub(ISessionsManagementService, sessions);
	stubSessionsService(instantiationService, new class extends mock<ISessionsService>() {
		override readonly slotPanes = constObservable([]);
		readonly activeSession = constObservable<ISession | undefined>(undefined);
		override async openSession(): Promise<void> { }
	}());
	const chatModels = observableValue<Iterable<IChatModel>>('chatModels', []);
	instantiationService.stub(IChatService, new class extends mock<IChatService>() {
		override readonly chatModels = chatModels;
	}());
	instantiationService.stub(IUriIdentityService, new class extends mock<IUriIdentityService>() {
		override readonly extUri = new ExtUri(() => false);
	}());
	instantiationService.stub(ISessionsListModelService, new class extends mock<ISessionsListModelService>() {
		override readonly onDidChange = Event.None;
		override isSessionPinned(): boolean { return false; }
		override isSessionListed(): boolean { return false; }
		override getStatusIcon() { return Codicon.circleSmallFilled; }
	}());
	instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
		override readonly onDidChangeProviders = Event.None;
		override getProviders() { return []; }
	}());
	instantiationService.stub(IVoicePlaybackService, new class extends mock<IVoicePlaybackService>() {
		override readonly pendingResponseVersion = constObservable(0);
		override hasPendingResponse() { return false; }
	}());
	instantiationService.stub(IAgentHostConnectionsService, new class extends mock<IAgentHostConnectionsService>() { }());
	instantiationService.stub(createDecorator<object>('agentSessions'), { model: { observeSession: () => constObservable(undefined) } });
	return { sessions, sessionsChanged, chatModels };
}

export function tableAutomation(id: string, name: string, overrides: Partial<IAutomationDescriptor> = {}): IAutomationDescriptor {
	return {
		id, name, prompt: `Review ${name}`,
		schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
		target: { kind: 'workspace', folderUri: URI.file('C:\\workspaces\\sample'), providerId: 'local', isolation: { kind: 'default' } },
		createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', enabled: true,
		...overrides,
	};
}

export class TableAutomationService extends mock<IAutomationService>() {
	override readonly automations = observableValue<readonly IAutomationDescriptor[]>(this, [
		tableAutomation('bravo', 'Bravo daily'),
		tableAutomation('alpha', 'Alpha manual', { schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 } }),
		tableAutomation('charlie', 'Charlie shared', { ownership: 'repository', isCreatedByCurrentUser: true, enabled: false }),
	]);
	override readonly runs = observableValue<readonly IAutomationRun[]>(this, [{
		id: 'run-1', automationId: 'bravo', status: 'completed', trigger: 'manual', startedAt: '2026-01-02T09:00:00Z',
	}]);
	override readonly catalogueState = observableValue<AutomationCatalogueState>(this, 'ready');
	override readonly availableProviders = constObservable<readonly IAutomationProviderDescriptor[]>([{ id: 'local', label: 'This Computer' }]);
	override readonly unavailableProviders = observableValue<readonly IAutomationProviderDescriptor[]>(this, []);
	refreshCalls = 0;
	mutable = true;
	runnable = true;
	override async refresh(): Promise<void> { this.refreshCalls++; }
	override getAutomation(id: string): IAutomationDescriptor | undefined { return this.automations.get().find(automation => automation.id === id); }
	override canUpdateAutomation(): boolean { return this.mutable; }
	override canDeleteAutomation(): boolean { return this.mutable; }
	override canRunAutomation(): boolean { return this.runnable; }
	override getProviderConfiguration(): undefined { return undefined; }
}

export class TableRemoteService extends mock<IRemoteAgentHostService>() {
	override readonly onDidChangeConfiguredEntries = Event.None;
	override readonly onDidChangeConnections = Event.None;
	override readonly configuredEntries = [];
	override readonly connections = [];
}

export class TableEnvironmentService extends mock<IMissionControlEnvironmentService>() {
	override readonly hosts = constObservable([]);
}
