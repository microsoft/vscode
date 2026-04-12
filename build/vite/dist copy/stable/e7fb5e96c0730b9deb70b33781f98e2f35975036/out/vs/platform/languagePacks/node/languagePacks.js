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
import * as fs from 'fs';
import { createHash } from 'crypto';
import { equals } from '../../../base/common/arrays.js';
import { Queue } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { join } from '../../../base/common/path.js';
import { Promises } from '../../../base/node/pfs.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IExtensionGalleryService, IExtensionManagementService } from '../../extensionManagement/common/extensionManagement.js';
import { areSameExtensions } from '../../extensionManagement/common/extensionManagementUtil.js';
import { ILogService } from '../../log/common/log.js';
import { LanguagePackBaseService } from '../common/languagePacks.js';
import { URI } from '../../../base/common/uri.js';
let NativeLanguagePackService = class NativeLanguagePackService extends LanguagePackBaseService {
    constructor(extensionManagementService, environmentService, extensionGalleryService, logService) {
        super(extensionGalleryService);
        this.extensionManagementService = extensionManagementService;
        this.logService = logService;
        this.cache = this._register(new LanguagePacksCache(environmentService, logService));
        this.extensionManagementService.registerParticipant({
            postInstall: async (extension) => {
                return this.postInstallExtension(extension);
            },
            postUninstall: async (extension) => {
                return this.postUninstallExtension(extension);
            }
        });
    }
    async getBuiltInExtensionTranslationsUri(id, language) {
        const packs = await this.cache.getLanguagePacks();
        const pack = packs[language];
        if (!pack) {
            this.logService.warn(`No language pack found for ${language}`);
            return undefined;
        }
        const translation = pack.translations[id];
        return translation ? URI.file(translation) : undefined;
    }
    async getInstalledLanguages() {
        const languagePacks = await this.cache.getLanguagePacks();
        const languages = Object.keys(languagePacks).map(locale => {
            const languagePack = languagePacks[locale];
            const baseQuickPick = this.createQuickPickItem(locale, languagePack.label);
            return {
                ...baseQuickPick,
                extensionId: languagePack.extensions[0].extensionIdentifier.id,
            };
        });
        languages.push(this.createQuickPickItem('en', 'English'));
        languages.sort((a, b) => a.label.localeCompare(b.label));
        return languages;
    }
    async postInstallExtension(extension) {
        if (extension && extension.manifest && extension.manifest.contributes && extension.manifest.contributes.localizations && extension.manifest.contributes.localizations.length) {
            this.logService.info('Adding language packs from the extension', extension.identifier.id);
            await this.update();
        }
    }
    async postUninstallExtension(extension) {
        const languagePacks = await this.cache.getLanguagePacks();
        if (Object.keys(languagePacks).some(language => languagePacks[language] && languagePacks[language].extensions.some(e => areSameExtensions(e.extensionIdentifier, extension.identifier)))) {
            this.logService.info('Removing language packs from the extension', extension.identifier.id);
            await this.update();
        }
    }
    async update() {
        const [current, installed] = await Promise.all([this.cache.getLanguagePacks(), this.extensionManagementService.getInstalled()]);
        const updated = await this.cache.update(installed);
        return !equals(Object.keys(current), Object.keys(updated));
    }
};
NativeLanguagePackService = __decorate([
    __param(0, IExtensionManagementService),
    __param(1, INativeEnvironmentService),
    __param(2, IExtensionGalleryService),
    __param(3, ILogService)
], NativeLanguagePackService);
export { NativeLanguagePackService };
let LanguagePacksCache = class LanguagePacksCache extends Disposable {
    constructor(environmentService, logService) {
        super();
        this.logService = logService;
        this.languagePacks = {};
        this.languagePacksFilePath = join(environmentService.userDataPath, 'languagepacks.json');
        this.languagePacksFileLimiter = new Queue();
    }
    getLanguagePacks() {
        // if queue is not empty, fetch from disk
        if (this.languagePacksFileLimiter.size || !this.initializedCache) {
            return this.withLanguagePacks()
                .then(() => this.languagePacks);
        }
        return Promise.resolve(this.languagePacks);
    }
    update(extensions) {
        return this.withLanguagePacks(languagePacks => {
            Object.keys(languagePacks).forEach(language => delete languagePacks[language]);
            this.createLanguagePacksFromExtensions(languagePacks, ...extensions);
        }).then(() => this.languagePacks);
    }
    createLanguagePacksFromExtensions(languagePacks, ...extensions) {
        for (const extension of extensions) {
            if (extension && extension.manifest && extension.manifest.contributes && extension.manifest.contributes.localizations && extension.manifest.contributes.localizations.length) {
                this.createLanguagePacksFromExtension(languagePacks, extension);
            }
        }
        Object.keys(languagePacks).forEach(languageId => this.updateHash(languagePacks[languageId]));
    }
    createLanguagePacksFromExtension(languagePacks, extension) {
        const extensionIdentifier = extension.identifier;
        const localizations = extension.manifest.contributes && extension.manifest.contributes.localizations ? extension.manifest.contributes.localizations : [];
        for (const localizationContribution of localizations) {
            if (extension.location.scheme === Schemas.file && isValidLocalization(localizationContribution)) {
                let languagePack = languagePacks[localizationContribution.languageId];
                if (!languagePack) {
                    languagePack = {
                        hash: '',
                        extensions: [],
                        translations: {},
                        label: localizationContribution.localizedLanguageName ?? localizationContribution.languageName
                    };
                    languagePacks[localizationContribution.languageId] = languagePack;
                }
                const extensionInLanguagePack = languagePack.extensions.filter(e => areSameExtensions(e.extensionIdentifier, extensionIdentifier))[0];
                if (extensionInLanguagePack) {
                    extensionInLanguagePack.version = extension.manifest.version;
                }
                else {
                    languagePack.extensions.push({ extensionIdentifier, version: extension.manifest.version });
                }
                for (const translation of localizationContribution.translations) {
                    languagePack.translations[translation.id] = join(extension.location.fsPath, translation.path);
                }
            }
        }
    }
    updateHash(languagePack) {
        if (languagePack) {
            const md5 = createHash('md5'); // CodeQL [SM04514] Used to create an hash for language pack extension version, which is not a security issue
            for (const extension of languagePack.extensions) {
                md5.update(extension.extensionIdentifier.uuid || extension.extensionIdentifier.id).update(extension.version); // CodeQL [SM01510] The extension UUID is not sensitive info and is not manually created by a user
            }
            languagePack.hash = md5.digest('hex');
        }
    }
    withLanguagePacks(fn = () => null) {
        return this.languagePacksFileLimiter.queue(() => {
            let result = null;
            return fs.promises.readFile(this.languagePacksFilePath, 'utf8')
                .then(undefined, err => err.code === 'ENOENT' ? Promise.resolve('{}') : Promise.reject(err))
                .then(raw => { try {
                return JSON.parse(raw);
            }
            catch (e) {
                return {};
            } })
                .then(languagePacks => { result = fn(languagePacks); return languagePacks; })
                .then(languagePacks => {
                for (const language of Object.keys(languagePacks)) {
                    if (!languagePacks[language]) {
                        delete languagePacks[language];
                    }
                }
                this.languagePacks = languagePacks;
                this.initializedCache = true;
                const raw = JSON.stringify(this.languagePacks);
                this.logService.debug('Writing language packs', raw);
                return Promises.writeFile(this.languagePacksFilePath, raw);
            })
                .then(() => result, error => this.logService.error(error));
        });
    }
};
LanguagePacksCache = __decorate([
    __param(0, INativeEnvironmentService),
    __param(1, ILogService)
], LanguagePacksCache);
function isValidLocalization(localization) {
    if (typeof localization.languageId !== 'string') {
        return false;
    }
    if (!Array.isArray(localization.translations) || localization.translations.length === 0) {
        return false;
    }
    for (const translation of localization.translations) {
        if (typeof translation.id !== 'string') {
            return false;
        }
        if (typeof translation.path !== 'string') {
            return false;
        }
    }
    if (localization.languageName && typeof localization.languageName !== 'string') {
        return false;
    }
    if (localization.localizedLanguageName && typeof localization.localizedLanguageName !== 'string') {
        return false;
    }
    return true;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VQYWNrcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2xhbmd1YWdlUGFja3Mvbm9kZS9sYW5ndWFnZVBhY2tzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDcEMsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDckQsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEYsT0FBTyxFQUFFLHdCQUF3QixFQUF3QiwyQkFBMkIsRUFBbUIsTUFBTSx5REFBeUQsQ0FBQztBQUN2SyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFFdEQsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3hGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQVkzQyxJQUFNLHlCQUF5QixHQUEvQixNQUFNLHlCQUEwQixTQUFRLHVCQUF1QjtJQUdyRSxZQUMrQywwQkFBdUQsRUFDMUUsa0JBQTZDLEVB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