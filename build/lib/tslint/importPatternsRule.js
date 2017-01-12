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
var Lint = require("tslint");
var minimatch = require("minimatch");
var Rule = (function (_super) {
    __extends(Rule, _super);
    function Rule() {
        return _super.apply(this, arguments) || this;
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
var ImportPatterns = (function (_super) {
    __extends(ImportPatterns, _super);
    function ImportPatterns(file, opts, _config) {
        var _this = _super.call(this, file, opts) || this;
        _this._config = _config;
        return _this;
    }
    ImportPatterns.prototype.visitImportDeclaration = function (node) {
        var path = node.moduleSpecifier.getText();
        // remove quotes
        path = path.slice(1, -1);
        // ignore relative paths
        if (path[0] === '.') {
            return;
        }
        if (!minimatch(path, this._config.restrictions)) {
            this.addFailure(this.createFailure(node.getStart(), node.getWidth(), "Imports violates '" + this._config.restrictions + "'-restriction."));
        }
    };
    return ImportPatterns;
}(Lint.RuleWalker));
