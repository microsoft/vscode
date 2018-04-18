/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import * as Lint from 'tslint';
import { join, dirname } from 'path';

interface Config {
	allowed: Set<string>;
	disallowed: Set<string>;
}

export class Rule extends Lint.Rules.AbstractRule {
	public apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {

		const parts = dirname(sourceFile.fileName).split(/\\|\//);
		let ruleArgs = this.getOptions().ruleArguments[0];

		let config: Config;
		for (let i = parts.length - 1; i >= 0; i--) {
			if (ruleArgs[parts[i]]) {
				config = {
					allowed: new Set<string>(<string[]>ruleArgs[parts[i]]).add(parts[i]),
					disallowed: new Set<string>()
				};
				Object.keys(ruleArgs).forEach(key => {
					if (!config.allowed.has(key)) {
						config.disallowed.add(key);
					}
				});
				break;
			}
		}

		if (!config) {
			return [];
		}

		return this.applyWithWalker(new LayeringRule(sourceFile, config, this.getOptions()));
	}
}

class LayeringRule extends Lint.RuleWalker {

	private _config: Config;

	constructor(file: ts.SourceFile, config: Config, opts: Lint.IOptions) {
		super(file, opts);
		this._config = config;
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

		if (path[0] === '.') {
			path = join(dirname(node.getSourceFile().fileName), path);
		}

		const parts = dirname(path).split(/\\|\//);
		for (let i = parts.length - 1; i >= 0; i--) {
			const part = parts[i];

			if (this._config.allowed.has(part)) {
				// GOOD - same layer
				return;
			}

			if (this._config.disallowed.has(part)) {
				// BAD - wrong layer
				const message = `Bad layering. You are not allowed to access '${part}' from here, allowed layers are: [${LayeringRule._print(this._config.allowed)}]`;
				this.addFailure(this.createFailure(node.getStart(), node.getWidth(), message));
				return;
			}
		}
	}

	static _print(set: Set<string>): string {
		let r: string[] = [];
		set.forEach(e => r.push(e));
		return r.join(', ');
	}
}
