/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TreeSitterTokenizationRegistry } from 'vs/editor/common/languages';
import { Parser } from 'vs/base/common/web-tree-sitter/tree-sitter-web';
import { AppResourcePath, FileAccess } from 'vs/base/common/network';
import { ITreeSitterTokenizationService } from 'vs/editor/common/services/treeSitterTokenizationFeature';

export class TreeSitterTokenizationService implements ITreeSitterTokenizationService {
	readonly _serviceBrand: undefined;
	private _init: Promise<void>;

	constructor() {
		this._init = Parser.init({
			locateFile(_file: string, _folder: string) {
				const wasmPath: AppResourcePath = `vs/base/common/web-tree-sitter/tree-sitter.wasm`;
				return FileAccess.asBrowserUri(wasmPath).toString(true);
			}
		});
		// Eventually, this should actually use an extension point to add tree sitter grammars, but for now they are hard coded in core
		this._addGrammar('html', 'tree-sitter-html');
	}

	public initTreeSitter(): Promise<void> {
		return this._init;
	}

	private _addGrammar(languageId: string, grammarName: string) {
		TreeSitterTokenizationRegistry.register(languageId, { name: grammarName });
	}
}
