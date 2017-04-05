/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import errors = require('vs/base/common/errors');
import { toErrorMessage } from 'vs/base/common/errorMessage';
import types = require('vs/base/common/types');
import { MessageList, Severity as BaseSeverity } from 'vs/workbench/services/message/browser/messageList';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IMessageService, IMessageWithAction, IConfirmation, Severity } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import Event from 'vs/base/common/event';

interface IBufferedMessage {
	severity: Severity;
	message: any;
	onHide: () => void;
	disposeFn: () => void;
}

export class WorkbenchMessageService implements IMessageService {

	public _serviceBrand: any;

	private handler: MessageList;
	private disposeables: IDisposable[];

	private canShowMessages: boolean;
	private messageBuffer: IBufferedMessage[];

	constructor(
		container: HTMLElement,
		telemetryService: ITelemetryService
	) {
		this.handler = new MessageList(container, telemetryService);

		this.messageBuffer = [];
		this.canShowMessages = true;
		this.disposeables = [];
	}

	public get onMessagesShowing(): Event<void> {
		return this.handler.onMessagesShowing;
	}

	public get onMessagesCleared(): Event<void> {
		return this.handler.onMessagesCleared;
	}

	public suspend(): void {
		this.canShowMessages = false;
		this.handler.hide();
	}

	public resume(): void {
		this.canShowMessages = true;
		this.handler.show();

		// Release messages from buffer
		while (this.messageBuffer.length) {
			const bufferedMessage = this.messageBuffer.pop();
			bufferedMessage.disposeFn = this.show(bufferedMessage.severity, bufferedMessage.message, bufferedMessage.onHide);
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

	public show(sev: Severity, message: string, onHide?: () => void): () => void;
	public show(sev: Severity, message: Error, onHide?: () => void): () => void;
	public show(sev: Severity, message: string[], onHide?: () => void): () => void;
	public show(sev: Severity, message: Error[], onHide?: () => void): () => void;
	public show(sev: Severity, message: IMessageWithAction, onHide?: () => void): () => void;
	public show(sev: Severity, message: any, onHide?: () => void): () => void {
		if (!message) {
			return () => void 0; // guard against undefined messages
		}

		if (Array.isArray(message)) {
			let closeFns: Function[] = [];
			message.forEach((msg: any) => closeFns.push(this.show(sev, msg, onHide)));

			return () => closeFns.forEach((fn) => fn());
		}

		if (errors.isPromiseCanceledError(message)) {
			return () => void 0; // this kind of error should not be shown
		}

		if (types.isNumber(message.severity)) {
			sev = message.severity;
		}

		return this.doShow(sev, message, onHide);
	}

	private doShow(sev: Severity, message: any, onHide?: () => void): () => void {

		// Check flag if we can show a message now
		if (!this.canShowMessages) {
			const messageObj: IBufferedMessage = {
				severity: sev,
				message,
				onHide,
				disposeFn: () => this.messageBuffer.splice(this.messageBuffer.indexOf(messageObj), 1)
			};
			this.messageBuffer.push(messageObj);

			// Return function that allows to remove message from buffer
			return () => messageObj.disposeFn();
		}

		// Show in Console
		if (sev === Severity.Error) {
			console.error(toErrorMessage(message, true));
		}

		// Show in Global Handler
		return this.handler.showMessage(this.toBaseSeverity(sev), message, onHide);
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
		while (this.disposeables.length) {
			this.disposeables.pop().dispose();
		}
	}
}