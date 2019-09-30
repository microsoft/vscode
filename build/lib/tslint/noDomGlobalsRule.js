"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const Lint = require("tslint");
const minimatch = require("minimatch");
const abstractGlobalsRule_1 = require("./abstractGlobalsRule");
class Rule extends Lint.Rules.TypedRule {
    applyWithProgram(sourceFile, program) {
        const configs = this.getOptions().ruleArguments;
        for (const config of configs) {
            if (minimatch(sourceFile.fileName, config.target)) {
                return this.applyWithWalker(new NoDOMGlobalsRuleWalker(sourceFile, program, this.getOptions(), config));
            }
        }
        return [];
    }
}
exports.Rule = Rule;
class NoDOMGlobalsRuleWalker extends abstractGlobalsRule_1.AbstractGlobalsRuleWalker {
    getDefinitionPattern() {
        return 'lib.dom.d.ts';
    }
    getDisallowedGlobals() {
        // intentionally not complete
        return [
            "window",
            "document",
            "HTMLElement"
        ];
    }
}
