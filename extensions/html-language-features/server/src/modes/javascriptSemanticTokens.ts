/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument, Range } from './languageModes';
import * as ts from 'typescript';

type SemanticTokenData = { offset: number, length: number, typeIdx: number, modifierSet: number };

export function getSemanticTokens(jsLanguageService: ts.LanguageService, currentTextDocument: TextDocument, fileName: string, ranges: Range[]) {
	//https://ts-ast-viewer.com/#code/AQ0g2CmAuwGbALzAJwG4BQZQGNwEMBnQ4AQQEYBmYAb2C22zgEtJwATJVTRxgcwD27AQAp8AGmAAjAJS0A9POB8+7NQ168oscAJz5wANXwAnLug2bsJmAFcTAO2XAA1MHyvgu-UdOeWbOw8ViAAvpagocBAA

	let resultTokens: SemanticTokenData[] = [];
	const tokens = jsLanguageService.getSemanticClassifications(fileName, { start: 0, length: currentTextDocument.getText().length });
	for (let token of tokens) {
		const typeIdx = tokenMapping[token.classificationType];
		if (typeIdx !== undefined) {
			resultTokens.push({ offset: token.textSpan.start, length: token.textSpan.length, typeIdx, modifierSet: 0 });
		}
	}

	resultTokens = resultTokens.sort((d1, d2) => d1.offset - d2.offset);
	const offsetRanges = ranges.map(r => ({ startOffset: currentTextDocument.offsetAt(r.start), endOffset: currentTextDocument.offsetAt(r.end) })).sort((d1, d2) => d1.startOffset - d2.startOffset);

	let rangeIndex = 0;
	let currRange = offsetRanges[rangeIndex++];

	let prefLine = 0;
	let prevChar = 0;

	let encodedResult: number[] = [];

	for (let k = 0; k < resultTokens.length && currRange; k++) {
		const curr = resultTokens[k];
		if (currRange.startOffset <= curr.offset && curr.offset + curr.length <= currRange.endOffset) {
			// token inside a range

			const startPos = currentTextDocument.positionAt(curr.offset);
			if (prefLine !== startPos.line) {
				prevChar = 0;
			}
			encodedResult.push(startPos.line - prefLine); // line delta
			encodedResult.push(startPos.character - prevChar); // line delta
			encodedResult.push(curr.length); // length
			encodedResult.push(curr.typeIdx); // tokenType
			encodedResult.push(curr.modifierSet); // tokenModifier

			prefLine = startPos.line;
			prevChar = startPos.character;

		} else if (currRange.endOffset >= curr.offset) {
			currRange = offsetRanges[rangeIndex++];
		}
	}
	return encodedResult;
}


export function getSemanticTokenLegend() {
	return { types: tokenTypes, modifiers: tokenModifiers };
}


const tokenTypes: string[] = ['class', 'enum', 'interface', 'namespace', 'parameterType', 'type', 'parameter'];
const tokenModifiers: string[] = [];

const tokenMapping: { [name: string]: number } = {
	[ts.ClassificationTypeNames.className]: tokenTypes.indexOf('class'),
	[ts.ClassificationTypeNames.enumName]: tokenTypes.indexOf('enum'),
	[ts.ClassificationTypeNames.interfaceName]: tokenTypes.indexOf('interface'),
	[ts.ClassificationTypeNames.moduleName]: tokenTypes.indexOf('namespace'),
	[ts.ClassificationTypeNames.typeParameterName]: tokenTypes.indexOf('parameterType'),
	[ts.ClassificationTypeNames.typeAliasName]: tokenTypes.indexOf('type'),
	[ts.ClassificationTypeNames.parameterName]: tokenTypes.indexOf('parameter')
};
