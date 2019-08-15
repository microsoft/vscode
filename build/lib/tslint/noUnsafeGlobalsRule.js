"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const Lint = require("tslint");
const minimatch = require("minimatch");
class Rule extends Lint.Rules.AbstractRule {
    apply(sourceFile) {
        const configs = this.getOptions().ruleArguments;
        for (const config of configs) {
            if (minimatch(sourceFile.fileName, config.target)) {
                return this.applyWithWalker(new NoUnsafeGlobalsRuleWalker(sourceFile, this.getOptions(), config));
            }
        }
        return [];
    }
}
exports.Rule = Rule;
class NoUnsafeGlobalsRuleWalker extends Lint.RuleWalker {
    constructor(file, opts, _config) {
        super(file, opts);
        this._config = _config;
    }
    visitIdentifier(node) {
        if (this._config.unsafe.some(unsafe => unsafe === node.text)) {
            this.addFailureAtNode(node, `Unsafe global usage of ${node.text} in ${this._config.target}`);
        }
        super.visitIdentifier(node);
    }
}
