/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isPromiseCanceledError } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ExtHostContext, ExtHostUriOpenersShape, IExtHostContext, MainContext, MainThreadUriOpenersShape } from 'vs/workbench/api/common/extHost.protocol';
import { externalUriOpenerIdSchemaAddition } from 'vs/workbench/contrib/externalUriOpener/common/configuration';
import { IExternalOpenerProvider, IExternalUriOpener, IExternalUriOpenerService } from 'vs/workbench/contrib/externalUriOpener/common/externalUriOpenerService';
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
		@IExternalUriOpenerService externalUriOpenerService: IExternalUriOpenerService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.proxy = context.getProxy(ExtHostContext.ExtHostUriOpeners);

		this._register(externalUriOpenerService.registerExternalOpenerProvider(this));
	}

	public async *getOpeners(targetUri: URI): AsyncIterable<IExternalUriOpener> {

		// Currently we only allow openers for http and https urls
		if (targetUri.scheme !== Schemas.http && targetUri.scheme !== Schemas.https) {
			return;
		}

		await this.extensionService.activateByEvent(`onUriOpen:${targetUri.scheme}`);

		for (const [id, openerMetadata] of this._registeredOpeners) {
			if (openerMetadata.schemes.has(targetUri.scheme)) {
				yield this.createOpener(id, openerMetadata);
			}
		}
	}

	private createOpener(id: string, metadata: RegisteredOpenerMetadata): IExternalUriOpener {
		return {
			id: id,
			label: metadata.label,
			canOpen: (uri, token) => {
				return this.proxy.$canOpenUri(id, uri, token);
			},
			openExternalUri: async (uri, ctx, token) => {
				try {
					await this.proxy.$openUri(id, { resolvedUri: uri, sourceUri: ctx.sourceUri }, token);
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
