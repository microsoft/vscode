/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import * as Lint from 'tslint';
import * as minimatch from 'minimatch';
import { AbstractGlobalsRuleWalker } from './abstractGlobalsRule';

interface NoDOMGlobalsRuleConfig {
	target: string;
	allowed: string[];
}

export class Rule extends Lint.Rules.TypedRule {

	applyWithProgram(sourceFile: ts.SourceFile, program: ts.Program): Lint.RuleFailure[] {
		const configs = <NoDOMGlobalsRuleConfig[]>this.getOptions().ruleArguments;

		for (const config of configs) {
			if (minimatch(sourceFile.fileName, config.target)) {
				return this.applyWithWalker(new NoDOMGlobalsRuleWalker(sourceFile, program, this.getOptions(), config));
			}
		}

		return [];
	}
}

class NoDOMGlobalsRuleWalker extends AbstractGlobalsRuleWalker {

	getDefinitionPattern(): string {
		return 'lib.dom.d.ts';
	}

	getDisallowedGlobals(): string[] {
		// intentionally not complete
		return [
			"window",
			"document",
			"HTMLElement"
		];
	}
}
