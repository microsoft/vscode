/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as URI from 'vscode-uri';
import { IUri } from '../types/uri';

const markdownFileExtensions = Object.freeze<string[]>([
	'.md',
	'.mkd',
	'.mdwn',
	'.mdown',
	'.markdown',
	'.markdn',
	'.mdtxt',
	'.mdtext',
	'.workbook',
]);

export function looksLikeMarkdownPath(resolvedHrefPath: IUri) {
	return markdownFileExtensions.includes(URI.Utils.extname(URI.URI.from(resolvedHrefPath)).toLowerCase());
}
