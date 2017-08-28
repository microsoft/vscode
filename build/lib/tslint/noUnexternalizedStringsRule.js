"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var ts = require("typescript");
var Lint = require("tslint");
/**
 * Implementation of the no-unexternalized-strings rule.
 */
var Rule = (function (_super) {
    __extends(Rule, _super);
    function Rule() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    Rule.prototype.apply = function (sourceFile) {
        return this.applyWithWalker(new NoUnexternalizedStringsRuleWalker(sourceFile, this.getOptions()));
    };
    return Rule;
}(Lint.Rules.AbstractRule));
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
var NoUnexternalizedStringsRuleWalker = (function (_super) {
    __extends(NoUnexternalizedStringsRuleWalker, _super);
    function NoUnexternalizedStringsRuleWalker(file, opts) {
        var _this = _super.call(this, file, opts) || this;
        _this.signatures = Object.create(null);
        _this.ignores = Object.create(null);
        _this.messageIndex = undefined;
        _this.keyIndex = undefined;
        _this.usedKeys = Object.create(null);
        var options = _this.getOptions();
        var first = options && options.length > 0 ? options[0] : null;
        if (first) {
            if (Array.isArray(first.signatures)) {
                first.signatures.forEach(function (signature) { return _this.signatures[signature] = true; });
            }
            if (Array.isArray(first.ignores)) {
                first.ignores.forEach(function (ignore) { return _this.ignores[ignore] = true; });
            }
            if (typeof first.messageIndex !== 'undefined') {
                _this.messageIndex = first.messageIndex;
            }
            if (typeof first.keyIndex !== 'undefined') {
                _this.keyIndex = first.keyIndex;
            }
        }
        return _this;
    }
    NoUnexternalizedStringsRuleWalker.prototype.visitSourceFile = function (node) {
        var _this = this;
        _super.prototype.visitSourceFile.call(this, node);
        Object.keys(this.usedKeys).forEach(function (key) {
            var occurrences = _this.usedKeys[key];
            if (occurrences.length > 1) {
                occurrences.forEach(function (occurrence) {
                    _this.addFailure((_this.createFailure(occurrence.key.getStart(), occurrence.key.getWidth(), "Duplicate key " + occurrence.key.getText() + " with different message value.")));
                });
            }
        });
    };
    NoUnexternalizedStringsRuleWalker.prototype.visitStringLiteral = function (node) {
        this.checkStringLiteral(node);
        _super.prototype.visitStringLiteral.call(this, node);
    };
    NoUnexternalizedStringsRuleWalker.prototype.checkStringLiteral = function (node) {
        var text = node.getText();
        var doubleQuoted = text.length >= 2 && text[0] === NoUnexternalizedStringsRuleWalker.DOUBLE_QUOTE && text[text.length - 1] === NoUnexternalizedStringsRuleWalker.DOUBLE_QUOTE;
        var info = this.findDescribingParent(node);
        // Ignore strings in import and export nodes.
        if (info && info.isImport && doubleQuoted) {
            this.addFailureAtNode(node, NoUnexternalizedStringsRuleWalker.ImportFailureMessage, new Lint.Fix(NoUnexternalizedStringsRuleWalker.ImportFailureMessage, [
                this.createReplacement(node.getStart(), 1, '\''),
                this.createReplacement(node.getStart() + text.length - 1, 1, '\''),
            ]));
            return;
        }
        var callInfo = info ? info.callInfo : null;
        var functionName = callInfo ? callInfo.callExpression.expression.getText() : null;
        if (functionName && this.ignores[functionName]) {
            return;
        }
        if (doubleQuoted && (!callInfo || callInfo.argIndex === -1 || !this.signatures[functionName])) {
            var s = node.getText();
            var replacement = new Lint.Replacement(node.getStart(), node.getWidth(), "nls.localize('KEY-" + s.substring(1, s.length - 1) + "', " + s + ")");
            var fix = new Lint.Fix('Unexternalitzed string', [replacement]);
            this.addFailure(this.createFailure(node.getStart(), node.getWidth(), "Unexternalized string found: " + node.getText(), fix));
            return;
        }
        // We have a single quoted string outside a localize function name.
        if (!doubleQuoted && !this.signatures[functionName]) {
            return;
        }
        // We have a string that is a direct argument into the localize call.
        var keyArg = callInfo.argIndex === this.keyIndex
            ? callInfo.callExpression.arguments[this.keyIndex]
            : null;
        if (keyArg) {
            if (isStringLiteral(keyArg)) {
                this.recordKey(keyArg, this.messageIndex ? callInfo.callExpression.arguments[this.messageIndex] : undefined);
            }
            else if (isObjectLiteral(keyArg)) {
                for (var i = 0; i < keyArg.properties.length; i++) {
                    var property = keyArg.properties[i];
                    if (isPropertyAssignment(property)) {
                        var name_1 = property.name.getText();
                        if (name_1 === 'key') {
                            var initializer = property.initializer;
                            if (isStringLiteral(initializer)) {
                                this.recordKey(initializer, this.messageIndex ? callInfo.callExpression.arguments[this.messageIndex] : undefined);
                            }
                            break;
                        }
                    }
                }
            }
        }
        var messageArg = callInfo.argIndex === this.messageIndex
            ? callInfo.callExpression.arguments[this.messageIndex]
            : null;
        if (messageArg && messageArg !== node) {
            this.addFailure(this.createFailure(messageArg.getStart(), messageArg.getWidth(), "Message argument to '" + callInfo.callExpression.expression.getText() + "' must be a string literal."));
            return;
        }
    };
    NoUnexternalizedStringsRuleWalker.prototype.recordKey = function (keyNode, messageNode) {
        var text = keyNode.getText();
        var occurrences = this.usedKeys[text];
        if (!occurrences) {
            occurrences = [];
            this.usedKeys[text] = occurrences;
        }
        if (messageNode) {
            if (occurrences.some(function (pair) { return pair.message ? pair.message.getText() === messageNode.getText() : false; })) {
                return;
            }
        }
        occurrences.push({ key: keyNode, message: messageNode });
    };
    NoUnexternalizedStringsRuleWalker.prototype.findDescribingParent = function (node) {
        var parent;
        while ((parent = node.parent)) {
            var kind = parent.kind;
            if (kind === ts.SyntaxKind.CallExpression) {
                var callExpression = parent;
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
    };
    NoUnexternalizedStringsRuleWalker.ImportFailureMessage = 'Do not use double qoutes for imports.';
    NoUnexternalizedStringsRuleWalker.DOUBLE_QUOTE = '"';
    return NoUnexternalizedStringsRuleWalker;
}(Lint.RuleWalker));
