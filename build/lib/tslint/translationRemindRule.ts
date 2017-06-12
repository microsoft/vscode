/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import * as Lint from 'tslint';
import * as fs from 'fs';

export class Rule extends Lint.Rules.AbstractRule {
	public apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
		return this.applyWithWalker(new TranslationRemindRuleWalker(sourceFile, this.getOptions()));
	}
}

class TranslationRemindRuleWalker extends Lint.RuleWalker {

	private static NLS_MODULE: string = 'vs/nls';

	constructor(file: ts.SourceFile, opts: Lint.IOptions) {
		super(file, opts);
	}

	protected visitImportDeclaration(node: ts.ImportDeclaration): void {
		const declaration = node.moduleSpecifier.getText();
		if (declaration !== `'${TranslationRemindRuleWalker.NLS_MODULE}'`) {
			return;
		}

		this.visitImportLikeDeclaration(node);
	}

    protected visitImportEqualsDeclaration(node: ts.ImportEqualsDeclaration): void {
		const reference = node.moduleReference.getText();
		if (reference !== `require('${TranslationRemindRuleWalker.NLS_MODULE}')`) {
			return;
		}

		this.visitImportLikeDeclaration(node);
	}

	private visitImportLikeDeclaration(node: ts.ImportDeclaration | ts.ImportEqualsDeclaration) {
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
		} catch (e) {
			console.error('[translation-remind rule]: File with resources to pull from Transifex was not found. Aborting translation resource check for newly defined workbench part/service.');
			return;
		}
		const workbenchResources = JSON.parse(json).workbench;

		workbenchResources.forEach(existingResource => {
			if (existingResource.name === resource) {
				resourceDefined = true;
				return;
			}
		});

		if (!resourceDefined) {
			this.addFailureAtNode(node, `Please add '${resource}' to ./builds/lib/i18n.resources.json file to use translations here.`);
		}
	}
}
