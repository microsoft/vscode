/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ExtHostContext, ExtHostWindowShape, IExtHostContext, IOpenUriOptions, MainContext, MainThreadWindowShape } from '../common/extHost.protocol';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IURLService } from 'vs/platform/url/common/url';
import { IProductService } from 'vs/platform/product/common/productService';

@extHostNamedCustomer(MainContext.MainThreadWindow)
export class MainThreadWindow implements MainThreadWindowShape {

	private readonly proxy: ExtHostWindowShape;
	private readonly disposables = new DisposableStore();
	private readonly resolved = new Map<number, IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		@IHostService private readonly hostService: IHostService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IURLService private readonly urlService: IURLService,
		@IProductService private readonly productService: IProductService
	) {
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostWindow);

		Event.latch(hostService.onDidChangeFocus)
			(this.proxy.$onDidChangeWindowFocus, this.proxy, this.disposables);
	}

	dispose(): void {
		this.disposables.dispose();

		for (const value of this.resolved.values()) {
			value.dispose();
		}
		this.resolved.clear();
	}

	$getWindowVisibility(): Promise<boolean> {
		return Promise.resolve(this.hostService.hasFocus);
	}

	async $openUri(uriComponents: UriComponents, options: IOpenUriOptions): Promise<boolean> {
		const uri = URI.from(uriComponents);

		if (uri.scheme === this.productService.urlProtocol) {
			// special case for URLs using URL protocol: we transform
			// the URL via the IURLService to correctly address this
			// instance of VSCode when the link is opened. depending on
			// using desktop or web, this means:
			// - desktop: a window ID parameter is added to ensure the
			//            correct window is targeted when multiple are open
			// -     web: the URL uses http/https scheme because the URL
			//            protocol will only work if addressable by browsers
			const resolvedAppUri = this.urlService.create(uri);
			return this.openerService.open(resolvedAppUri, { openExternal: true });
		}

		return this.openerService.open(uri, { openExternal: true, allowTunneling: options.allowTunneling });
	}

	async $asExternalUri(uriComponents: UriComponents, options: IOpenUriOptions): Promise<UriComponents> {
		const uri = URI.revive(uriComponents);
		const result = await this.openerService.resolveExternalUri(uri, options);
		return result.resolved;
	}
}
