/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMdParser } from '../parser';
import { githubSlugifier } from '../slugify';
import MarkdownIt = require('markdown-it');

export function createNewMarkdownEngine(): IMdParser {
	return {
		slugifier: githubSlugifier,
		async tokenize(document) {
			const md: MarkdownIt = MarkdownIt({});
			return md.parse(document.getText(), {});
		},
	};
}
