/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppResourcePath } from 'vs/base/common/network';
import type { Parser } from '@vscode/tree-sitter-wasm';
import { ITextModel } from 'vs/editor/common/model';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ITreeSitterParserService = createDecorator<ITreeSitterParserService>('treeSitterParserService');

export interface ITreeSitterParserService {
	readonly _serviceBrand: undefined;
	initTreeSitter(): Promise<void>;
	getTree(model: ITextModel): Parser.Tree | undefined;
	getLanguage(model: ITextModel): Parser.Language | undefined;
	getLanguageLocation(languageId: string): AppResourcePath | undefined;
}
