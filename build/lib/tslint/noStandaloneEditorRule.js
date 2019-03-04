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
        if (/vs(\/|\\)editor/.test(sourceFile.fileName)) {
            // the vs/editor folder is allowed to use the standalone editor
            return [];
        }
        return this.applyWithWalker(new NoStandaloneEditorRuleWalker(sourceFile, this.getOptions()));
    }
}
exports.Rule = Rule;
class NoStandaloneEditorRuleWalker extends Lint.RuleWalker {
    constructor(file, opts) {
        super(file, opts);
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
        if (/vs(\/|\\)editor(\/|\\)standalone/.test(path)
            || /vs(\/|\\)editor(\/|\\)common(\/|\\)standalone/.test(path)
            || /vs(\/|\\)editor(\/|\\)editor.api/.test(path)
            || /vs(\/|\\)editor(\/|\\)editor.main/.test(path)
            || /vs(\/|\\)editor(\/|\\)editor.worker/.test(path)) {
            this.addFailure(this.createFailure(node.getStart(), node.getWidth(), `Not allowed to import standalone editor modules. See https://github.com/Microsoft/vscode/wiki/Code-Organization`));
        }
    }
}
