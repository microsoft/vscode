/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'vs/base/common/path';
import { Language } from 'vs/base/common/platform';
import { originalFSPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { Promises } from 'vs/base/node/pfs';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { AbstractExtHostLocalizationService } from 'vs/workbench/api/common/extHostLocalizationService';

export class ExtHostLocalizationService extends AbstractExtHostLocalizationService {
	private getBundleLocation(extension: IExtensionDescription): string | undefined {
		// uncomment when language packs are supported on Desktop
		// if (extension.isBuiltin && this.initData.nlsBaseUrl) {
		// 	return URI.joinPath(this.initData.nlsBaseUrl, extension.identifier.value, 'main');
		// }

		if (extension.i18nBundleLocation) {
			return path.join(originalFSPath(extension.extensionLocation), extension.i18nBundleLocation);
		}
		return undefined;
	}

	async initializeLocalizedMessages(extension: IExtensionDescription): Promise<void> {
		if (
			Language.isDefault()
			|| (!extension.isBuiltin && !extension.i18nBundleLocation)
		) {
			return;
		}

		const bundleLocation = this.getBundleLocation(extension);
		if (!bundleLocation) {
			console.error(`No bundle location found for extension ${extension.identifier.value}`);
			return;
		}

		const bundlePath = path.join(bundleLocation, `bundle.i18n.${Language.value()}.json`);
		let contents: { [key: string]: string } | undefined;
		try {
			contents = JSON.parse(await Promises.readFile(bundlePath, 'utf-8'));
		} catch (e) {
			console.error(`Failed to load translations for ${extension.identifier.value} from ${bundlePath}: ${e.message}`);
			return;
		}

		if (contents) {
			this.bundleCache.set(extension.identifier.value, {
				contents,
				uri: URI.file(bundlePath)
			});
		}
	}
}
