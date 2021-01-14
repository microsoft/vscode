/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { isPromiseCanceledError } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ExtHostContext, ExtHostUriOpenersShape, IExtHostContext, MainContext, MainThreadUriOpenersShape } from 'vs/workbench/api/common/extHost.protocol';
import { externalUriOpenerIdSchemaAddition } from 'vs/workbench/contrib/externalUriOpener/common/configuration';
import { ExternalOpenerEntry, IExternalOpenerProvider, IExternalUriOpenerService } from 'vs/workbench/contrib/externalUriOpener/common/externalUriOpenerService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { extHostNamedCustomer } from '../common/extHostCustomers';

interface RegisteredOpenerMetadata {
	readonly schemes: ReadonlySet<string>;
	readonly extensionId: ExtensionIdentifier;
	readonly label: string;
}

@extHostNamedCustomer(MainContext.MainThreadUriOpeners)
export class MainThreadUriOpeners extends Disposable implements MainThreadUriOpenersShape, IExternalOpenerProvider {

	private readonly proxy: ExtHostUriOpenersShape;
	private readonly _registeredOpeners = new Map<string, RegisteredOpenerMetadata>();

	constructor(
		context: IExtHostContext,
		@IExternalUriOpenerService private readonly externalUriOpenerService: IExternalUriOpenerService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.proxy = context.getProxy(ExtHostContext.ExtHostUriOpeners);

		this._register(this.externalUriOpenerService.registerExternalOpenerProvider(this));
	}

	public async provideExternalOpeners(href: string | URI): Promise<readonly ExternalOpenerEntry[]> {
		const targetUri = typeof href === 'string' ? URI.parse(href) : href;

		// Currently we only allow openers for http and https urls
		if (targetUri.scheme !== Schemas.http && targetUri.scheme !== Schemas.https) {
			return [];
		}

		await this.extensionService.activateByEvent(`onUriOpen:${targetUri.scheme}`);

		// If there are no handlers there is no point in making a round trip
		const hasHandler = Array.from(this._registeredOpeners.values()).some(x => x.schemes.has(targetUri.scheme));
		if (!hasHandler) {
			return [];
		}

		const openerIds = await this.proxy.$getOpenersForUri(targetUri, CancellationToken.None);
		return openerIds.map(id => this.createOpener(id, targetUri));
	}

	private createOpener(openerId: string, sourceUri: URI): ExternalOpenerEntry {
		const metadata = this._registeredOpeners.get(openerId)!;
		return {
			id: openerId,
			label: metadata.label,
			openExternal: async (href) => {
				const resolveUri = URI.parse(href);
				try {
					await this.proxy.$openUri(openerId, { resolveUri, sourceUri }, CancellationToken.None);
				} catch (e) {
					if (!isPromiseCanceledError(e)) {
						this.notificationService.error(localize('openerFailedMessage', "Could not open uri: {0}", e.toString()));
					}
				}
				return true;
			},
		};
	}

	async $registerUriOpener(
		id: string,
		schemes: readonly string[],
		extensionId: ExtensionIdentifier,
		label: string,
	): Promise<void> {
		if (this._registeredOpeners.has(id)) {
			throw new Error(`Opener with id already registered: '${id}'`);
		}

		this._registeredOpeners.set(id, {
			schemes: new Set(schemes),
			label,
			extensionId,
		});

		externalUriOpenerIdSchemaAddition.enum?.push(id);
	}

	async $unregisterUriOpener(id: string): Promise<void> {
		this._registeredOpeners.delete(id);
	}

	dispose(): void {
		super.dispose();
		this._registeredOpeners.clear();
	}
}
