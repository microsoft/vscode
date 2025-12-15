/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { IDisposable, combinedDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { createDecorator, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IURLHandler, IURLService, IOpenURLOptions } from '../../../../platform/url/common/url.js';
import { IHostService } from '../../host/browser/host.js';
import { ActivationKind, IExtensionService } from '../common/extensions.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { disposableWindowInterval } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { equalsIgnoreCase } from '../../../../base/common/strings.js';

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

export interface IExtensionContributedURLHandler extends IURLHandler {
	extensionDisplayName: string;
}

export interface IExtensionUrlHandler {
	readonly _serviceBrand: undefined;
	registerExtensionHandler(extensionId: ExtensionIdentifier, handler: IExtensionContributedURLHandler): void;
	unregisterExtensionHandler(extensionId: ExtensionIdentifier): void;
}

export interface IExtensionUrlHandlerOverride {
	canHandleURL(uri: URI): boolean;
	handleURL(uri: URI): Promise<boolean>;
}

export class ExtensionUrlHandlerOverrideRegistry {

	private static readonly handlers = new Set<IExtensionUrlHandlerOverride>();

	static registerHandler(handler: IExtensionUrlHandlerOverride): IDisposable {
		this.handlers.add(handler);

		return toDisposable(() => this.handlers.delete(handler));
	}

	static getHandler(uri: URI): IExtensionUrlHandlerOverride | undefined {
		for (const handler of this.handlers) {
			if (handler.canHandleURL(uri)) {
				return handler;
			}
		}

		return undefined;
	}
}

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

	private extensionHandlers = new Map<string, IExtensionContributedURLHandler>();
	private uriBuffer = new Map<string, { timestamp: number; uri: URI }[]>();
	private userTrustedExtensionsStorage: UserTrustedExtensionIdStorage;
	private disposable: IDisposable;

	constructor(
		@IURLService urlService: IURLService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IDialogService private readonly dialogService: IDialogService,
		@ICommandService private readonly commandService: ICommandService,
		@IHostService private readonly hostService: IHostService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IProductService private readonly productService: IProductService,
	) {
		this.userTrustedExtensionsStorage = new UserTrustedExtensionIdStorage(storageService);

		const interval = disposableWindowInterval(mainWindow, () => this.garbageCollect(), THIRTY_SECONDS);
		const urlToHandleValue = this.storageService.get(URL_TO_HANDLE, StorageScope.WORKSPACE);
		if (urlToHandleValue) {
			this.storageService.remove(URL_TO_HANDLE, StorageScope.WORKSPACE);
			this.handleURL(URI.revive(JSON.parse(urlToHandleValue)), { trusted: true });
		}

		this.disposable = combinedDisposable(
			urlService.registerHandler(this),
			interval
		);

		const cache = ExtensionUrlBootstrapHandler.cache;
		setTimeout(() => cache.forEach(([uri, option]) => this.handleURL(uri, option)));
	}

	async handleURL(uri: URI, options?: IOpenURLOptions): Promise<boolean> {
		if (!isExtensionId(uri.authority)) {
			return false;
		}

		const overrideHandler = ExtensionUrlHandlerOverrideRegistry.getHandler(uri);
		if (overrideHandler) {
			const handled = await overrideHandler.handleURL(uri);
			if (handled) {
				return handled;
			}
		}

		const extensionId = uri.authority;

		const initialHandler = this.extensionHandlers.get(ExtensionIdentifier.toKey(extensionId));
		let extensionDisplayName: string;

		if (!initialHandler) {
			// The extension is not yet activated, so let's check if it is installed and enabled
			const extension = await this.extensionService.getExtension(extensionId);
			if (!extension) {
				await this.handleUnhandledURL(uri, extensionId, options);
				return true;
			} else {
				extensionDisplayName = extension.displayName ?? '';
			}
		} else {
			extensionDisplayName = initialHandler.extensionDisplayName;
		}

		const trusted = options?.trusted
			|| this.productService.trustedExtensionProtocolHandlers?.some(value => equalsIgnoreCase(value, extensionId))
			|| this.didUserTrustExtension(ExtensionIdentifier.toKey(extensionId));

		if (!trusted) {
			const uriString = uri.toString(false);
			let uriLabel = uriString;

			if (uriLabel.length > 40) {
				uriLabel = `${uriLabel.substring(0, 30)}...${uriLabel.substring(uriLabel.length - 5)}`;
			}

			const result = await this.dialogService.confirm({
				message: localize('confirmUrl', "Allow '{0}' extension to open this URI?", extensionDisplayName),
				checkbox: {
					label: localize('rememberConfirmUrl', "Do not ask me again for this extension"),
				},
				primaryButton: localize({ key: 'open', comment: ['&& denotes a mnemonic'] }, "&&Open"),
				custom: {
					markdownDetails: [{
						markdown: new MarkdownString(`<div title="${uriString}" aria-label='${uriString}'>${uriLabel}</div>`, { supportHtml: true }),
					}]
				}
			});

			if (!result.confirmed) {
				return true;
			}

			if (result.checkboxChecked) {
				this.userTrustedExtensionsStorage.add(ExtensionIdentifier.toKey(extensionId));
			}
		}

		const handler = this.extensionHandlers.get(ExtensionIdentifier.toKey(extensionId));

		if (handler) {
			if (!initialHandler) {
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

		// activate the extension using ActivationKind.Immediate because URI handling might be part
		// of resolving authorities (via authentication extensions)
		await this.extensionService.activateByEvent(`onUri:${ExtensionIdentifier.toKey(extensionId)}`, ActivationKind.Immediate);
		return true;
	}

	registerExtensionHandler(extensionId: ExtensionIdentifier, handler: IExtensionContributedURLHandler): void {
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
		return await handler.handleURL(uri, options);
	}

	private async handleUnhandledURL(uri: URI, extensionId: string, options?: IOpenURLOptions): Promise<void> {
		try {
			await this.commandService.executeCommand('workbench.extensions.installExtension', extensionId, {
				justification: {
					reason: `${localize('installDetail', "This extension wants to open a URI:")}\n${uri.toString()}`,
					action: localize('openUri', "Open URI")
				},
				enable: true,
				installPreReleaseVersion: this.productService.quality !== 'stable'
			});
		} catch (error) {
			if (!isCancellationError(error)) {
				this.notificationService.error(error);
			}
			return;
		}

		const extension = await this.extensionService.getExtension(extensionId);

		if (extension) {
			await this.handleURL(uri, { ...options, trusted: true });
		}

		/* Extension cannot be added and require window reload */
		else {
			const result = await this.dialogService.confirm({
				message: localize('reloadAndHandle', "Extension '{0}' is not loaded. Would you like to reload the window to load the extension and open the URL?", extensionId),
				primaryButton: localize({ key: 'reloadAndOpen', comment: ['&& denotes a mnemonic'] }, "&&Reload Window and Open")
			});

			if (!result.confirmed) {
				return;
			}

			this.storageService.store(URL_TO_HANDLE, JSON.stringify(uri.toJSON()), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			await this.hostService.reload();
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

	static readonly ID = 'workbench.contrib.extensionUrlBootstrapHandler';

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

registerWorkbenchContribution2(ExtensionUrlBootstrapHandler.ID, ExtensionUrlBootstrapHandler, WorkbenchPhase.BlockRestore /* registration only */);

class ManageAuthorizedExtensionURIsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.extensions.action.manageAuthorizedExtensionURIs',
			title: localize2('manage', 'Manage Authorized Extension URIs...'),
			category: localize2('extensions', 'Extensions'),
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
		const items = storage.extensions.map((label): IQuickPickItem => ({ label, picked: true }));

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
