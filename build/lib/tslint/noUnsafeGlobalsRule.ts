/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import * as Lint from 'tslint';
import * as minimatch from 'minimatch';

interface NoUnsafeGlobalsConfig {
	target: string;
	unsafe: string[];
}

export class Rule extends Lint.Rules.AbstractRule {
	apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
		const configs = <NoUnsafeGlobalsConfig[]>this.getOptions().ruleArguments;

		for (const config of configs) {
			if (minimatch(sourceFile.fileName, config.target)) {
				return this.applyWithWalker(new NoUnsafeGlobalsRuleWalker(sourceFile, this.getOptions(), config));
			}
		}

		return [];
	}
}

class NoUnsafeGlobalsRuleWalker extends Lint.RuleWalker {

	constructor(file: ts.SourceFile, opts: Lint.IOptions, private _config: NoUnsafeGlobalsConfig) {
		super(file, opts);
	}

	visitIdentifier(node: ts.Identifier) {
		if (this._config.unsafe.some(unsafe => unsafe === node.text)) {
			this.addFailureAtNode(node, `Unsafe global usage of ${node.text} in ${this._config.target}`);
		}

		super.visitIdentifier(node);
	}
}
