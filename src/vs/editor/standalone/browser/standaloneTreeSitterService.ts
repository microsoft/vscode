/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Parser } from '@vscode/tree-sitter-wasm';
import { Event } from '../../../base/common/event.js';
import { ITextModel } from '../../common/model.js';
import { ITextModelTreeSitter, ITreeSitterParseResult, ITreeSitterParserService } from '../../common/services/treeSitterParserService.js';
import { Range } from '../../common/core/range.js';

/**
 * The monaco build doesn't like the dynamic import of tree sitter in the real service.
 * We use a dummy sertive here to make the build happy.
 */
export class StandaloneTreeSitterParserService implements ITreeSitterParserService {
	getTextModelTreeSitter(textModel: ITextModel): ITextModelTreeSitter | undefined {
		return undefined;
	}
	async getTree(content: string, languageId: string): Promise<Parser.Tree | undefined> {
		return undefined;
	}
	onDidUpdateTree: Event<{ textModel: ITextModel; ranges: Range[] }> = Event.None;
	readonly _serviceBrand: undefined;
	onDidAddLanguage: Event<{ id: string; language: Parser.Language }> = Event.None;

	getOrInitLanguage(_languageId: string): Parser.Language | undefined {
		return undefined;
	}
	getParseResult(textModel: ITextModel): ITreeSitterParseResult | undefined {
		return undefined;
	}
}
