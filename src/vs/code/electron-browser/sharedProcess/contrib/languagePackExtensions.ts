/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as pfs from 'vs/base/node/pfs';
import { IExtensionManagementService, ILocalExtension, IExtensionIdentifier } from 'vs/platform/extensionManagement/common/extensionManagement';
import { Disposable } from 'vs/base/common/lifecycle';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { join } from 'vs/base/common/paths';
import { TPromise } from 'vs/base/common/winjs.base';
import { Limiter } from 'vs/base/common/async';
import { areSameExtensions, getGalleryExtensionIdFromLocal, getIdFromLocalExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ILogService } from 'vs/platform/log/common/log';

interface ILanguageSource {
	extensionIdentifier: IExtensionIdentifier;
	version: string;
	translations: string;
}

export class LanguagePackExtensions extends Disposable {

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

	private reset(): void {
		this.extensionManagementService.getInstalled()
			.then(installed => {
				this.withLanguagePacks(languagePacks => {
					for (const language of Object.keys(languagePacks)) {
						languagePacks[language] = [];
					}
					this.addLanguagePacksFromExtensions(languagePacks, ...installed);
				});
			});
	}

	private onDidInstallExtension(extension: ILocalExtension): void {
		if (extension && extension.manifest && extension.manifest.contributes && extension.manifest.contributes.localizations && extension.manifest.contributes.localizations.length) {
			this.logService.debug('Adding language packs from the extension', extension.identifier.id);
			this.withLanguagePacks(languagePacks => {
				this.removeLanguagePacksFromExtensions(languagePacks, { id: getGalleryExtensionIdFromLocal(extension), uuid: extension.identifier.uuid });
				this.addLanguagePacksFromExtensions(languagePacks, extension);
			});
		}
	}

	private onDidUninstallExtension(identifier: IExtensionIdentifier): void {
		this.logService.debug('Removing language packs from the extension', identifier.id);
		this.withLanguagePacks(languagePacks => this.removeLanguagePacksFromExtensions(languagePacks, { id: getIdFromLocalExtensionId(identifier.id), uuid: identifier.uuid }));
	}

	private addLanguagePacksFromExtensions(languagePacks: { [language: string]: ILanguageSource[] }, ...extensions: ILocalExtension[]): void {
		for (const extension of extensions) {
			if (extension && extension.manifest && extension.manifest.contributes && extension.manifest.contributes.localizations && extension.manifest.contributes.localizations.length) {
				const extensionIdentifier = { id: getGalleryExtensionIdFromLocal(extension), uuid: extension.identifier.uuid };
				for (const localizationContribution of extension.manifest.contributes.localizations) {
					if (localizationContribution.languageId && localizationContribution.translations) {
						const languageSources = languagePacks[localizationContribution.languageId] || [];
						languageSources.splice(0, 0, { extensionIdentifier, translations: join(extension.path, localizationContribution.translations), version: extension.manifest.version });
						languagePacks[localizationContribution.languageId] = languageSources;
					}
				}
			}
		}
	}

	private removeLanguagePacksFromExtensions(languagePacks: { [language: string]: ILanguageSource[] }, ...extensionIdentifiers: IExtensionIdentifier[]): void {
		for (const language of Object.keys(languagePacks)) {
			languagePacks[language] = languagePacks[language].filter(languageSource => !extensionIdentifiers.some(extensionIdentifier => areSameExtensions(extensionIdentifier, languageSource.extensionIdentifier)));
		}
	}

	private withLanguagePacks<T>(fn: (languagePacks: { [language: string]: ILanguageSource[] }) => T): TPromise<T> {
		return this.languagePacksFileLimiter.queue(() => {
			let result: T = null;
			return pfs.readFile(this.languagePacksFilePath, 'utf8')
				.then(null, err => err.code === 'ENOENT' ? TPromise.as('{}') : TPromise.wrapError(err))
				.then<{ [language: string]: ILanguageSource[] }>(raw => { try { return JSON.parse(raw); } catch (e) { return {}; } })
				.then(languagePacks => { result = fn(languagePacks); return languagePacks; })
				.then(languagePacks => {
					for (const language of Object.keys(languagePacks)) {
						if (!(languagePacks[language] && languagePacks[language].length)) {
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