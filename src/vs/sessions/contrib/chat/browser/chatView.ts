/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatView.css';
import './media/voiceChatView.css';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMicCaptureService } from '../../../../workbench/contrib/chat/browser/voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../../../../workbench/contrib/chat/browser/voiceClient/ttsPlaybackService.js';
import { IVoiceSessionController } from '../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../../workbench/common/theme.js';
import { ChatWidget } from '../../../../workbench/contrib/chat/browser/widget/chatWidget.js';
import { setModelPreservingInputTypedWhileLoading } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatModelReference, IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { IChatSessionsService, localChatSessionType } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { AbstractChatView, ChatViewKind, IChatViewOptions } from '../../../browser/parts/chatView.js';
import { ChatInteractivity, IChat } from '../../../services/sessions/common/session.js';
import { IChatViewFactory } from '../../../services/chatView/browser/chatViewFactory.js';
import { NewChatWidget } from './newChatWidget.js';
import { NewChatInSessionWidget } from './newChatInSessionWidget.js';
import { SessionInputBanners } from '../../sessionInputBanners/browser/sessionInputBanners.js';
import { SessionChatInputToolbar } from './sessionChatInputToolbar.js';
import { ISessionChatPillsDebugService } from './sessionChatInputToolbarDebug.js';
import { AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING } from './sessionsChatHistory.js';
import { activeSessionViewBackground, activeSessionViewForeground, agentsPanelBackground, inactiveSessionViewBackground, inactiveSessionViewForeground } from '../../../common/theme.js';
import { isEqual } from '../../../../base/common/resources.js';
import { setupVoiceInputDecorations } from './voiceInputDecorations.js';

/**
 * A session view that hosts a {@link NewChatWidget} — the "new session" UI
 * shown before a session has been created. This is the default view that
 * the `SessionsPart` grid is seeded with.
 */
export class NewChatView extends AbstractChatView {

	static readonly TYPE = 'sessions.newSession';

	override readonly kind: ChatViewKind;

	private readonly _widget: NewChatWidget | NewChatInSessionWidget;

	constructor(
		isNewChatInSession: boolean,
		options: IChatViewOptions,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();

		this.element.classList.add('chat-view-new');
		this.kind = isNewChatInSession ? 'newChatInSession' : 'newSession';
		this._widget = this._register(isNewChatInSession
			? instantiationService.createInstance(NewChatInSessionWidget, options)
			: instantiationService.createInstance(NewChatWidget, options));
		this._widget.render(this.element);
	}

	override toJSON(): object {
		return { type: NewChatView.TYPE };
	}

	protected override doLayout(width: number, height: number, _top: number, _left: number): void {
		this._widget.layout(height, width);
	}

	override focus(): void {
		this._widget.focusInput();
	}

	override selectWorkspace(folderUri: URI, providerId?: string): void {
		if (this._widget instanceof NewChatWidget) {
			this._widget.selectWorkspace(folderUri, providerId);
		}
	}

	override prefillInput(text: string): void {
		if (this._widget instanceof NewChatWidget) {
			this._widget.prefillInput(text);
		}
	}

	override sendQuery(text: string): void {
		if (this._widget instanceof NewChatWidget) {
			this._widget.sendQuery(text);
		}
	}

	override attach(uris: URI[]): void {
		this._widget.attach(uris);
	}
}

/**
 * A session view that hosts the standard chat {@link ChatWidget} — used to
 * render an active chat session inside the `SessionsPart` grid.
 */
export class ChatView extends AbstractChatView {

	static readonly TYPE = 'sessions.session';

	override readonly kind: ChatViewKind = 'chat';

	private readonly _widget: ChatWidget;

	/** Session banners (CI failures, created comments) shown above the chat input. */
	private readonly _banners: SessionInputBanners;
	/** Floating status pills (changes, preview, background activity) above the input. */
	private readonly _chatPills: SessionChatInputToolbar;

	/** Reference to the loaded chat model; disposing releases the model. */
	private readonly _modelRef = this._register(new MutableDisposable<IChatModelReference>());

	/** Cancels any in-flight model load when a new session is set or the view disposes. */
	private readonly _loadCts = this._register(new MutableDisposable<CancellationTokenSource>());

	/** Tracks the current chat's interactivity and hides the input for read-only chats. */
	private readonly _interactiveDisposable = this._register(new MutableDisposable());

	/** Tracks the currently loaded chat resource to avoid redundant reloads. */
	private _currentChatResource: URI | undefined;
	private _historyKey: string | undefined;

	/** Whether this view currently represents the active session. */
	private _isActive = true;
	/** Observable mirror of {@link _isActive} so the voice overlay can react. */
	private readonly _isActiveObs = observableValue<boolean>(this, true);

