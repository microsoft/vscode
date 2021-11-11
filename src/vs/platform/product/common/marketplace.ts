/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProductConfiguration } from 'vs/base/common/product';

/**
 * Allows for overriding the extension gallery configuration via the
 * `'EXTENSIONS_GALLERY'` environment variable.
 *
 * @example
 * ```sh
 * export EXTENSIONS_GALLERY='{"serviceUrl": "https://extensions.coder.com/api"}'
 * ```
 */
export function parseExtensionsGalleryEnv(extensionsGalleryEnv: string): IProductConfiguration['extensionsGallery'] {
	return {
		serviceUrl: '',
		itemUrl: '',
		resourceUrlTemplate: '',
		controlUrl: '',
		recommendationsUrl: '',
		...JSON.parse(extensionsGalleryEnv),
	};
}
