/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../../workbench/common/theme.js';
import { ChatWidget } from '../../../../workbench/contrib/chat/browser/widget/chatWidget.js';
import { IChatModelReference, IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { IChatSessionsService, localChatSessionType } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { AbstractChatView, ChatViewKind, IChatViewOptions } from '../../../browser/parts/chatView.js';
import { IChat } from '../../../services/sessions/common/session.js';
import { IChatViewFactory } from '../../../services/chatView/browser/chatViewFactory.js';
import { NewChatWidget } from './newChatWidget.js';
import { NewChatInSessionWidget } from './newChatInSessionWidget.js';
import { AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING } from './sessionsChatHistory.js';
import { activeSessionViewBackground, activeSessionViewForeground, agentsPanelBackground, inactiveSessionViewBackground, inactiveSessionViewForeground } from '../../../common/theme.js';
import { isEqual } from '../../../../base/common/resources.js';

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

	/** Reference to the loaded chat model; disposing releases the model. */
	private readonly _modelRef = this._register(new MutableDisposable<IChatModelReference>());

	/** Cancels any in-flight model load when a new session is set or the view disposes. */
	private readonly _loadCts = this._register(new MutableDisposable<CancellationTokenSource>());

	/** Tracks the currently loaded chat resource to avoid redundant reloads. */
	private _currentChatResource: URI | undefined;
	private _historyKey: string | undefined;

	/** Whether this view currently represents the active session. */
	private _isActive = true;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.element.classList.add('chat-view-chat');

		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
		const scopedInstantiationService = this._register(instantiationService.createChild(
			new ServiceCollection([IContextKeyService, scopedContextKeyService])
		));

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

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING)) {
				this._applyHistoryKey();
			}
		}));
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
		const resource = chat.resource;
		this._historyKey = historyKey;
		this._applyHistoryKey();

		// Skip loading if we're already showing this chat
		if (isEqual(this._currentChatResource, resource)) {
			return;
		}

		this._currentChatResource = resource;

		// Cancel any in-flight load for the previous chat and start a fresh one.
		const cts = new CancellationTokenSource();
		this._loadCts.value = cts;
		const token = cts.token;

		const loadPromise = this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, token, 'ChatView').then(ref => {
			if (token.isCancellationRequested || !ref) {
				ref?.dispose();
				return;
			}
			this._modelRef.value = ref;
			this._updateWidgetLockState(getChatSessionType(ref.object.sessionResource));
			this._widget.setModel(ref.object);
		}, err => {
			if (!token.isCancellationRequested) {
				this.logService.error('[ChatView] Failed to load chat model for chat', err);
			}
			if (resource === this._currentChatResource) { // might have changed while we were waiting, only reset if it is still the same
				this._currentChatResource = undefined;
			}
		});

		// Surface progress on this leaf's own bar while the chat model loads,
		// matching how each editor group shows progress independently. The short
		// delay avoids flashing the bar for fast cached loads.
		this.showProgressWhile(loadPromise, 800);
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
			this._widget.lockToCodingAgent(contribution.name, contribution.displayName, sessionType);
		} else {
			this._widget.unlockFromCodingAgent();
		}
	}

	override toJSON(): object {
		return { type: ChatView.TYPE };
	}

	protected override doLayout(width: number, height: number, _top: number, _left: number): void {
		this._widget.layout(height, width);
	}

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
