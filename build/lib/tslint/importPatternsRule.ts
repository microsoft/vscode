/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import * as Lint from 'tslint';
import * as minimatch from 'minimatch';
import { join } from 'path';

interface ImportPatternsConfig {
	target: string;
	restrictions: string | string[];
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

	protected visitImportEqualsDeclaration(node: ts.ImportEqualsDeclaration): void {
		if (node.moduleReference.kind === ts.SyntaxKind.ExternalModuleReference) {
			this._validateImport(node.moduleReference.expression.getText(), node);
		}
	}

	protected visitImportDeclaration(node: ts.ImportDeclaration): void {
		this._validateImport(node.moduleSpecifier.getText(), node);
	}

	protected visitCallExpression(node: ts.CallExpression): void {
		super.visitCallExpression(node);

		// import('foo') statements inside the code
		if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
			const [path] = node.arguments;
			this._validateImport(path.getText(), node);
		}
	}

	private _validateImport(path: string, node: ts.Node): void {
		// remove quotes
		path = path.slice(1, -1);

		// resolve relative paths
		if (path[0] === '.') {
			path = join(this.getSourceFile().fileName, path);
		}

		let restrictions: string[];
		if (typeof this._config.restrictions === 'string') {
			restrictions = [this._config.restrictions];
		} else {
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
