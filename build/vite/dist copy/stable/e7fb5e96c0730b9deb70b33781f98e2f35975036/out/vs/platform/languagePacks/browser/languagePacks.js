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
import { URI } from '../../../base/common/uri.js';
import { IExtensionGalleryService } from '../../extensionManagement/common/extensionManagement.js';
import { IExtensionResourceLoaderService } from '../../extensionResourceLoader/common/extensionResourceLoader.js';
import { LanguagePackBaseService } from '../common/languagePacks.js';
import { ILogService } from '../../log/common/log.js';
let WebLanguagePacksService = class WebLanguagePacksService extends LanguagePackBaseService {
    constructor(extensionResourceLoaderService, extensionGalleryService, logService) {
        super(extensionGalleryService);
        this.extensionResourceLoaderService = extensionResourceLoaderService;
        this.logService = logService;
    }
    async getBuiltInExtensionTranslationsUri(id, language) {
        const queryTimeout = new CancellationTokenSource();
        setTimeout(() => queryTimeout.cancel(), 1000);
        // First get the extensions that supports the language (there should only be one but just in case let's include more results)
        let result;
        try {
            result = await this.extensionGalleryService.query({
                text: `tag:"lp-${language}"`,
                pageSize: 5
            }, queryTimeout.token);
        }
        catch (err) {
            this.logService.error(err);
            return undefined;
        }
        const languagePackExtensions = result.firstPage.find(e => e.properties.localizedLanguages?.length);
        if (!languagePackExtensions) {
            this.logService.trace(`No language pack found for language ${language}`);
            return undefined;
        }
        // Then get the manifest for that extension
        const manifestTimeout = new CancellationTokenSource();
        setTimeout(() => queryTimeout.cancel(), 1000);
        const manifest = await this.extensionGalleryService.getManifest(languagePackExtensions, manifestTimeout.token);
        // Find the translation from the language pack
        const localization = manifest?.contributes?.localizations?.find(l => l.languageId === language);
        const translation = localization?.translations.find(t => t.id === id);
        if (!translation) {
            this.logService.trace(`No translation found for id '${id}, in ${manifest?.name}`);
            return undefined;
        }
        // get the resource uri and return it
        const uri = await this.extensionResourceLoaderService.getExtensionGalleryResourceURL({
            // If translation is defined then manifest should have been defined.
            name: manifest.name,
            publisher: manifest.publisher,
            version: manifest.version
        });
        if (!uri) {
            this.logService.trace('Gallery does not provide extension resources.');
            return undefined;
        }
        return URI.joinPath(uri, translation.path);
    }
    // Web doesn't have a concept of language packs, so we just return an empty array
    getInstalledLanguages() {
        return Promise.resolve([]);
    }
};
WebLanguagePacksService = __decorate([
    __param(0, IExtensionResourceLoaderService),
    __param(1, IExtensionGalleryService),
    __param(2, ILogService)
], WebLanguagePacksService);
export { WebLanguagePacksService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VQYWNrcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2xhbmd1YWdlUGFja3MvYnJvd3Nlci9sYW5ndWFnZVBhY2tzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUNsSCxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDeEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBRS9DLElBQU0sdUJBQXVCLEdBQTdCLE1BQU0sdUJBQXdCLFNBQVEsdUJBQXVCO0lBQ25FLFlBQ21ELDhCQUErRCxFQUN2Rix1QkFBaUQsRUFDN0MsVUFBdUI7UUFFckQsS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFKbUIsbUNBQThCLEdBQTlCLDhCQUE4QixDQUFpQztRQUVuRixlQUFVLEdBQVYsVUFBVSxDQUFhO0lBR3RELENBQUM7SUFFRCxLQUFLLENBQUMsa0NBQWtDLENBQUMsRUFBVSxFQUFFLFFBQWdCO1FBRXBFLE1BQU0sWUFBWSxHQUFHLElBQUksdUJBQXVCLEVBQUUsQ0FBQztRQUNuRCxVQUFVLENBQUMsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRTlDLDZIQUE2SDtRQUM3SCxJQUFJLE1BQU0sQ0FBQztRQUNYLElBQUksQ0FBQztZQUNKLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FB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