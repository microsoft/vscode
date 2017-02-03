/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import * as Lint from 'tslint';
import * as minimatch from 'minimatch';

interface ImportPatternsConfig {
	target: string;
	restrictions: string;
}


export class Rule extends Lint.Rules.AbstractRule {
	public apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {

		const configs = <ImportPatternsConfig[]>this.getOptions().ruleArguments;


		for (const config of configs) {
			if (minimatch(sourceFile.fileName, config.target)) {
				return this.applyWithWalker(new ImportPatterns(sourceFile, this.getOptions(), config));
			}
		}

		return [];
	}
}

class ImportPatterns extends Lint.RuleWalker {

	constructor(file: ts.SourceFile, opts: Lint.IOptions, private _config: ImportPatternsConfig) {
		super(file, opts);
	}

	protected visitImportDeclaration(node: ts.ImportDeclaration): void {
		let path = node.moduleSpecifier.getText();

		// remove quotes
		path = path.slice(1, -1);

		// ignore relative paths
		if (path[0] === '.') {
			return;
		}

		if (!minimatch(path, this._config.restrictions)) {
			this.addFailure(this.createFailure(node.getStart(), node.getWidth(), `Imports violates '${this._config.restrictions}'-restriction.`));
		}
	}
}
