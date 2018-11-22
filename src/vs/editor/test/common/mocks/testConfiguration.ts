/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccessibilitySupport } from 'vs/base/common/platform';
import { CommonEditorConfiguration, IEnvConfiguration } from 'vs/editor/common/config/commonEditorConfig';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { BareFontInfo, FontInfo } from 'vs/editor/common/config/fontInfo';

export class TestConfiguration extends CommonEditorConfiguration {

	constructor(opts: IEditorOptions) {
		super(opts);
		this._recomputeOptions();
	}

	protected _getEnvConfiguration(): IEnvConfiguration {
		return {
			extraEditorClassName: '',
			outerWidth: 100,
			outerHeight: 100,
			emptySelectionClipboard: true,
			pixelRatio: 1,
			zoomLevel: 0,
			accessibilitySupport: AccessibilitySupport.Unknown
		};
	}

	protected readConfiguration(styling: BareFontInfo): FontInfo {
		return new FontInfo({
			zoomLevel: 0,
			fontFamily: 'mockFont',
			fontWeight: 'normal',
			fontSize: 14,
			lineHeight: 19,
			letterSpacing: 1.5,
			isMonospace: true,
			typicalHalfwidthCharacterWidth: 10,
			typicalFullwidthCharacterWidth: 20,
			canUseHalfwidthRightwardsArrow: true,
			spaceWidth: 10,
			maxDigitWidth: 10,
		}, true);
	}
}
