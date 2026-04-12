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
import { LANGUAGE_DEFAULT } from '../../../base/common/platform.js';
import { format2 } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { MainContext } from './extHost.protocol.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { IExtHostRpcService } from './extHostRpcService.js';
let ExtHostLocalizationService = class ExtHostLocalizationService {
    constructor(initData, rpc, logService) {
        this.logService = logService;
        this.bundleCache = new Map();
        this._proxy = rpc.getProxy(MainContext.MainThreadLocalization);
        this.currentLanguage = initData.environment.appLanguage;
        this.isDefaultLanguage = this.currentLanguage === LANGUAGE_DEFAULT;
    }
    getMessage(extensionId, details) {
        const { message, args, comment } = details;
        if (this.isDefaultLanguage) {
            return format2(message, (args ?? {}));
        }
        let key = message;
        if (comment && comment.length > 0) {
            key += `/${Array.isArray(comment) ? comment.join('') : comment}`;
        }
        const str = this.bundleCache.get(extensionId)?.contents[key];
        if (!str) {
            this.logService.warn(`Using default string since no string found in i18n bundle that has the key: ${key}`);
        }
        return format2(str ?? message, (args ?? {}));
    }
    getBundle(extensionId) {
        return this.bundleCache.get(extensionId)?.contents;
    }
    getBundleUri(extensionId) {
        return this.bundleCache.get(extensionId)?.uri;
    }
    async initializeLocalizedMessages(extension) {
        if (this.isDefaultLanguage
            || (!extension.l10n && !extension.isBuiltin)) {
            return;
        }
        if (this.bundleCache.has(extension.identifier.value)) {
            return;
        }
        let contents;
        const bundleUri = await this.getBundleLocation(extension);
        if (!bundleUri) {
            this.logService.error(`No bundle location found for extension ${extension.identifier.value}`);
            return;
        }
        try {
            const response = await this._proxy.$fetchBundleContents(bundleUri);
            const result = JSON.parse(response);
            // 'contents.bundle' is a well-known key in the language pack json file that contains the _code_ translations for the extension
            contents = extension.isBuiltin ? result.contents?.bundle : result;
        }
        catch (e) {
            this.logService.error(`Failed to load translations for ${extension.identifier.value} from ${bundleUri}: ${e.message}`);
            return;
        }
        if (contents) {
            this.bundleCache.set(extension.identifier.value, {
                contents,
                uri: bundleUri
            });
        }
    }
    async getBundleLocation(extension) {
        if (extension.isBuiltin) {
            const uri = await this._proxy.$fetchBuiltInBundleUri(extension.identifier.value, this.currentLanguage);
            return URI.revive(uri);
        }
        return extension.l10n
            ? URI.joinPath(extension.extensionLocation, extension.l10n, `bundle.l10n.${this.currentLanguage}.json`)
            : undefined;
    }
};
ExtHostLocalizationService = __decorate([
    __param(0, IExtHostInitDataService),
    __param(1, IExtHostRpcService),
    __param(2, ILogService)
], ExtHostLocalizationService);
export { ExtHostLocalizationService };
export const IExtHostLocalizationService = createDecorator('IExtHostLocalizationService');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdExvY2FsaXphdGlvblNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0TG9jYWxpemF0aW9uU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBRWxELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbEUsT0FBTyxFQUE0QyxXQUFXLEVBQStCLE1BQU0sdUJBQXVCLENBQUM7QUFDM0gsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFFckQsSUFBTSwwQkFBMEIsR0FBaEMsTUFBTSwwQkFBMEI7SUFTdEMsWUFDMEIsUUFBaUMsRUFDdEMsR0FBdUIsRUFDOUIsVUFBd0M7UUFBdkIsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUxyQyxnQkFBVyxHQUFtRSxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBT3hHLElBQUksQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUMvRCxJQUFJLENBQUMsZUFBZSxHQUFHLFFBQVEsQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDO1FBQ3hELElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUMsZUFBZSxLQUFLLGdCQUFnQixD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