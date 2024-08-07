/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Parser } from '@vscode/tree-sitter-wasm';
import { ITextModel } from 'vs/editor/common/model';
import { ITreeSitterParserService, ITreeSitterTree } from 'vs/editor/common/services/treeSitterParserService';

export class TestTreeSitterParserService implements ITreeSitterParserService {
	_serviceBrand: undefined;
	getLanguage(languageId: string): Parser.Language | boolean {
		throw new Error('Method not implemented.');
	}
	waitForLanguage(languageId: string): Promise<Parser.Language | undefined> {
		throw new Error('Method not implemented.');
	}
	getTree(textModel: ITextModel): ITreeSitterTree | undefined {
		throw new Error('Method not implemented.');
	}

}
