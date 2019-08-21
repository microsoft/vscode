/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import * as Lint from 'tslint';
import * as minimatch from 'minimatch';
import { AbstractGlobalsRuleWalker } from './abstractGlobalsRule';

interface NoNodejsGlobalsConfig {
	target: string;
	allowed: string[];
}

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

class NoNodejsGlobalsRuleWalker extends AbstractGlobalsRuleWalker {

	getDefinitionPattern(): string {
		return '@types/node';
	}

	getDisallowedGlobals(): string[] {
		// https://nodejs.org/api/globals.html#globals_global_objects
		return [
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
	}
}
