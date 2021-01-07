/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IExternalOpener, IExternalOpenerProvider, IOpenerService } from 'vs/platform/opener/common/opener';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { ExtHostContext, ExtHostUriOpenersShape, IExtHostContext, MainContext, MainThreadUriOpenersShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { extHostNamedCustomer } from '../common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadUriOpeners)
export class MainThreadUriOpeners extends Disposable implements MainThreadUriOpenersShape, IExternalOpenerProvider {

	private readonly proxy: ExtHostUriOpenersShape;
	private readonly handlers = new Map<number, { schemes: ReadonlySet<string> }>();

	constructor(
		context: IExtHostContext,
		@IOpenerService private readonly openerService: IOpenerService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		super();
		this.proxy = context.getProxy(ExtHostContext.ExtHostUriOpeners);

		this._register(this.openerService.registerExternalOpenerProvider(this));
	}
	public async provideExternalOpener(href: string | URI): Promise<IExternalOpener | undefined> {
		const targetUri = typeof href === 'string' ? URI.parse(href) : href;

		// Currently we only allow openers for http and https urls
		if (targetUri.scheme !== Schemas.http && targetUri.scheme !== Schemas.https) {
			return undefined;
		}

		await this.extensionService.activateByEvent(`onUriOpen:${targetUri.scheme}`);

		// If there are no handlers there is no point in making a round trip
		const hasHandler = Array.from(this.handlers.values()).some(x => x.schemes.has(targetUri.scheme));
		if (!hasHandler) {
			return undefined;
		}


		const { openers, cacheId } = await this.proxy.$getOpenersForUri(targetUri, CancellationToken.None);
		if (openers.length === 0) {
			return undefined;
		} else if (openers.length === 1) {
			return this.openerForCommand(cacheId, openers[0].id);
		} else {
			type PickItem = IQuickPickItem & { index: number };
			const items = openers.map((opener, i): PickItem => {
				return {
					label: opener.title,
					index: i
				};
			});

			const picked = await this.quickInputService.pick(items, {});
			if (picked) {
				const opener = openers[(picked as PickItem).index];
				return this.openerForCommand(cacheId, opener.id);
			}

			this.proxy.$releaseOpener(cacheId);
			return undefined;
		}
	}

	private openerForCommand(cacheId: number, commandId: number): IExternalOpener {
		return {
			openExternal: async (href) => {
				const targetUri = URI.parse(href);
				try {
					await this.proxy.$openUri([cacheId, commandId], targetUri);
				} finally {
					this.proxy.$releaseOpener(cacheId);
				}
				return true;
			}
		};
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
