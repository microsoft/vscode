/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { clipboard } from 'electron';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { MainContext, MainThreadClipboardShape } from '../node/extHost.protocol';

@extHostNamedCustomer(MainContext.MainThreadClipboard)
export class MainThreadCommands implements MainThreadClipboardShape {

	dispose(): void {
		// nothing
	}

	$readText(): Promise<string> {
		return Promise.resolve(clipboard.readText());
	}

	$writeText(value: string): Promise<void> {
		clipboard.writeText(value);
		return undefined;
	}
}
