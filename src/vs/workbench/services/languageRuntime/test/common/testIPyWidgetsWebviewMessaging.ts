/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { IIPyWidgetsWebviewMessaging } from '../../common/languageRuntimeIPyWidgetClient.js';
import { FromWebviewMessage, ToWebviewMessage } from '../../common/erdosIPyWidgetsWebviewMessages.js';

export class TestIPyWidgetsWebviewMessaging implements IIPyWidgetsWebviewMessaging {
	private readonly _onDidReceiveMessage = new Emitter<FromWebviewMessage>();
	readonly onDidReceiveMessage: Event<FromWebviewMessage> = this._onDidReceiveMessage.event;

	private _messages: ToWebviewMessage[] = [];

	async postMessage(message: ToWebviewMessage): Promise<boolean> {
		this._messages.push(message);
		return true;
	}

	sendMessage(message: FromWebviewMessage): void {
		this._onDidReceiveMessage.fire(message);
	}

	get messages(): ToWebviewMessage[] {
		return this._messages;
	}

	dispose(): void {
		this._onDidReceiveMessage.dispose();
	}
}
