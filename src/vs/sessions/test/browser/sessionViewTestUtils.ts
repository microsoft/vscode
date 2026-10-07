/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../base/common/assert.js';
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
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
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
import { ChatInteractivity, IChat, ISessionCapabilities, ISessionPreparationProgress, SessionStatus } from '../../services/sessions/common/session.js';
import { ISessionChangesStatsCache } from '../../services/sessions/common/sessionChangesStatsCache.js';
import { SessionInputPickerVisibility } from '../../services/sessions/common/sessionPickerVisibility.js';
import { IActiveSession, ISessionsManagementService } from '../../services/sessions/common/sessionsManagement.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { MobileSessionsPart } from '../../browser/parts/mobile/mobileSessionsPart.js';

export class TestChatView extends AbstractChatView {
	readonly inputPickerVisibility = this._register(new SessionInputPickerVisibility());
	override readonly pickerVisibility = this.inputPickerVisibility.visibility;
	disposed = false;
	disposeCount = 0;
	visible = true;
	chat: IChat | undefined;
	readonly input = document.createElement('textarea');
	readonly layouts: { width: number; height: number }[] = [];
	onLayout: (() => void) | undefined;

	constructor(
		readonly kind: ChatViewKind,
		@IContextKeyService public readonly contextKeyService: IContextKeyService,
	) {
		super();
		this.element.appendChild(this.input);
	}

	override setChat(chat: IChat): void { this.chat = chat; }
	override setVisible(visible: boolean): void { this.visible = visible; }
	protected override doLayout(width: number, height: number): void {
		assert(!this.disposed, 'A disposed chat view must not receive layout');
		this.layouts.push({ width, height });
		this.onLayout?.();
	}
	override toJSON(): object { return {}; }
	override focus(): void { this.input.focus(); }
	override dispose(): void {
		this.disposed = true;
		this.disposeCount++;
		super.dispose();
	}
}

export function createSessionViewTestServices(store: Pick<DisposableStore, 'add'>, instantiationService = workbenchInstantiationService(undefined, store)) {
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
		assert(scopedInstantiationService !== undefined);
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

export function createSessionsPartTestHarness(store: Pick<DisposableStore, 'add'>, mobile = false, options?: { container?: HTMLElement; instantiationService?: TestInstantiationService; layoutService?: IAgentWorkbenchLayoutService }) {
	const services = createSessionViewTestServices(store, options?.instantiationService);
	const container = options?.container ?? document.createElement('div');
	container.classList.toggle('phone-layout', mobile);
	services.instantiationService.stub(IAgentWorkbenchLayoutService, options?.layoutService ?? new class extends mock<IAgentWorkbenchLayoutService>() {
		override registerPart() { return Disposable.None; }
		override readonly mainContainer = container;
		override readonly mainContainerDimension = { width: 1200, height: 800 };
		override isVisible(part: Parts) { return part === Parts.SESSIONS_PART || part === Parts.SIDEBAR_PART; }
		override isEditorPaneVisible() { return false; }
		override isModernUICompact() { return false; }
	}());
	services.instantiationService.stub(ISessionsChatBackgroundService, new class extends mock<ISessionsChatBackgroundService>() {
		override readonly onDidChangeBackground = Event.None;
		override getBackground() { return undefined; }
	}());
	if (!options?.container) {
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
	}
	const part = store.add(services.instantiationService.createInstance(mobile ? MobileSessionsPart : SessionsPart));
	part.create(container);
	return { ...services, part, container };
}

export function createTestActiveSession(sessionId: string, isCreated = true, lifecycle?: {
	readonly isNewSessionRequestInProgress?: IObservable<boolean>;
	readonly preparationProgress?: IObservable<ISessionPreparationProgress | undefined>;
}) {
	const chat = new class extends mock<IChat>() {
		override readonly resource = URI.parse(`test-chat://${sessionId}`);
		override readonly workspace = constObservable(undefined);
		override readonly title = constObservable('Main Chat');
		override readonly status = constObservable(SessionStatus.Completed);
		override readonly isRead = constObservable(true);
		override readonly interactivity = constObservable(ChatInteractivity.Full);
		override readonly capabilities = constObservable({ canRename: true, canArchive: false, canDelete: false });
		override readonly changes = constObservable([]);
		override readonly changesets = constObservable([]);
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
		override readonly capabilities: IObservable<ISessionCapabilities> = constObservable({ supportsMultipleChats: true });
		override readonly chats: IObservable<readonly IChat[]> = constObservable([chat]);
		override readonly openChats: IObservable<readonly IChat[]> = constObservable([chat]);
		override readonly closedChats: IObservable<readonly IChat[]> = constObservable([]);
		override readonly visibleChatTabs: IObservable<readonly IChat[]> = constObservable([chat]);
		override readonly activeChat: IObservable<IChat> = constObservable(chat);
		override readonly mainChat: IObservable<IChat> = constObservable(chat);
		override readonly shouldShowChatTabs = constObservable(true);
		override readonly isNewSessionRequestInProgress = lifecycle?.isNewSessionRequestInProgress ?? constObservable(false);
		override readonly preparationProgress = lifecycle?.preparationProgress;
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
