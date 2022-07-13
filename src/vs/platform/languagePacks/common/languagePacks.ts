/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { language } from 'vs/base/common/platform';
import { IQuickPickItem } from 'vs/base/parts/quickinput/common/quickInput';
import { localize } from 'vs/nls';
import { IExtensionGalleryService, IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ILanguagePackService = createDecorator<ILanguagePackService>('languagePackService');

export interface ILanguagePackItem extends IQuickPickItem {
	readonly extensionId: string;
	readonly galleryExtension?: IGalleryExtension;
}

export interface ILanguagePackService {
	readonly _serviceBrand: undefined;
	getAvailableLanguages(): Promise<Array<ILanguagePackItem>>;
	getInstalledLanguages(): Promise<Array<ILanguagePackItem>>;
	getLocale(extension: IGalleryExtension): string | undefined;
}

export abstract class LanguagePackBaseService extends Disposable implements ILanguagePackService {
	declare readonly _serviceBrand: undefined;

	constructor(@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService) {
		super();
	}

	abstract getInstalledLanguages(): Promise<Array<ILanguagePackItem>>;

	async getAvailableLanguages(): Promise<ILanguagePackItem[]> {
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
		const allFromMarketplace: ILanguagePackItem[] = languagePackExtensions.map(lp => {
			const languageName = lp.properties.localizedLanguages?.[0];
			const locale = this.getLocale(lp)!;
			const baseQuickPick = this.createQuickPickItem({ locale, label: languageName });
			return {
				...baseQuickPick,
				extensionId: lp.identifier.id,
				galleryExtension: lp
			};
		});

		allFromMarketplace.push({
			...this.createQuickPickItem({ locale: 'en', label: 'English' }),
			extensionId: 'default',
		});

		return allFromMarketplace;
	}

	getLocale(extension: IGalleryExtension): string | undefined {
		return extension.tags.find(t => t.startsWith('lp-'))?.split('lp-')[1];
	}

	protected createQuickPickItem(languageItem: { locale: string; label?: string | undefined }): IQuickPickItem {
		const label = languageItem.label ?? languageItem.locale;
		let description: string | undefined = languageItem.locale !== languageItem.label ? languageItem.locale : undefined;
		if (languageItem.locale.toLowerCase() === language.toLowerCase()) {
			if (!description) {
				description = '';
			}
			description += localize('currentDisplayLanguage', " (Current)");
		}
		return {
			id: languageItem.locale,
			label,
			description
		};
	}
}
