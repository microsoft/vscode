/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SemanticTokenData, Range, TextDocument, LanguageModes, Position } from './languageModes';
import { beforeOrSame } from '../utils/positions';

interface LegendMapping {
	types: number[];
	modifiers: number[];
}

export interface SemanticTokenProvider {
	readonly legend: { types: string[]; modifiers: string[] };
	getSemanticTokens(document: TextDocument, ranges?: Range[]): number[];
}


export function newSemanticTokenProvider(languageModes: LanguageModes): SemanticTokenProvider {

	// build legend across language
	const types: string[] = [];
	const modifiers: string[] = [];

	const legendMappings: { [modeId: string]: LegendMapping } = {};

	for (let mode of languageModes.getAllModes()) {
		if (mode.getSemanticTokenLegend && mode.getSemanticTokens) {
			const legend = mode.getSemanticTokenLegend();
			const legendMapping: LegendMapping = { types: [], modifiers: [] };
			for (let type of legend.types) {
				let index = types.indexOf(type);
				if (index === -1) {
					index = types.length;
					types.push(type);
				}
				legendMapping.types.push(index);
			}
			for (let modifier of legend.modifiers) {
				let index = modifiers.indexOf(modifier);
				if (index === -1) {
					index = modifiers.length;
					modifiers.push(modifier);
				}
				legendMapping.modifiers.push(index);
			}
			legendMappings[mode.getId()] = legendMapping;
		}

	}

	return {
		legend: { types, modifiers },
		getSemanticTokens(document: TextDocument, ranges?: Range[]): number[] {
			const allTokens: SemanticTokenData[] = [];
			for (let mode of languageModes.getAllModesInDocument(document)) {
				if (mode.getSemanticTokens) {
					const mapping = legendMappings[mode.getId()];
					const tokens = mode.getSemanticTokens(document);
					for (let token of tokens) {
						allTokens.push(applyMapping(token, mapping));
					}
				}
			}
			return encodeAndFilterTokens(allTokens, ranges);
		}
	};
}

function applyMapping(token: SemanticTokenData, legendMapping: LegendMapping): SemanticTokenData {
	token.typeIdx = legendMapping.types[token.typeIdx];

	let modifierSet = token.modifierSet;
	if (modifierSet) {
		let index = 0;
		let result = 0;
		const mapping = legendMapping.modifiers;
		while (modifierSet > 0) {
			if ((modifierSet & 1) !== 0) {
				result = result + (1 << mapping[index]);
			}
			index++;
			modifierSet = modifierSet >> 1;
		}
		token.modifierSet = result;
	}
	return token;
}

const fullRange = [Range.create(Position.create(0, 0), Position.create(Number.MAX_VALUE, 0))];

function encodeAndFilterTokens(tokens: SemanticTokenData[], ranges?: Range[]): number[] {

	const resultTokens = tokens.sort((d1, d2) => d1.start.line - d2.start.line || d1.start.character - d2.start.character);
	if (ranges) {
		ranges = ranges.sort((d1, d2) => d1.start.line - d2.start.line || d1.start.character - d2.start.character);
	} else {
		ranges = fullRange;
	}

	let rangeIndex = 0;
	let currRange = ranges[rangeIndex++];

	let prefLine = 0;
	let prevChar = 0;

	let encodedResult: number[] = [];

	for (let k = 0; k < resultTokens.length && currRange; k++) {
		const curr = resultTokens[k];
		const start = curr.start;
		while (currRange && beforeOrSame(currRange.end, start)) {
			currRange = ranges[rangeIndex++];
		}
		if (currRange && beforeOrSame(currRange.start, start) && beforeOrSame({ line: start.line, character: start.character + curr.length }, currRange.end)) {
			// token inside a range

			if (prefLine !== start.line) {
				prevChar = 0;
			}
			encodedResult.push(start.line - prefLine); // line delta
			encodedResult.push(start.character - prevChar); // line delta
			encodedResult.push(curr.length); // length
			encodedResult.push(curr.typeIdx); // tokenType
			encodedResult.push(curr.modifierSet); // tokenModifier

			prefLine = start.line;
			prevChar = start.character;
		}
	}
	return encodedResult;
}


