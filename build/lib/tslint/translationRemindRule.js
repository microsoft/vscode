"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const Lint = require("tslint");
const fs = require("fs");
class Rule extends Lint.Rules.AbstractRule {
    apply(sourceFile) {
        return this.applyWithWalker(new TranslationRemindRuleWalker(sourceFile, this.getOptions()));
    }
}
exports.Rule = Rule;
class TranslationRemindRuleWalker extends Lint.RuleWalker {
    constructor(file, opts) {
        super(file, opts);
    }
    visitImportDeclaration(node) {
        const declaration = node.moduleSpecifier.getText();
        if (declaration !== `'${TranslationRemindRuleWalker.NLS_MODULE}'`) {
            return;
        }
        this.visitImportLikeDeclaration(node);
    }
    visitImportEqualsDeclaration(node) {
        const reference = node.moduleReference.getText();
        if (reference !== `require('${TranslationRemindRuleWalker.NLS_MODULE}')`) {
            return;
        }
        this.visitImportLikeDeclaration(node);
    }
    visitImportLikeDeclaration(node) {
        const currentFile = node.getSourceFile().fileName;
        const matchService = currentFile.match(/vs\/workbench\/services\/\w+/);
        const matchPart = currentFile.match(/vs\/workbench\/parts\/\w+/);
        if (!matchService && !matchPart) {
            return;
        }
        const resource = matchService ? matchService[0] : matchPart[0];
        let resourceDefined = false;
        let json;
        try {
            json = fs.readFileSync('./build/lib/i18n.resources.json', 'utf8');
        }
        catch (e) {
            console.error('[translation-remind rule]: File with resources to pull from Transifex was not found. Aborting translation resource check for newly defined workbench part/service.');
            return;
        }
        const workbenchResources = JSON.parse(json).workbench;
        workbenchResources.forEach((existingResource) => {
            if (existingResource.name === resource) {
                resourceDefined = true;
                return;
            }
        });
        if (!resourceDefined) {
            this.addFailureAtNode(node, `Please add '${resource}' to ./build/lib/i18n.resources.json file to use translations here.`);
        }
    }
}
TranslationRemindRuleWalker.NLS_MODULE = 'vs/nls';
