/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IExternalOpener, IOpenerService } from 'vs/platform/opener/common/opener';
import { ExtHostContext, ExtHostUriOpenersShape, IExtHostContext, MainContext, MainThreadUriOpenersShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { extHostNamedCustomer } from '../common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadUriOpeners)
export class MainThreadUriOpeners extends Disposable implements MainThreadUriOpenersShape, IExternalOpener {

	private readonly proxy: ExtHostUriOpenersShape;
	private readonly handlers = new Map<number, { schemes: ReadonlySet<string> }>();

	constructor(
		context: IExtHostContext,
		@IOpenerService private readonly openerService: IOpenerService,
		@IExtensionService private readonly extensionService: IExtensionService,
	) {
		super();
		this.proxy = context.getProxy(ExtHostContext.ExtHostUriOpeners);

		this._register(this.openerService.registerAdditionalExternalOpener(this));
	}

	public async openExternal(href: string, originalUri: URI): Promise<boolean> {
		const targetUri = URI.parse(href);

		// Currently we only allow openers for http and https urls
		if (targetUri.scheme !== Schemas.http && targetUri.scheme !== Schemas.https) {
			return false;
		}

		await this.extensionService.activateByEvent(`onUriOpen:${targetUri.scheme}`);

		// If there are no handlers there is no point in making a round trip
		const hasHandler = Array.from(this.handlers.values()).some(x => x.schemes.has(targetUri.scheme));
		if (!hasHandler) {
			return false;
		}

		return await this.proxy.$openUri(targetUri, {
			originalUri: originalUri,
		}, CancellationToken.None);
	}

	async $registerUriOpener(handle: number, schemes: readonly string[]): Promise<void> {
		this.handlers.set(handle, { schemes: new Set(schemes) });
	}

	async $unregisterUriOpener(handle: number): Promise<void> {
		this.handlers.delete(handle);
	}

	dispose(): void {
		super.dispose();
		this.handlers.clear();
	}
}
