/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Parser } from '@vscode/tree-sitter-wasm';
import { ITextModel } from 'vs/editor/common/model';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const EDITOR_EXPERIMENTAL_PREFER_TREESITTER = 'editor.experimental.preferTreeSitter';

export const ITreeSitterParserService = createDecorator<ITreeSitterParserService>('treeSitterParserService');

export interface ITreeSitterParserService {
	readonly _serviceBrand: undefined;
	getLanguage(languageId: string): Parser.Language | boolean;
	waitForLanguage(languageId: string): Promise<Parser.Language | undefined>;
	getTree(textModel: ITextModel): ITreeSitterTree | undefined;
}

export interface ITreeSitterTree {
	readonly tree: Parser.Tree | undefined;
	readonly language: Parser.Language;
}

export interface ITreeChangedEvent {
	readonly ranges: {
		/**
		 * The start of the range (inclusive)
		 */
		readonly fromLineNumber: number;
		/**
		 * The end of the range (inclusive)
		 */
		readonly toLineNumber: number;
	}[];
}
