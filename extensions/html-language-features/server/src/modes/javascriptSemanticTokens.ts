/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument, Range } from './languageModes';
import * as ts from 'typescript';

export function getSemanticTokens(jsLanguageService: ts.LanguageService, currentTextDocument: TextDocument, fileName: string, ranges: Range[]) {
	const result = [];

	for (let range of ranges) {
		const start = currentTextDocument.offsetAt(range.start), length = currentTextDocument.offsetAt(range.end) - start;
		const tokens = jsLanguageService.getSemanticClassifications(fileName, { start, length });

		let prefLine = 0;
		let prevChar = 0;

		for (let token of tokens) {
			const m = tokenMapping[token.classificationType];
			if (m) {
				const startPos = currentTextDocument.positionAt(token.textSpan.start);
				if (prefLine !== startPos.line) {
					prevChar = 0;
				}
				result.push(startPos.line - prefLine); // line delta
				result.push(startPos.character - prevChar); // line delta
				result.push(token.textSpan.length); // lemgth
				result.push(tokenTypes.indexOf(m)); // tokenType
				result.push(0); // tokenModifier

				prefLine = startPos.line;
				prevChar = startPos.character;
			}

		}
	}
	return result;
}

export function getSemanticTokenLegend() {
	return { types: tokenTypes, modifiers: tokenModifiers };
}


const tokenTypes: string[] = ['class', 'enum', 'interface', 'namespace', 'parameterType', 'type', 'parameter'];
const tokenModifiers: string[] = [];
const tokenMapping: { [name: string]: string } = {
	[ts.ClassificationTypeNames.className]: 'class',
	[ts.ClassificationTypeNames.enumName]: 'enum',
	[ts.ClassificationTypeNames.interfaceName]: 'interface',
	[ts.ClassificationTypeNames.moduleName]: 'namespace',
	[ts.ClassificationTypeNames.typeParameterName]: 'parameterType',
	[ts.ClassificationTypeNames.typeAliasName]: 'type',
	[ts.ClassificationTypeNames.parameterName]: 'parameter'
};
