/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Language } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { AbstractExtHostLocalizationService } from 'vs/workbench/api/common/extHostLocalizationService';

export class ExtHostLocalizationService extends AbstractExtHostLocalizationService {

	private getBundleLocation(extension: IExtensionDescription): URI | undefined {
		if (extension.isBuiltin && this.initData.nlsBaseUrl) {
			return URI.joinPath(this.initData.nlsBaseUrl, extension.identifier.value, 'main');
		}

		if (extension.i18nBundleLocation) {
			return URI.joinPath(extension.extensionLocation, extension.i18nBundleLocation);
		}
		return undefined;
	}

	async initializeLocalizedMessages(extension: IExtensionDescription): Promise<void> {
		if (Language.isDefault()
			|| (!extension.isBuiltin && !extension.i18nBundleLocation)
		) {
			return;
		}

		let contents: { [key: string]: string } | undefined;
		const bundleLocation = this.getBundleLocation(extension);
		if (!bundleLocation) {
			console.error(`No bundle location found for extension ${extension.identifier.value}`);
			return;
		}
		const bundleUri = URI.joinPath(bundleLocation, `bundle.i18n.${Language.value()}.json`);

		try {
			const response = await fetch(bundleUri.toString(true));
			if (!response.ok) {
				throw new Error(await response.text());
			}
			contents = await response.json();
		} catch (e) {
			console.error(`Failed to load translations for ${extension.identifier.value} from ${bundleUri}: ${e.message}`);
			return;
		}

		if (contents) {
			this.bundleCache.set(extension.identifier.value, {
				contents,
				uri: bundleUri
			});
		}
	}
}
