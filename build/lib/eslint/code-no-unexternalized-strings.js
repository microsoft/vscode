"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var _a;
const experimental_utils_1 = require("@typescript-eslint/experimental-utils");
function isStringLiteral(node) {
    return !!node && node.type === experimental_utils_1.AST_NODE_TYPES.Literal && typeof node.value === 'string';
}
function isObjectLiteral(node) {
    return !!node && node.type === experimental_utils_1.AST_NODE_TYPES.ObjectExpression;
}
function isPropertyAssignment(node) {
    return !!node && node.type === experimental_utils_1.AST_NODE_TYPES.Property;
}
module.exports = new (_a = class NoUnexternalizedStringsRuleWalker {
        constructor() {
            this.signatures = Object.create(null);
            this.ignores = Object.create(null);
            this.usedKeys = Object.create(null);
            this.meta = {
                type: 'problem',
                schema: {},
                messages: {
                    badQuotes: 'Do not use double quotes for imports.',
                    unexternalized: 'Unexternalized string.',
                    duplicateKey: `Duplicate key '{{key}}' with different message value.`,
                    badKey: `The key {{key}} doesn't conform to a valid localize identifier`,
                    emptyKey: 'Key is empty.',
                    whitespaceKey: 'Key is only whitespace.',
                    badMessage: `Message argument to '{{message}}' must be a string literal.`
                }
            };
        }
        create(context) {
            const first = context.options[0];
            if (first) {
                if (Array.isArray(first.signatures)) {
                    first.signatures.forEach((signature) => this.signatures[signature] = true);
                }
                if (Array.isArray(first.ignores)) {
                    first.ignores.forEach((ignore) => this.ignores[ignore] = true);
                }
                if (typeof first.messageIndex !== 'undefined') {
                    this.messageIndex = first.messageIndex;
                }
                if (typeof first.keyIndex !== 'undefined') {
                    this.keyIndex = first.keyIndex;
                }
            }
            return {
                ['Program:exit']: () => {
                    this._checkProgramEnd(context);
                },
                ['Literal']: (node) => {
                    if (typeof node.value === 'string') {
                        this._checkStringLiteral(context, node);
                    }
                },
            };
        }
        _checkProgramEnd(context) {
            Object.keys(this.usedKeys).forEach(key => {
                // Keys are quoted.
                const identifier = key.substr(1, key.length - 2);
                const occurrences = this.usedKeys[key];
                // bad key
                if (!NoUnexternalizedStringsRuleWalker.IDENTIFIER.test(identifier)) {
                    context.report({
                        loc: occurrences[0].key.loc,
                        messageId: 'badKey',
                        data: { key: occurrences[0].key.value }
                    });
                }
                // duplicates key
                if (occurrences.length > 1) {
                    occurrences.forEach(occurrence => {
                        context.report({
                            loc: occurrence.key.loc,
                            messageId: 'duplicateKey',
                            data: { key: occurrence.key.value }
                        });
                    });
                }
            });
        }
        _checkStringLiteral(context, node) {
            var _a;
            const text = node.raw;
            const doubleQuoted = text.length >= 2 && text[0] === NoUnexternalizedStringsRuleWalker.DOUBLE_QUOTE && text[text.length - 1] === NoUnexternalizedStringsRuleWalker.DOUBLE_QUOTE;
            const info = this._findDescribingParent(node);
            // Ignore strings in import and export nodes.
            if (info && info.isImport && doubleQuoted) {
                context.report({
                    loc: node.loc,
                    messageId: 'badQuotes'
                });
                return;
            }
            const callInfo = info ? info.callInfo : null;
            const functionName = callInfo && isStringLiteral(callInfo.callExpression.callee)
                ? callInfo.callExpression.callee.value
                : null;
            if (functionName && this.ignores[functionName]) {
                return;
            }
            if (doubleQuoted && (!callInfo || callInfo.argIndex === -1 || !this.signatures[functionName])) {
                context.report({
                    loc: node.loc,
                    messageId: 'unexternalized'
                });
                return;
            }
            // We have a single quoted string outside a localize function name.
            if (!doubleQuoted && !this.signatures[functionName]) {
                return;
            }
            // We have a string that is a direct argument into the localize call.
            const keyArg = callInfo && callInfo.argIndex === this.keyIndex
                ? callInfo.callExpression.arguments[this.keyIndex]
                : null;
            if (keyArg) {
                if (isStringLiteral(keyArg)) {
                    this.recordKey(context, keyArg, this.messageIndex && callInfo ? callInfo.callExpression.arguments[this.messageIndex] : undefined);
                }
                else if (isObjectLiteral(keyArg)) {
                    for (const property of keyArg.properties) {
                        if (isPropertyAssignment(property)) {
                            const name = NoUnexternalizedStringsRuleWalker._getText(context.getSourceCode(), property.key);
                            if (name === 'key') {
                                const initializer = property.value;
                                if (isStringLiteral(initializer)) {
                                    this.recordKey(context, initializer, this.messageIndex && callInfo ? callInfo.callExpression.arguments[this.messageIndex] : undefined);
                                }
                                break;
                            }
                        }
                    }
                }
            }
            const messageArg = callInfo.callExpression.arguments[this.messageIndex];
            if (messageArg && !isStringLiteral(messageArg)) {
                context.report({
                    loc: messageArg.loc,
                    messageId: 'badMessage',
                    data: { message: NoUnexternalizedStringsRuleWalker._getText(context.getSourceCode(), (_a = callInfo) === null || _a === void 0 ? void 0 : _a.callExpression.callee) }
                });
                return;
            }
        }
        recordKey(context, keyNode, messageNode) {
            const text = keyNode.raw;
            // We have an empty key
            if (text.match(/(['"]) *\1/)) {
                if (messageNode) {
                    context.report({
                        loc: keyNode.loc,
                        messageId: 'whitespaceKey'
                    });
                }
                else {
                    context.report({
                        loc: keyNode.loc,
                        messageId: 'emptyKey'
                    });
                }
                return;
            }
            let occurrences = this.usedKeys[text];
            if (!occurrences) {
                occurrences = [];
                this.usedKeys[text] = occurrences;
            }
            if (messageNode) {
                if (occurrences.some(pair => pair.message ? NoUnexternalizedStringsRuleWalker._getText(context.getSourceCode(), pair.message) === NoUnexternalizedStringsRuleWalker._getText(context.getSourceCode(), messageNode) : false)) {
                    return;
                }
            }
            occurrences.push({ key: keyNode, message: messageNode });
        }
        _findDescribingParent(node) {
            let parent;
            while ((parent = node.parent)) {
                const kind = parent.type;
                if (kind === experimental_utils_1.AST_NODE_TYPES.CallExpression) {
                    const callExpression = parent;
                    return { callInfo: { callExpression: callExpression, argIndex: callExpression.arguments.indexOf(node) } };
                }
                else if (kind === experimental_utils_1.AST_NODE_TYPES.TSImportEqualsDeclaration || kind === experimental_utils_1.AST_NODE_TYPES.ImportDeclaration || kind === experimental_utils_1.AST_NODE_TYPES.ExportNamedDeclaration) {
                    return { isImport: true };
                }
                else if (kind === experimental_utils_1.AST_NODE_TYPES.VariableDeclaration || kind === experimental_utils_1.AST_NODE_TYPES.FunctionDeclaration || kind === experimental_utils_1.AST_NODE_TYPES.TSPropertySignature
                    || kind === experimental_utils_1.AST_NODE_TYPES.TSMethodSignature || kind === experimental_utils_1.AST_NODE_TYPES.TSInterfaceDeclaration
                    || kind === experimental_utils_1.AST_NODE_TYPES.ClassDeclaration || kind === experimental_utils_1.AST_NODE_TYPES.TSEnumDeclaration || kind === experimental_utils_1.AST_NODE_TYPES.TSModuleDeclaration
                    || kind === experimental_utils_1.AST_NODE_TYPES.TSTypeAliasDeclaration || kind === experimental_utils_1.AST_NODE_TYPES.Program) {
                    return null;
                }
                node = parent;
            }
            return null;
        }
        static _getText(source, node) {
            if (node.type === experimental_utils_1.AST_NODE_TYPES.Literal) {
                return String(node.value);
            }
            const start = source.getIndexFromLoc(node.loc.start);
            const end = source.getIndexFromLoc(node.loc.end);
            return source.getText().substring(start, end);
        }
    },
    _a.DOUBLE_QUOTE = '"',
    _a.IDENTIFIER = /^[_a-zA-Z0-9][ .\-_a-zA-Z0-9]*$/,
    _a);
