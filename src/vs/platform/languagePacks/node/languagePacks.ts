/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { createHash } from 'crypto';
import { equals } from '../../../base/common/arrays.js';
import { Queue } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { join } from '../../../base/common/path.js';
import { Promises } from '../../../base/node/pfs.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IExtensionGalleryService, IExtensionIdentifier, IExtensionManagementService, ILocalExtension } from '../../extensionManagement/common/extensionManagement.js';
import { areSameExtensions } from '../../extensionManagement/common/extensionManagementUtil.js';
import { ILogService } from '../../log/common/log.js';
import { ILocalizationContribution } from '../../extensions/common/extensions.js';
import { ILanguagePackItem, LanguagePackBaseService } from '../common/languagePacks.js';
import { URI } from '../../../base/common/uri.js';

interface ILanguagePack {
	hash: string;
	label: string | undefined;
	extensions: {
		extensionIdentifier: IExtensionIdentifier;
		version: string;
	}[];
	translations: { [id: string]: string };
}

export class NativeLanguagePackService extends LanguagePackBaseService {
	private readonly cache: LanguagePacksCache;

	constructor(
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IExtensionGalleryService extensionGalleryService: IExtensionGalleryService,
		@ILogService private readonly logService: ILogService
	) {
		super(extensionGalleryService);
		this.cache = this._register(new LanguagePacksCache(environmentService, logService));
		this.extensionManagementService.registerParticipant({
			postInstall: async (extension: ILocalExtension): Promise<void> => {
				return this.postInstallExtension(extension);
			},
			postUninstall: async (extension: ILocalExtension): Promise<void> => {
				return this.postUninstallExtension(extension);
			}
		});
	}

	async getBuiltInExtensionTranslationsUri(id: string, language: string): Promise<URI | undefined> {
		const packs = await this.cache.getLanguagePacks();
		const pack = packs[language];
		if (!pack) {
			this.logService.warn(`No language pack found for ${language}`);
			return undefined;
		}

		const translation = pack.translations[id];
		return translation ? URI.file(translation) : undefined;
	}

	async getInstalledLanguages(): Promise<Array<ILanguagePackItem>> {
		const languagePacks = await this.cache.getLanguagePacks();
		const languages: ILanguagePackItem[] = Object.keys(languagePacks).map(locale => {
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

	private async postInstallExtension(extension: ILocalExtension): Promise<void> {
		if (extension && extension.manifest && extension.manifest.contributes && extension.manifest.contributes.localizations && extension.manifest.contributes.localizations.length) {
			this.logService.info('Adding language packs from the extension', extension.identifier.id);
			await this.update();
		}
	}

	private async postUninstallExtension(extension: ILocalExtension): Promise<void> {
		const languagePacks = await this.cache.getLanguagePacks();
		if (Object.keys(languagePacks).some(language => languagePacks[language] && languagePacks[language].extensions.some(e => areSameExtensions(e.extensionIdentifier, extension.identifier)))) {
			this.logService.info('Removing language packs from the extension', extension.identifier.id);
			await this.update();
		}
	}

	async update(): Promise<boolean> {
		const [current, installed] = await Promise.all([this.cache.getLanguagePacks(), this.extensionManagementService.getInstalled()]);
		const updated = await this.cache.update(installed);
		return !equals(Object.keys(current), Object.keys(updated));
	}
}

class LanguagePacksCache extends Disposable {

	private languagePacks: { [language: string]: ILanguagePack } = {};
	private languagePacksFilePath: string;
	private languagePacksFileLimiter: Queue<any>;
	private initializedCache: boolean | undefined;

	constructor(
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@ILogService private readonly logService: ILogService
	) {
		super();
		this.languagePacksFilePath = join(environmentService.userDataPath, 'languagepacks.json');
		this.languagePacksFileLimiter = new Queue();
	}

	getLanguagePacks(): Promise<{ [language: string]: ILanguagePack }> {
		// if queue is not empty, fetch from disk
		if (this.languagePacksFileLimiter.size || !this.initializedCache) {
			return this.withLanguagePacks()
				.then(() => this.languagePacks);
		}
		return Promise.resolve(this.languagePacks);
	}

	update(extensions: ILocalExtension[]): Promise<{ [language: string]: ILanguagePack }> {
		return this.withLanguagePacks(languagePacks => {
			Object.keys(languagePacks).forEach(language => delete languagePacks[language]);
			this.createLanguagePacksFromExtensions(languagePacks, ...extensions);
		}).then(() => this.languagePacks);
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
				} else {
					languagePack.extensions.push({ extensionIdentifier, version: extension.manifest.version });
				}
				for (const translation of localizationContribution.translations) {
					languagePack.translations[translation.id] = join(extension.location.fsPath, translation.path);
				}
			}
		}
	}

	private updateHash(languagePack: ILanguagePack): void {
		if (languagePack) {
			const md5 = createHash('md5'); // CodeQL [SM04514] Used to create an hash for language pack extension version, which is not a security issue
			for (const extension of languagePack.extensions) {
				md5.update(extension.extensionIdentifier.uuid || extension.extensionIdentifier.id).update(extension.version); // CodeQL [SM01510] The extension UUID is not sensitive info and is not manually created by a user
			}
			languagePack.hash = md5.digest('hex');
		}
	}

	private withLanguagePacks<T>(fn: (languagePacks: { [language: string]: ILanguagePack }) => T | null = () => null): Promise<T> {
		return this.languagePacksFileLimiter.queue(() => {
			let result: T | null = null;
			return fs.promises.readFile(this.languagePacksFilePath, 'utf8')
				.then(undefined, err => err.code === 'ENOENT' ? Promise.resolve('{}') : Promise.reject(err))
				.then<{ [language: string]: ILanguagePack }>(raw => { try { return JSON.parse(raw); } catch (e) { return {}; } })
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
}

function isValidLocalization(localization: ILocalizationContribution): boolean {
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
