"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const ts = require("typescript");
const Lint = require("tslint");
const path_1 = require("path");
class Rule extends Lint.Rules.AbstractRule {
    apply(sourceFile) {
        const parts = path_1.dirname(sourceFile.fileName).split(/\\|\//);
        const ruleArgs = this.getOptions().ruleArguments[0];
        let config;
        for (let i = parts.length - 1; i >= 0; i--) {
            if (ruleArgs[parts[i]]) {
                config = {
                    allowed: new Set(ruleArgs[parts[i]]).add(parts[i]),
                    disallowed: new Set()
                };
                Object.keys(ruleArgs).forEach(key => {
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
    }
}
exports.Rule = Rule;
class LayeringRule extends Lint.RuleWalker {
    constructor(file, config, opts) {
        super(file, opts);
        this._config = config;
    }
    visitImportEqualsDeclaration(node) {
        if (node.moduleReference.kind === ts.SyntaxKind.ExternalModuleReference) {
            this._validateImport(node.moduleReference.expression.getText(), node);
        }
    }
    visitImportDeclaration(node) {
        this._validateImport(node.moduleSpecifier.getText(), node);
    }
    visitCallExpression(node) {
        super.visitCallExpression(node);
        // import('foo') statements inside the code
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            const [path] = node.arguments;
            this._validateImport(path.getText(), node);
        }
    }
    _validateImport(path, node) {
        // remove quotes
        path = path.slice(1, -1);
        if (path[0] === '.') {
            path = path_1.join(path_1.dirname(node.getSourceFile().fileName), path);
        }
        const parts = path_1.dirname(path).split(/\\|\//);
        for (let i = parts.length - 1; i >= 0; i--) {
            const part = parts[i];
            if (this._config.allowed.has(part)) {
                // GOOD - same layer
                return;
            }
            if (this._config.disallowed.has(part)) {
                // BAD - wrong layer
                const message = `Bad layering. You are not allowed to access '${part}' from here, allowed layers are: [${LayeringRule._print(this._config.allowed)}]`;
                this.addFailure(this.createFailure(node.getStart(), node.getWidth(), message));
                return;
            }
        }
    }
    static _print(set) {
        const r = [];
        set.forEach(e => r.push(e));
        return r.join(', ');
    }
}
