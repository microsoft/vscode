/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import * as Lint from 'tslint';

export class Rule extends Lint.Rules.AbstractRule {
	public apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
		const allowed = this.getOptions().ruleArguments[0] as string[];
		return this.applyWithWalker(new AsyncRuleWalker(sourceFile, this.getOptions(), allowed));
	}
}

class AsyncRuleWalker extends Lint.RuleWalker {

	constructor(file: ts.SourceFile, opts: Lint.IOptions, private allowed: string[]) {
		super(file, opts);
	}

	protected visitMethodDeclaration(node: ts.MethodDeclaration): void {
		this.visitFunctionLikeDeclaration(node);
	}

	protected visitFunctionDeclaration(node: ts.FunctionDeclaration): void {
		this.visitFunctionLikeDeclaration(node);
	}

	private visitFunctionLikeDeclaration(node: ts.FunctionLikeDeclaration) {
		const flags = ts.getCombinedModifierFlags(node);

		if (!(flags & ts.ModifierFlags.Async)) {
			return;
		}

		const path = node.getSourceFile().path;
		const pathParts = path.split(/\\|\//);

		if (pathParts.some(part => this.allowed.some(allowed => part === allowed))) {
			return;
		}

		const message = `You are not allowed to use async function in this layer. Allowed layers are: [${this.allowed}]`;
		this.addFailureAtNode(node, message);
	}
}
