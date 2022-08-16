/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Language } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ExtHostLocalizationShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';

export abstract class AbstractExtHostLocalizationService implements ExtHostLocalizationShape {
	readonly _serviceBrand: undefined;

	protected bundleCache: Map<string, { contents: { [key: string]: string }; uri: URI }> = new Map();

	constructor(@IExtHostInitDataService protected readonly initData: IExtHostInitDataService) { }

	private format(message: string, args: any[]): string {
		let result: string;
		if (args.length === 0) {
			result = message;
		}
		else {
			result = message.replace(/\{(\d+)\}/g, (match, rest) => {
				const index = rest[0];
				const arg = args[index];
				let replacement = match;
				if (typeof arg === 'string') {
					replacement = arg;
				}
				else if (typeof arg === 'number' || typeof arg === 'boolean' || arg === void 0 || arg === null) {
					replacement = String(arg);
				}
				return replacement;
			});
		}
		return result;
	}

	getMessage(extensionId: string, key: string, ...args: string[]): string {
		if (Language.isDefault()) {
			return this.format(key, args);
		}

		const str = this.bundleCache.get(extensionId)?.contents[key];
		if (!str) {
			console.warn(`Using default string since no string found in i18n bundle that has the key: ${key}`);
		}
		return this.format(str ?? key, args);
	}

	getBundleContents(extensionId: string): { [key: string]: string } {
		return this.bundleCache.get(extensionId)!.contents;
	}

	getBundleUri(extensionId: string): URI {
		return this.bundleCache.get(extensionId)!.uri;
	}

	abstract initializeLocalizedMessages(extension: IExtensionDescription): Promise<void>;
}

export const IExtHostLocalizationService = createDecorator<IExtHostLocalizationService>('IExtHostLocalizationService');
export interface IExtHostLocalizationService extends AbstractExtHostLocalizationService { }
