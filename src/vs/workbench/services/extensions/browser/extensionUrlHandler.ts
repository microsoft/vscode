/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IDisposable, toDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IExtensionGalleryService, IExtensionIdentifier, IExtensionManagementService, IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IWorkbenchExtensionEnablementService, EnablementState } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { createDecorator, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IURLHandler, IURLService, IOpenURLOptions } from 'vs/platform/url/common/url';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IExtensionService, toExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution, Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { IsWebContext } from 'vs/platform/contextkey/common/contextkeys';
import { IExtensionUrlTrustService } from 'vs/platform/extensionManagement/common/extensionUrlTrust';
import { CancellationToken } from 'vs/base/common/cancellation';

import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

const FIVE_MINUTES = 5 * 60 * 1000;
const THIRTY_SECONDS = 30 * 1000;
const URL_TO_HANDLE = 'extensionUrlHandler.urlToHandle';
const USER_TRUSTED_EXTENSIONS_CONFIGURATION_KEY = 'extensions.confirmedUriHandlerExtensionIds';
const USER_TRUSTED_EXTENSIONS_STORAGE_KEY = 'extensionUrlHandler.confirmedExtensions';

function isExtensionId(value: string): boolean {
	return /^[a-z0-9][a-z0-9\-]*\.[a-z0-9][a-z0-9\-]*$/i.test(value);
}

class UserTrustedExtensionIdStorage {

	get extensions(): string[] {
		const userTrustedExtensionIdsJson = this.storageService.get(USER_TRUSTED_EXTENSIONS_STORAGE_KEY, StorageScope.PROFILE, '[]');

		try {
			return JSON.parse(userTrustedExtensionIdsJson);
		} catch {
			return [];
		}
	}

	constructor(private storageService: IStorageService) { }

	has(id: string): boolean {
		return this.extensions.indexOf(id) > -1;
	}

	add(id: string): void {
		this.set([...this.extensions, id]);
	}

	set(ids: string[]): void {
		this.storageService.store(USER_TRUSTED_EXTENSIONS_STORAGE_KEY, JSON.stringify(ids), StorageScope.PROFILE, StorageTarget.MACHINE);
	}
}

export const IExtensionUrlHandler = createDecorator<IExtensionUrlHandler>('extensionUrlHandler');

export interface IExtensionUrlHandler {
	readonly _serviceBrand: undefined;
	registerExtensionHandler(extensionId: ExtensionIdentifier, handler: IURLHandler): void;
	unregisterExtensionHandler(extensionId: ExtensionIdentifier): void;
}

export interface ExtensionUrlHandlerEvent {
	readonly extensionId: string;
}

type ExtensionUrlHandlerClassification = {
	owner: 'joaomoreno';
	readonly extensionId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The ID of the extension that should handle the URI' };
	comment: 'This is used to understand the drop funnel of extension URI handling by the OS & VS Code.';
};

/**
 * This class handles URLs which are directed towards extensions.
 * If a URL is directed towards an inactive extension, it buffers it,
 * activates the extension and re-opens the URL once the extension registers
 * a URL handler. If the extension never registers a URL handler, the urls
 * will eventually be garbage collected.
 *
 * It also makes sure the user confirms opening URLs directed towards extensions.
 */
class ExtensionUrlHandler implements IExtensionUrlHandler, IURLHandler {

	readonly _serviceBrand: undefined;

	private extensionHandlers = new Map<string, IURLHandler>();
	private uriBuffer = new Map<string, { timestamp: number; uri: URI }[]>();
	private userTrustedExtensionsStorage: UserTrustedExtensionIdStorage;
	private disposable: IDisposable;

	constructor(
		@IURLService urlService: IURLService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IHostService private readonly hostService: IHostService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProgressService private readonly progressService: IProgressService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IExtensionUrlTrustService private readonly extensionUrlTrustService: IExtensionUrlTrustService
	) {
		this.userTrustedExtensionsStorage = new UserTrustedExtensionIdStorage(storageService);

		const interval = setInterval(() => this.garbageCollect(), THIRTY_SECONDS);
		const urlToHandleValue = this.storageService.get(URL_TO_HANDLE, StorageScope.WORKSPACE);
		if (urlToHandleValue) {
			this.storageService.remove(URL_TO_HANDLE, StorageScope.WORKSPACE);
			this.handleURL(URI.revive(JSON.parse(urlToHandleValue)), { trusted: true });
		}

		this.disposable = combinedDisposable(
			urlService.registerHandler(this),
			toDisposable(() => clearInterval(interval))
		);

		const cache = ExtensionUrlBootstrapHandler.cache;
		setTimeout(() => cache.forEach(([uri, option]) => this.handleURL(uri, option)));
	}

