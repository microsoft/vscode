/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { TestingCacheSalts } from '../../base/salts';
import { CacheScope } from '../../base/simulationContext';
import { ITestDiagnostic } from './diagnosticsProvider';
import { LintingDiagnosticsProvider } from './utils';

/**
 * Class which finds eslint diagnostic erors
 */
export class EslintDiagnosticsProvider extends LintingDiagnosticsProvider {

	override readonly id = 'eslint';
	override readonly cacheSalt = TestingCacheSalts.eslintCacheSalt;
	override readonly cacheScope = CacheScope.ESLint;

	private get eslintConfig(): any {
		return {
			'parser': '@typescript-eslint/parser',
			'plugins': ['@typescript-eslint'],
			'extends': [],
			'parserOptions': {
				'warnOnUnsupportedTypeScriptVersion': false,
				'sourceType': 'module',
				'ecmaVersion': 'latest',
				'ecmaFeatures': { 'jsx': true, 'experimentalObjectRestSpread': true },
			},
			'ignorePatterns': ['!+'],
			'rules': {
				'constructor-super': 'error',
				'for-direction': 'error',
				'getter-return': 'error',
				'no-async-promise-executor': 'error',
				'no-class-assign': 'error',
				'no-compare-neg-zero': 'error',
				'no-cond-assign': 'error',
				'no-const-assign': 'error',
				'no-constant-condition': 'error',
				'no-control-regex': 'error',
				'no-dupe-args': 'error',
				'no-empty-pattern': 'error',
				'no-ex-assign': 'error',
				'no-invalid-regexp': 'error',
				'no-new-symbol': 'error',
				'no-obj-calls': 'error',
				'no-prototype-builtins': 'error',
				'no-self-assign': 'error',
				'no-setter-return': 'error',
				'no-unreachable': 'error',
				'no-unreachable-loop': 'error',
				'no-unsafe-finally': 'error',
				'no-unsafe-negation': 'error',
				'no-unsafe-optional-chaining': 'error',
				'use-isnan': 'error',
				'indent': 'off'
			},
		};
	}

	protected override async fetchCommand(temporaryDirectory: string, filePath: string) {
		const eslintConfigFile = path.join(temporaryDirectory, '.eslintrc.json');
		await fs.promises.writeFile(eslintConfigFile, JSON.stringify(this.eslintConfig));
		return {
			command: 'npx',
			arguments: ['eslint', '--no-eslintrc', '--config', eslintConfigFile, '--no-ignore', '-f', 'json', filePath]
		};
	}

	protected override processDiagnostics(fileName: string, stdoutResult: any): ITestDiagnostic[] {
		assert(Array.isArray(stdoutResult));
		if (stdoutResult.length === 0) {
			return [];
		}
		const sanitizeLineOrColumn = (lineOrColumn: any) => typeof lineOrColumn !== 'number' || Number.isNaN(lineOrColumn) ? 0 : Math.max(0, lineOrColumn - 1);
		const diagnostics = [];
		const messages = stdoutResult[0].messages;
		assert(Array.isArray(messages));
		for (const message of messages) {
			const messageText = message.message;
			assert(typeof messageText === 'string');
			diagnostics.push({
				file: fileName,
				startLine: sanitizeLineOrColumn(message.line),
				startCharacter: sanitizeLineOrColumn(message.column),
				endLine: sanitizeLineOrColumn(message.endLine),
				endCharacter: sanitizeLineOrColumn(message.endColumn),
				message: messageText,
				code: message.ruleId,
				relatedInformation: undefined,
				source: 'eslint'
			});
		}
		return diagnostics;
	}
}
