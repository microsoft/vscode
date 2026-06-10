/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LogOutputChannel, window } from 'vscode';
import { IHooksOutputChannel } from '../../../platform/chat/common/hooksOutputChannel';

export class HooksOutputChannel implements IHooksOutputChannel {
	declare readonly _serviceBrand: undefined;

	private _channel: LogOutputChannel | undefined;

	appendLine(message: string): void {
		if (!this._channel) {
			this._channel = window.createOutputChannel('GitHub Copilot Chat Hooks', { log: true });
		}
		this._channel.info(message);
	}
}
