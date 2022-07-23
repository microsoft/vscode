/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { language } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
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
	getBuiltInExtensionTranslationsUri(id: string): Promise<URI | undefined>;
	getLocale(extension: IGalleryExtension): string | undefined;
}

export abstract class LanguagePackBaseService extends Disposable implements ILanguagePackService {
	declare readonly _serviceBrand: undefined;

	constructor(@IExtensionGalleryService protected readonly extensionGalleryService: IExtensionGalleryService) {
		super();
	}

	abstract getBuiltInExtensionTranslationsUri(id: string): Promise<URI | undefined>;

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
			const baseQuickPick = this.createQuickPickItem(locale, languageName, lp);
			return {
				...baseQuickPick,
				extensionId: lp.identifier.id,
				galleryExtension: lp
			};
		});

		allFromMarketplace.push({
			...this.createQuickPickItem('en', 'English'),
			extensionId: 'default',
		});

		return allFromMarketplace;
	}

	getLocale(extension: IGalleryExtension): string | undefined {
		return extension.tags.find(t => t.startsWith('lp-'))?.split('lp-')[1];
	}

	protected createQuickPickItem(locale: string, languageName?: string, languagePack?: IGalleryExtension): IQuickPickItem {
		const label = languageName ?? locale;
		let description: string | undefined;
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
			let countLabel: string;
			if (count > 1000000) {
				countLabel = `${Math.floor(count / 100000) / 10}M`;
			} else if (count > 1000) {
				countLabel = `${Math.floor(count / 1000)}K`;
			} else {
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
}
