/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { CommonEditorConfiguration } from 'vs/editor/common/config/commonEditorConfig';
import { IEditorOptions } from 'vs/editor/common/editorCommon';
import { FontInfo, BareFontInfo } from 'vs/editor/common/config/fontInfo';

export class TestConfiguration extends CommonEditorConfiguration {

	constructor(opts: IEditorOptions) {
		super(opts);
	}

	protected _getEditorClassName(theme: string, fontLigatures: boolean): string {
		return '';
	}

	protected getOuterWidth(): number {
		return 100;
	}

	protected getOuterHeight(): number {
		return 100;
	}

	protected _getCanUseTranslate3d(): boolean {
		return true;
	}

	protected _getPixelRatio(): number {
		return 1;
	}

	protected readConfiguration(styling: BareFontInfo): FontInfo {
		return new FontInfo({
			zoomLevel: 0,
			fontFamily: 'mockFont',
			fontWeight: 'normal',
			fontSize: 14,
			lineHeight: 19,
			isMonospace: true,
			typicalHalfwidthCharacterWidth: 10,
			typicalFullwidthCharacterWidth: 20,
			spaceWidth: 10,
			maxDigitWidth: 10,
		}, true);
	}

	protected getZoomLevel(): number {
		return 0;
	}
}
