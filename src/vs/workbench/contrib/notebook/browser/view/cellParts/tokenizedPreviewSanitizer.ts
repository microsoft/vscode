/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as domSanitize from '../../../../../../base/browser/domSanitize.js';

/**
 * Returns a DomSanitizerConfig that preserves only the tokenization classes used by
 * Monaco's HTML tokenization output for a single-line preview and strips any others.
 *
 * Allowed:
 * - DIV: class "monaco-tokenized-source"
 * - SPAN: classes matching /mtk\d+/ and modifiers: mtki, mtkb, mtku, mtks
 */
export function getTokenizedPreviewSanitizerConfig(): domSanitize.DomSanitizerConfig {
	return {
		allowedAttributes: {
			augment: [{
				attributeName: 'class',
				shouldKeep: (element, data) => {
					const raw = (data.attrValue ?? '').trim();
					if (!raw) {
						return false;
					}
					const classes = raw.split(/\s+/).filter(c => !!c);
					if (element.tagName === 'DIV') {
						const keep = classes.filter(c => c === 'monaco-tokenized-source');
						return keep.length ? keep.join(' ') : false;
					}
					if (element.tagName === 'SPAN') {
						const keep = classes.filter(c => /^mtk\d+$/.test(c) || c === 'mtki' || c === 'mtkb' || c === 'mtku' || c === 'mtks');
						return keep.length ? keep.join(' ') : false;
					}
					return false;
				}
			}]
		}
	};
}
