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
var path_1 = require("path");
var Rule = (function (_super) {
    __extends(Rule, _super);
    function Rule() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    Rule.prototype.apply = function (sourceFile) {
        var parts = path_1.dirname(sourceFile.fileName).split(/\\|\//);
        var ruleArgs = this.getOptions().ruleArguments[0];
        var config;
        for (var i = parts.length - 1; i >= 0; i--) {
            if (ruleArgs[parts[i]]) {
                config = {
                    allowed: new Set(ruleArgs[parts[i]]).add(parts[i]),
                    disallowed: new Set()
                };
                Object.keys(ruleArgs).forEach(function (key) {
                    if (!config.allowed.has(key)) {
                        config.disallowed.add(key);
                    }
                });
                break;
            }
        }
        if (!config) {
            return [];
        }
        return this.applyWithWalker(new LayeringRule(sourceFile, config, this.getOptions()));
    };
    return Rule;
}(Lint.Rules.AbstractRule));
exports.Rule = Rule;
var LayeringRule = (function (_super) {
    __extends(LayeringRule, _super);
    function LayeringRule(file, config, opts) {
        var _this = _super.call(this, file, opts) || this;
        _this._config = config;
        return _this;
    }
    LayeringRule.prototype.visitImportDeclaration = function (node) {
        var path = node.moduleSpecifier.getText();
        // remove quotes
        path = path.slice(1, -1);
        if (path[0] === '.') {
            path = path_1.join(path_1.dirname(node.getSourceFile().fileName), path);
        }
        var parts = path_1.dirname(path).split(/\\|\//);
        for (var i = parts.length - 1; i >= 0; i--) {
            var part = parts[i];
            if (this._config.allowed.has(part)) {
                // GOOD - same layer
                return;
            }
            if (this._config.disallowed.has(part)) {
                // BAD - wrong layer
                var message = "Bad layering. You are not allowed to access '" + part + "' from here, allowed layers are: [" + LayeringRule._print(this._config.allowed) + "]";
                this.addFailure(this.createFailure(node.getStart(), node.getWidth(), message));
                return;
            }
        }
    };
    LayeringRule._print = function (set) {
        var r = [];
        set.forEach(function (e) { return r.push(e); });
        return r.join(', ');
    };
    return LayeringRule;
}(Lint.RuleWalker));
