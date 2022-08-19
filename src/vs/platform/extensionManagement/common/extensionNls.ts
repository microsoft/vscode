/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { cloneAndChange } from 'vs/base/common/objects';
import { IExtensionManifest } from 'vs/platform/extensions/common/extensions';

const nlsRegex = /^%([\w\d.-]+)%$/i;

export interface ITranslations {
	[key: string]: string | { message: string; comment: string[] };
}

export function localizeManifest(manifest: IExtensionManifest, translations: ITranslations, fallbackTranslations?: ITranslations): IExtensionManifest {
	const patcher = (value: string): string | undefined => {
		if (typeof value !== 'string') {
			return undefined;
		}

		const match = nlsRegex.exec(value);

		if (!match) {
			return undefined;
		}

		const translation = translations?.[match[1]] ?? fallbackTranslations?.[match[1]] ?? value;
		return typeof translation === 'string' ? translation : (typeof translation.message === 'string' ? translation.message : value);
	};

	return cloneAndChange(manifest, patcher);
}
