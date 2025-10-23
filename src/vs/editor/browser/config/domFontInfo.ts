/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode } from '../../../base/browser/fastDomNode.js';
import { BareFontInfo } from '../../common/config/fontInfo.js';

export function applyFontInfo(domNode: FastDomNode<HTMLElement> | HTMLElement, fontInfo: BareFontInfo): void {
	if (domNode instanceof FastDomNode) {
		domNode.setFontFamily(fontInfo.getMassagedFontFamily());
		domNode.setFontWeight(fontInfo.fontWeight);
		domNode.setFontSize(fontInfo.fontSize);
		domNode.setFontFeatureSettings(fontInfo.fontFeatureSettings);
		domNode.setFontVariationSettings(fontInfo.fontVariationSettings);
		domNode.setLineHeight(fontInfo.lineHeight);
		domNode.setLetterSpacing(fontInfo.letterSpacing);
	} else {
		domNode.style.fontFamily = fontInfo.getMassagedFontFamily();
		domNode.style.fontWeight = fontInfo.fontWeight;
		domNode.style.fontSize = fontInfo.fontSize + 'px';
		domNode.style.fontFeatureSettings = fontInfo.fontFeatureSettings;
		domNode.style.fontVariationSettings = fontInfo.fontVariationSettings;
		domNode.style.lineHeight = fontInfo.lineHeight + 'px';
		domNode.style.letterSpacing = fontInfo.letterSpacing + 'px';
	}
}
