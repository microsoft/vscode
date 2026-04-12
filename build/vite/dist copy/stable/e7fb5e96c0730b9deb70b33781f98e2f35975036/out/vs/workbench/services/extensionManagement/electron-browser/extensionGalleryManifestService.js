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
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IExtensionGalleryManifestService, ExtensionGalleryServiceUrlConfigKey } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { ExtensionGalleryManifestService } from '../../../../platform/extensionManagement/common/extensionGalleryManifestService.js';
import { resolveMarketplaceHeaders } from '../../../../platform/externalServices/common/marketplace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asJson, IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IHostService } from '../../host/browser/host.js';
let WorkbenchExtensionGalleryManifestService = class WorkbenchExtensionGalleryManifestService extends ExtensionGalleryManifestService {
    get extensionGalleryManifestStatus() { return this.currentStatus; }
    constructor(productService, environmentService, fileService, telemetryService, storageService, remoteAgentService, sharedProcessService, configurationService, requestService, defaultAccountService, logService, dialogService, hostService) {
        super(productService);
        this.telemetryService = telemetryService;
        this.configurationService = configurationService;
        this.requestService = requestService;
        this.defaultAccountService = defaultAccountService;
        this.logService = logService;
        this.dialogService = dialogService;
        this.hostService = hostService;
        this.extensionGalleryManifest = null;
        this._onDidChangeExtensionGalleryManifest = this._register(new Emitter());
        this.onDidChangeExtensionGalleryManifest = this._onDidChangeExtensionGalleryManifest.event;
        this.currentStatus = "unavailable" /* ExtensionGalleryManifestStatus.Unavailable */;
        this._onDidChangeExtensionGalleryManifestStatus = this._register(new Emitter());
        this.onDidChangeExtensionGalleryManifestStatus = this._onDidChangeExtensionGalleryManifestStatus.event;
        this.commonHeadersPromise = resolveMarketplaceHeaders(productService.version, productService, environmentService, configurationService, fileService, storageService, telemetryService);
        const channels = [sharedProcessService.getChannel('extensionGalleryManifest')];
        const remoteConnection = remoteAgentService.getConnection();
        if (remoteConnection) {
            channels.push(remoteConnection.getChannel('extensionGalleryManifest'));
        }
        this.getExtensionGalleryManifest().then(manifest => {
            channels.forEach(channel => channel.call('setExtensionGalleryManifest', [manifest]));
        });
    }
    async getExtensionGalleryManifest() {
        if (!this.extensionGalleryManifestPromise) {
            this.extensionGalleryManifestPromise = this.doGetExtensionGalleryManifest();
        }
        await this.extensionGalleryManifestPromise;
        return this.extensionGalleryManifest;
    }
    async doGetExtensionGalleryManifest() {
        const defaultServiceUrl = this.productService.extensionsGallery?.serviceUrl;
        if (!defaultServiceUrl) {
            return;
        }
        const configuredServiceUrl = this.configurationService.getValue(ExtensionGalleryServiceUrlConfigKey);
        if (configuredServiceUrl) {
            await this.handleDefaultAccountAccess(configuredServiceUrl);
            this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this.handleDefaultAccountAccess(configuredServiceUrl)));
        }
        else {
            const defaultExtensionGalleryManifest = await super.getExtensionGalleryManifest();
            this.update(defaultExtensionGalleryManifest);
        }
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (!e.affectsConfiguration(ExtensionGalleryServiceUrlConfigKey)) {
                return;
            }
            this.requestRestart();
        }));
    }
    async handleDefaultAccountAccess(configuredServiceUrl) {
        const account = await this.defaultAccountService.getDefaultAccount();
        if (!account) {
            this.logService.debug('[Marketplace] Enterprise marketplace configured but user not signed in');
            this.update(null, "requiresSignIn" /* ExtensionGalleryManifestStatus.RequiresSignIn */);
        }
        else if (!this.checkAccess(account)) {
            this.logService.debug('[Marketplace] User signed in but lacks access to enterprise marketplace');
            this.update(null, "accessDenied" /* ExtensionGalleryManifestStatus.AccessDenied */);
        }
        else if (this.currentStatus !== "available" /* ExtensionGalleryManifestStatus.Available */) {
            try {
                const manifest = await this.getExtensionGalleryManifestFromServiceUrl(configuredServiceUrl);
                this.update(manifest);
                this.telemetryService.publicLog2('galleryservice:custom:marketplace');
            }
            catch (error) {
                this.logService.error('[Marketplace] Error retrieving enterprise gallery manifest', error);
                this.update(null, "accessDenied" /* ExtensionGalleryManifestStatus.AccessDenied */);
            }
        }
    }
    update(manifest, status) {
        if (this.extensionGalleryManifest !== manifest) {
            this.extensionGalleryManifest = manifest;
            this._onDidChangeExtensionGalleryManifest.fire(manifest);
        }
        this.updateStatus(status ?? (this.extensionGalleryManifest ? "available" /* ExtensionGalleryManifestStatus.Available */ : "unavailable" /* ExtensionGalleryManifestStatus.Unavailable */));
    }
    updateStatus(status) {
        if (this.currentStatus !== status) {
            this.currentStatus = status;
            this._onDidChangeExtensionGalleryManifestStatus.fire(status);
        }
    }
    checkAccess(account) {
        this.logService.debug('[Marketplace] Checking Account SKU access for configured gallery', account.entitlementsData?.access_type_sku);
        if (account.entitlementsData?.access_type_sku && this.productService.extensionsGallery?.accessSKUs?.includes(account.entitlementsData.access_type_sku)) {
            this.logService.debug('[Marketplace] Account has access to configured gallery');
            return true;
        }
        this.logService.debug('[Marketplace] Checking enterprise account access for configured gallery', account.enterprise);
        return account.enterprise;
    }
    async requestRestart() {
        const confirmation = await this.dialogService.confirm({
            message: localize('extensionGalleryManifestService.accountChange', "{0} is now configured to a different Marketplace. Please restart to apply the changes.", this.productService.nameLong),
            primaryButton: localize({ key: 'restart', comment: ['&& denotes a mnemonic'] }, "&&Restart")
        });
        if (confirmation.confirmed) {
            return this.hostService.restart();
        }
    }
    async getExtensionGalleryManifestFromServiceUrl(url) {
        const commonHeaders = await this.commonHeadersPromise;
        const headers = {
            ...commonHeaders,
            'Content-Type': 'application/json',
            'Accept-Encoding': 'gzip',
        };
        try {
            const context = await this.requestService.request({
                type: 'GET',
                url,
                headers,
                callSite: 'extensionGalleryManifestService.fetchManifest'
            }, CancellationToken.None);
            const extensionGalleryManifest = await asJson(context);
            if (!extensionGalleryManifest) {
                throw new Error('Unable to retrieve extension gallery manifest.');
            }
            return extensionGalleryManifest;
        }
        catch (error) {
            this.logService.error('[Marketplace] Error retrieving extension gallery manifest', error);
            throw error;
        }
    }
};
WorkbenchExtensionGalleryManifestService = __decorate([
    __param(0, IProductService),
    __param(1, IEnvironmentService),
    __param(2, IFileService),
    __param(3, ITelemetryService),
    __param(4, IStorageService),
    __param(5, IRemoteAgentService),
    __param(6, ISharedProcessService),
    __param(7, IConfigurationService),
    __param(8, IRequestService),
    __param(9, IDefaultAccountService),
    __param(10, ILogService),
    __param(11, IDialogService),
    __param(12, IHostService)
], WorkbenchExtensionGalleryManifestService);
export { WorkbenchExtensionGalleryManifestService };
registerSingleton(IExtensionGalleryManifestService, WorkbenchExtensionGalleryManifestService, 0 /* InstantiationType.Eager */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2VsZWN0cm9uLWJyb3dzZXIvZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFM0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBNkIsbUNBQW1DLEVBQWtDLE1BQU0sNkVBQTZFLENBQUM7QUFDL04sT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sb0ZBQW9GLENBQUM7QUFDckksT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDeEcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM5RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDekYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFHbkQsSUFBTSx3Q0FBd0MsR0FBOUMsTUFBTSx3Q0FBeUMsU0FBUSwrQkFBK0I7SUFTNUYsSUFBYSw4QkFBOEIsS0FBcUMsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztJQUk1RyxZQUNrQixjQUErQixFQUMzQixrQkFBdUMsRUFDOUMsV0FBeUIsRUFDcEIsZ0JBQW9ELEVBQ3RELGNBQStCLEVBQzNCLGtCQUF1QyxFQUNyQyxvQkFBMkMsRUFDM0Msb0JBQTRELEVBQ2xFLGNBQWdELEVBQ3pDLHFCQUE4RCxFQUN6RSxVQUF3QyxFQUNyQyxhQUE4QyxFQUNoRCxXQUEwQztRQUV4RCxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7UUFYYyxxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQW1CO1FBSS9CLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFDakQsbUJBQWMsR0FBZCxjQUFjLENBQWlCO1FBQ3hCLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBd0I7UUFDeEQsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUNwQixrQkFBYSxHQUFiLGFBQWEsQ0FBZ0I7UUFDL0IsZ0JBQVcsR0FBWCxXQUFXLENBQWM7UUF2QmpELDZCQUF3QixHQUFxQyxJQUFJLENBQUM7UUFFbEUseUNBQW9DLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBb0MsQ0FBQyxDQUFDO1FBQzdGLHdDQUFtQyxHQUFHLElBQUksQ0FBQyxvQ0FBb0MsQ0FBQyxLQUFLLENBQUM7UUFFaEcsa0JBQWEsa0VBQThFO1FBRTNGLCtDQUEwQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQWtDLENBQUMsQ0FBQztRQUNqRyw4Q0FBeUMsR0FBRyxJQUFJLENBQUMsMENBQTBDLENBQUMsS0FBSyxDQUFDO1FBa0JuSCxJQUFJLENBQUMsb0JBQW9CLEdBQUcseUJBQXlCLENBQ3BELGNBQWMsQ0FBQyxPQUFPLEVBQ3RCLGNBQWMsRUFDZCxrQkFBa0IsRUFDbEIsb0JBQW9CLEVBQ3BCLFdBQVcsRUFDWCxjQUFjLEVBQ2QsZ0JBQWdCLENBQUMsQ0FBQztRQUVuQixNQUFNLFFBQVEsR0FBRyxDQUFDLG9CQUFvQixDQUFDLFVBQVUsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLENBQUM7UUFDL0UsTUFBTSxnQkFBZ0IsR0FBRyxrQkFBa0IsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUM1RCxJQUFJLGdCQUFnQixFQUFFLENBQUM7WUFDdEIsUUFBUSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxDQUFDO1FBQ3hFLENBQUM7UUFDRCxJQUFJLENBQUMsMkJBQTJCLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUU7WUFDbEQsUUFBUSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsNkJBQTZCLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdEYsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBR1EsS0FBSyxDQUFDLDJCQUEyQjtRQUN6QyxJQUFJLENBQUMsSUFBSSxDQUFDLCtCQUErQixFQUFFLENBQUM7WUFDM0MsSUFBSSxDQUFDLCtCQUErQixHQUFHLElBQUksQ0FBQyw2QkFBNkIsRUFBRSxDQUFDO1FBQzdFLENBQUM7UUFDRCxNQUFNLElBQUksQ0FBQywrQkFBK0IsQ0FBQztRQUMzQyxPQUFPLElBQUksQ0FBQyx3QkFBd0IsQ0FBQztJQUN0QyxDQUFDO0lBRU8sS0FBSyxDQUFDLDZCQUE2QjtRQUMxQyxNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsaUJBQWlCLEVBQUUsVUFBVSxDQUFDO1FBQzVFLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3hCLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFTLG1DQUFtQyxDQUFDLENBQUM7UUFDN0csSUFBSSxvQkFBb0IsRUFBRSxDQUFDO1lBQzFCLE1BQU0sSUFBSSxDQUFDLDBCQUEwQixDQUFDLG9CQUFvQixDQUFDLENBQUM7WUFDNUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMseUJBQXlCLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ25JLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSwrQkFBK0IsR0FBRyxNQUFNLEtBQUssQ0FBQywyQkFBMkIsRUFBRSxDQUFDO1lBQ2xGLElBQUksQ0FBQyxNQUFNLENBQUMsK0JBQStCLENBQUMsQ0FBQztRQUM5QyxDQUFDO1FBRUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDckUsSUFBSSxDQUFDLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxtQ0FBbUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ2xFLE9BQU87WUFDUixDQUFDO1lBQ0QsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3ZCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRU8sS0FBSyxDQUFDLDBCQUEwQixDQUFDLG9CQUE0QjtRQUNwRSxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBRXJFLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNkLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLHdFQUF3RSxDQUFDLENBQUM7WUFDaEcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLHVFQUFnRCxDQUFDO1FBQ2xFLENBQUM7YUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ3ZDLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLHlFQUF5RSxDQUFDLENBQUM7WUFDakcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLG1FQUE4QyxDQUFDO1FBQ2hFLENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxhQUFhLCtEQUE2QyxFQUFFLENBQUM7WUFDNUUsSUFBSSxDQUFDO2dCQUNKLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLHlDQUF5QyxDQUFDLG9CQUFvQixDQUFDLENBQUM7Z0JBQzVGLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ3RCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBSzVCLG1DQUFtQyxDQUFDLENBQUM7WUFDMUMsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2hCLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLDREQUE0RCxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUMzRixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksbUVBQThDLENBQUM7WUFDaEUsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRU8sTUFBTSxDQUFDLFFBQTBDLEVBQUUsTUFBdUM7UUFDakcsSUFBSSxJQUFJLENBQUMsd0JBQXdCLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDaEQsSUFBSSxDQUFDLHdCQUF3QixHQUFHLFFBQVEsQ0FBQztZQUN6QyxJQUFJLENBQUMsb0NBQW9DLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzFELENBQUM7UUFDRCxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLDREQUEwQyxDQUFDLCtEQUEyQyxDQUFDLENBQUMsQ0FBQztJQUN0SixDQUFDO0lBRU8sWUFBWSxDQUFDLE1BQXNDO1FBQzFELElBQUksSUFBSSxDQUFDLGFBQWEsS0FBSyxNQUFNLEVBQUUsQ0FBQztZQUNuQyxJQUFJLENBQUMsYUFBYSxHQUFHLE1BQU0sQ0FBQztZQUM1QixJQUFJLENBQUMsMENBQTBDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzlELENBQUM7SUFDRixDQUFDO0lBRU8sV0FBVyxDQUFDLE9BQXdCO1FBQzNDLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLGtFQUFrRSxFQUFFLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUNySSxJQUFJLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxlQUFlLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxpQkFBaUIsRUFBRSxVQUFVLEVBQUUsUUFBUSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDO1lBQ3hKLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLHdEQUF3RCxDQUFDLENBQUM7WUFDaEYsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMseUVBQXlFLEVBQUUsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3JILE9BQU8sT0FBTyxDQUFDLFVBQVUsQ0FBQztJQUMzQixDQUFDO0lBRU8sS0FBSyxDQUFDLGNBQWM7UUFDM0IsTUFBTSxZQUFZLEdBQUcsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQztZQUNyRCxPQUFPLEVBQUUsUUFBUSxDQUFDLCtDQUErQyxFQUFFLHdGQUF3RixFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDO1lBQzFMLGFBQWEsRUFBRSxRQUFRLENBQUMsRUFBRSxHQUFHLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxXQUFXLENBQUM7U0FDNUYsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxZQUFZLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDNUIsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25DLENBQUM7SUFDRixDQUFDO0lBRU8sS0FBSyxDQUFDLHlDQUF5QyxDQUFDLEdBQVc7UUFDbEUsTUFBTSxhQUFhLEdBQUcsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUM7UUFDdEQsTUFBTSxPQUFPLEdBQUc7WUFDZixHQUFHLGFBQWE7WUFDaEIsY0FBYyxFQUFFLGtCQUFrQjtZQUNsQyxpQkFBaUIsRUFBRSxNQUFNO1NBQ3pCLENBQUM7UUFFRixJQUFJLENBQUM7WUFDSixNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDO2dCQUNqRCxJQUFJLEVBQUUsS0FBSztnQkFDWCxHQUFHO2dCQUNILE9BQU87Z0JBQ1AsUUFBUSxFQUFFLCtDQUErQzthQUN6RCxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBRTNCLE1BQU0sd0JBQXdCLEdBQUcsTUFBTSxNQUFNLENBQTRCLE9BQU8sQ0FBQyxDQUFDO1lBRWxGLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO2dCQUMvQixNQUFNLElBQUksS0FBSyxDQUFDLGdEQUFnRCxDQUFDLENBQUM7WUFDbkUsQ0FBQztZQUVELE9BQU8sd0JBQXdCLENBQUM7UUFDakMsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDaEIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsMkRBQTJELEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDMUYsTUFBTSxLQUFLLENBQUM7UUFDYixDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUE7QUF6S1ksd0NBQXdDO0lBY2xELFdBQUEsZUFBZSxDQUFBO0lBQ2YsV0FBQSxtQkFBbUIsQ0FBQTtJQUNuQixXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEsaUJBQWlCLENBQUE7SUFDakIsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLG1CQUFtQixDQUFBO0lBQ25CLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEsc0JBQXNCLENBQUE7SUFDdEIsWUFBQSxXQUFXLENBQUE7SUFDWCxZQUFBLGNBQWMsQ0FBQTtJQUNkLFlBQUEsWUFBWSxDQUFBO0dBMUJGLHdDQUF3QyxDQXlLcEQ7O0FBRUQsaUJBQWlCLENBQUMsZ0NBQWdDLEVBQUUsd0NBQXdDLGtDQUEwQixDQUFDIn0=