	/**
	 * Per-view mirror of `agentsVoiceInitiatedHere`, scoped above the chat widget.
	 * Keeps post-connect voice controls anchored to the active session view.
	 */
	private readonly _voiceInitiatedHereKey: IContextKey<boolean>;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IVoiceSessionController private readonly voiceSessionController: IVoiceSessionController,
		@IMicCaptureService private readonly micCaptureService: IMicCaptureService,
		@ITtsPlaybackService private readonly ttsPlaybackService: ITtsPlaybackService,
		@ISessionChatPillsDebugService private readonly chatPillsDebugService: ISessionChatPillsDebugService,
	) {
		super();

		this.element.classList.add('chat-view-chat');

		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
		const scopedInstantiationService = this._register(instantiationService.createChild(
			new ServiceCollection([IContextKeyService, scopedContextKeyService])
		));

		// Matches `AGENTS_VOICE_INITIATED_HERE` in agentsVoice.contribution.ts.
		this._voiceInitiatedHereKey = scopedContextKeyService.createKey<boolean>('agentsVoiceInitiatedHere', false);

		this._widget = this._register(scopedInstantiationService.createInstance(
			ChatWidget,
			ChatAgentLocation.Chat,
			undefined,
			{
				autoScroll: mode => mode !== ChatModeKind.Ask,
				renderFollowups: true,
				supportsFileReferences: true,
				rendererOptions: {
					referencesExpandedWhenEmptyResponse: false,
					progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask,
				},
				enableImplicitContext: true,
				enableWorkingSet: 'implicit',
				supportsChangingModes: true,
				inputEditorMinLines: 2,
				isSessionsWindow: true
			},
			this._buildStyles(this._isActive)
		));
		this._widget.render(this.element);
		this._widget.setVisible(true);

		// Mount the session banners directly above the chat input.
		this._banners = this._register(instantiationService.createInstance(SessionInputBanners));
		this._banners.setActive(this._isActive);

		// Floating status pills above the input.
		this._chatPills = this._register(instantiationService.createInstance(SessionChatInputToolbar));
		this._register(chatPillsDebugService.register(this._chatPills, this._banners, this._isActiveObs));
		this._ensureBannersMounted();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING)) {
				this._applyHistoryKey();
			}
		}));

		// Voice transcript overlay + input glow.
		this._setupVoiceOverlay();

		// Anchor post-connect voice controls to this active voice view.
		this._register(autorun(reader => {
			const active = this._isActiveObs.read(reader);
			const voiceActive = this.voiceSessionController.isConnected.read(reader)
				|| this.voiceSessionController.isConnecting.read(reader);
			this._voiceInitiatedHereKey.set(active && voiceActive);
		}));
	}

	override dispose(): void {
		this._loadCts.value?.cancel();
		super.dispose();
	}

	private _buildStyles(active: boolean) {
		return {
			listForeground: active ? activeSessionViewForeground : inactiveSessionViewForeground,
			listBackground: active ? activeSessionViewBackground : inactiveSessionViewBackground,
			overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND,
			inputEditorBackground: inactiveSessionViewBackground,
			resultEditorBackground: agentsPanelBackground,
		};
	}

	/** The underlying chat widget. */
	get widget(): ChatWidget {
		return this._widget;
	}

	override setChat(chat: IChat, historyKey?: string): void {
		this.chatPillsDebugService.clear(this._chatPills);
		const resource = chat.resource;
		this._historyKey = historyKey;
		this._applyHistoryKey();

		// Reflect this chat's last-turn changes, status, and background activity.
		this._chatPills.setChat(chat);
		this._banners.setDebugData(undefined);

		// Reflect read-only (non-interactive) chats: hide the composer and gate
		// mutating actions (Start Over / Restore Checkpoint) via the widget. Any
		// non-Full interactivity is treated as read-only here (hidden chats are
		// filtered out of the visible model before they reach a ChatView).
		this._interactiveDisposable.value = autorun(reader => {
			this._widget.setReadOnly(chat.interactivity.read(reader) !== ChatInteractivity.Full);
		});

		// Skip loading if we're already showing this chat
		if (isEqual(this._currentChatResource, resource)) {
			return;
		}

		const previousChatResource = this._currentChatResource;
		this._currentChatResource = resource;

		// Cancel any in-flight load for the previous chat and start a fresh one.
		this._loadCts.value?.cancel();
		if (previousChatResource) {
			this._clearCurrentChat();
		}
		const cts = new CancellationTokenSource();
		this._loadCts.value = cts;
		const token = cts.token;

		// Capture the input draft before the load window opens so text typed
		// during loading is preserved when the model binds. See #325323.
		const inputBeforeLoad = this._widget.getInput();

		const loadPromise = this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, token, 'ChatView').then(ref => {
			if (token.isCancellationRequested || !ref || !isEqual(this._currentChatResource, resource)) {
				ref?.dispose();
				return;
			}
			this._modelRef.value = ref;
			this._updateWidgetLockState(getChatSessionType(ref.object.sessionResource));
			setModelPreservingInputTypedWhileLoading(this._widget, inputBeforeLoad, () => this._widget.setModel(ref.object));
			// Expose the bound chat resource on the DOM so test automation
			// can synchronize with the post-rebind state without polling timeouts.
			// Set AFTER `setModel` so observers see the attribute only once the
			// inner widget is fully attached to the loaded model.
			this.element.dataset.boundChatResource = resource.toString();
		}, err => {
			if (!token.isCancellationRequested) {
				this.logService.error('[ChatView] Failed to load chat model for chat', err);
			}
			if (isEqual(this._currentChatResource, resource)) { // might have changed while we were waiting, only reset if it is still the same
				this._currentChatResource = undefined;
			}
		});

		// Surface progress on this leaf's own bar while the chat model loads,
		// matching how each editor group shows progress independently. The short
		// delay avoids flashing the bar for fast cached loads.
		this.showProgressWhile(loadPromise, 800);
	}

	private _clearCurrentChat(): void {
		this._widget.clear().catch(err => this.logService.error('[ChatView] Failed to clear chat widget', err));
		this._widget.setModel(undefined);
		this._modelRef.clear();
		// Clear the bound-resource attribute while the rebind is in flight so
		// test automation can wait for the next `setChat` cycle to finish
		// before acting on the view.
		delete this.element.dataset.boundChatResource;
	}

	private _applyHistoryKey(): void {
		const scopedHistory = this.configurationService.getValue<boolean>(AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING) !== false;
		this._widget.inputPart.setHistoryKey(scopedHistory ? this._historyKey : undefined);
	}

	private _updateWidgetLockState(sessionType: string): void {
		if (sessionType === localChatSessionType) {
			this._widget.unlockFromCodingAgent();
			return;
		}

		const contribution = this.chatSessionsService.getChatSessionContribution(sessionType);
		if (contribution) {
			this._widget.lockToCodingAgent(contribution.name, contribution.displayName, sessionType, contribution.agentHostProviderId);
		} else {
			this._widget.unlockFromCodingAgent();
		}
	}

	override toJSON(): object {
		return { type: ChatView.TYPE };
	}

	protected override doLayout(width: number, height: number, _top: number, _left: number): void {
		this._ensureBannersMounted();
		this._widget.layout(height, width);
	}

	/**
	 * Mounts the status pills and session banners above the chat input.
	 */
	private _ensureBannersMounted(): void {
		const inputPartElement = this._widget.inputPart.element;
		const persistentContentContainer = this._widget.inputPart.persistentContentContainerElement;
		const pillsNode = this._chatPills.element;
		const bannersNode = this._banners.domNode;
		if (persistentContentContainer.firstChild !== pillsNode) {
			persistentContentContainer.insertBefore(pillsNode, persistentContentContainer.firstChild);
		}
		if (persistentContentContainer.nextSibling !== bannersNode) {
			inputPartElement.insertBefore(bannersNode, persistentContentContainer.nextSibling);
		}
	}

	//#region Voice overlay

	/**
	 * Sets up this view's transcript overlay and input glow, mirroring `ChatViewPane`.
	 * Shows only while voice is connected and targeting this active session.
	 */
	private _setupVoiceOverlay(): void {
		const inputContainerEl = this._widget.inputPart.inputContainerElement;
		if (!inputContainerEl) {
			return;
		}

		this._register(setupVoiceInputDecorations({
			voiceSessionController: this.voiceSessionController,
			ttsPlaybackService: this.ttsPlaybackService,
			micCaptureService: this.micCaptureService,
			configurationService: this.configurationService,
			keybindingService: this.keybindingService,
			accessibilityService: this.accessibilityService,
		}, {
			inputContainer: inputContainerEl,
			isActive: this._isActiveObs,
			getCurrentResource: () => this._currentChatResource,
		}));
	}

	//#endregion

	override focus(): void {
		this._widget.focusInput();
	}

	override attach(uris: URI[]): void {
		for (const uri of uris) {
			this._widget.attachmentModel.addFile(uri).catch(err => this.logService.error('[ChatView] Failed to attach file as context', err));
		}
	}

	override setActive(active: boolean): void {
		if (this._isActive === active) {
			return;
		}
		this._isActive = active;
		this._isActiveObs.set(active, undefined);
		this._banners.setActive(active);
		this._widget.setStyles(this._buildStyles(active));
	}
}

/**
 * Default {@link IChatViewFactory} implementation. Lives in the contrib
 * layer where the concrete views are defined and is registered as an eager
 * singleton via the entry point.
 */
export class ChatViewFactory implements IChatViewFactory {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	createNewChatView(isNewChatInSession: boolean, options: IChatViewOptions): AbstractChatView {
		return this.instantiationService.createInstance(NewChatView, isNewChatInSession, options);
	}

	createChatView(): AbstractChatView {
		return this.instantiationService.createInstance(ChatView);
	}
}
