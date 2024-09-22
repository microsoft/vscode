/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorConfiguration, IEnvConfiguration } from '../../../browser/config/editorConfiguration.js';
import { EditorFontLigatures, EditorFontVariations } from '../../../common/config/editorOptions.js';
import { BareFontInfo, FontInfo } from '../../../common/config/fontInfo.js';
import { TestCodeEditorCreationOptions } from '../testCodeEditor.js';
import { AccessibilitySupport } from '../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';

export class TestConfiguration extends EditorConfiguration {

	constructor(opts: Readonly<TestCodeEditorCreationOptions>) {
		super(false, MenuId.EditorContext, opts, null, new TestAccessibilityService());
	}

	protected override _readEnvConfiguration(): IEnvConfiguration {
		const envConfig = (this.getRawOptions() as TestCodeEditorCreationOptions).envConfig;
		return {
			extraEditorClassName: envConfig?.extraEditorClassName ?? '',
			outerWidth: envConfig?.outerWidth ?? 100,
			outerHeight: envConfig?.outerHeight ?? 100,
			emptySelectionClipboard: envConfig?.emptySelectionClipboard ?? true,
			pixelRatio: envConfig?.pixelRatio ?? 1,
			accessibilitySupport: envConfig?.accessibilitySupport ?? AccessibilitySupport.Unknown
		};
	}

	protected override _readFontInfo(styling: BareFontInfo): FontInfo {
		return new FontInfo({
			pixelRatio: 1,
			fontFamily: 'mockFont',
			fontWeight: 'normal',
			fontSize: 14,
			fontFeatureSettings: EditorFontLigatures.OFF,
			fontVariationSettings: EditorFontVariations.OFF,
			lineHeight: 19,
			letterSpacing: 1.5,
			isMonospace: true,
			typicalHalfwidthCharacterWidth: 10,
			typicalFullwidthCharacterWidth: 20,
			canUseHalfwidthRightwardsArrow: true,
			spaceWidth: 10,
			middotWidth: 10,
			wsmiddotWidth: 10,
			maxDigitWidth: 10,
		}, true);
	}
}
