/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../base/browser/dom.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatWidget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatUserInteraction, ChatUserInteractionTimingResult } from '../../../../workbench/contrib/chat/browser/chatUserInteractionTelemetry.js';
import { getChatSessionTelemetryContext } from '../../../../workbench/contrib/chat/common/chatService/chatServiceTelemetry.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { IChatResponseModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export interface INewChatUserInteractionSource {
	readonly window: Window;
	readonly visible: IObservable<boolean>;
	readonly hostVisible?: IObservable<boolean>;
}

/**
 * Adapts the composer's deliberate transfer to a response widget without
 * restarting its measurement or mistaking composer replacement for hiding.
 */
export class NewChatUserInteraction extends Disposable {
	readonly timer: ChatUserInteraction;
	private readonly _session = observableValue<ISession | undefined>(this, undefined);
	private readonly _widgets = this._register(new DisposableMap<IChatWidget, DisposableStore>());
	private _chatResource: URI | undefined;
	private _response: IChatResponseModel | undefined;
	private _sourceAvailable = true;
	private _handedOff = false;
	private _newSession = false;
	private _visibilityCheckScheduled = false;

	constructor(
		private readonly _source: INewChatUserInteractionSource,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatWidgetService private readonly _widgetService: IChatWidgetService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsManagementService private readonly _managementService: ISessionsManagementService,
	) {
		super();
		this.timer = instantiationService.createInstance(ChatUserInteraction, {
			window: _source.window,
			visible: _source.visible.get() && (_source.hostVisible?.get() ?? true),
			context: { location: ChatAgentLocation.Chat },
		});
		this.timer.addDisposable(this);
		if (!this.timer.isActive) {
			return;
		}
		this._register(autorun(reader => {
			const visible = _source.visible.read(reader);
			const hostVisible = _source.hostVisible?.read(reader) ?? visible;
			if (!hostVisible || (!this._handedOff && !visible)) {
				this.cancel('hidden');
			}
		}));
		this._register(disposableTimeout(() => this.cancel('timedOut'), 120_000));
	}

	/** Called only after the composer has accepted a foreground send, before preparation can replace it. */
	handoff(session: ISession, chat: IChat): void {
		if (!this.timer.isActive || this._handedOff) {
			return;
		}
		this._handedOff = true;
		this._newSession = session.status.get() === SessionStatus.Untitled;
		this._chatResource = chat.resource;
		this._session.set(session, undefined);
		this.timer.setContext(getChatSessionTelemetryContext(chat.resource));
		const replace = ({ from, to }: { from: ISession; to: ISession }) => {
			if (from.sessionId === this._session.get()?.sessionId) {
				this._session.set(to, undefined);
				if (this._newSession && !this._response) {
					this._chatResource = to.mainChat.get().resource;
				}
			}
		};
		this._register(this._managementService.onDidReplaceSession(replace));
		this._register(this._managementService.onDidReplaceNewDraftSession(replace));
		this._register(autorun(reader => {
			const sessionId = this._session.read(reader)?.sessionId;
			const session = this._sessionsService.visibleSessions.read(reader).find(candidate => candidate?.sessionId === sessionId);
			session?.activeChat.read(reader);
			session?.isNewSessionRequestInProgress?.read(reader);
			this._scheduleVisibilityCheck();
		}));
		const observeWidget = (widget: IChatWidget) => {
			if (!this.timer.isActive || getWindow(widget.domNode) !== this._source.window || this._widgets.has(widget)) {
				return;
			}
			const store = new DisposableStore();
			this._widgets.set(widget, store);
			store.add(widget.onDidChangeViewModel(() => {
				this.timer.checkResponse();
				this._scheduleVisibilityCheck();
			}));
			store.add(widget.onDidHide(() => {
				if (isEqual(widget.viewModel?.sessionResource, this._response?.session.sessionResource ?? this._chatResource)) {
					this.cancel('hidden');
				} else {
					this._scheduleVisibilityCheck();
				}
			}));
			store.add(widget.onDidShow(() => this.timer.checkResponse()));
			this.timer.checkResponse();
		};
		this._register(this._widgetService.onDidAddWidget(observeWidget));
		this._register(this._widgetService.onDidRemoveWidget(widget => {
			this._widgets.deleteAndDispose(widget);
			this.timer.checkResponse();
			this._scheduleVisibilityCheck();
		}));
		for (const widget of this._widgetService.getAllWidgets()) {
			observeWidget(widget);
		}
	}

	/** This callback is carried with this exact send, never inferred from prompt text or focus. */
	readonly onDidCreateResponse = (response: IChatResponseModel | undefined): void => {
		if (!this.timer.isActive || this._response) {
			return;
		}
		this._response = response;
		this.timer.observeResponse(response, () => this._getResponseWidget());
	};

	/** Disposal of a deliberately replaced composer is not abandonment of its send. */
	disposeSource(): void {
		this._sourceAvailable = false;
		if (!this._handedOff) {
			this.cancel('disposed');
		} else {
			this._scheduleVisibilityCheck();
		}
	}

	cancel(result: Exclude<ChatUserInteractionTimingResult, 'success'>): void {
		this.timer.cancel(result);
	}

	private _getResponseWidget(): IChatWidget | undefined {
		const response = this._response;
		return this._widgetService.getAllWidgets().find(widget =>
			widget.visible && getWindow(widget.domNode) === this._source.window
			&& (response ? widget.viewModel?.model === response.session : isEqual(widget.viewModel?.sessionResource, this._chatResource)));
	}

	private _scheduleVisibilityCheck(): void {
		if (this._visibilityCheckScheduled || !this.timer.isActive) {
			return;
		}
		this._visibilityCheckScheduled = true;
		// Replacement notifications also update the visible-session wrappers. Read
		// their settled identities, not the intermediate state between listeners.
		queueMicrotask(() => {
			this._visibilityCheckScheduled = false;
			if (!this.timer.isActive) {
				return;
			}
			const session = this._sessionsService.visibleSessions.get().find(candidate => candidate?.sessionId === this._session.get()?.sessionId);
			const expectedChat = this._response?.session.sessionResource ?? this._chatResource;
			const preparing = this._newSession && !this._response && session?.isNewSessionRequestInProgress?.get();
			if (!this._getResponseWidget() && (!session || (!preparing
				&& !(this._sourceAvailable && this._source.visible.get())
				&& !isEqual(session.activeChat.get().resource, expectedChat)))) {
				this.cancel('hidden');
			} else {
				this.timer.checkResponse();
			}
		});
	}
}
