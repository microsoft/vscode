/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LANGUAGE_DEFAULT } from 'vs/base/common/platform';
import { format } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostLocalizationShape, IStringDetails, MainContext, MainThreadLocalizationShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';

export class ExtHostLocalizationService implements ExtHostLocalizationShape {
	readonly _serviceBrand: undefined;

	private readonly _proxy: MainThreadLocalizationShape;
	private readonly currentLanguage: string;
	private readonly isDefaultLanguage: boolean;

	private readonly bundleCache: Map<string, { contents: { [key: string]: string }; uri: URI }> = new Map();

	constructor(
		@IExtHostInitDataService initData: IExtHostInitDataService,
		@IExtHostRpcService rpc: IExtHostRpcService,
		@ILogService private readonly logService: ILogService
	) {
		this._proxy = rpc.getProxy(MainContext.MainThreadLocalization);
		this.currentLanguage = initData.environment.appLanguage;
		this.isDefaultLanguage = this.currentLanguage === LANGUAGE_DEFAULT;
	}

	getMessage(extensionId: string, details: IStringDetails): string {
		const { message, args, comment } = details;
		if (this.isDefaultLanguage) {
			return format(message, args);
		}

		let key = message;
		if (comment && comment.length > 0) {
			key += `/${comment.join()}`;
		}
		const str = this.bundleCache.get(extensionId)?.contents[key];
		if (!str) {
			this.logService.warn(`Using default string since no string found in i18n bundle that has the key: ${key}`);
		}
		return format(str ?? key, args);
	}

	getBundle(extensionId: string): { [key: string]: string } {
		return this.bundleCache.get(extensionId)?.contents ?? {};
	}

	getBundleUri(extensionId: string): URI | undefined {
		return this.bundleCache.get(extensionId)?.uri;
	}

	async initializeLocalizedMessages(extension: IExtensionDescription): Promise<void> {
		if (this.isDefaultLanguage
			// TODO: support builtin extensions
			|| !extension.l10n
		) {
			return;
		}

		if (this.bundleCache.has(extension.identifier.value)) {
			return;
		}

		let contents: { [key: string]: string } | undefined;
		const bundleLocation = this.getBundleLocation(extension);
		if (!bundleLocation) {
			this.logService.error(`No bundle location found for extension ${extension.identifier.value}`);
			return;
		}
		const bundleUri = URI.joinPath(bundleLocation, `bundle.l10n.${this.currentLanguage}.json`);

		try {
			const response = await this._proxy.$fetchBundleContents(bundleUri);
			contents = JSON.parse(response);
		} catch (e) {
			this.logService.error(`Failed to load translations for ${extension.identifier.value} from ${bundleUri}: ${e.message}`);
			return;
		}

		if (contents) {
			this.bundleCache.set(extension.identifier.value, {
				contents,
				uri: bundleUri
			});
		}
	}

	private getBundleLocation(extension: IExtensionDescription): URI | undefined {
		// TODO: support builtin extensions using IExtHostInitDataService
		// if (extension.isBuiltin && this.initData.nlsBaseUrl) {
		// 	return URI.joinPath(this.initData.nlsBaseUrl, extension.identifier.value, 'main');
		// }

		return extension.l10n
			? URI.joinPath(extension.extensionLocation, extension.l10n)
			: undefined;
	}
}

export const IExtHostLocalizationService = createDecorator<IExtHostLocalizationService>('IExtHostLocalizationService');
export interface IExtHostLocalizationService extends ExtHostLocalizationService { }
