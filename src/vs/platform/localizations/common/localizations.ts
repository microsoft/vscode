/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ILocalizationContribution } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ILocalizationsService = createDecorator<ILocalizationsService>('localizationsService');

export interface ILocaleDetails {
	readonly extensionId: string;
	readonly locale: string;
	readonly label?: string;
}
export interface ILocalizationsService {
	readonly _serviceBrand: undefined;
	getAvailableLanguages(): Promise<Array<ILocaleDetails>>;
	getInstalledLanguages(): Promise<Array<ILocaleDetails>>;
}

export abstract class LocalizationsBaseService extends Disposable implements ILocalizationsService {
	_serviceBrand: undefined;

	constructor(@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService) {
		super();
	}

	abstract getInstalledLanguages(): Promise<ILocaleDetails[]>;

	async getAvailableLanguages(): Promise<{ extensionId: string; locale: string; label?: string }[]> {
		const timeout = new CancellationTokenSource();
		setTimeout(() => timeout.cancel(), 1000);

		let result;
		try {
			result = await this.extensionGalleryService.query({
				text: 'category:"language packs"',
				pageSize: 20
			}, timeout.token);
		} catch (_) {
			// This method is best effort. So, we ignore any errors.
			return [];
		}

		const languagePackExtensions = result.firstPage.filter(e => e.properties.localizedLanguages?.length && e.tags.some(t => t.startsWith('lp-')));
		return languagePackExtensions.map(lp => {
			const languageName = lp.properties.localizedLanguages?.[0];
			const locale = lp.tags.find(t => t.startsWith('lp-'))!.split('lp-')[1];
			return {
				extensionId: lp.identifier.id,
				locale,
				label: languageName
			};
		});
	}
}

export function isValidLocalization(localization: ILocalizationContribution): boolean {
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