	async handleURL(uri: URI, options?: IOpenURLOptions): Promise<boolean> {
		if (!isExtensionId(uri.authority)) {
			return false;
		}

		const extensionId = uri.authority;
		this.telemetryService.publicLog2<ExtensionUrlHandlerEvent, ExtensionUrlHandlerClassification>('uri_invoked/start', { extensionId });

		const wasHandlerAvailable = this.extensionHandlers.has(ExtensionIdentifier.toKey(extensionId));
		const extension = await this.extensionService.getExtension(extensionId);

		if (!extension) {
			await this.handleUnhandledURL(uri, { id: extensionId }, options);
			return true;
		}

		const trusted = options?.trusted
			|| (options?.originalUrl ? await this.extensionUrlTrustService.isExtensionUrlTrusted(extensionId, options.originalUrl) : false)
			|| this.didUserTrustExtension(ExtensionIdentifier.toKey(extensionId));

		if (!trusted) {
			let uriString = uri.toString(false);

			if (uriString.length > 40) {
				uriString = `${uriString.substring(0, 30)}...${uriString.substring(uriString.length - 5)}`;
			}

			const result = await this.dialogService.confirm({
				message: localize('confirmUrl', "Allow an extension to open this URI?", extensionId),
				checkbox: {
					label: localize('rememberConfirmUrl', "Don't ask again for this extension."),
				},
				detail: `${extension.displayName || extension.name} (${extensionId}) wants to open a URI:\n\n${uriString}`,
				primaryButton: localize('open', "&&Open"),
				type: 'question'
			});

			if (!result.confirmed) {
				this.telemetryService.publicLog2<ExtensionUrlHandlerEvent, ExtensionUrlHandlerClassification>('uri_invoked/cancel', { extensionId });
				return true;
			}

			if (result.checkboxChecked) {
				this.userTrustedExtensionsStorage.add(ExtensionIdentifier.toKey(extensionId));
			}
		}

		const handler = this.extensionHandlers.get(ExtensionIdentifier.toKey(extensionId));

		if (handler) {
			if (!wasHandlerAvailable) {
				// forward it directly
				return await this.handleURLByExtension(extensionId, handler, uri, options);
			}

			// let the ExtensionUrlHandler instance handle this
			return false;
		}

		// collect URI for eventual extension activation
		const timestamp = new Date().getTime();
		let uris = this.uriBuffer.get(ExtensionIdentifier.toKey(extensionId));

		if (!uris) {
			uris = [];
			this.uriBuffer.set(ExtensionIdentifier.toKey(extensionId), uris);
		}

		uris.push({ timestamp, uri });

		// activate the extension
		await this.extensionService.activateByEvent(`onUri:${ExtensionIdentifier.toKey(extensionId)}`);
		return true;
	}

	registerExtensionHandler(extensionId: ExtensionIdentifier, handler: IURLHandler): void {
		this.extensionHandlers.set(ExtensionIdentifier.toKey(extensionId), handler);

		const uris = this.uriBuffer.get(ExtensionIdentifier.toKey(extensionId)) || [];

		for (const { uri } of uris) {
			this.handleURLByExtension(extensionId, handler, uri);
		}

		this.uriBuffer.delete(ExtensionIdentifier.toKey(extensionId));
	}

	unregisterExtensionHandler(extensionId: ExtensionIdentifier): void {
		this.extensionHandlers.delete(ExtensionIdentifier.toKey(extensionId));
	}

	private async handleURLByExtension(extensionId: ExtensionIdentifier | string, handler: IURLHandler, uri: URI, options?: IOpenURLOptions): Promise<boolean> {
		this.telemetryService.publicLog2<ExtensionUrlHandlerEvent, ExtensionUrlHandlerClassification>('uri_invoked/end', { extensionId: ExtensionIdentifier.toKey(extensionId) });
		return await handler.handleURL(uri, options);
	}

