/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../base/common/observable.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { URI } from '../../../base/common/uri.js';
import { mock } from '../../../base/test/common/mock.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { DEFAULT_EDITOR_PART_OPTIONS } from '../../../workbench/browser/parts/editor/editor.js';
import { IEditorGroupsService } from '../../../workbench/services/editor/common/editorGroupsService.js';
import { workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { AbstractChatView, ChatViewKind, IChatViewOptions } from '../../browser/parts/chatView.js';
import { SessionsPart } from '../../browser/parts/sessionsPart.js';
import { IAgentWorkbenchLayoutService } from '../../browser/workbench.js';
import { SessionHarnessPickerVisibleContext, SessionIsolationPickerVisibleContext, SessionWorkspacePickerVisibleContext } from '../../common/contextkeys.js';
import { SESSIONS_CHAT_TABS_SETTING, SessionsChatTabsMode } from '../../common/sessionConfig.js';
import { ISessionsChatBackgroundService } from '../../services/chatBackground/browser/chatBackgroundService.js';
import { IChatViewFactory } from '../../services/chatView/browser/chatViewFactory.js';
import { ISessionsListModelService } from '../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsPartService } from '../../services/sessions/browser/sessionsPartService.js';
import { ISessionsProvidersService } from '../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, IChat, ISessionCapabilities, SessionStatus } from '../../services/sessions/common/session.js';
import { ISessionChangesStatsCache } from '../../services/sessions/common/sessionChangesStatsCache.js';
import { SessionInputPickerVisibility } from '../../services/sessions/common/sessionPickerVisibility.js';
import { IActiveSession, ISessionsManagementService } from '../../services/sessions/common/sessionsManagement.js';

export class TestChatView extends AbstractChatView {
	readonly inputPickerVisibility = this._register(new SessionInputPickerVisibility());
	override readonly pickerVisibility = this.inputPickerVisibility.visibility;
	disposed = false;

	constructor(
		readonly kind: ChatViewKind,
		@IContextKeyService public readonly contextKeyService: IContextKeyService,
	) {
		super();
	}

	protected override doLayout(): void { }
	override toJSON(): object { return {}; }
	override focus(): void { }
	override dispose(): void {
		this.disposed = true;
		super.dispose();
	}
}

export function createSessionViewTestServices(store: Pick<DisposableStore, 'add'>) {
	const instantiationService = workbenchInstantiationService(undefined, store);
	const configurationService = new TestConfigurationService({ [SESSIONS_CHAT_TABS_SETTING]: SessionsChatTabsMode.Multiple });
	const contextKeyService = store.add(new ContextKeyService(configurationService));
	const chatViews: TestChatView[] = [];
	instantiationService.stub(IConfigurationService, configurationService);
	instantiationService.stub(IContextKeyService, contextKeyService);
	instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
		override readonly onDidChangeEditorPartOptions = Event.None;
		override readonly partOptions = DEFAULT_EDITOR_PART_OPTIONS;
	}());
	const createChatView = (kind: ChatViewKind, scopedInstantiationService?: IInstantiationService) => {
		assert.ok(scopedInstantiationService);
		const view = scopedInstantiationService.createInstance(TestChatView, kind);
		chatViews.push(view);
		return view;
	};
	instantiationService.stub(IChatViewFactory, new class extends mock<IChatViewFactory>() {
		override createNewChatView(isNewChatInSession: boolean, _options: IChatViewOptions, scopedInstantiationService?: IInstantiationService): AbstractChatView {
			return createChatView(isNewChatInSession ? 'newChatInSession' : 'newSession', scopedInstantiationService);
		}
		override createChatView(scopedInstantiationService?: IInstantiationService): AbstractChatView {
			return createChatView('chat', scopedInstantiationService);
		}
	}());
	instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
		override readonly activeSession = observableValue<IActiveSession | undefined>(this, undefined);
	}());
	instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
		override readonly onDidChangeSessions = Event.None;
	}());
	instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
	instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
		override readonly onDidChangeProviders = Event.None;
		override getProvider() { return undefined; }
	}());
	instantiationService.stub(ISessionsListModelService, new class extends mock<ISessionsListModelService>() {
		override readonly onDidChange = Event.None;
		override isSessionPinned(): boolean { return false; }
		override getStatusIcon(): ThemeIcon { return ThemeIcon.fromId('circle'); }
	}());
	instantiationService.stub(ISessionChangesStatsCache, new class extends mock<ISessionChangesStatsCache>() {
		override get() { return undefined; }
		override set(): void { }
	}());
	return { instantiationService, configurationService, contextKeyService, chatViews };
}

