/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as lsp from 'vscode-languageserver-types';
import { MdDocumentSymbolProvider } from './languageFeatures/documentSymbols';
import { ILogger } from './logging';
import { IMdParser } from './parser';
import { MdTableOfContentsProvider } from './tableOfContents';
import { ITextDocument } from './types/textDocument';
import { IMdWorkspace } from './workspace';

// Types
export * from './parser';
export * from './slugify';
export * from './tableOfContents';
export * from './workspace';
export * from './logging';

// Common
export * from './types/location';
export * from './types/position';
export * from './types/range';
export * from './types/textDocument';
export * from './types/uri';


// Language service

export interface IMdLanguageService {
	provideDocumentSymbols(document: ITextDocument): Promise<lsp.DocumentSymbol[]>;
}

export function createLanguageService(workspace: IMdWorkspace, parser: IMdParser, logger: ILogger): IMdLanguageService {
	const tocProvider = new MdTableOfContentsProvider(parser, workspace, logger);
	const docSymbolProvider = new MdDocumentSymbolProvider(tocProvider, logger);

	return {
		provideDocumentSymbols(document) {
			return docSymbolProvider.provideDocumentSymbols(document);
		},
	};
}
