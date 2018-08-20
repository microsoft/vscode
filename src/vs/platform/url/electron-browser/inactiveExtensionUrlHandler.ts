/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IURLService, IURLHandler } from 'vs/platform/url/common/url';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, toDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { localize } from 'vs/nls';

const FIVE_MINUTES = 5 * 60 * 1000;
const THIRTY_SECONDS = 30 * 1000;

function isExtensionId(value: string): boolean {
	return /^[a-z0-9][a-z0-9\-]*\.[a-z0-9][a-z0-9\-]*$/i.test(value);
}

export const IExtensionUrlHandler = createDecorator<IExtensionUrlHandler>('inactiveExtensionUrlHandler');

export interface IExtensionUrlHandler {
	readonly _serviceBrand: any;
	registerExtensionHandler(extensionId: string, handler: IURLHandler): void;
	unregisterExtensionHandler(extensionId: string): void;
}

/**
 * This class handles URLs which are directed towards inactive extensions.
 * If a URL is directed towards an inactive extension, it buffers it,
 * activates the extension and re-opens the URL once the extension registers
 * a URL handler. If the extension never registers a URL handler, the urls
 * will eventually be garbage collected.
 *
 * It also makes sure the user confirms opening URLs directed towards extensions.
 */
export class ExtensionUrlHandler implements IExtensionUrlHandler, IURLHandler {

	readonly _serviceBrand: any;

	private extensionHandlers = new Map<string, IURLHandler>();
	private uriBuffer = new Map<string, { timestamp: number, uri: URI }[]>();
	private disposable: IDisposable;

	constructor(
		@IURLService urlService: IURLService,
		@IExtensionService private extensionService: IExtensionService,
		@IDialogService private dialogService: IDialogService
	) {
		const interval = setInterval(() => this.garbageCollect(), THIRTY_SECONDS);

		this.disposable = combinedDisposable([
			urlService.registerHandler(this),
			toDisposable(() => clearInterval(interval))
		]);
	}

	handleURL(uri: URI): TPromise<boolean> {
		if (!isExtensionId(uri.authority)) {
			return TPromise.as(false);
		}

		const extensionId = uri.authority;
		const wasHandlerAvailable = this.extensionHandlers.has(extensionId);

		return this.extensionService.getExtensions().then(extensions => {
			const extension = extensions.filter(e => e.id === extensionId)[0];

			if (!extension) {
				return TPromise.as(false);
			}

			return this.dialogService.confirm({
				message: localize('confirmUrl', "Allow an extension to open this URL?", extensionId),
				detail: `${extension.displayName || extension.name} (${extensionId}) wants to open a URL:\n\n${uri.toString()}`
			}).then(result => {

				if (!result.confirmed) {
					return TPromise.as(true);
				}

				const handler = this.extensionHandlers.get(extensionId);
				if (handler) {
					if (!wasHandlerAvailable) {
						// forward it directly
						return handler.handleURL(uri);
					}

					// let the ExtensionUrlHandler instance handle this
					return TPromise.as(false);
				}

				// collect URI for eventual extension activation
				const timestamp = new Date().getTime();
				let uris = this.uriBuffer.get(extensionId);

				if (!uris) {
					uris = [];
					this.uriBuffer.set(extensionId, uris);
				}

				uris.push({ timestamp, uri });

				// activate the extension
				return this.extensionService.activateByEvent(`onUri:${extensionId}`)
					.then(() => true);
			});
		});
	}

	registerExtensionHandler(extensionId: string, handler: IURLHandler): void {
		this.extensionHandlers.set(extensionId, handler);

		const uris = this.uriBuffer.get(extensionId) || [];

		for (const { uri } of uris) {
			handler.handleURL(uri);
		}

		this.uriBuffer.delete(extensionId);
	}

	unregisterExtensionHandler(extensionId: string): void {
		this.extensionHandlers.delete(extensionId);
	}

	// forget about all uris buffered more than 5 minutes ago
	private garbageCollect(): void {
		const now = new Date().getTime();
		const uriBuffer = new Map<string, { timestamp: number, uri: URI }[]>();

		this.uriBuffer.forEach((uris, extensionId) => {
			uris = uris.filter(({ timestamp }) => now - timestamp < FIVE_MINUTES);

			if (uris.length > 0) {
				uriBuffer.set(extensionId, uris);
			}
		});

		this.uriBuffer = uriBuffer;
	}

	dispose(): void {
		this.disposable.dispose();
		this.extensionHandlers.clear();
		this.uriBuffer.clear();
	}
}