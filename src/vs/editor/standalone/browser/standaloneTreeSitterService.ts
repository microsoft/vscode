/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns
import type { Parser } from '@vscode/tree-sitter-wasm';
import { Event } from 'vs/base/common/event';
import { ITextModel } from 'vs/editor/common/model';
import { ITreeSitterParseResult, ITreeSitterParserService } from 'vs/editor/common/services/treeSitterParserService';

/**
 * The monaco build doesn't like the dynamic import of tree sitter in the real service.
 * We use a dummy sertive here to make the build happy.
 */
export class StandaloneTreeSitterParserService implements ITreeSitterParserService {
	readonly _serviceBrand: undefined;
	onDidAddLanguage: Event<{ id: string; language: Parser.Language }> = Event.None;

	getOrInitLanguage(_languageId: string): Parser.Language | undefined {
		return undefined;
	}
	getParseResult(textModel: ITextModel): ITreeSitterParseResult | undefined {
		return undefined;
	}
}
