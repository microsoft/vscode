/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var ts = require("typescript");
var Lint = require("tslint");
var Rule = (function (_super) {
    __extends(Rule, _super);
    function Rule() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    Rule.prototype.apply = function (sourceFile) {
        var allowed = this.getOptions().ruleArguments[0];
        return this.applyWithWalker(new AsyncRuleWalker(sourceFile, this.getOptions(), allowed));
    };
    return Rule;
}(Lint.Rules.AbstractRule));
exports.Rule = Rule;
var AsyncRuleWalker = (function (_super) {
    __extends(AsyncRuleWalker, _super);
    function AsyncRuleWalker(file, opts, allowed) {
        var _this = _super.call(this, file, opts) || this;
        _this.allowed = allowed;
        return _this;
    }
    AsyncRuleWalker.prototype.visitMethodDeclaration = function (node) {
        this.visitFunctionLikeDeclaration(node);
    };
    AsyncRuleWalker.prototype.visitFunctionDeclaration = function (node) {
        this.visitFunctionLikeDeclaration(node);
    };
    AsyncRuleWalker.prototype.visitFunctionLikeDeclaration = function (node) {
        var _this = this;
        var flags = ts.getCombinedModifierFlags(node);
        if (!(flags & ts.ModifierFlags.Async)) {
            return;
        }
        var path = node.getSourceFile().path;
        var pathParts = path.split(/\\|\//);
        if (pathParts.some(function (part) { return _this.allowed.some(function (allowed) { return part === allowed; }); })) {
            return;
        }
        var message = "You are not allowed to use async function in this layer. Allowed layers are: [" + this.allowed + "]";
        this.addFailureAtNode(node, message);
    };
    return AsyncRuleWalker;
}(Lint.RuleWalker));
