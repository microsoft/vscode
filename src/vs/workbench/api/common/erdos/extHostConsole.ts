/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as erdos from 'erdos';
import { MainThreadConsoleServiceShape } from './extHost.erdos.protocol.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export class ExtHostConsole {

	private _disposed: boolean = false;

	private readonly _value: erdos.Console;

	constructor(
		sessionId: string,
		proxy: MainThreadConsoleServiceShape,
		logService: ILogService,
	) {
		const that = this;

		this._value = Object.freeze({
			pasteText(text: string): void {
				if (that._disposed) {
					logService.warn('Console is closed/disposed.');
					return;
				}
				proxy.$tryPasteText(sessionId, text);
			}
		});
	}

	dispose() {
		this._disposed = true;
	}

	getConsole(): erdos.Console {
		return this._value;
	}
}