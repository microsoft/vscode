/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IOpener, IOpenerService, OpenExternalOptions, OpenInternalOptions } from 'vs/platform/opener/common/opener';
import { ExtHostContext, ExtHostUriOpenersShape, IExtHostContext, MainContext, MainThreadUriOpenersShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { extHostNamedCustomer } from '../common/extHostCustomers';


@extHostNamedCustomer(MainContext.MainThreadUriOpeners)
export class MainThreadUriOpeners implements MainThreadUriOpenersShape, IOpener {

	private readonly proxy: ExtHostUriOpenersShape;
	private readonly handlers = new Set<number>();

	constructor(
		context: IExtHostContext,
		@IOpenerService private readonly openerService: IOpenerService,
		@IExtensionService private readonly extensionService: IExtensionService,
	) {
		this.proxy = context.getProxy(ExtHostContext.ExtHostUriOpeners);

		this.openerService.registerOpener(this);
	}

	async open(
		target: string | URI,
		options?: OpenInternalOptions | OpenExternalOptions
	): Promise<boolean> {
		const targetUri = typeof target === 'string' ? URI.parse(target) : target;

		// Currently we only allow openers for http and https urls
		if (targetUri.scheme !== Schemas.http && targetUri.scheme !== Schemas.https) {
			return false;
		}

		await this.extensionService.activateByEvent(`onUriOpen:${targetUri.scheme}`);

		// No handlers so no point in making a rount trip
		if (!this.handlers.size) {
			return false;
		}

		return await this.proxy.$openUri(targetUri, CancellationToken.None);
	}

	async $registerUriOpener(handle: number): Promise<void> {
		this.handlers.add(handle);
	}

	async $unregisterUriOpener(handle: number): Promise<void> {
		this.handlers.delete(handle);
	}

	dispose(): void {
		this.handlers.clear();
	}
}
