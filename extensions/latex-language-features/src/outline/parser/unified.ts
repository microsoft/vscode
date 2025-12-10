/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getParser } from '@unified-latex/unified-latex-util-parse';
import type { Root, MacroInfoRecord, EnvInfoRecord } from '@unified-latex/unified-latex-types';

let unifiedParser = getParser({ flags: { autodetectExpl3AndAtLetter: true } });

/**
 * Get the unified-latex parser instance
 * Used by modules that need direct parser access
 */
export function getParserInstance(): ReturnType<typeof getParser> {
	return unifiedParser;
}

/**
 * Parse LaTeX content to AST
 * Ported from latex-workshop unified parser
 */
export function parseLaTeX(content: string): Root {
	return unifiedParser.parse(content);
}

/**
 * Reset parser with custom macros and environments
 */
export function resetParser(macros?: MacroInfoRecord, environments?: EnvInfoRecord): void {
	unifiedParser = getParser({
		macros,
		environments,
		flags: { autodetectExpl3AndAtLetter: true }
	});
}

