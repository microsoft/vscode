/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { RunOnceScheduler, timeout } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableResourceMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorunDelta, autorunIterableDelta, derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FocusMode } from '../../../../platform/native/common/native.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IChatModel, IChatRequestNeedsInputInfo } from '../common/model/chatModel.js';
import { IChatService, IChatToolInvocation, ToolConfirmKind } from '../common/chatService/chatService.js';
import { migrateLegacyTerminalToolSpecificData } from '../common/chat.js';
import { ChatNotificationKind, getChatNotificationDedupeKey } from '../common/chatNotification.js';
import { ChatConfiguration, ChatNotificationMode } from '../common/constants.js';
import { IChatWidgetService } from './chat.js';

/**
 * Observes whether a session has nothing left to do: no request running, no
 * input needed, and no queued work that is still going to run. Queued requests
 * are event-based on the model, so they are lifted into an observable as a
 * count, which is stable across the array being mutated in place.
 */
function observeIsIdle(model: IChatModel): IObservable<boolean> {
	const pendingRequestCount = observableFromEvent(model.onDidChangePendingRequests, () => model.getPendingRequests().length);
	return derived(reader => {
		if (model.requestInProgress.read(reader) || model.requestNeedsInput.read(reader)) {
			return false;
		}
		if (pendingRequestCount.read(reader) === 0) {
			return true;
		}
		// A queue only keeps the session busy while it can still drain. Both the chat
		// service and the agent host stop draining after an error or a cancellation, so
		// a session left in either state has no more work to do despite the queue.
		const response = model.lastRequestObs.read(reader)?.response;
		return !!response && (response.isCanceled || !!response.result?.errorDetails);
	});
}

/**
 * Whether the session's last response finished while this window was watching it.
 *
 * Loading a session replays its history through the same add-request-then-complete
 * path that live work uses, so the busy -> idle transition alone cannot tell a
 * session that was restored from one that just finished. A replayed response keeps
 * the completion time it originally had, or has none at all when that time was
 * never recorded, while a response completing here is stamped as it finishes.
 */
function hasCompletedSince(model: IChatModel, watchingSince: number): boolean {
	const completedAt = model.lastRequest?.response?.completionTimestamp;
	return completedAt !== undefined && completedAt >= watchingSince;
}

/**
 * Observes all live chat models and triggers OS notifications when any model
 * transitions to needing input or becomes idle.
 */
