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
var Lint = require("tslint");
var fs = require("fs");
var Rule = /** @class */ (function (_super) {
    __extends(Rule, _super);
    function Rule() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    Rule.prototype.apply = function (sourceFile) {
        return this.applyWithWalker(new TranslationRemindRuleWalker(sourceFile, this.getOptions()));
    };
    return Rule;
}(Lint.Rules.AbstractRule));
exports.Rule = Rule;
var TranslationRemindRuleWalker = /** @class */ (function (_super) {
    __extends(TranslationRemindRuleWalker, _super);
    function TranslationRemindRuleWalker(file, opts) {
        return _super.call(this, file, opts) || this;
    }
    TranslationRemindRuleWalker.prototype.visitImportDeclaration = function (node) {
        var declaration = node.moduleSpecifier.getText();
        if (declaration !== "'" + TranslationRemindRuleWalker.NLS_MODULE + "'") {
            return;
        }
        this.visitImportLikeDeclaration(node);
    };
    TranslationRemindRuleWalker.prototype.visitImportEqualsDeclaration = function (node) {
        var reference = node.moduleReference.getText();
        if (reference !== "require('" + TranslationRemindRuleWalker.NLS_MODULE + "')") {
            return;
        }
        this.visitImportLikeDeclaration(node);
    };
    TranslationRemindRuleWalker.prototype.visitImportLikeDeclaration = function (node) {
        var currentFile = node.getSourceFile().fileName;
        var matchService = currentFile.match(/vs\/workbench\/services\/\w+/);
        var matchPart = currentFile.match(/vs\/workbench\/parts\/\w+/);
        if (!matchService && !matchPart) {
            return;
        }
        var resource = matchService ? matchService[0] : matchPart[0];
        var resourceDefined = false;
        var json;
        try {
            json = fs.readFileSync('./build/lib/i18n.resources.json', 'utf8');
        }
        catch (e) {
            console.error('[translation-remind rule]: File with resources to pull from Transifex was not found. Aborting translation resource check for newly defined workbench part/service.');
            return;
        }
        var workbenchResources = JSON.parse(json).workbench;
        workbenchResources.forEach(function (existingResource) {
            if (existingResource.name === resource) {
                resourceDefined = true;
                return;
            }
        });
        if (!resourceDefined) {
            this.addFailureAtNode(node, "Please add '" + resource + "' to ./builds/lib/i18n.resources.json file to use translations here.");
        }
    };
    TranslationRemindRuleWalker.NLS_MODULE = 'vs/nls';
    return TranslationRemindRuleWalker;
}(Lint.RuleWalker));
