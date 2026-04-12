/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ExtensionUrlBootstrapHandler_1;
import { localize, localize2 } from '../../../../nls.js';
import { combinedDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IURLService } from '../../../../platform/url/common/url.js';
import { IHostService } from '../../host/browser/host.js';
import { IExtensionService } from '../common/extensions.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
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
function isExtensionId(value) {
    return /^[a-z0-9][a-z0-9\-]*\.[a-z0-9][a-z0-9\-]*$/i.test(value);
}
class UserTrustedExtensionIdStorage {
    get extensions() {
        const userTrustedExtensionIdsJson = this.storageService.get(USER_TRUSTED_EXTENSIONS_STORAGE_KEY, 0 /* StorageScope.PROFILE */, '[]');
        try {
            return JSON.parse(userTrustedExtensionIdsJson);
        }
        catch {
            return [];
        }
    }
    constructor(storageService) {
        this.storageService = storageService;
    }
    has(id) {
        return this.extensions.indexOf(id) > -1;
    }
    add(id) {
        this.set([...this.extensions, id]);
    }
    set(ids) {
        this.storageService.store(USER_TRUSTED_EXTENSIONS_STORAGE_KEY, JSON.stringify(ids), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
    }
}
export const IExtensionUrlHandler = createDecorator('extensionUrlHandler');
export class ExtensionUrlHandlerOverrideRegistry {
    static { this.handlers = new Set(); }
    static registerHandler(handler) {
        this.handlers.add(handler);
        return toDisposable(() => this.handlers.delete(handler));
    }
    static getHandler(uri) {
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
let ExtensionUrlHandler = class ExtensionUrlHandler {
    constructor(urlService, extensionService, dialogService, commandService, hostService, storageService, configurationService, notificationService, productService) {
        this.extensionService = extensionService;
        this.dialogService = dialogService;
        this.commandService = commandService;
        this.hostService = hostService;
        this.storageService = storageService;
        this.configurationService = configurationService;
        this.notificationService = notificationService;
        this.productService = productService;
        this.extensionHandlers = new Map();
        this.uriBuffer = new Map();
        this.userTrustedExtensionsStorage = new UserTrustedExtensionIdStorage(storageService);
        const interval = disposableWindowInterval(mainWindow, () => this.garbageCollect(), THIRTY_SECONDS);
        const urlToHandleValue = this.storageService.get(URL_TO_HANDLE, 1 /* StorageScope.WORKSPACE */);
        if (urlToHandleValue) {
            this.storageService.remove(URL_TO_HANDLE, 1 /* StorageScope.WORKSPACE */);
            this.handleURL(URI.revive(JSON.parse(urlToHandleValue)), { trusted: true });
        }
        this.disposable = combinedDisposable(urlService.registerHandler(this), interval);
        const cache = ExtensionUrlBootstrapHandler.cache;
        setTimeout(() => cache.forEach(([uri, option]) => this.handleURL(uri, option)));
    }
    async handleURL(uri, options) {
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
        let extensionDisplayName;
        if (!initialHandler) {
            // The extension is not yet activated, so let's check if it is installed and enabled
            const extension = await this.extensionService.getExtension(extensionId);
            if (!extension) {
                await this.handleUnhandledURL(uri, extensionId, options);
                return true;
            }
            else {
                extensionDisplayName = extension.displayName ?? '';
            }
        }
        else {
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
        await this.extensionService.activateByEvent(`onUri:${ExtensionIdentifier.toKey(extensionId)}`, 1 /* ActivationKind.Immediate */);
        return true;
    }
    registerExtensionHandler(extensionId, handler) {
        this.extensionHandlers.set(ExtensionIdentifier.toKey(extensionId), handler);
        const uris = this.uriBuffer.get(ExtensionIdentifier.toKey(extensionId)) || [];
        for (const { uri } of uris) {
            this.handleURLByExtension(extensionId, handler, uri);
        }
        this.uriBuffer.delete(ExtensionIdentifier.toKey(extensionId));
    }
    unregisterExtensionHandler(extensionId) {
        this.extensionHandlers.delete(ExtensionIdentifier.toKey(extensionId));
    }
    async handleURLByExtension(extensionId, handler, uri, options) {
        return await handler.handleURL(uri, options);
    }
    async handleUnhandledURL(uri, extensionId, options) {
        try {
            await this.commandService.executeCommand('workbench.extensions.installExtension', extensionId, {
                justification: {
                    reason: `${localize('installDetail', "This extension wants to open a URI:")}\n${uri.toString()}`,
                    action: localize('openUri', "Open URI")
                },
                enable: true,
                installPreReleaseVersion: this.productService.quality !== 'stable'
            });
        }
        catch (error) {
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
            this.storageService.store(URL_TO_HANDLE, JSON.stringify(uri.toJSON()), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
            await this.hostService.reload();
        }
    }
    // forget about all uris buffered more than 5 minutes ago
    garbageCollect() {
        const now = new Date().getTime();
        const uriBuffer = new Map();
        this.uriBuffer.forEach((uris, extensionId) => {
            uris = uris.filter(({ timestamp }) => now - timestamp < FIVE_MINUTES);
            if (uris.length > 0) {
                uriBuffer.set(extensionId, uris);
            }
        });
        this.uriBuffer = uriBuffer;
    }
    didUserTrustExtension(id) {
        if (this.userTrustedExtensionsStorage.has(id)) {
            return true;
        }
        return this.getConfirmedTrustedExtensionIdsFromConfiguration().indexOf(id) > -1;
    }
    getConfirmedTrustedExtensionIdsFromConfiguration() {
        const trustedExtensionIds = this.configurationService.getValue(USER_TRUSTED_EXTENSIONS_CONFIGURATION_KEY);
        if (!Array.isArray(trustedExtensionIds)) {
            return [];
        }
        return trustedExtensionIds;
    }
    dispose() {
        this.disposable.dispose();
        this.extensionHandlers.clear();
        this.uriBuffer.clear();
    }
};
ExtensionUrlHandler = __decorate([
    __param(0, IURLService),
    __param(1, IExtensionService),
    __param(2, IDialogService),
    __param(3, ICommandService),
    __param(4, IHostService),
    __param(5, IStorageService),
    __param(6, IConfigurationService),
    __param(7, INotificationService),
    __param(8, IProductService)
], ExtensionUrlHandler);
registerSingleton(IExtensionUrlHandler, ExtensionUrlHandler, 0 /* InstantiationType.Eager */);
/**
 * This class handles URLs before `ExtensionUrlHandler` is instantiated.
 * More info: https://github.com/microsoft/vscode/issues/73101
 */
let ExtensionUrlBootstrapHandler = class ExtensionUrlBootstrapHandler {
    static { ExtensionUrlBootstrapHandler_1 = this; }
    static { this.ID = 'workbench.contrib.extensionUrlBootstrapHandler'; }
    static { this._cache = []; }
    static get cache() {
        ExtensionUrlBootstrapHandler_1.disposable.dispose();
        const result = ExtensionUrlBootstrapHandler_1._cache;
        ExtensionUrlBootstrapHandler_1._cache = [];
        return result;
    }
    constructor(urlService) {
        ExtensionUrlBootstrapHandler_1.disposable = urlService.registerHandler(this);
    }
    async handleURL(uri, options) {
        if (!isExtensionId(uri.authority)) {
            return false;
        }
        ExtensionUrlBootstrapHandler_1._cache.push([uri, options]);
        return true;
    }
};
ExtensionUrlBootstrapHandler = ExtensionUrlBootstrapHandler_1 = __decorate([
    __param(0, IURLService)
], ExtensionUrlBootstrapHandler);
registerWorkbenchContribution2(ExtensionUrlBootstrapHandler.ID, ExtensionUrlBootstrapHandler, 2 /* WorkbenchPhase.BlockRestore */);
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
    async run(accessor) {
        const storageService = accessor.get(IStorageService);
        const quickInputService = accessor.get(IQuickInputService);
        const storage = new UserTrustedExtensionIdStorage(storageService);
        const items = storage.extensions.map((label) => ({ label, picked: true }));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uVXJsSGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2Jyb3dzZXIvZXh0ZW5zaW9uVXJsSGFuZGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQWUsa0JBQWtCLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDckcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRixPQUFPLEVBQUUsZUFBZSxFQUFvQixNQUFNLDREQUE0RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUFlLFdBQVcsRUFBbUIsTUFBTSx3Q0FBd0MsQ0FBQztBQUNuRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDMUQsT0FBTyxFQUFrQixpQkFBaUIsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzVFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzNGLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQTBDLDhCQUE4QixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDMUgsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbEcsT0FBTyxFQUFF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