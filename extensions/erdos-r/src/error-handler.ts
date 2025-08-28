/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	CloseAction,
	CloseHandlerResult,
	ErrorAction,
	ErrorHandler,
	ErrorHandlerResult,
	Message
} from 'vscode-languageclient/node';

import { LOGGER } from './extension';

export class RErrorHandler implements ErrorHandler {
	constructor(
		private readonly _version: string,
		private readonly _port: number
	) {
	}

	public error(error: Error, _message: Message, count: number): ErrorHandlerResult {
		LOGGER.warn(`ARK (R ${this._version}) language client error occurred (port ${this._port}). '${error.name}' with message: ${error.message}. This is error number ${count}.`);
		return { action: ErrorAction.Shutdown, handled: true };
	}

	public closed(): CloseHandlerResult {
		LOGGER.warn(`ARK (R ${this._version}) language client was closed unexpectedly (port ${this._port}).`);
		return { action: CloseAction.DoNotRestart, handled: true };
	}
}
