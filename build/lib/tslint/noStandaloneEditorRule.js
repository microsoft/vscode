"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    }
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var ts = require("typescript");
var Lint = require("tslint");
var path_1 = require("path");
var Rule = /** @class */ (function (_super) {
    __extends(Rule, _super);
    function Rule() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    Rule.prototype.apply = function (sourceFile) {
        if (/vs(\/|\\)editor/.test(sourceFile.fileName)) {
            // the vs/editor folder is allowed to use the standalone editor
            return [];
        }
        return this.applyWithWalker(new NoStandaloneEditorRuleWalker(sourceFile, this.getOptions()));
    };
    return Rule;
}(Lint.Rules.AbstractRule));
exports.Rule = Rule;
var NoStandaloneEditorRuleWalker = /** @class */ (function (_super) {
    __extends(NoStandaloneEditorRuleWalker, _super);
    function NoStandaloneEditorRuleWalker(file, opts) {
        return _super.call(this, file, opts) || this;
    }
    NoStandaloneEditorRuleWalker.prototype.visitImportEqualsDeclaration = function (node) {
        if (node.moduleReference.kind === ts.SyntaxKind.ExternalModuleReference) {
            this._validateImport(node.moduleReference.expression.getText(), node);
        }
    };
    NoStandaloneEditorRuleWalker.prototype.visitImportDeclaration = function (node) {
        this._validateImport(node.moduleSpecifier.getText(), node);
    };
    NoStandaloneEditorRuleWalker.prototype.visitCallExpression = function (node) {
        _super.prototype.visitCallExpression.call(this, node);
        // import('foo') statements inside the code
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            var path = node.arguments[0];
            this._validateImport(path.getText(), node);
        }
    };
    NoStandaloneEditorRuleWalker.prototype._validateImport = function (path, node) {
        // remove quotes
        path = path.slice(1, -1);
        // resolve relative paths
        if (path[0] === '.') {
            path = path_1.join(this.getSourceFile().fileName, path);
        }
        if (/vs(\/|\\)editor(\/|\\)standalone/.test(path)
            || /vs(\/|\\)editor(\/|\\)common(\/|\\)standalone/.test(path)
            || /vs(\/|\\)editor(\/|\\)editor.api/.test(path)
            || /vs(\/|\\)editor(\/|\\)editor.main/.test(path)
            || /vs(\/|\\)editor(\/|\\)editor.worker/.test(path)) {
            this.addFailure(this.createFailure(node.getStart(), node.getWidth(), "Not allowed to import standalone editor modules. See https://github.com/Microsoft/vscode/wiki/Code-Organization"));
        }
    };
    return NoStandaloneEditorRuleWalker;
}(Lint.RuleWalker));
