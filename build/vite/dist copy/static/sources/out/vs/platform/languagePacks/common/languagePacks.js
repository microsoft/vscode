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
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { language } from '../../../base/common/platform.js';
import { localize } from '../../../nls.js';
import { IExtensionGalleryService } from '../../extensionManagement/common/extensionManagement.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
export function getLocale(extension) {
    return extension.tags.find(t => t.startsWith('lp-'))?.split('lp-')[1];
}
export const ILanguagePackService = createDecorator('languagePackService');
let LanguagePackBaseService = class LanguagePackBaseService extends Disposable {
    constructor(extensionGalleryService) {
        super();
        this.extensionGalleryService = extensionGalleryService;
    }
    async getAvailableLanguages() {
        const timeout = new CancellationTokenSource();
        setTimeout(() => timeout.cancel(), 1000);
        let result;
        try {
            result = await this.extensionGalleryService.query({
                text: 'category:"language packs"',
                pageSize: 20
            }, timeout.token);
        }
        catch (_) {
            // This method is best effort. So, we ignore any errors.
            return [];
        }
        const languagePackExtensions = result.firstPage.filter(e => e.properties.localizedLanguages?.length && e.tags.some(t => t.startsWith('lp-')));
        const allFromMarketplace = languagePackExtensions.map(lp => {
            const languageName = lp.properties.localizedLanguages?.[0];
            const locale = getLocale(lp);
            const baseQuickPick = this.createQuickPickItem(locale, languageName, lp);
            return {
                ...baseQuickPick,
                extensionId: lp.identifier.id,
                galleryExtension: lp
            };
        });
        allFromMarketplace.push(this.createQuickPickItem('en', 'English'));
        return allFromMarketplace;
    }
    createQuickPickItem(locale, languageName, languagePack) {
        const label = languageName ?? locale;
        let description;
        if (label !== locale) {
            description = `(${locale})`;
        }
        if (locale.toLowerCase() === language.toLowerCase()) {
            description ??= '';
            description += localize('currentDisplayLanguage', " (Current)");
        }
        if (languagePack?.installCount) {
            description ??= '';
            const count = languagePack.installCount;
            let countLabel;
            if (count > 1000000) {
                countLabel = `${Math.floor(count / 100000) / 10}M`;
            }
            else if (count > 1000) {
                countLabel = `${Math.floor(count / 1000)}K`;
            }
            else {
                countLabel = String(count);
            }
            description += ` $(cloud-download) ${countLabel}`;
        }
        return {
            id: locale,
            label,
            description
        };
    }
};
LanguagePackBaseService = __decorate([
    __param(0, IExtensionGalleryService)
], LanguagePackBaseService);
export { LanguagePackBaseService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VQYWNrcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2xhbmd1YWdlUGFja3MvY29tbW9uL2xhbmd1YWdlUGFja3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDL0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUc1RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDM0MsT0FBTyxFQUFFLHdCQUF3QixFQUFxQixNQUFNLHlEQUF5RCxDQUFDO0FBQ3RILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUU5RSxNQUFNLFVBQVUsU0FBUyxDQUFDLFNBQTRCO0lBQ3JELE9BQU8sU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3ZFLENBQUM7QUFFRCxNQUFNLENBQUMsTUFBTSxvQkFBb0IsR0FBRyxlQUFlLENBQXVCLHFCQUFxQixDQUFDLENBQUM7QUFjMUYsSUFBZSx1QkFBdUIsR0FBdEMsTUFBZSx1QkFBd0IsU0FBUSxVQUFVO0lBRy9ELFlBQXlELHVCQUFpRDtRQUN6RyxLQUFLLEVBQUUsQ0FBQztRQURnRCw0QkFBdUIsR0FBdkIsdUJBQXVCLENBQTBCO0lBRTFHLENBQUM7SUFNRCxLQUFLLENBQUMscUJBQXFCO1FBQzFCLE1BQU0sT0FBTyxHQUFHLElBQUksdUJBQXVCLEVBQUUs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