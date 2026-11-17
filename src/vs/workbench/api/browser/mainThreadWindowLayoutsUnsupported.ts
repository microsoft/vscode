/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { MainContext, MainThreadWindowLayoutsShape, WindowLayoutDto } from '../common/extHost.protocol.js';

/**
 * Registered instead of `MainThreadWindowLayouts` by windows that do not support named layouts,
 * like the Agents window, because the extension host requires every main thread actor. The
 * active layout of the extension host stays the default layout.
 */
@extHostNamedCustomer(MainContext.MainThreadWindowLayouts)
export class MainThreadWindowLayoutsUnsupported extends Disposable implements MainThreadWindowLayoutsShape {

	constructor(_extHostContext: IExtHostContext) {
		super();
	}

	async $switchLayout(): Promise<{ readonly token: number; readonly previousLayout: WindowLayoutDto }> {
		throw new Error('Layouts are not supported in this window.');
	}

	async $restoreLayout(): Promise<boolean> {
		return false;
	}
}
