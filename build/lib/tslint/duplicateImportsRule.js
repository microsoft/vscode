"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
const Lint = require("tslint");
class Rule extends Lint.Rules.AbstractRule {
    apply(sourceFile) {
        return this.applyWithWalker(new ImportPatterns(sourceFile, this.getOptions()));
    }
}
exports.Rule = Rule;
class ImportPatterns extends Lint.RuleWalker {
    constructor(file, opts) {
        super(file, opts);
        this.imports = Object.create(null);
    }
    visitImportDeclaration(node) {
        let path = node.moduleSpecifier.getText();
        // remove quotes
        path = path.slice(1, -1);
        if (path[0] === '.') {
            path = path_1.join(path_1.dirname(node.getSourceFile().fileName), path);
        }
        if (this.imports[path]) {
            this.addFailure(this.createFailure(node.getStart(), node.getWidth(), `Duplicate imports for '${path}'.`));
        }
        this.imports[path] = true;
    }
}
