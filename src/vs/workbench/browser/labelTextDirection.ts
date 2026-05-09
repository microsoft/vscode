/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorTextDirectionPreset, getConfiguredTextDirection, textDirectionToString } from '../../editor/common/core/textDirection.js';
import { TextDirection } from '../../editor/common/model.js';

export function applyConfiguredTextDirectionToElement(element: HTMLElement, text: string, preset: EditorTextDirectionPreset): void {
	if (!text) {
		element.removeAttribute('dir');
		element.style.removeProperty('unicode-bidi');
		return;
	}

	const direction = textDirectionToString(getConfiguredTextDirection(text, preset, TextDirection.LTR));
	element.setAttribute('dir', direction);

	if (preset === 'auto' || preset === 'auto-keep' || preset === 'auto-follow') {
		element.style.unicodeBidi = 'plaintext';
	} else {
		element.style.removeProperty('unicode-bidi');
	}
}
