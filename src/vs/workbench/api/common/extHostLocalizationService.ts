/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LANGUAGE_DEFAULT } from '../../../base/common/platform.js';
import { format2 } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { ExtHostLocalizationShape, IStringDetails, MainContext, MainThreadLocalizationShape } from './extHost.protocol.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { IExtHostRpcService } from './extHostRpcService.js';

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
			return format2(message, (args ?? {}));
		}

		let key = message;
		if (comment && comment.length > 0) {
			key += `/${Array.isArray(comment) ? comment.join('') : comment}`;
		}
		const str = this.bundleCache.get(extensionId)?.contents[key];
		if (!str) {
			this.logService.warn(`Using default string since no string found in i18n bundle that has the key: ${key}`);
		}
		return format2(str ?? message, (args ?? {}));
	}

	getBundle(extensionId: string): { [key: string]: string } | undefined {
		return this.bundleCache.get(extensionId)?.contents;
	}

	getBundleUri(extensionId: string): URI | undefined {
		return this.bundleCache.get(extensionId)?.uri;
	}

	async initializeLocalizedMessages(extension: IExtensionDescription): Promise<void> {
		if (this.isDefaultLanguage
			|| (!extension.l10n && !extension.isBuiltin)
		) {
			return;
		}

		if (this.bundleCache.has(extension.identifier.value)) {
			return;
		}

		let contents: { [key: string]: string } | undefined;
		const bundleUri = await this.getBundleLocation(extension);
		if (!bundleUri) {
			this.logService.error(`No bundle location found for extension ${extension.identifier.value}`);
			return;
		}

		try {
			const response = await this._proxy.$fetchBundleContents(bundleUri);
			const result = JSON.parse(response);
			// 'contents.bundle' is a well-known key in the language pack json file that contains the _code_ translations for the extension
			contents = extension.isBuiltin ? result.contents?.bundle : result;
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

	private async getBundleLocation(extension: IExtensionDescription): Promise<URI | undefined> {
		if (extension.isBuiltin) {
			const uri = await this._proxy.$fetchBuiltInBundleUri(extension.identifier.value, this.currentLanguage);
			return URI.revive(uri);
		}

		return extension.l10n
			? URI.joinPath(extension.extensionLocation, extension.l10n, `bundle.l10n.${this.currentLanguage}.json`)
			: undefined;
	}
}

export const IExtHostLocalizationService = createDecorator<IExtHostLocalizationService>('IExtHostLocalizationService');
export interface IExtHostLocalizationService extends ExtHostLocalizationService { }
