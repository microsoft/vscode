/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TreeSitterTokenizationRegistry } from 'vs/editor/common/languages';
import { ITreeSitterTokenizationService } from 'vs/workbench/services/treeSitter/browser/treeSitterTokenizationFeature';

export class TreeSitterTokenizationService implements ITreeSitterTokenizationService {
	readonly _serviceBrand: undefined;

	constructor() {
		// Eventually, this should actually use an extension point to add tree sitter grammars, but for now they are hard coded in core
		this._addGrammar('placeholder-language');
	}

	private _addGrammar(languageId: string) {
		TreeSitterTokenizationRegistry.register(languageId, {});
	}
}
