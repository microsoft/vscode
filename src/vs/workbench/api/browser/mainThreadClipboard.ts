/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { MainContext, MainThreadClipboardShape } from '../common/extHost.protocol.js';
import { IClipboardService } from '../../../platform/clipboard/common/clipboardService.js';

@extHostNamedCustomer(MainContext.MainThreadClipboard)
export class MainThreadClipboard implements MainThreadClipboardShape {

	constructor(
		_context: any,
		@IClipboardService private readonly _clipboardService: IClipboardService,
	) { }

	dispose(): void {
		// nothing
	}

	$readText(): Promise<string> {
		return this._clipboardService.readText();
	}

	$writeText(value: string): Promise<void> {
		return this._clipboardService.writeText(value);
	}
}
