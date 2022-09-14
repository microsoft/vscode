/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Parser = require('web-tree-sitter');
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ITextModel } from 'vs/editor/common/model';

export class TreeSitterFoldingTree {

	private readonly _disposableStore: DisposableStore = new DisposableStore();

	constructor(
		_model: ITextModel,
		_language: Parser.Language,
	) {

	}

	public dispose() {
		this._disposableStore.clear();
	}
}
