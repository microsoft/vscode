/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {CommonEditorConfiguration} from 'vs/editor/common/config/commonEditorConfig';
import {IEditorOptions, FontInfo, BareFontInfo} from 'vs/editor/common/editorCommon';

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

	protected readConfiguration(styling: BareFontInfo): FontInfo {
		return new FontInfo('mockFont', 14, 19, 10, 20, 10, 10);
	}
}