export class ChatWindowNotifier extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatWindowNotifier';

	private readonly _activeNotifications = this._register(new DisposableResourceMap());

	constructor(
		@IChatService private readonly _chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IHostService private readonly _hostService: IHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		const modelTrackers = this._register(new DisposableResourceMap());

		this._register(autorunIterableDelta(
			reader => this._chatService.chatModels.read(reader),
			({ addedValues, removedValues }) => {
				for (const model of addedValues) {
					modelTrackers.set(model.sessionResource, this._trackModel(model));
				}
				for (const model of removedValues) {
					modelTrackers.deleteAndDispose(model.sessionResource);
				}
			}
		));
	}

	/**
	 * Delay before an idle session is announced, to swallow the brief idle gap
	 * between a turn ending and the next queued turn starting. A method rather
	 * than a field so tests can override it before `_trackModel` runs during
	 * construction.
	 */
	protected _getIdleNotificationDelay(): number {
		return 500;
	}

	/**
	 * Delay before a toast from a window that is not showing the session, so that
	 * a window showing it notifies first.
	 */
	protected _getBackgroundNotificationDelay(): number {
		return 250;
	}

	private _trackModel(model: IChatModel) {
		const store = new DisposableStore();
		const isIdle = observeIsIdle(model);
		const watchingSince = Date.now();
		const idleScheduler = store.add(new RunOnceScheduler(() => void this._notifyIdleIfNeeded(model, isIdle, watchingSince), this._getIdleNotificationDelay()));
		store.add(autorunDelta(model.requestNeedsInput, ({ lastValue, newValue }) => {
			const currentNeedsInput = !!newValue;
			const previousNeedsInput = !!lastValue;

			// Only notify on transition from false -> true
			if (!previousNeedsInput && currentNeedsInput && newValue) {
				this._notifyIfNeeded(model.sessionResource, newValue);
			} else if (previousNeedsInput && !currentNeedsInput) {
				// Clear any active notification for this session when input is no longer needed
				this._clearNotification(model.sessionResource);
			}
		}));
		store.add(autorunDelta(isIdle, ({ lastValue, newValue }) => {
			// Only notify on a genuine busy -> idle transition of a response that finished
			// here, never for a model that was created idle or one replaying its history.
			if (lastValue === false && newValue === true && hasCompletedSince(model, watchingSince)) {
				idleScheduler.schedule();
			} else if (!newValue) {
				idleScheduler.cancel();
			}
		}));
		return store;
	}

	private async _notifyIfNeeded(sessionResource: URI, info: IChatRequestNeedsInputInfo): Promise<void> {
		// Check configuration
		const mode = this._configurationService.getValue<ChatNotificationMode>(ChatConfiguration.NotifyWindowOnConfirmation);
		if (mode === ChatNotificationMode.Off) {
			return;
		}

		// Find the widget to determine the target window
		const widget = this._chatWidgetService.getWidgetBySessionResource(sessionResource);
		const targetWindow = widget ? dom.getWindow(widget.domNode) : mainWindow;
		await this._delayForBackgroundWindow(widget?.visible === true);
		if (!this._chatService.getSession(sessionResource)?.requestNeedsInput.get()) {
			return;
		}

		const isFocused = targetWindow.document.hasFocus();
		if (mode !== ChatNotificationMode.Always && isFocused) {
			return;
		}

		// Clear any existing notification for this session
		this._clearNotification(sessionResource);

		// Focus window in notify mode (flash taskbar/dock) if not already focused
		if (!isFocused) {
			await this._hostService.focus(targetWindow, { mode: FocusMode.Notify });
		}

		// Create OS notification
		const notificationTitle = info.title ? localize('chatTitle', "Session: {0}", info.title) : localize('chat.untitledChat', "Untitled Session");

		const cts = new CancellationTokenSource();
		this._activeNotifications.set(sessionResource, toDisposable(() => cts.dispose(true)));

		// Determine if the pending input is for a question carousel
		const isQuestionCarousel = this._isQuestionCarouselPending(sessionResource);

		try {
			const actionLabel = isQuestionCarousel
				? localize('openChatAction', "Open Session")
				: localize('allowAction', "Allow");

			const result = await this._hostService.showToast({
				title: this._sanitizeOSToastText(notificationTitle),
				body: this._getNotificationBody(sessionResource, info, isQuestionCarousel),
				actions: [actionLabel],
				dedupeKey: getChatNotificationDedupeKey(sessionResource, ChatNotificationKind.NeedsInput),
			}, cts.token);

			if (result.actionIndex === 0 && !isQuestionCarousel && this._confirmAllow(sessionResource)) {
				return; // skip focusing/opening chat if we successfully confirmed the tool invocation from the toast action
			}

			if (result.clicked || typeof result.actionIndex === 'number') {
				await this._hostService.focus(targetWindow, { mode: FocusMode.Force });

				const widget = await this._chatWidgetService.openSession(sessionResource);
				widget?.focusInput();
			}
		} finally {
			this._clearNotification(sessionResource);
		}
	}

	private async _notifyIdleIfNeeded(model: IChatModel, isIdle: IObservable<boolean>, watchingSince: number): Promise<void> {
		if (!hasCompletedSince(model, watchingSince) || !isIdle.get() || model.requestNeedsInput.get()) {
			return;
		}
		const mode = this._configurationService.getValue<ChatNotificationMode>(ChatConfiguration.NotifyWindowOnResponseReceived);
		if (mode === ChatNotificationMode.Off) {
			return;
		}
		const widget = this._chatWidgetService.getWidgetBySessionResource(model.sessionResource);
		const targetWindow = widget ? dom.getWindow(widget.domNode) : mainWindow;
		await this._delayForBackgroundWindow(widget?.visible === true);
		if (!isIdle.get() || model.requestNeedsInput.get()) {
			return;
		}
		const isFocused = targetWindow.document.hasFocus();
		if (mode !== ChatNotificationMode.Always && isFocused) {
			return;
		}
		this._clearNotification(model.sessionResource);
		if (!isFocused) {
			await this._hostService.focus(targetWindow, { mode: FocusMode.Notify });
		}
		const cts = new CancellationTokenSource();
		this._activeNotifications.set(model.sessionResource, toDisposable(() => cts.dispose(true)));
		try {
			const title = model.title ? localize('chatTitle', "Session: {0}", model.title) : localize('chat.untitledChat', "Untitled Session");
			const result = await this._hostService.showToast({
				title: this._sanitizeOSToastText(title),
				body: localize('chat.idleNotificationDetail', "Session finished."),
				actions: [localize('openChatAction', "Open Session")],
				dedupeKey: getChatNotificationDedupeKey(model.sessionResource, ChatNotificationKind.Idle),
			}, cts.token);
			if (result.clicked || typeof result.actionIndex === 'number') {
				await this._hostService.focus(targetWindow, { mode: FocusMode.Force });
				const openedWidget = await this._chatWidgetService.openSession(model.sessionResource);
				openedWidget?.focusInput();
			}
		} finally {
			this._clearNotification(model.sessionResource);
		}
	}

	private async _delayForBackgroundWindow(isWidgetVisible: boolean): Promise<void> {
		if (isWidgetVisible && await this._hostService.hadLastFocus()) {
			return;
		}
		await timeout(this._getBackgroundNotificationDelay());
	}

	private _confirmAllow(sessionResource: URI): boolean {
		const model = this._chatService.getSession(sessionResource);
		const lastResponse = model?.lastRequest?.response;
		if (!lastResponse) {
			return false;
		}
		for (const part of lastResponse.response.value) {
			const state = part.kind === 'toolInvocation' ? part.state.get() : undefined;
			if (state?.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state?.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
				state.confirm({ type: ToolConfirmKind.UserAction });
				return true;
			}
		}
		return false;
	}

	private _getNotificationBody(sessionResource: URI, info: IChatRequestNeedsInputInfo, isQuestionCarousel: boolean): string {
		if (isQuestionCarousel) {
			return localize('questionCarouselDetail', "Questions need your input.");
		}
		const terminalCommand = this._getPendingTerminalCommand(sessionResource);
		if (terminalCommand) {
			return this._sanitizeOSToastText(terminalCommand);
		}
		if (info.detail) {
			return this._sanitizeOSToastText(info.detail);
		}
		return localize('notificationDetail', "Approval needed to continue.");
	}

	private _getPendingTerminalCommand(sessionResource: URI): string | undefined {
		const model = this._chatService.getSession(sessionResource);
		const lastResponse = model?.lastRequest?.response;
		if (!lastResponse?.response?.value) {
			return undefined;
		}
		for (const part of lastResponse.response.value) {
			if (part.kind === 'toolInvocation' && part.toolSpecificData?.kind === 'terminal') {
				const state = part.state.get();
				if (state?.type !== IChatToolInvocation.StateKind.WaitingForConfirmation && state?.type !== IChatToolInvocation.StateKind.WaitingForPostApproval) {
					continue;
				}
				const terminalData = migrateLegacyTerminalToolSpecificData(part.toolSpecificData);
				return terminalData.commandLine.forDisplay ?? terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
			}
		}
		return undefined;
	}

	private _isQuestionCarouselPending(sessionResource: URI): boolean {
		const model = this._chatService.getSession(sessionResource);
		const lastResponse = model?.lastRequest?.response;
		if (!lastResponse) {
			return false;
		}
		return lastResponse.response.value.some(
			part => part.kind === 'questionCarousel' && !part.isUsed
		);
	}

	private _sanitizeOSToastText(text: string): string {
		return text.replace(/`/g, '\''); // convert backticks to single quotes
	}

	private _clearNotification(sessionResource: URI): void {
		this._activeNotifications.deleteAndDispose(sessionResource);
	}
}
