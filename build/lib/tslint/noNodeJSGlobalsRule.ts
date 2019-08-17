/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import * as Lint from 'tslint';
import * as minimatch from 'minimatch';

interface NoNodejsGlobalsConfig {
	target: string;
	allowed: string[];
}

// https://nodejs.org/api/globals.html#globals_global_objects
const nodeJSGlobals = [
	"Buffer",
	"__dirname",
	"__filename",
	"clearImmediate",
	"exports",
	"global",
	"module",
	"process",
	"setImmediate"
];

export class Rule extends Lint.Rules.TypedRule {

	applyWithProgram(sourceFile: ts.SourceFile, program: ts.Program): Lint.RuleFailure[] {
		const configs = <NoNodejsGlobalsConfig[]>this.getOptions().ruleArguments;

		for (const config of configs) {
			if (minimatch(sourceFile.fileName, config.target)) {
				return this.applyWithWalker(new NoNodejsGlobalsRuleWalker(sourceFile, program, this.getOptions(), config));
			}
		}

		return [];
	}
}

class NoNodejsGlobalsRuleWalker extends Lint.RuleWalker {

	constructor(file: ts.SourceFile, private program: ts.Program, opts: Lint.IOptions, private _config: NoNodejsGlobalsConfig) {
		super(file, opts);
	}

	visitIdentifier(node: ts.Identifier) {
		if (nodeJSGlobals.some(nodeJSGlobal => nodeJSGlobal === node.text)) {
			if (this._config.allowed && this._config.allowed.some(allowed => allowed === node.text)) {
				return; // override
			}

			const checker = this.program.getTypeChecker();
			const symbol = checker.getSymbolAtLocation(node);
			if (symbol) {
				const valueDeclaration = symbol.valueDeclaration;
				if (valueDeclaration) {
					const parent = valueDeclaration.parent;
					if (parent) {
						const sourceFile = parent.getSourceFile();
						if (sourceFile) {
							const fileName = sourceFile.fileName;
							if (fileName && fileName.indexOf('@types/node') >= 0) {
								this.addFailureAtNode(node, `Cannot use node.js global '${node.text}' in '${this._config.target}'`);
							}
						}
					}
				}
			}
		}

		super.visitIdentifier(node);
	}
}
