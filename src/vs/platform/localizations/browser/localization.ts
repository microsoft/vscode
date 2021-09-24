/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct, equals } from 'vs/base/common/arrays';
import { hash } from 'vs/base/common/hash';
import { Disposable } from 'vs/base/common/lifecycle';
import { join } from 'vs/base/common/path';
import { IExtensionIdentifier, IExtensionManagementService, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILocalizationsService, isValidLocalization } from 'vs/platform/localizations/common/localizations';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';

interface ILanguagePack {
	hash: string;
	extensions: {
		extensionIdentifier: IExtensionIdentifier;
		version: string;
	}[];
	translations: { [id: string]: string };
}

export class LocalizationsService extends Disposable implements ILocalizationsService {

	declare readonly _serviceBrand: undefined;

	private readonly cache: LanguagePacksCache;
	constructor(
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@ILogService private readonly logService: ILogService,
		@IStorageService storageService: IStorageService
	) {
		super();
		this.cache = this._register(new LanguagePacksCache(storageService, logService));
		this._register(this.extensionManagementService.onDidInstallExtensions((e) => e.forEach(r => {
			if (r.local) {
				this.postInstallExtension(r.local);
			}
		})));
		this._register(this.extensionManagementService.onDidUninstallExtension((e) => {
			this.postUninstallExtension(e.identifier);
		}));
	}

	async getLanguageIds(): Promise<string[]> {
		const languagePacks = this.cache.getLanguagePacks();
		// Contributed languages are those installed via extension packs, so does not include English
		const languages = ['en', ...Object.keys(languagePacks)];
		return distinct(languages);
	}

	private async postInstallExtension(extension: ILocalExtension): Promise<void> {
		if (extension && extension.manifest && extension.manifest.contributes && extension.manifest.contributes.localizations && extension.manifest.contributes.localizations.length) {
			this.logService.info('Adding language packs from the extension', extension.identifier.id);
			await this.update();
		}
	}

	private async postUninstallExtension(extensionIdentifier: IExtensionIdentifier): Promise<void> {
		const languagePacks = this.cache.getLanguagePacks();
		if (Object.keys(languagePacks).some(language => languagePacks[language] && languagePacks[language].extensions.some(e => areSameExtensions(e.extensionIdentifier, extensionIdentifier)))) {
			this.logService.info('Removing language packs from the extension', extensionIdentifier.id);
			await this.update();
		}
	}

	async update(): Promise<boolean> {
		const current = this.cache.getLanguagePacks();
		const installed = await this.extensionManagementService.getInstalled();
		const updated = this.cache.update(installed);
		return !equals(Object.keys(current), Object.keys(updated));
	}
}

class LanguagePacksCache extends Disposable {

	private languagePacks: { [language: string]: ILanguagePack } = {};
	private readonly languagePacksStorageKey: string = 'languagepacksjson';
	private initializedCache: boolean | undefined;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	getLanguagePacks(): { [language: string]: ILanguagePack } {
		// if queue is not empty, fetch from disk
		if (!this.initializedCache) {
			let languagePacks: any;
			const raw = this.storageService.get(this.languagePacksStorageKey, StorageScope.GLOBAL, '{}');
			try {
				languagePacks = JSON.parse(raw);
			} catch (e) {
				return {};
			}

			for (const language of Object.keys(languagePacks)) {
				if (!languagePacks[language]) {
					delete languagePacks[language];
				}
			}
			this.languagePacks = languagePacks;
			this.initializedCache = true;
			const newRaw = JSON.stringify(this.languagePacks);
			this.logService.debug('Writing language packs', raw);
			this.storageService.store(this.languagePacksStorageKey, newRaw, StorageScope.GLOBAL, StorageTarget.USER);
		}
		return this.languagePacks;
	}

	update(extensions: ILocalExtension[]): { [language: string]: ILanguagePack } {
		const languagePacks = this.getLanguagePacks();
		Object.keys(languagePacks).forEach(language => delete languagePacks[language]);
		this.createLanguagePacksFromExtensions(languagePacks, ...extensions);
		return languagePacks;
	}

	private createLanguagePacksFromExtensions(languagePacks: { [language: string]: ILanguagePack }, ...extensions: ILocalExtension[]): void {
		for (const extension of extensions) {
			if (extension && extension.manifest && extension.manifest.contributes && extension.manifest.contributes.localizations && extension.manifest.contributes.localizations.length) {
				this.createLanguagePacksFromExtension(languagePacks, extension);
			}
		}
		Object.keys(languagePacks).forEach(languageId => this.updateHash(languagePacks[languageId]));
	}

	private createLanguagePacksFromExtension(languagePacks: { [language: string]: ILanguagePack }, extension: ILocalExtension): void {
		const extensionIdentifier = extension.identifier;
		const localizations = extension.manifest.contributes && extension.manifest.contributes.localizations ? extension.manifest.contributes.localizations : [];
		for (const localizationContribution of localizations) {
			if (isValidLocalization(localizationContribution)) {
				let languagePack = languagePacks[localizationContribution.languageId];
				if (!languagePack) {
					languagePack = { hash: '', extensions: [], translations: {} };
					languagePacks[localizationContribution.languageId] = languagePack;
				}
				let extensionInLanguagePack = languagePack.extensions.filter(e => areSameExtensions(e.extensionIdentifier, extensionIdentifier))[0];
				if (extensionInLanguagePack) {
					extensionInLanguagePack.version = extension.manifest.version;
				} else {
					languagePack.extensions.push({ extensionIdentifier, version: extension.manifest.version });
				}
				for (const translation of localizationContribution.translations) {
					languagePack.translations[translation.id] = join(extension.location.toString(), translation.path);
				}
			}
		}
	}

	private updateHash(languagePack: ILanguagePack): void {
		languagePack.hash = `${hash(languagePack)}`;
	}
}

registerSingleton(ILocalizationsService, LocalizationsService);