export function createSessionsPartTestHarness(store: Pick<DisposableStore, 'add'>) {
	const services = createSessionViewTestServices(store);
	services.instantiationService.stub(IAgentWorkbenchLayoutService, new class extends mock<IAgentWorkbenchLayoutService>() {
		override registerPart() { return Disposable.None; }
	}());
	services.instantiationService.stub(ISessionsChatBackgroundService, new class extends mock<ISessionsChatBackgroundService>() {
		override readonly onDidChangeBackground = Event.None;
		override getBackground() { return undefined; }
	}());
	const container = document.createElement('div');
	document.body.appendChild(container);
	store.add(toDisposable(() => container.remove()));
	const part = store.add(services.instantiationService.createInstance(SessionsPart));
	part.create(container);
	return { ...services, part };
}

export function createTestActiveSession(sessionId: string, isCreated = true) {
	const chat = new class extends mock<IChat>() {
		override readonly resource = URI.parse(`test-chat://${sessionId}`);
		override readonly title = constObservable('Main Chat');
		override readonly status = constObservable(SessionStatus.Completed);
		override readonly isRead = constObservable(true);
		override readonly interactivity = constObservable(ChatInteractivity.Full);
		override readonly capabilities = constObservable({ canRename: true, canDelete: false });
	}();
	return new class extends mock<IActiveSession>() {
		override readonly sessionId = sessionId;
		override readonly resource = URI.parse(`test-session://${sessionId}`);
		override readonly providerId = 'test';
		override readonly sessionType = 'test';
		override readonly title = constObservable('Session');
		override readonly status = constObservable(SessionStatus.Completed);
		override readonly isRead = constObservable(true);
		override readonly isArchived = constObservable(false);
		override readonly isCreated = observableValue(this, isCreated);
		override readonly sticky = constObservable(false);
		override readonly workspace = constObservable(undefined);
		override readonly changesets = constObservable(undefined);
		override readonly changes = constObservable([]);
		override readonly capabilities: IObservable<ISessionCapabilities> = constObservable({ supportsMultipleChats: true });
		override readonly chats: IObservable<readonly IChat[]> = constObservable([chat]);
		override readonly openChats: IObservable<readonly IChat[]> = constObservable([chat]);
		override readonly closedChats: IObservable<readonly IChat[]> = constObservable([]);
		override readonly visibleChatTabs: IObservable<readonly IChat[]> = constObservable([chat]);
		override readonly activeChat: IObservable<IChat> = constObservable(chat);
		override readonly mainChat: IObservable<IChat> = constObservable(chat);
		override readonly shouldShowChatTabs = constObservable(true);
		override readonly isNewSessionRequestInProgress = constObservable(false);
		override readonly loading = constObservable(false);
	}();
}

export function getSessionPickerVisibility(contextKeyService: IContextKeyService, element?: HTMLElement) {
	const value = (key: string) => element
		? contextKeyService.getContext(element).getValue<boolean>(key)
		: contextKeyService.getContextKeyValue<boolean>(key);
	return {
		workspace: value(SessionWorkspacePickerVisibleContext.key),
		harness: value(SessionHarnessPickerVisibleContext.key),
		isolation: value(SessionIsolationPickerVisibleContext.key),
	};
}
