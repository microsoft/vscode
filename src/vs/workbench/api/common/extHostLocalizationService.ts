/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Language } from 'vs/base/common/platform';
import { format } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ExtHostLocalizationShape, IStringDetails } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';

export abstract class AbstractExtHostLocalizationService implements ExtHostLocalizationShape {
	readonly _serviceBrand: undefined;

	protected bundleCache: Map<string, { contents: { [key: string]: string }; uri: URI }> = new Map();

	constructor(@IExtHostInitDataService protected readonly initData: IExtHostInitDataService) { }

	getMessage(extensionId: string, details: IStringDetails): string {
		const { message, args, comment } = details;
		if (Language.isDefault()) {
			return format(message, args);
		}

		let key = message;
		if (comment && comment.length > 0) {
			key += `/${comment.join()}`;
		}
		const str = this.bundleCache.get(extensionId)?.contents[key];
		if (!str) {
			console.warn(`Using default string since no string found in i18n bundle that has the key: ${key}`);
		}
		return format(str ?? key, args);
	}

	getBundle(extensionId: string): { [key: string]: string } {
		return this.bundleCache.get(extensionId)!.contents;
	}

	getBundleUri(extensionId: string): URI {
		return this.bundleCache.get(extensionId)!.uri;
	}

	abstract initializeLocalizedMessages(extension: IExtensionDescription): Promise<void>;
}

export const IExtHostLocalizationService = createDecorator<IExtHostLocalizationService>('IExtHostLocalizationService');
export interface IExtHostLocalizationService extends AbstractExtHostLocalizationService { }
