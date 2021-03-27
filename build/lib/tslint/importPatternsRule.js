"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const ts = require("typescript");
const Lint = require("tslint");
const minimatch = require("minimatch");
const path_1 = require("path");
class Rule extends Lint.Rules.AbstractRule {
    apply(sourceFile) {
        const configs = this.getOptions().ruleArguments;
        for (const config of configs) {
            if (minimatch(sourceFile.fileName, config.target)) {
                return this.applyWithWalker(new ImportPatterns(sourceFile, this.getOptions(), config));
            }
        }
        return [];
    }
}
exports.Rule = Rule;
class ImportPatterns extends Lint.RuleWalker {
    constructor(file, opts, _config) {
        super(file, opts);
        this._config = _config;
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
        // resolve relative paths
        if (path[0] === '.') {
            path = path_1.join(this.getSourceFile().fileName, path);
        }
        let restrictions;
        if (typeof this._config.restrictions === 'string') {
            restrictions = [this._config.restrictions];
        }
        else {
            restrictions = this._config.restrictions;
        }
        let matched = false;
        for (const pattern of restrictions) {
            if (minimatch(path, pattern)) {
                matched = true;
                break;
            }
        }
        if (!matched) {
            // None of the restrictions matched
            this.addFailure(this.createFailure(node.getStart(), node.getWidth(), `Imports violates '${restrictions.join(' or ')}' restrictions. See https://github.com/Microsoft/vscode/wiki/Code-Organization`));
        }
    }
}
