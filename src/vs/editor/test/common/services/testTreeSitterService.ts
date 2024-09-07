/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Parser } from '@vscode/tree-sitter-wasm';
import { Event } from '../../../../base/common/event.js';
import { ITextModel } from '../../../common/model.js';
import { ITreeSitterParserService, ITreeSitterParseResult } from '../../../common/services/treeSitterParserService.js';

export class TestTreeSitterParserService implements ITreeSitterParserService {
	onDidAddLanguage: Event<{ id: string; language: Parser.Language }> = Event.None;
	_serviceBrand: undefined;
	getOrInitLanguage(languageId: string): Parser.Language | undefined {
		throw new Error('Method not implemented.');
	}
	waitForLanguage(languageId: string): Promise<Parser.Language | undefined> {
		throw new Error('Method not implemented.');
	}
	getParseResult(textModel: ITextModel): ITreeSitterParseResult | undefined {
		throw new Error('Method not implemented.');
	}

}
