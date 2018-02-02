/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as pfs from 'vs/base/node/pfs';
import { createHash } from 'crypto';
import { IExtensionManagementService, ILocalExtension, IExtensionIdentifier } from 'vs/platform/extensionManagement/common/extensionManagement';
import { Disposable } from 'vs/base/common/lifecycle';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { join } from 'vs/base/common/paths';
import { TPromise } from 'vs/base/common/winjs.base';
import { Limiter } from 'vs/base/common/async';
import { areSameExtensions, getGalleryExtensionIdFromLocal } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ILogService } from 'vs/platform/log/common/log';
import { isValidLocalization } from 'vs/platform/localizations/common/localizations';

interface ILanguagePack {
	hash: string;
	extensions: {
		extensionIdentifier: IExtensionIdentifier;
		version: string;
	}[];
	translations: { [id: string]: string };
}

export class LanguagePacksCache extends Disposable {

	private languagePacksFilePath: string;
	private languagePacksFileLimiter: Limiter<void>;

	constructor(
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILogService private logService: ILogService
	) {
		super();
		this.languagePacksFilePath = join(environmentService.userDataPath, 'languagepacks.json');
		this.languagePacksFileLimiter = new Limiter(1);

		this._register(extensionManagementService.onDidInstallExtension(({ local }) => this.onDidInstallExtension(local)));
		this._register(extensionManagementService.onDidUninstallExtension(({ identifier }) => this.onDidUninstallExtension(identifier)));

		this.reset();
	}

	private onDidInstallExtension(extension: ILocalExtension): void {
		if (extension && extension.manifest && extension.manifest.contributes && extension.manifest.contributes.localizations && extension.manifest.contributes.localizations.length) {
			this.logService.debug('Adding language packs from the extension', extension.identifier.id);
			this.reset();
		}
	}

	private onDidUninstallExtension(identifier: IExtensionIdentifier): void {
		if (this.withLanguagePacks(languagePacks => Object.keys(languagePacks).some(language => languagePacks[language] && languagePacks[language].extensions.some(e => areSameExtensions(e.extensionIdentifier, identifier))))) {
			this.logService.debug('Removing language packs from the extension', identifier.id);
			this.reset();
		}
	}

	private reset(): void {
		this.extensionManagementService.getInstalled()
			.then(installed => {
				this.withLanguagePacks(languagePacks => {
					Object.keys(languagePacks).forEach(language => languagePacks[language] = undefined);
					this.createLanguagePacksFromExtensions(languagePacks, ...installed);
				});
			});
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
		const extensionIdentifier = { id: getGalleryExtensionIdFromLocal(extension), uuid: extension.identifier.uuid };
		for (const localizationContribution of extension.manifest.contributes.localizations) {
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
					languagePack.translations[translation.id] = join(extension.path, translation.path);
				}
			}
		}
	}

	private updateHash(languagePack: ILanguagePack): void {
		if (languagePack) {
			const md5 = createHash('md5');
			for (const extension of languagePack.extensions) {
				md5.update(extension.extensionIdentifier.uuid || extension.extensionIdentifier.id).update(extension.version);
			}
			languagePack.hash = md5.digest('hex');
		}
	}

	private withLanguagePacks<T>(fn: (languagePacks: { [language: string]: ILanguagePack }) => T): TPromise<T> {
		return this.languagePacksFileLimiter.queue(() => {
			let result: T = null;
			return pfs.readFile(this.languagePacksFilePath, 'utf8')
				.then(null, err => err.code === 'ENOENT' ? TPromise.as('{}') : TPromise.wrapError(err))
				.then<{ [language: string]: ILanguagePack }>(raw => { try { return JSON.parse(raw); } catch (e) { return {}; } })
				.then(languagePacks => { result = fn(languagePacks); return languagePacks; })
				.then(languagePacks => {
					for (const language of Object.keys(languagePacks)) {
						if (!languagePacks[language]) {
							delete languagePacks[language];
						}
					}
					const raw = JSON.stringify(languagePacks);
					this.logService.debug('Writing language packs', raw);
					return pfs.writeFile(this.languagePacksFilePath, raw);
				})
				.then(() => result, error => this.logService.error(error));
		});
	}
}