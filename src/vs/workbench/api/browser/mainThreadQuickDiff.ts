/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { DisposableMap, IDisposable } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { ExtHostContext, ExtHostQuickDiffShape, IDocumentFilterDto, MainContext, MainThreadQuickDiffShape } from '../common/extHost.protocol.js';
import { IQuickDiffService, QuickDiffProvider } from '../../contrib/scm/common/quickDiff.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';

@extHostNamedCustomer(MainContext.MainThreadQuickDiff)
export class MainThreadQuickDiff implements MainThreadQuickDiffShape {

	private readonly proxy: ExtHostQuickDiffShape;
	private providerDisposables = new DisposableMap<number, IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		@IQuickDiffService private readonly quickDiffService: IQuickDiffService
	) {
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostQuickDiff);
	}

	async $registerQuickDiffProvider(handle: number, selector: IDocumentFilterDto[], id: string, label: string, rootUri: UriComponents | undefined): Promise<void> {
		const provider: QuickDiffProvider = {
			id,
			label,
			rootUri: URI.revive(rootUri),
			selector,
			kind: 'contributed',
			getOriginalResource: async (uri: URI) => {
				return URI.revive(await this.proxy.$provideOriginalResource(handle, uri, CancellationToken.None));
			}
		};
		const disposable = this.quickDiffService.addQuickDiffProvider(provider);
		this.providerDisposables.set(handle, disposable);
	}

	async $unregisterQuickDiffProvider(handle: number): Promise<void> {
		if (this.providerDisposables.has(handle)) {
			this.providerDisposables.deleteAndDispose(handle);
		}
	}

	dispose(): void {
		this.providerDisposables.dispose();
	}
}
