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
var path_1 = require("path");
var Lint = require("tslint");
var Rule = (function (_super) {
    __extends(Rule, _super);
    function Rule() {
        return _super.apply(this, arguments) || this;
    }
    Rule.prototype.apply = function (sourceFile) {
        return this.applyWithWalker(new ImportPatterns(sourceFile, this.getOptions()));
    };
    return Rule;
}(Lint.Rules.AbstractRule));
exports.Rule = Rule;
var ImportPatterns = (function (_super) {
    __extends(ImportPatterns, _super);
    function ImportPatterns(file, opts) {
        var _this = _super.call(this, file, opts) || this;
        _this.imports = Object.create(null);
        return _this;
    }
    ImportPatterns.prototype.visitImportDeclaration = function (node) {
        var path = node.moduleSpecifier.getText();
        // remove quotes
        path = path.slice(1, -1);
        if (path[0] === '.') {
            path = path_1.join(path_1.dirname(node.getSourceFile().fileName), path);
        }
        if (this.imports[path]) {
            this.addFailure(this.createFailure(node.getStart(), node.getWidth(), "Duplicate imports for '" + path + "'."));
        }
        this.imports[path] = true;
    };
    return ImportPatterns;
}(Lint.RuleWalker));
