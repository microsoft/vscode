/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SingleTextEdit } from '../../../../common/core/textEdit.js';

export class InlineEdit {
	constructor(
		public readonly edit: SingleTextEdit,
	) { }

	public get range() {
		return this.edit.range;
	}

	public get text() {
		return this.edit.text;
	}
}
