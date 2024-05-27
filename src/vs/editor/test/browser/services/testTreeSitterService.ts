/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppResourcePath } from 'vs/base/common/network';
import { Parser } from 'vs/base/common/web-tree-sitter/tree-sitter-web';
import { ITextModel } from 'vs/editor/common/model';
import { ITreeSitterParserService } from 'vs/editor/common/services/treeSitterParserService';

export class TestTreeSitterParserService implements ITreeSitterParserService {
	getLanguage(model: ITextModel): Parser.Language | undefined {
		throw new Error('Method not implemented.');
	}
	getLanguageLocation(languageId: string): AppResourcePath {
		throw new Error('Method not implemented.');
	}
	readonly _serviceBrand: undefined;

	public initTreeSitter(): Promise<void> {
		return Promise.resolve();
	}

	public getTree(_model: ITextModel): Parser.Tree | undefined {
		return undefined;
	}
}
