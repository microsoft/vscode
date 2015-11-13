/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import errors = require('vs/base/common/errors');
import types = require('vs/base/common/types');
import {MessageList, Severity as BaseSeverity} from 'vs/base/browser/ui/messagelist/messageList';
import {Identifiers} from 'vs/workbench/common/constants';
import {StatusbarAlignment} from 'vs/workbench/browser/parts/statusbar/statusbar';
import {IDisposable} from 'vs/base/common/lifecycle';
import {IMessageService, IMessageWithAction, IConfirmation, Severity} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IKeybindingService, IKeybindingContextKey} from 'vs/platform/keybinding/common/keybindingService';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/browser/quickOpenService';
import {IStatusbarService} from 'vs/workbench/services/statusbar/statusbarService';

interface IBufferedMessage {
	severity: Severity;
	message: any;
	disposeFn: () => void;
}

export class WorkbenchMessageService implements IMessageService {
	public static GLOBAL_MESSAGES_SHOWING_CONTEXT = 'globalMessageVisible';

	public serviceId = IMessageService;

	private handler: MessageList;
	private statusMsgDispose: IDisposable;

	private canShowMessages: boolean;
	private messageBuffer: IBufferedMessage[];

	private quickOpenService: IQuickOpenService;
	private statusbarService: IStatusbarService;

	private messagesShowingContextKey: IKeybindingContextKey<boolean>;

	constructor(
		private telemetryService: ITelemetryService,
		keybindingService: IKeybindingService
	) {
		this.messagesShowingContextKey = keybindingService.createKey(WorkbenchMessageService.GLOBAL_MESSAGES_SHOWING_CONTEXT, false);
		this.handler = new MessageList(Identifiers.WORKBENCH_CONTAINER, telemetryService);

		this.messageBuffer = [];
		this.canShowMessages = true;

		this.registerListeners();
	}

	public setWorkbenchServices(quickOpenService: IQuickOpenService, statusbarService: IStatusbarService): void {
		this.statusbarService = statusbarService;
		this.quickOpenService = quickOpenService;

		this.quickOpenService.onShow.add(this.onQuickOpenShowing, this);
		this.quickOpenService.onHide.add(this.onQuickOpenHiding, this);
	}

	private registerListeners(): void {
		this.handler.onMessagesShowing.add(this.onMessagesShowing, this);
		this.handler.onMessagesCleared.add(this.onMessagesCleared, this);
	}

	private onMessagesShowing(): void {
		this.messagesShowingContextKey.set(true);
	}

	private onMessagesCleared(): void {
		this.messagesShowingContextKey.reset();
	}

	private onQuickOpenShowing(): void {
		this.canShowMessages = false; // when quick open is open, dont show messages behind
	}

	private onQuickOpenHiding(): void {
		this.canShowMessages = true;

		// Release messages from buffer
		while (this.messageBuffer.length) {
			const bufferedMessage = this.messageBuffer.pop();
			bufferedMessage.disposeFn = this.show(bufferedMessage.severity, bufferedMessage.message);
		}
	}

	private toBaseSeverity(severity: Severity): BaseSeverity {
		switch (severity) {
			case Severity.Info:
				return BaseSeverity.Info;

			case Severity.Warning:
				return BaseSeverity.Warning;
		}

		return BaseSeverity.Error;
	}

	public show(sev: Severity, message: string): () => void;
	public show(sev: Severity, message: Error): () => void;
	public show(sev: Severity, message: string[]): () => void;
	public show(sev: Severity, message: Error[]): () => void;
	public show(sev: Severity, message: IMessageWithAction): () => void;
	public show(sev: Severity, message: any): () => void {
		if (!message) {
			return () => void 0; // guard against undefined messages
		}

		if (Array.isArray(message)) {
			let closeFns: Function[] = [];
			message.forEach((msg: any) => closeFns.push(this.show(sev, msg)));

			return () => closeFns.forEach((fn) => fn());
		}

		if (errors.isPromiseCanceledError(message)) {
			return () => void 0; // this kind of error should not be shown
		}

		if (types.isNumber(message.severity)) {
			sev = message.severity;
		}

		return this.doShow(sev, message);
	}

	private doShow(sev: Severity, message: any): () => void {

		// Check flag if we can show a message now
		if (!this.canShowMessages) {
			const messageObj:IBufferedMessage = { severity: sev, message, disposeFn: () => this.messageBuffer.splice(this.messageBuffer.indexOf(messageObj), 1) };
			this.messageBuffer.push(messageObj);

			// Return function that allows to remove message from buffer
			return () => messageObj.disposeFn();
		}

		// Show in Console
		if (sev === Severity.Error) {
			console.error(errors.toErrorMessage(message, true));
		}

		// Show in Global Handler
		return this.handler.showMessage(this.toBaseSeverity(sev), message);
	}

	public setStatusMessage(message: string, autoDisposeAfter: number = -1, delayBy: number = 0): IDisposable {
		if (this.statusbarService) {
			if (this.statusMsgDispose) {
				this.statusMsgDispose.dispose(); // dismiss any previous
			}

			// Create new
			let statusDispose: IDisposable;
			let showHandle = setTimeout(() => {
				statusDispose = this.statusbarService.addEntry({ text: message }, StatusbarAlignment.LEFT, Number.MIN_VALUE);
				showHandle = null;
			}, delayBy);
			let hideHandle: number;

			// Dispose function takes care of timeouts and actual entry
			const dispose = { dispose: () => {
				if (showHandle) {
					clearTimeout(showHandle);
				}

				if (hideHandle) {
					clearTimeout(hideHandle);
				}

				if (statusDispose) {
					statusDispose.dispose();
				}
			}};
			this.statusMsgDispose = dispose;

			if (typeof autoDisposeAfter === 'number' && autoDisposeAfter > 0) {
				hideHandle = setTimeout(() => dispose.dispose(), autoDisposeAfter);
			}

			return dispose;
		}

		return { dispose: () => { /* not yet ready */ } };
	}

	public hideAll(): void {
		if (this.handler) {
			this.handler.hideMessages();
		}
	}

	public confirm(confirmation: IConfirmation): boolean {
		let messageText = confirmation.message;
		if (confirmation.detail) {
			messageText = messageText + '\n\n' + confirmation.detail;
		}

		return window.confirm(messageText);
	}

	public dispose(): void {
		this.handler.onMessagesShowing.remove(this.onMessagesShowing, this);
		this.handler.onMessagesCleared.remove(this.onMessagesCleared, this);

		if (this.quickOpenService) {
			this.quickOpenService.onShow.remove(this.onQuickOpenShowing, this);
			this.quickOpenService.onHide.remove(this.onQuickOpenHiding, this);
		}
	}
}