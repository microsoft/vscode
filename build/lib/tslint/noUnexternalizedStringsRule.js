"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const ts = require("typescript");
const Lint = require("tslint");
/**
 * Implementation of the no-unexternalized-strings rule.
 */
class Rule extends Lint.Rules.AbstractRule {
    apply(sourceFile) {
        return this.applyWithWalker(new NoUnexternalizedStringsRuleWalker(sourceFile, this.getOptions()));
    }
}
exports.Rule = Rule;
function isStringLiteral(node) {
    return node && node.kind === ts.SyntaxKind.StringLiteral;
}
function isObjectLiteral(node) {
    return node && node.kind === ts.SyntaxKind.ObjectLiteralExpression;
}
function isPropertyAssignment(node) {
    return node && node.kind === ts.SyntaxKind.PropertyAssignment;
}
class NoUnexternalizedStringsRuleWalker extends Lint.RuleWalker {
    constructor(file, opts) {
        super(file, opts);
        this.signatures = Object.create(null);
        this.ignores = Object.create(null);
        this.messageIndex = undefined;
        this.keyIndex = undefined;
        this.usedKeys = Object.create(null);
        let options = this.getOptions();
        let first = options && options.length > 0 ? options[0] : null;
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
    }
    visitSourceFile(node) {
        super.visitSourceFile(node);
        Object.keys(this.usedKeys).forEach(key => {
            let occurrences = this.usedKeys[key];
            if (occurrences.length > 1) {
                occurrences.forEach(occurrence => {
                    this.addFailure((this.createFailure(occurrence.key.getStart(), occurrence.key.getWidth(), `Duplicate key ${occurrence.key.getText()} with different message value.`)));
                });
            }
        });
    }
    visitStringLiteral(node) {
        this.checkStringLiteral(node);
        super.visitStringLiteral(node);
    }
    checkStringLiteral(node) {
        let text = node.getText();
        let doubleQuoted = text.length >= 2 && text[0] === NoUnexternalizedStringsRuleWalker.DOUBLE_QUOTE && text[text.length - 1] === NoUnexternalizedStringsRuleWalker.DOUBLE_QUOTE;
        let info = this.findDescribingParent(node);
        // Ignore strings in import and export nodes.
        if (info && info.isImport && doubleQuoted) {
            const fix = [
                Lint.Replacement.replaceFromTo(node.getStart(), 1, '\''),
                Lint.Replacement.replaceFromTo(node.getStart() + text.length - 1, 1, '\''),
            ];
            this.addFailureAtNode(node, NoUnexternalizedStringsRuleWalker.ImportFailureMessage, fix);
            return;
        }
        let callInfo = info ? info.callInfo : null;
        let functionName = callInfo ? callInfo.callExpression.expression.getText() : null;
        if (functionName && this.ignores[functionName]) {
            return;
        }
        if (doubleQuoted && (!callInfo || callInfo.argIndex === -1 || !this.signatures[functionName])) {
            const s = node.getText();
            const fix = [
                Lint.Replacement.replaceFromTo(node.getStart(), node.getWidth(), `nls.localize('KEY-${s.substring(1, s.length - 1)}', ${s})`),
            ];
            this.addFailure(this.createFailure(node.getStart(), node.getWidth(), `Unexternalized string found: ${node.getText()}`, fix));
            return;
        }
        // We have a single quoted string outside a localize function name.
        if (!doubleQuoted && !this.signatures[functionName]) {
            return;
        }
        // We have a string that is a direct argument into the localize call.
        let keyArg = callInfo.argIndex === this.keyIndex
            ? callInfo.callExpression.arguments[this.keyIndex]
            : null;
        if (keyArg) {
            if (isStringLiteral(keyArg)) {
                this.recordKey(keyArg, this.messageIndex ? callInfo.callExpression.arguments[this.messageIndex] : undefined);
            }
            else if (isObjectLiteral(keyArg)) {
                for (let i = 0; i < keyArg.properties.length; i++) {
                    let property = keyArg.properties[i];
                    if (isPropertyAssignment(property)) {
                        let name = property.name.getText();
                        if (name === 'key') {
                            let initializer = property.initializer;
                            if (isStringLiteral(initializer)) {
                                this.recordKey(initializer, this.messageIndex ? callInfo.callExpression.arguments[this.messageIndex] : undefined);
                            }
                            break;
                        }
                    }
                }
            }
        }
        let messageArg = callInfo.argIndex === this.messageIndex
            ? callInfo.callExpression.arguments[this.messageIndex]
            : null;
        if (messageArg && messageArg !== node) {
            this.addFailure(this.createFailure(messageArg.getStart(), messageArg.getWidth(), `Message argument to '${callInfo.callExpression.expression.getText()}' must be a string literal.`));
            return;
        }
    }
    recordKey(keyNode, messageNode) {
        let text = keyNode.getText();
        let occurrences = this.usedKeys[text];
        if (!occurrences) {
            occurrences = [];
            this.usedKeys[text] = occurrences;
        }
        if (messageNode) {
            if (occurrences.some(pair => pair.message ? pair.message.getText() === messageNode.getText() : false)) {
                return;
            }
        }
        occurrences.push({ key: keyNode, message: messageNode });
    }
    findDescribingParent(node) {
        let parent;
        while ((parent = node.parent)) {
            let kind = parent.kind;
            if (kind === ts.SyntaxKind.CallExpression) {
                let callExpression = parent;
                return { callInfo: { callExpression: callExpression, argIndex: callExpression.arguments.indexOf(node) } };
            }
            else if (kind === ts.SyntaxKind.ImportEqualsDeclaration || kind === ts.SyntaxKind.ImportDeclaration || kind === ts.SyntaxKind.ExportDeclaration) {
                return { isImport: true };
            }
            else if (kind === ts.SyntaxKind.VariableDeclaration || kind === ts.SyntaxKind.FunctionDeclaration || kind === ts.SyntaxKind.PropertyDeclaration
                || kind === ts.SyntaxKind.MethodDeclaration || kind === ts.SyntaxKind.VariableDeclarationList || kind === ts.SyntaxKind.InterfaceDeclaration
                || kind === ts.SyntaxKind.ClassDeclaration || kind === ts.SyntaxKind.EnumDeclaration || kind === ts.SyntaxKind.ModuleDeclaration
                || kind === ts.SyntaxKind.TypeAliasDeclaration || kind === ts.SyntaxKind.SourceFile) {
                return null;
            }
            node = parent;
        }
    }
}
NoUnexternalizedStringsRuleWalker.ImportFailureMessage = 'Do not use double qoutes for imports.';
NoUnexternalizedStringsRuleWalker.DOUBLE_QUOTE = '"';
