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
var minimatch = require("minimatch");
var path_1 = require("path");
var Rule = /** @class */ (function (_super) {
    __extends(Rule, _super);
    function Rule() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    Rule.prototype.apply = function (sourceFile) {
        var configs = this.getOptions().ruleArguments;
        for (var _i = 0, configs_1 = configs; _i < configs_1.length; _i++) {
            var config = configs_1[_i];
            if (minimatch(sourceFile.fileName, config.target)) {
                return this.applyWithWalker(new ImportPatterns(sourceFile, this.getOptions(), config));
            }
        }
        return [];
    };
    return Rule;
}(Lint.Rules.AbstractRule));
exports.Rule = Rule;
var ImportPatterns = /** @class */ (function (_super) {
    __extends(ImportPatterns, _super);
    function ImportPatterns(file, opts, _config) {
        var _this = _super.call(this, file, opts) || this;
        _this._config = _config;
        return _this;
    }
    ImportPatterns.prototype.visitImportEqualsDeclaration = function (node) {
        if (node.moduleReference.kind === ts.SyntaxKind.ExternalModuleReference) {
            this._validateImport(node.moduleReference.expression.getText(), node);
        }
    };
    ImportPatterns.prototype.visitImportDeclaration = function (node) {
        this._validateImport(node.moduleSpecifier.getText(), node);
    };
    ImportPatterns.prototype.visitCallExpression = function (node) {
        _super.prototype.visitCallExpression.call(this, node);
        // import('foo') statements inside the code
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            var path = node.arguments[0];
            this._validateImport(path.getText(), node);
        }
    };
    ImportPatterns.prototype._validateImport = function (path, node) {
        // remove quotes
        path = path.slice(1, -1);
        // resolve relative paths
        if (path[0] === '.') {
            path = path_1.join(this.getSourceFile().fileName, path);
        }
        var restrictions;
        if (typeof this._config.restrictions === 'string') {
            restrictions = [this._config.restrictions];
        }
        else {
            restrictions = this._config.restrictions;
        }
        var matched = false;
        for (var _i = 0, restrictions_1 = restrictions; _i < restrictions_1.length; _i++) {
            var pattern = restrictions_1[_i];
            if (minimatch(path, pattern)) {
                matched = true;
                break;
            }
        }
        if (!matched) {
            // None of the restrictions matched
            this.addFailure(this.createFailure(node.getStart(), node.getWidth(), "Imports violates '" + restrictions.join(' or ') + "' restrictions. See https://github.com/Microsoft/vscode/wiki/Code-Organization"));
        }
    };
    return ImportPatterns;
}(Lint.RuleWalker));
