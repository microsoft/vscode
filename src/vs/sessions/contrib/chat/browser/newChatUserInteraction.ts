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
import { IChatWidget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { chatUserInteractionTimingTracker, ChatUserInteractionTimingTracker, ChatUserInteractionTimingResult, IChatUserInteractionTimer, isChatFirstVisibleProgress } from '../../../../workbench/contrib/chat/browser/chatUserInteractionTelemetry.js';
import { getChatSessionTelemetryContext } from '../../../../workbench/contrib/chat/common/chatService/chatServiceTelemetry.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
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
 * Keeps a composer gesture alive through preparation and the deliberate transfer
 * to its response widget. The tracker, not the outgoing composer, owns its lifetime.
 */
export class NewChatUserInteraction extends Disposable {
	readonly timer: IChatUserInteractionTimer;
	private readonly _session = observableValue<ISession | undefined>(this, undefined);
	private readonly _widgets = this._register(new DisposableMap<IChatWidget, DisposableStore>());
	private _chatResource: URI | undefined;
	private _response: IChatResponseModel | undefined;
	private _responseWidget: IChatWidget | undefined;
	private _sourceAvailable = true;
	private _handedOff = false;
	private _newSession = false;
	private _visibilityCheckScheduled = false;

	constructor(
		private readonly _source: INewChatUserInteractionSource,
		private readonly _tracker: ChatUserInteractionTimingTracker = chatUserInteractionTimingTracker,
		@IChatWidgetService private readonly _widgetService: IChatWidgetService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsManagementService private readonly _managementService: ISessionsManagementService,
	) {
		super();
		this.timer = _tracker.start('turn', _source.window, { location: ChatAgentLocation.Chat }, _source.visible.get() && (_source.hostVisible?.get() ?? true));
		_tracker.addDisposable(this.timer, this);
		if (!_tracker.isActive(this.timer)) {
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
		if (!this._tracker.isActive(this.timer) || this._handedOff) {
			return;
		}
		this._handedOff = true;
		this._newSession = session.status.get() === SessionStatus.Untitled;
		this._chatResource = chat.resource;
		this._session.set(session, undefined);
		this._tracker.setContext(this.timer, getChatSessionTelemetryContext(chat.resource));
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
			if (!this._tracker.isActive(this.timer) || getWindow(widget.domNode) !== this._source.window || this._widgets.has(widget)) {
				return;
			}
			const store = new DisposableStore();
			this._widgets.set(widget, store);
			store.add(widget.onDidChangeViewModel(() => this._checkResponse()));
			store.add(widget.onDidHide(() => {
				if (widget === this._responseWidget || isEqual(widget.viewModel?.sessionResource, this._response?.session.sessionResource ?? this._chatResource)) {
					this.cancel('hidden');
				} else {
					this._scheduleVisibilityCheck();
				}
			}));
			store.add(widget.onDidShow(() => this._checkResponse()));
			this._checkResponse();
		};
		this._register(this._widgetService.onDidAddWidget(observeWidget));
		this._register(this._widgetService.onDidRemoveWidget(widget => {
			this._widgets.deleteAndDispose(widget);
			if (widget === this._responseWidget) {
				this._responseWidget = undefined;
				this._tracker.resetRender(this.timer);
			}
			this._scheduleVisibilityCheck();
		}));
		for (const widget of this._widgetService.getAllWidgets()) {
			observeWidget(widget);
		}
	}

	/** This callback is carried with this exact send, never inferred from prompt text or focus. */
	readonly onDidCreateResponse = (response: IChatResponseModel | undefined): void => {
		if (!this._tracker.isActive(this.timer)) {
			return;
		}
		if (!response || response.isHiddenFromTranscript) {
			this.cancel('notDispatched');
			return;
		}
		if (this._response) {
			return;
		}
		this._response = response;
		this._tracker.setContext(this.timer, {
			...getChatSessionTelemetryContext(response.session.sessionResource),
			requestId: response.requestId,
			agent: response.agent?.id,
			agentExtensionId: response.agent?.extensionId.value,
			model: response.request?.modelId,
			permissionLevel: response.request?.modeInfo?.kind === ChatModeKind.Ask ? undefined : response.request?.modeInfo?.permissionLevel,
			chatMode: response.request?.modeInfo?.telemetryModeName ?? response.request?.modeInfo?.telemetryModeId,
		});
		this._register(response.onDidChange(() => this._checkResponse()));
		this._register(response.session.onDidDispose(() => this.cancel('disposed')));
		this._checkResponse();
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
		this._tracker.cancel(this.timer, result);
	}

	private _getResponseWidget(): IChatWidget | undefined {
		const response = this._response;
		return this._widgetService.getAllWidgets().find(widget =>
			widget.visible && getWindow(widget.domNode) === this._source.window
			&& (response ? widget.viewModel?.model === response.session : isEqual(widget.viewModel?.sessionResource, this._chatResource)));
	}

	private _scheduleVisibilityCheck(): void {
		if (this._visibilityCheckScheduled || !this._tracker.isActive(this.timer)) {
			return;
		}
		this._visibilityCheckScheduled = true;
		// Replacement notifications also update the visible-session wrappers. Read
		// their settled identities, not the intermediate state between listeners.
		queueMicrotask(() => {
			this._visibilityCheckScheduled = false;
			if (!this._tracker.isActive(this.timer)) {
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
				this._checkResponse();
			}
		});
	}

	private _checkResponse(): void {
		const response = this._response;
		if (!response || !this._tracker.isActive(this.timer)) {
			return;
		}
		if (response.isCanceled || response.result?.errorDetails) {
			this.cancel(response.isCanceled ? 'cancelled' : 'error');
			return;
		}
		const widget = this._getResponseWidget();
		if (this._responseWidget && widget !== this._responseWidget) {
			this._responseWidget = undefined;
			this._tracker.resetRender(this.timer);
			this._scheduleVisibilityCheck();
		}
		if (widget) {
			this._responseWidget = widget;
		}
		if (response.response.value.some(isChatFirstVisibleProgress)) {
			if (widget && !widget.isTranscriptProgressActive) {
				this._tracker.completeAfterRender(this.timer, getWindow(widget.domNode), () =>
					this._getResponseWidget() === widget && response.response.value.some(isChatFirstVisibleProgress)
					&& !widget.isTranscriptProgressActive && !response.isCanceled && !response.result?.errorDetails);
			}
		} else if (response.isComplete) {
			this.cancel('completedWithoutProgress');
		}
	}
}
