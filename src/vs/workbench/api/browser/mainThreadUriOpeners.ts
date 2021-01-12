/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { ExtHostContext, ExtHostUriOpener, ExtHostUriOpenersShape, IExtHostContext, MainContext, MainThreadUriOpenersShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExternalOpenerEntry, ExternalOpenerSet, IExternalOpenerProvider, IExternalUriOpenerService } from 'vs/workbench/contrib/externalUriOpener/common/externalUriOpenerService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { extHostNamedCustomer } from '../common/extHostCustomers';

interface RegisteredOpenerMetadata {
	readonly schemes: ReadonlySet<string>;
}

@extHostNamedCustomer(MainContext.MainThreadUriOpeners)
export class MainThreadUriOpeners extends Disposable implements MainThreadUriOpenersShape, IExternalOpenerProvider {

	private readonly proxy: ExtHostUriOpenersShape;
	private readonly registeredOpeners = new Map<number, RegisteredOpenerMetadata>();

	constructor(
		context: IExtHostContext,
		@IExternalUriOpenerService private readonly externalUriOpenerService: IExternalUriOpenerService,
		@IExtensionService private readonly extensionService: IExtensionService,
	) {
		super();
		this.proxy = context.getProxy(ExtHostContext.ExtHostUriOpeners);

		this._register(this.externalUriOpenerService.registerExternalOpenerProvider(this));
	}

	public async provideExternalOpeners(href: string | URI): Promise<ExternalOpenerSet | undefined> {
		const targetUri = typeof href === 'string' ? URI.parse(href) : href;

		// Currently we only allow openers for http and https urls
		if (targetUri.scheme !== Schemas.http && targetUri.scheme !== Schemas.https) {
			return undefined;
		}

		await this.extensionService.activateByEvent(`onUriOpen:${targetUri.scheme}`);

		// If there are no handlers there is no point in making a round trip
		const hasHandler = Array.from(this.registeredOpeners.values()).some(x => x.schemes.has(targetUri.scheme));
		if (!hasHandler) {
			return undefined;
		}

		const { openers, cacheId } = await this.proxy.$getOpenersForUri(targetUri, CancellationToken.None);

		if (openers.length === 0) {
			this.proxy.$releaseOpener(cacheId);
			return undefined;
		} else {
			return {
				openers: openers.map(opener => this.openerForCommand(cacheId, opener)),
				dispose: () => {
					this.proxy.$releaseOpener(cacheId);
				}
			};
		}
	}

	private openerForCommand(
		cacheId: number,
		opener: ExtHostUriOpener
	): ExternalOpenerEntry {
		return {
			id: opener.extensionId.value,
			label: opener.title,
			openExternal: async (href) => {
				const targetUri = URI.parse(href);
				await this.proxy.$openUri([cacheId, opener.commandId], targetUri);
				return true;
			},
		};
	}

	async $registerUriOpener(handle: number, schemes: readonly string[]): Promise<void> {
		this.registeredOpeners.set(handle, { schemes: new Set(schemes) });
	}

	async $unregisterUriOpener(handle: number): Promise<void> {
		this.registeredOpeners.delete(handle);
	}

	dispose(): void {
		super.dispose();
		this.registeredOpeners.clear();
	}
}
