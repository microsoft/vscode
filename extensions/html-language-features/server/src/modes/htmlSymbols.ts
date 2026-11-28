/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageModes, SymbolInformation, TextDocument } from './languageModes.js';
import { pushAll } from '../utils/arrays.js';

export async function findDocumentSymbols(languageModes: LanguageModes, document: TextDocument, maxSymbols: number = 5000): Promise<SymbolInformation[]> {
	const symbols: SymbolInformation[] = [];
	if (maxSymbols <= 0) {
		return symbols;
	}
	for (const m of languageModes.getAllModesInDocument(document)) {
		if (m.findDocumentSymbols) {
			const modeSymbols = await m.findDocumentSymbols(document);
			if (modeSymbols) {
				const remaining = maxSymbols - symbols.length;
				if (modeSymbols.length > remaining) {
					for (let i = 0; i < remaining; i++) {
						symbols.push(modeSymbols[i]);
					}
					break;
				} else {
					pushAll(symbols, modeSymbols);
					if (symbols.length >= maxSymbols) {
						break;
					}
				}
			}
		}
	}
	return symbols;
}
