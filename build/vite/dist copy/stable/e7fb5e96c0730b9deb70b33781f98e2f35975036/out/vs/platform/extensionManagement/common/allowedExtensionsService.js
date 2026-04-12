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
import { Disposable } from '../../../base/common/lifecycle.js';
import * as nls from '../../../nls.js';
import { AllowedExtensionsConfigKey } from './extensionManagement.js';
import { IProductService } from '../../product/common/productService.js';
import { createCommandUri, MarkdownString } from '../../../base/common/htmlContent.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { isBoolean, isObject, isUndefined } from '../../../base/common/types.js';
import { Emitter } from '../../../base/common/event.js';
function isGalleryExtension(extension) {
    return extension.type === 'gallery';
}
function isIExtension(extension) {
    return extension.type === 1 /* ExtensionType.User */ || extension.type === 0 /* ExtensionType.System */;
}
const VersionRegex = /^(?<version>\d+\.\d+\.\d+(-.*)?)(@(?<platform>.+))?$/;
let AllowedExtensionsService = class AllowedExtensionsService extends Disposable {
    get allowedExtensionsConfigValue() {
        return this._allowedExtensionsConfigValue;
    }
    constructor(productService, configurationService) {
        super();
        this.configurationService = configurationService;
        this._onDidChangeAllowedExtensions = this._register(new Emitter());
        this.onDidChangeAllowedExtensionsConfigValue = this._onDidChangeAllowedExtensions.event;
        this.publisherOrgs = productService.extensionPublisherOrgs?.map(p => p.toLowerCase()) ?? [];
        this._allowedExtensionsConfigValue = this.getAllowedExtensionsValue();
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(AllowedExtensionsConfigKey)) {
                this._allowedExtensionsConfigValue = this.getAllowedExtensionsValue();
                this._onDidChangeAllowedExtensions.fire();
            }
        }));
    }
    getAllowedExtensionsValue() {
        const value = this.configurationService.getValue(AllowedExtensionsConfigKey);
        if (!isObject(value) || Array.isArray(value)) {
            return undefined;
        }
        const entries = Object.entries(value).map(([key, value]) => [key.toLowerCase(), value]);
        if (entries.length === 1 && entries[0][0] === '*' && entries[0][1] === true) {
            return undefined;
        }
        return Object.fromEntries(entries);
    }
    isAllowed(extension) {
        if (!this._allowedExtensionsConfigValue) {
            return true;
        }
        let id, version, targetPlatform, prerelease, publisher, publisherDisplayName;
        if (isGalleryExtension(extension)) {
            id = extension.identifier.id.toLowerCase();
            version = extension.version;
            prerelease = extension.properties.isPreReleaseVersion;
            publisher = extension.publisher.toLowerCase();
            publisherDisplayName = extension.publisherDisplayName.toLowerCase();
            targetPlatform = extension.properties.targetPlatform;
        }
        else if (isIExtension(extension)) {
            id = extension.identifier.id.toLowerCase();
            version = extension.manifest.version;
            prerelease = extension.preRelease;
            publisher = extension.manifest.publisher.toLowerCase();
            publisherDisplayName = extension.publisherDisplayName?.toLowerCase();
            targetPlatform = extension.targetPlatform;
        }
        else {
            id = extension.id.toLowerCase();
            version = extension.version ?? '*';
            targetPlatform = extension.targetPlatform ?? "universal" /* TargetPlatform.UNIVERSAL */;
            prerelease = extension.prerelease ?? false;
            publisher = extension.id.substring(0, extension.id.indexOf('.')).toLowerCase();
            publisherDisplayName = extension.publisherDisplayName?.toLowerCase();
        }
        const settingsCommandLink = createCommandUri('workbench.action.openSettings', { query: `@id:${AllowedExtensionsConfigKey}` }).toString();
        const extensionValue = this._allowedExtensionsConfigValue[id];
        const extensionReason = new MarkdownString(nls.localize('specific extension not allowed', "it is not in the [allowed list]({0})", settingsCommandLink));
        if (!isUndefined(extensionValue)) {
            if (isBoolean(extensionValue)) {
                return extensionValue ? true : extensionReason;
            }
            if (extensionValue === 'stable' && prerelease) {
                return new MarkdownString(nls.localize('extension prerelease not allowed', "the pre-release versions of this extension are not in the [allowed list]({0})", settingsCommandLink));
            }
            if (version !== '*' && Array.isArray(extensionValue) && !extensionValue.some(v => {
                const match = VersionRegex.exec(v);
                if (match && match.groups) {
                    const { platform: p, version: v } = match.groups;
                    if (v !== version) {
                        return false;
                    }
                    if (targetPlatform !== "universal" /* TargetPlatform.UNIVERSAL */ && p && targetPlatform !== p) {
                        return false;
                    }
                    return true;
                }
                return false;
            })) {
                return new MarkdownString(nls.localize('specific version of extension not allowed', "the version {0} of this extension is not in the [allowed list]({1})", version, settingsCommandLink));
            }
            return true;
        }
        const publisherKey = publisherDisplayName && this.publisherOrgs.includes(publisherDisplayName) ? publisherDisplayName : publisher;
        const publisherValue = this._allowedExtensionsConfigValue[publisherKey];
        if (!isUndefined(publisherValue)) {
            if (isBoolean(publisherValue)) {
                return publisherValue ? true : new MarkdownString(nls.localize('publisher not allowed', "the extensions from this publisher are not in the [allowed list]({1})", publisherKey, settingsCommandLink));
            }
            if (publisherValue === 'stable' && prerelease) {
                return new MarkdownString(nls.localize('prerelease versions from this publisher not allowed', "the pre-release versions from this publisher are not in the [allowed list]({1})", publisherKey, settingsCommandLink));
            }
            return true;
        }
        if (this._allowedExtensionsConfigValue['*'] === true) {
            return true;
        }
        return extensionReason;
    }
};
AllowedExtensionsService = __decorate([
    __param(0, IProductService),
    __param(1, IConfigurationService)
], AllowedExtensionsService);
export { AllowedExtensionsService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEtBQUssR0FBRyxNQUFNLGlCQUFpQixDQUFDO0FBQ3ZDLE9BQU8sRUFBcUIsMEJBQTBCLEVBQStELE1BQU0sMEJBQTBCLENBQUM7QUFFdEosT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBbUIsY0FBYyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDeEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEYsT0FBTyxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDakYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRXhELFNBQVMsa0JBQWtCLENBQUMsU0FBa0I7SUFDN0MsT0FBUSxTQUErQixDQUFDLElBQUksS0FBSyxTQUFTLENBQUM7QUFDNUQsQ0FBQztBQUVELFNBQVMsWUFBWSxDQUFDLFNBQWtCO0lBQ3ZDLE9BQVEsU0FBd0IsQ0FBQyxJQUFJLCtCQUF1QixJQUFLLFNBQXdCLENBQUMsSUFBSSxpQ0FBeUIsQ0FBQztBQUN6SCxDQUFDO0FBR0QsTUFBTSxZQUFZLEdBQUcsc0RBQXNELENBQUM7QUFFckUsSUFBTSx3QkFBd0IsR0FBOUIsTUFBTSx3QkFBeUIsU0FBUSxVQUFVO0lBT3ZELElBQUksNEJBQTRCO1FBQy9CLE9B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