"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const ts = require("typescript");
const Lint = require("tslint");
class Rule extends Lint.Rules.AbstractRule {
    apply(sourceFile) {
        return this.applyWithWalker(new NewBufferRuleWalker(sourceFile, this.getOptions()));
    }
}
exports.Rule = Rule;
class NewBufferRuleWalker extends Lint.RuleWalker {
    visitNewExpression(node) {
        if (node.expression.kind === ts.SyntaxKind.Identifier && node.expression && node.expression.text === 'Buffer') {
            this.addFailureAtNode(node, '`new Buffer` is deprecated. Consider Buffer.From or Buffer.alloc instead.');
        }
        super.visitNewExpression(node);
    }
}
