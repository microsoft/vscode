/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import * as Lint from 'tslint';

interface AbstractGlobalsRuleConfig {
	target: string;
	allowed: string[];
}

export abstract class AbstractGlobalsRuleWalker extends Lint.RuleWalker {

	constructor(file: ts.SourceFile, private program: ts.Program, opts: Lint.IOptions, private _config: AbstractGlobalsRuleConfig) {
		super(file, opts);
	}

	protected abstract getDisallowedGlobals(): string[];

	protected abstract getDefinitionPattern(): string;

	visitIdentifier(node: ts.Identifier) {
		if (this.getDisallowedGlobals().some(disallowedGlobal => disallowedGlobal === node.text)) {
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
							if (fileName && fileName.indexOf(this.getDefinitionPattern()) >= 0) {
								this.addFailureAtNode(node, `Cannot use global '${node.text}' in '${this._config.target}'`);
							}
						}
					}
				}
			}
		}

		super.visitIdentifier(node);
	}
}
