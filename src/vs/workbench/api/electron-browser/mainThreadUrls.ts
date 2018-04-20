/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtHostContext, IExtHostContext, MainContext, MainThreadUrlsShape, ExtHostUrlsShape } from 'vs/workbench/api/node/extHost.protocol';
import { extHostNamedCustomer } from './extHostCustomers';
import { TPromise } from 'vs/base/common/winjs.base';
import { IURLService, IURLHandler } from 'vs/platform/url/common/url';
import URI from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';

class ExtensionUrlHandler implements IURLHandler {

	constructor(
		private readonly proxy: ExtHostUrlsShape,
		private readonly handle: number,
		private readonly extensionId: string
	) { }

	handleURL(uri: URI): TPromise<boolean> {
		if (uri.authority !== this.extensionId) {
			return TPromise.as(false);
		}

		return this.proxy.$handleUrl(this.handle, uri).then(() => true);
	}
}

@extHostNamedCustomer(MainContext.MainThreadUrls)
export class MainThreadUrls implements MainThreadUrlsShape {

	private readonly proxy: ExtHostUrlsShape;

	private handlers = new Map<number, IDisposable>();

	constructor(
		context: IExtHostContext,
		@IURLService private urlService: IURLService
	) {
		this.proxy = context.getProxy(ExtHostContext.ExtHostUrls);
	}

	$registerUrlHandler(handle: number, extensionId: string): TPromise<void> {
		const handler = new ExtensionUrlHandler(this.proxy, handle, extensionId);
		const disposable = this.urlService.registerHandler(handler);
		this.handlers.set(handle, disposable);

		return TPromise.as(null);
	}

	$unregisterUrlHandler(handle: number): TPromise<void> {
		const disposable = this.handlers.get(handle);

		if (!disposable) {
			return TPromise.as(null);
		}

		disposable.dispose();
		this.handlers.delete(handle);

		return TPromise.as(null);
	}

	dispose(): void {

	}
}
