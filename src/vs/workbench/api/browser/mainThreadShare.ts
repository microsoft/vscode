/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ExtHostContext, ExtHostShareShape, IDocumentFilterDto, MainContext, MainThreadShareShape } from 'vs/workbench/api/common/extHost.protocol';
import { IShareProvider, IShareService, IShareableItem } from 'vs/workbench/contrib/share/common/share';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

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
				const result = await this.proxy.$provideShare(handle, item, new CancellationTokenSource().token);
				return typeof result === 'string' ? result : URI.revive(result);
			}
		};
		this.providers.set(handle, provider);
		const disposable = this.shareService.registerShareProvider(provider);
		this.providerDisposables.set(handle, disposable);
	}

	$unregisterShareProvider(handle: number): void {
		if (this.providers.has(handle)) {
			this.providers.delete(handle);
		}
		if (this.providerDisposables.has(handle)) {
			this.providerDisposables.delete(handle);
		}
	}

	dispose(): void {
		this.providers.clear();
		dispose(this.providerDisposables.values());
		this.providerDisposables.clear();
	}
}
