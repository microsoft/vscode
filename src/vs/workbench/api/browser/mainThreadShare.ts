/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { IDisposable, dispose } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ExtHostContext, ExtHostShareShape, IDocumentFilterDto, MainContext, MainThreadShareShape } from '../common/extHost.protocol.js';
import { IShareProvider, IShareService, IShareableItem } from '../../contrib/share/common/share.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';

@extHostNamedCustomer(MainContext.MainThreadShare)
export class MainThreadShare implements MainThreadShareShape {

	private readonly proxy: ExtHostShareShape;
	private providers = new Map<number, IShareProvider>();
	private providerDisposables = new Map<number, IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		@IShareService private readonly shareService: IShareService
	) {
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostShare);
	}

	$registerShareProvider(handle: number, selector: IDocumentFilterDto[], id: string, label: string, priority: number): void {
		const provider: IShareProvider = {
			id,
			label,
			selector,
			priority,
			provideShare: async (item: IShareableItem) => {
				const result = await this.proxy.$provideShare(handle, item, CancellationToken.None);
				return typeof result === 'string' ? result : URI.revive(result);
			}
		};
		this.providers.set(handle, provider);
		const disposable = this.shareService.registerShareProvider(provider);
		this.providerDisposables.set(handle, disposable);
	}

	$unregisterShareProvider(handle: number): void {
		this.providers.delete(handle);
		this.providerDisposables.delete(handle);
	}

	dispose(): void {
		this.providers.clear();
		dispose(this.providerDisposables.values());
		this.providerDisposables.clear();
	}
}
