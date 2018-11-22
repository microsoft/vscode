/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { IDisposable, combinedDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { EnablementState, IExtensionEnablementService, IExtensionGalleryService, IExtensionIdentifier, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { INotificationHandle, INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IURLHandler, IURLService } from 'vs/platform/url/common/url';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

const FIVE_MINUTES = 5 * 60 * 1000;
const THIRTY_SECONDS = 30 * 1000;
const URL_TO_HANDLE = 'extensionUrlHandler.urlToHandle';

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
		@IDialogService private dialogService: IDialogService,
		@INotificationService private notificationService: INotificationService,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService,
		@IWindowService private windowService: IWindowService,
		@IExtensionGalleryService private galleryService: IExtensionGalleryService,
		@IStorageService private storageService: IStorageService
	) {
		const interval = setInterval(() => this.garbageCollect(), THIRTY_SECONDS);
		const urlToHandleValue = this.storageService.get(URL_TO_HANDLE, StorageScope.WORKSPACE);
		if (urlToHandleValue) {
			this.storageService.remove(URL_TO_HANDLE, StorageScope.WORKSPACE);
			this.handleURL(URI.revive(JSON.parse(urlToHandleValue)), true);
		}

		this.disposable = combinedDisposable([
			urlService.registerHandler(this),
			toDisposable(() => clearInterval(interval))
		]);
	}

	handleURL(uri: URI, confirmed?: boolean): TPromise<boolean> {
		if (!isExtensionId(uri.authority)) {
			return TPromise.as(false);
		}

		const extensionId = uri.authority;
		const wasHandlerAvailable = this.extensionHandlers.has(extensionId);

		return this.extensionService.getExtension(extensionId).then(extension => {

			if (!extension) {
				return this.handleUnhandledURL(uri, { id: extensionId }).then(() => false);
			}

			const handleURL = () => {
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
			};

			if (confirmed) {
				return handleURL();
			}

			return this.dialogService.confirm({
				message: localize('confirmUrl', "Allow an extension to open this URL?", extensionId),
				detail: `${extension.displayName || extension.name} (${extensionId}) wants to open a URL:\n\n${uri.toString()}`,
				primaryButton: localize('open', "&&Open"),
				type: 'question'
			}).then(result => {

				if (!result.confirmed) {
					return TPromise.as(true);
				}

				return handleURL();
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

	private async handleUnhandledURL(uri: URI, extensionIdentifier: IExtensionIdentifier): Promise<void> {
		const installedExtensions = await this.extensionManagementService.getInstalled();
		const extension = installedExtensions.filter(e => areSameExtensions(e.galleryIdentifier, extensionIdentifier))[0];

		// Extension is installed
		if (extension) {
			const enabled = this.extensionEnablementService.isEnabled(extension);

			// Extension is not running. Reload the window to handle.
			if (enabled) {
				this.dialogService.confirm({
					message: localize('reloadAndHandle', "Extension '{0}' is not loaded. Would you like to reload the window to load the extension and open the URL?", extension.manifest.displayName || extension.manifest.name),
					detail: `${extension.manifest.displayName || extension.manifest.name} (${extensionIdentifier.id}) wants to open a URL:\n\n${uri.toString()}`,
					primaryButton: localize('reloadAndOpen', "&&Reload Window and Open"),
					type: 'question'
				}).then(result => {
					if (result.confirmed) {
						return this.reloadAndHandle(uri);
					}
					return null;
				});
			}

			// Extension is disabled. Enable the extension and reload the window to handle.
			else {
				this.dialogService.confirm({
					message: localize('enableAndHandle', "Extension '{0}' is disabled. Would you like to enable the extension and reload the window to open the URL?", extension.manifest.displayName || extension.manifest.name),
					detail: `${extension.manifest.displayName || extension.manifest.name} (${extensionIdentifier.id}) wants to open a URL:\n\n${uri.toString()}`,
					primaryButton: localize('enableAndReload', "&&Enable and Open"),
					type: 'question'
				}).then((result): TPromise<void> | null => {
					if (result.confirmed) {
						return this.extensionEnablementService.setEnablement(extension, EnablementState.Enabled)
							.then(() => this.reloadAndHandle(uri));
					}
					return null;
				});
			}
		}

		// Extension is not installed
		else {
			const galleryExtension = await this.galleryService.getExtension(extensionIdentifier);
			if (galleryExtension) {
				// Install the Extension and reload the window to handle.
				this.dialogService.confirm({
					message: localize('installAndHandle', "Extension '{0}' is not installed. Would you like to install the extension and reload the window to open this URL?", galleryExtension.displayName || galleryExtension.name),
					detail: `${galleryExtension.displayName || galleryExtension.name} (${extensionIdentifier.id}) wants to open a URL:\n\n${uri.toString()}`,
					primaryButton: localize('install', "&&Install"),
					type: 'question'
				}).then(async result => {
					if (result.confirmed) {
						let notificationHandle: INotificationHandle | null = this.notificationService.notify({ severity: Severity.Info, message: localize('Installing', "Installing Extension '{0}'...", galleryExtension.displayName || galleryExtension.name) });
						notificationHandle.progress.infinite();
						notificationHandle.onDidClose(() => notificationHandle = null);
						try {
							await this.extensionManagementService.installFromGallery(galleryExtension);
							const reloadMessage = localize('reload', "Would you like to reload the window and open the URL '{0}'?", uri.toString());
							const reloadActionLabel = localize('Reload', "Reload Window and Open");
							if (notificationHandle) {
								notificationHandle.progress.done();
								notificationHandle.updateMessage(reloadMessage);
								notificationHandle.updateActions({
									primary: [new Action('reloadWindow', reloadActionLabel, undefined, true, () => this.reloadAndHandle(uri))]
								});
							} else {
								this.notificationService.prompt(Severity.Info, reloadMessage,
									[{
										label: reloadActionLabel,
										run: () => this.reloadAndHandle(uri)
									}],
									{ sticky: true }
								);
							}
						} catch (e) {
							if (notificationHandle) {
								notificationHandle.progress.done();
								notificationHandle.updateSeverity(Severity.Error);
								notificationHandle.updateMessage(e);
							} else {
								this.notificationService.error(e);
							}
						}
					}
				});
			}
		}
	}

	private reloadAndHandle(url: URI): TPromise<void> {
		this.storageService.store(URL_TO_HANDLE, JSON.stringify(url.toJSON()), StorageScope.WORKSPACE);
		return this.windowService.reloadWindow();
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
