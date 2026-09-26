/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { IMeteredConnectionService } from '../../../platform/meteredConnection/common/meteredConnection.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostMeteredConnectionShape, MainContext, MainThreadMeteredConnectionShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadMeteredConnection)
export class MainThreadMeteredConnection extends Disposable implements MainThreadMeteredConnectionShape {

	private readonly _proxy: ExtHostMeteredConnectionShape;

	constructor(
		extHostContext: IExtHostContext,
		@IMeteredConnectionService private readonly meteredConnectionService: IMeteredConnectionService
	) {
		super();

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostMeteredConnection);

		// Listen for changes and forward to extension host
		this._register(this.meteredConnectionService.onDidChangeIsConnectionMetered(isMetered => {
			this._proxy.$onDidChangeIsConnectionMetered(isMetered);
		}));

		void this.initialize();
	}

	private async initialize(): Promise<void> {
		await this.meteredConnectionService.whenInitialized;
		if (!this._store.isDisposed) {
			this._proxy.$initializeIsConnectionMetered(this.meteredConnectionService.isConnectionMetered);
		}
	}
}
