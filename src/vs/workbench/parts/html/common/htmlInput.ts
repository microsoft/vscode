/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';

export class HtmlInput extends ResourceEditorInput {
	private _scrollYPercentage: number = 0;

	get scrollYPercentage(): number { return this._scrollYPercentage; }

	updateScroll(scrollYPercentage: number) {
		this._scrollYPercentage = scrollYPercentage;
	}
}
