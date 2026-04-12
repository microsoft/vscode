"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSemanticTokenLegend = getSemanticTokenLegend;
exports.getSemanticTokens = getSemanticTokens;
function getSemanticTokenLegend() {
    if (tokenTypes.length !== 12 /* TokenType._ */) {
        console.warn('TokenType has added new entries.');
    }
    if (tokenModifiers.length !== 6 /* TokenModifier._ */) {
        console.warn('TokenModifier has added new entries.');
    }
    return { types: tokenTypes, modifiers: tokenModifiers };
}
function* getSemanticTokens(jsLanguageService, document, fileName) {
    const { spans } = jsLanguageService.getEncodedSemanticClassifications(fileName, { start: 0, length: document.getText().length }, '2020');
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
function getTokenTypeFromClassification(tsClassification) {
    if (tsClassification > 255 /* TokenEncodingConsts.modifierMask */) {
        return (tsClassification >> 8 /* TokenEncodingConsts.typeOffset */) - 1;
    }
    return undefined;
}
function getTokenModifierFromClassification(tsClassification) {
    return tsClassification & 255 /* TokenEncodingConsts.modifierMask */;
}
const tokenTypes = [];
tokenTypes[0 /* TokenType.class */] = 'class';
tokenTypes[1 /* TokenType.enum */] = 'enum';
tokenTypes[2 /* TokenType.interface */] = 'interface';
tokenTypes[3 /* TokenType.namespace */] = 'namespace';
tokenTypes[4 /* TokenType.typeParameter */] = 'typeParameter';
tokenTypes[5 /* TokenType.type */] = 'type';
tokenTypes[6 /* TokenType.parameter */] = 'parameter';
tokenTypes[7 /* TokenType.variable */] = 'variable';
tokenTypes[8 /* TokenType.enumMember */] = 'enumMember';
tokenTypes[9 /* TokenType.property */] = 'property';
tokenTypes[10 /* TokenType.function */] = 'function';
tokenTypes[11 /* TokenType.method */] = 'method';
const tokenModifiers = [];
tokenModifiers[2 /* TokenModifier.async */] = 'async';
tokenModifiers[0 /* TokenModifier.declaration */] = 'declaration';
tokenModifiers[3 /* TokenModifier.readonly */] = 'readonly';
tokenModifiers[1 /* TokenModifier.static */] = 'static';
tokenModifiers[5 /* TokenModifier.local */] = 'local';
tokenModifiers[4 /* TokenModifier.defaultLibrary */] = 'defaultLibrary';
//# sourceMappingURL=javascriptSemanticTokens.js.map