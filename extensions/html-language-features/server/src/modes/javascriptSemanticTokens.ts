/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument, SemanticTokenData } from './languageModes';
import * as ts from 'typescript';

export function getSemanticTokenLegend() {
	if (tokenTypes.length !== TokenType._) {
		console.warn('TokenType has added new entries.');
	}
	if (tokenModifiers.length !== TokenModifier._) {
		console.warn('TokenModifier has added new entries.');
	}
	return { types: tokenTypes, modifiers: tokenModifiers };
}

export function* getSemanticTokens(jsLanguageService: ts.LanguageService, document: TextDocument, fileName: string): Iterable<SemanticTokenData> {
	const { spans } = jsLanguageService.getEncodedSemanticClassifications(fileName, { start: 0, length: document.getText().length }, '2020' as ts.SemanticClassificationFormat);

	for (let i = 0; i < spans.length;) {
		const offset = spans[i++];
		const length = spans[i++];
		const tsClassification = spans[i++];

		const tokenType = getTokenTypeFromClassification(tsClassification);
		if (tokenType === undefined) {
			continue;
		}

		const tokenModifiers = getTokenModifierFromClassification(tsClassification);
		const startPos = document.positionAt(offset);
		yield {
			start: startPos,
			length: length,
			typeIdx: tokenType,
			modifierSet: tokenModifiers
		};
	}
}


// typescript encodes type and modifiers in the classification:
// TSClassification = (TokenType + 1) << 8 + TokenModifier

const enum TokenType {
	class = 0,
	enum = 1,
	interface = 2,
	namespace = 3,
	typeParameter = 4,
	type = 5,
	parameter = 6,
	variable = 7,
	enumMember = 8,
	property = 9,
	function = 10,
	method = 11,
	_ = 12
}

const enum TokenModifier {
	declaration = 0,
	static = 1,
	async = 2,
	readonly = 3,
	defaultLibrary = 4,
	local = 5,
	_ = 6
}

const enum TokenEncodingConsts {
	typeOffset = 8,
	modifierMask = 255
}

function getTokenTypeFromClassification(tsClassification: number): number | undefined {
	if (tsClassification > TokenEncodingConsts.modifierMask) {
		return (tsClassification >> TokenEncodingConsts.typeOffset) - 1;
	}
	return undefined;
}

function getTokenModifierFromClassification(tsClassification: number) {
	return tsClassification & TokenEncodingConsts.modifierMask;
}

const tokenTypes: string[] = [];
tokenTypes[TokenType.class] = 'class';
tokenTypes[TokenType.enum] = 'enum';
tokenTypes[TokenType.interface] = 'interface';
tokenTypes[TokenType.namespace] = 'namespace';
tokenTypes[TokenType.typeParameter] = 'typeParameter';
tokenTypes[TokenType.type] = 'type';
tokenTypes[TokenType.parameter] = 'parameter';
tokenTypes[TokenType.variable] = 'variable';
tokenTypes[TokenType.enumMember] = 'enumMember';
tokenTypes[TokenType.property] = 'property';
tokenTypes[TokenType.function] = 'function';
tokenTypes[TokenType.method] = 'method';

const tokenModifiers: string[] = [];
tokenModifiers[TokenModifier.async] = 'async';
tokenModifiers[TokenModifier.declaration] = 'declaration';
tokenModifiers[TokenModifier.readonly] = 'readonly';
tokenModifiers[TokenModifier.static] = 'static';
tokenModifiers[TokenModifier.local] = 'local';
tokenModifiers[TokenModifier.defaultLibrary] = 'defaultLibrary';