	private async handleUnhandledURL(uri: URI, extensionIdentifier: IExtensionIdentifier, options?: IOpenURLOptions): Promise<void> {
		const installedExtensions = await this.extensionManagementService.getInstalled();
		let extension = installedExtensions.find(e => areSameExtensions(e.identifier, extensionIdentifier));

		// Extension is not installed
		if (!extension) {
			let galleryExtension: IGalleryExtension | undefined;

			try {
				galleryExtension = (await this.galleryService.getExtensions([extensionIdentifier], CancellationToken.None))[0] ?? undefined;
			} catch (err) {
				return;
			}

			if (!galleryExtension) {
				return;
			}

			this.telemetryService.publicLog2<ExtensionUrlHandlerEvent, ExtensionUrlHandlerClassification>('uri_invoked/install_extension/start', { extensionId: extensionIdentifier.id });

			// Install the Extension and reload the window to handle.
			const result = await this.dialogService.confirm({
				message: localize('installAndHandle', "Extension '{0}' is not installed. Would you like to install the extension and open this URL?", galleryExtension.displayName || galleryExtension.name),
				detail: `${galleryExtension.displayName || galleryExtension.name} (${extensionIdentifier.id}) wants to open a URL:\n\n${uri.toString()}`,
				primaryButton: localize('install and open', "&&Install and Open"),
				type: 'question'
			});

			if (!result.confirmed) {
				this.telemetryService.publicLog2<ExtensionUrlHandlerEvent, ExtensionUrlHandlerClassification>('uri_invoked/install_extension/cancel', { extensionId: extensionIdentifier.id });
				return;
			}

			this.telemetryService.publicLog2<ExtensionUrlHandlerEvent, ExtensionUrlHandlerClassification>('uri_invoked/install_extension/accept', { extensionId: extensionIdentifier.id });

			try {
				extension = await this.progressService.withProgress({
					location: ProgressLocation.Notification,
					title: localize('Installing', "Installing Extension '{0}'...", galleryExtension.displayName || galleryExtension.name)
				}, () => this.extensionManagementService.installFromGallery(galleryExtension!));
			} catch (error) {
				this.notificationService.error(error);
				return;
			}
		}

		// Extension is installed but not enabled
		if (!this.extensionEnablementService.isEnabled(extension)) {
			this.telemetryService.publicLog2<ExtensionUrlHandlerEvent, ExtensionUrlHandlerClassification>('uri_invoked/enable_extension/start', { extensionId: extensionIdentifier.id });
			const result = await this.dialogService.confirm({
				message: localize('enableAndHandle', "Extension '{0}' is disabled. Would you like to enable the extension and open the URL?", extension.manifest.displayName || extension.manifest.name),
				detail: `${extension.manifest.displayName || extension.manifest.name} (${extensionIdentifier.id}) wants to open a URL:\n\n${uri.toString()}`,
				primaryButton: localize('enableAndReload', "&&Enable and Open"),
				type: 'question'
			});

			if (!result.confirmed) {
				this.telemetryService.publicLog2<ExtensionUrlHandlerEvent, ExtensionUrlHandlerClassification>('uri_invoked/enable_extension/cancel', { extensionId: extensionIdentifier.id });
				return;
			}

			this.telemetryService.publicLog2<ExtensionUrlHandlerEvent, ExtensionUrlHandlerClassification>('uri_invoked/enable_extension/accept', { extensionId: extensionIdentifier.id });
			await this.extensionEnablementService.setEnablement([extension], EnablementState.EnabledGlobally);
		}

		if (this.extensionService.canAddExtension(toExtensionDescription(extension))) {
			await this.waitUntilExtensionIsAdded(extensionIdentifier);
			await this.handleURL(uri, { ...options, trusted: true });
		}

		/* Extension cannot be added and require window reload */
		else {
			this.telemetryService.publicLog2<ExtensionUrlHandlerEvent, ExtensionUrlHandlerClassification>('uri_invoked/activate_extension/start', { extensionId: extensionIdentifier.id });
			const result = await this.dialogService.confirm({
				message: localize('reloadAndHandle', "Extension '{0}' is not loaded. Would you like to reload the window to load the extension and open the URL?", extension.manifest.displayName || extension.manifest.name),
				detail: `${extension.manifest.displayName || extension.manifest.name} (${extensionIdentifier.id}) wants to open a URL:\n\n${uri.toString()}`,
				primaryButton: localize('reloadAndOpen', "&&Reload Window and Open"),
				type: 'question'
			});

			if (!result.confirmed) {
				this.telemetryService.publicLog2<ExtensionUrlHandlerEvent, ExtensionUrlHandlerClassification>('uri_invoked/activate_extension/cancel', { extensionId: extensionIdentifier.id });
				return;
			}

			this.telemetryService.publicLog2<ExtensionUrlHandlerEvent, ExtensionUrlHandlerClassification>('uri_invoked/activate_extension/accept', { extensionId: extensionIdentifier.id });
			this.storageService.store(URL_TO_HANDLE, JSON.stringify(uri.toJSON()), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			await this.hostService.reload();
		}
	}

	private async waitUntilExtensionIsAdded(extensionId: IExtensionIdentifier): Promise<void> {
		if (!(await this.extensionService.getExtension(extensionId.id))) {
			await new Promise<void>((c, e) => {
				const disposable = this.extensionService.onDidChangeExtensions(async () => {
					try {
						if (await this.extensionService.getExtension(extensionId.id)) {
							disposable.dispose();
							c();
						}
					} catch (error) {
						e(error);
					}
				});
			});
		}
	}

	// forget about all uris buffered more than 5 minutes ago
	private garbageCollect(): void {
		const now = new Date().getTime();
		const uriBuffer = new Map<string, { timestamp: number; uri: URI }[]>();

		this.uriBuffer.forEach((uris, extensionId) => {
			uris = uris.filter(({ timestamp }) => now - timestamp < FIVE_MINUTES);

			if (uris.length > 0) {
				uriBuffer.set(extensionId, uris);
			}
		});

		this.uriBuffer = uriBuffer;
	}

	private didUserTrustExtension(id: string): boolean {
		if (this.userTrustedExtensionsStorage.has(id)) {
			return true;
		}

		return this.getConfirmedTrustedExtensionIdsFromConfiguration().indexOf(id) > -1;
	}

	private getConfirmedTrustedExtensionIdsFromConfiguration(): Array<string> {
		const trustedExtensionIds = this.configurationService.getValue(USER_TRUSTED_EXTENSIONS_CONFIGURATION_KEY);

		if (!Array.isArray(trustedExtensionIds)) {
			return [];
		}

		return trustedExtensionIds;
	}

	dispose(): void {
		this.disposable.dispose();
		this.extensionHandlers.clear();
		this.uriBuffer.clear();
	}
}

registerSingleton(IExtensionUrlHandler, ExtensionUrlHandler, InstantiationType.Eager);

/**
 * This class handles URLs before `ExtensionUrlHandler` is instantiated.
 * More info: https://github.com/microsoft/vscode/issues/73101
 */
class ExtensionUrlBootstrapHandler implements IWorkbenchContribution, IURLHandler {

