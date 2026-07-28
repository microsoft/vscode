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
import { ensurePythonVEnv } from './python';
import { LintingDiagnosticsProvider } from './utils';

/**
 * Class which finds python rule tooling diagnostic erors
 */
export class RuffDiagnosticsProvider extends LintingDiagnosticsProvider {

	override readonly id = 'ruff';
	override readonly cacheSalt = TestingCacheSalts.ruffCacheSalt;
	override readonly cacheScope = CacheScope.Ruff;

	private get ruffConfig(): string {
		// pyproject.toml
		return `
[tool.ruff]
select = ["ALL"]

[tool.ruff.lint]
preview = true

[tool.ruff.format]
preview = true
`;

	}

	protected override async fetchCommand(temporaryDirectory: string, filePath: string) {
		const ruffConfigFile = path.join(temporaryDirectory, 'pyproject.toml');
		await fs.promises.writeFile(ruffConfigFile, this.ruffConfig, 'utf8');
		const virtualEnvironment = ensurePythonVEnv();
		if (!virtualEnvironment) {
			throw new Error('No virtual environment found');
		}

		return {
			command: virtualEnvironment.pythonInterpreter,
			arguments: ['-m', 'ruff', 'check', filePath, '--config', ruffConfigFile, '--output-format', 'json']
		};
	}

	protected override processDiagnostics(fileName: string, stdoutResult: any): ITestDiagnostic[] {
		assert(Array.isArray(stdoutResult));
		if (stdoutResult.length === 0) {
			return [];
		}
		const sanitizeLineOrColumn = (lineOrColumn: any) => typeof lineOrColumn !== 'number' || Number.isNaN(lineOrColumn) ? 0 : Math.max(0, lineOrColumn - 1);
		const diagnostics = [];
		const messages = stdoutResult;
		assert(Array.isArray(messages));
		for (const message of messages) {
			const messageText = message.message;
			assert(typeof messageText === 'string');
			diagnostics.push({
				file: fileName,
				startLine: sanitizeLineOrColumn(message.location.row),
				startCharacter: sanitizeLineOrColumn(message.location.column),
				endLine: sanitizeLineOrColumn(message.end_location.row),
				endCharacter: sanitizeLineOrColumn(message.end_location.column),
				message: messageText,
				code: message.ruleId,
				relatedInformation: undefined,
				source: 'Ruff'
			});
		}
		return diagnostics;
	}
}
