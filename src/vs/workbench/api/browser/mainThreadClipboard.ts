/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { MainContext, MainThreadClipboardShape } from '../common/extHost.protocol.js';
import { IClipboardService } from '../../../platform/clipboard/common/clipboardService.js';
import { ILogService } from '../../../platform/log/common/log.js';

@extHostNamedCustomer(MainContext.MainThreadClipboard)
export class MainThreadClipboard implements MainThreadClipboardShape {

	constructor(
		_context: IExtHostContext,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@ILogService private readonly _logService: ILogService
	) { }

	dispose(): void {
		// nothing
	}

	$readText(): Promise<string> {
		this._logService.trace('MainThreadClipboard#readText');
		const readText = this._clipboardService.readText();
		return readText;
	}

	$writeText(value: string): Promise<void> {
		this._logService.trace('MainThreadClipboard#writeText with text.length : ', value.length);
		return this._clipboardService.writeText(value);
	}
}