	private static _cache: [URI, IOpenURLOptions | undefined][] = [];
	private static disposable: IDisposable;

	static get cache(): [URI, IOpenURLOptions | undefined][] {
		ExtensionUrlBootstrapHandler.disposable.dispose();

		const result = ExtensionUrlBootstrapHandler._cache;
		ExtensionUrlBootstrapHandler._cache = [];
		return result;
	}

	constructor(@IURLService urlService: IURLService) {
		ExtensionUrlBootstrapHandler.disposable = urlService.registerHandler(this);
	}

	async handleURL(uri: URI, options?: IOpenURLOptions): Promise<boolean> {
		if (!isExtensionId(uri.authority)) {
			return false;
		}

		ExtensionUrlBootstrapHandler._cache.push([uri, options]);
		return true;
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(ExtensionUrlBootstrapHandler, LifecyclePhase.Ready);

class ManageAuthorizedExtensionURIsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.extensions.action.manageAuthorizedExtensionURIs',
			title: { value: localize('manage', "Manage Authorized Extension URIs..."), original: 'Manage Authorized Extension URIs...' },
			category: { value: localize('extensions', "Extensions"), original: 'Extensions' },
			menu: {
				id: MenuId.CommandPalette,
				when: IsWebContext.toNegated()
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const storageService = accessor.get(IStorageService);
		const quickInputService = accessor.get(IQuickInputService);
		const storage = new UserTrustedExtensionIdStorage(storageService);
		const items = storage.extensions.map(label => ({ label, picked: true } as IQuickPickItem));

		if (items.length === 0) {
			await quickInputService.pick([{ label: localize('no', 'There are currently no authorized extension URIs.') }]);
			return;
		}

		const result = await quickInputService.pick(items, { canPickMany: true });

		if (!result) {
			return;
		}

		storage.set(result.map(item => item.label));
	}
}

registerAction2(ManageAuthorizedExtensionURIsAction);
