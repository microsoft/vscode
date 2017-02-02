/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { cloneAndChange } from 'vs/base/common/objects';
import { IExtensionManifest } from 'vs/platform/extensionManagement/common/extensionManagement';

const nlsRegex = /^%([\w\d.]+)%$/i;

export interface ITranslations {
	[key: string]: string;
}

export function localizeManifest(manifest: IExtensionManifest, translations: ITranslations): IExtensionManifest {
	const patcher = value => {
		if (typeof value !== 'string') {
			return undefined;
		}

		const match = nlsRegex.exec(value);

		if (!match) {
			return undefined;
		}

		return translations[match[1]] || value;
	};

	return cloneAndChange(manifest, patcher);
}
