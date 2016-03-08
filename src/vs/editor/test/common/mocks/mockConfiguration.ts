/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {CommonEditorConfiguration, ICSSConfig} from 'vs/editor/common/config/commonEditorConfig';
import {IEditorOptions} from 'vs/editor/common/editorCommon';

export class MockConfiguration extends CommonEditorConfiguration {

	constructor(opts:IEditorOptions) {
		super(opts);
	}

	protected _getEditorClassName(theme:string, fontLigatures:boolean): string {
		return '';
	}

	protected getOuterWidth(): number {
		return 100;
	}

	protected getOuterHeight(): number {
		return 100;
	}

	protected readConfiguration(editorClassName: string, fontFamily: string, fontSize: number, lineHeight: number): ICSSConfig {
		// Doesn't really matter
		return {
			typicalHalfwidthCharacterWidth: 10,
			typicalFullwidthCharacterWidth: 20,
			maxDigitWidth: 10,
			lineHeight: 20,
			font: 'mockFont',
			fontSize: 20
		};
	}
}
