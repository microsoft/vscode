/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import * as Lint from 'tslint';
import { join } from 'path';

export class Rule extends Lint.Rules.AbstractRule {
	public apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
		if (/vs(\/|\\)editor/.test(sourceFile.fileName)) {
			// the vs/editor folder is allowed to use the standalone editor
			return [];
		}
		return this.applyWithWalker(new NoStandaloneEditorRuleWalker(sourceFile, this.getOptions()));
	}
}

class NoStandaloneEditorRuleWalker extends Lint.RuleWalker {

	constructor(file: ts.SourceFile, opts: Lint.IOptions) {
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

		if (
			/vs(\/|\\)editor(\/|\\)standalone/.test(path)
			|| /vs(\/|\\)editor(\/|\\)common(\/|\\)standalone/.test(path)
			|| /vs(\/|\\)editor(\/|\\)editor.api/.test(path)
			|| /vs(\/|\\)editor(\/|\\)editor.main/.test(path)
			|| /vs(\/|\\)editor(\/|\\)editor.worker/.test(path)
		) {
			this.addFailure(this.createFailure(node.getStart(), node.getWidth(), `Not allowed to import standalone editor modules. See https://github.com/Microsoft/vscode/wiki/Code-Organization`));
		}
	}
}
