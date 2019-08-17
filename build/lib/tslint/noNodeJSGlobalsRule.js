"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const Lint = require("tslint");
const minimatch = require("minimatch");
// https://nodejs.org/api/globals.html#globals_global_objects
const nodeJSGlobals = [
    "Buffer",
    "__dirname",
    "__filename",
    "clearImmediate",
    "exports",
    "global",
    "module",
    "process",
    "setImmediate"
];
class Rule extends Lint.Rules.TypedRule {
    applyWithProgram(sourceFile, program) {
        const configs = this.getOptions().ruleArguments;
        for (const config of configs) {
            if (minimatch(sourceFile.fileName, config.target)) {
                return this.applyWithWalker(new NoNodejsGlobalsRuleWalker(sourceFile, program, this.getOptions(), config));
            }
        }
        return [];
    }
}
exports.Rule = Rule;
class NoNodejsGlobalsRuleWalker extends Lint.RuleWalker {
    constructor(file, program, opts, _config) {
        super(file, opts);
        this.program = program;
        this._config = _config;
    }
    visitIdentifier(node) {
        if (nodeJSGlobals.some(nodeJSGlobal => nodeJSGlobal === node.text)) {
            if (this._config.allowed && this._config.allowed.some(allowed => allowed === node.text)) {
                return; // override
            }
            const checker = this.program.getTypeChecker();
            const symbol = checker.getSymbolAtLocation(node);
            if (symbol) {
                const valueDeclaration = symbol.valueDeclaration;
                if (valueDeclaration) {
                    const parent = valueDeclaration.parent;
                    if (parent) {
                        const sourceFile = parent.getSourceFile();
                        if (sourceFile) {
                            const fileName = sourceFile.fileName;
                            if (fileName && fileName.indexOf('@types/node') >= 0) {
                                this.addFailureAtNode(node, `Cannot use node.js global '${node.text}' in '${this._config.target}'`);
                            }
                        }
                    }
                }
            }
        }
        super.visitIdentifier(node);
    }
}
