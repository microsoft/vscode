/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {CommonEditorConfiguration, ICSSConfig} from 'vs/editor/common/config/commonEditorConfig';
import {IEditorOptions, EditorStyling} from 'vs/editor/common/editorCommon';

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

	protected readConfiguration(styling: EditorStyling): ICSSConfig {
		// Doesn't really matter
		return {
			typicalHalfwidthCharacterWidth: 10,
			typicalFullwidthCharacterWidth: 20,
			spaceWidth: 10,
			maxDigitWidth: 10
		};
	}
}
