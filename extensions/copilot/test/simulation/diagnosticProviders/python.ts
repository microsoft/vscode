/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { promisify } from 'util';
import { ITestingServicesAccessor } from '../../../src/platform/test/node/services';
import { generateUuid } from '../../../src/util/vs/base/common/uuid';
import { Range } from '../../../src/util/vs/workbench/api/common/extHostTypes/range';
import { computeSHA256 } from '../../base/hash';
import { TestingCacheSalts } from '../../base/salts';
import { CacheScope, ICachingResourceFetcher } from '../../base/simulationContext';
import { PYTHON_EXECUTES_WITHOUT_ERRORS, PYTHON_VALID_SYNTAX_CACHE_SALT } from '../../cacheSalt';
import { ITestDiagnostic } from './diagnosticsProvider';
import { LintingDiagnosticsProvider } from './utils';

/**
 * Class which finds Pyright diagnostics
 */
export class PyrightDiagnosticsProvider extends LintingDiagnosticsProvider {

	override readonly id = 'pyright';
	override readonly cacheSalt = TestingCacheSalts.pyrightCacheSalt;
	override readonly cacheScope = CacheScope.Pyright;

	protected override async fetchCommand(temporaryDirectory: string, filePath: string) {
		const configPyrightFile = path.join(temporaryDirectory, 'pyrightconfig.json');
		await fs.promises.writeFile(configPyrightFile, JSON.stringify({}));
		const virtualEnvironment = ensurePythonVEnv();
		if (!virtualEnvironment) {
			// throw
			throw new Error('No virtual environment found');
		}

		return {
			command: virtualEnvironment.pythonInterpreter,
			arguments: ['-m', 'pyright', '--project', configPyrightFile, '--outputjson', filePath],
			env: virtualEnvironment.env
		};
	}

	protected override processDiagnostics(fileName: string, stdoutResult: any): ITestDiagnostic[] {
		const generalDiagnostics = stdoutResult.generalDiagnostics;
		assert(Array.isArray(generalDiagnostics));
		const diagnostics = [];
		for (const diagnostic of generalDiagnostics) {
			const range = diagnostic.range;
			const message = diagnostic.message;
			assert(Range.isRange(range) && typeof message === 'string');
			diagnostics.push({
				file: fileName,
				startLine: range.start.line,
				startCharacter: range.start.character,
				endLine: range.end.line,
				endCharacter: range.end.character,
				message: message,
				code: undefined,
				relatedInformation: undefined,
				source: 'pyright'
			});
		}
		return diagnostics;
	}
}

/**
 * Class which finds Pylint diagnostics
 */
export class PylintDiagnosticsProvider extends LintingDiagnosticsProvider {

	override readonly id = 'pylint';
	override readonly cacheSalt = TestingCacheSalts.pylintCacheSalt;
	override readonly cacheScope = CacheScope.Pylint;

	private get pylintConfigFile(): string {
		const pylintConfigFile = [
			`[MESSAGES CONTROL]`,
			`disable=W0311, C0115, C0305, C0116, C0114, C0304, C0103, W0108`
		].join(`\n`);
		return pylintConfigFile;
	}

	protected override async fetchCommand(temporaryDirectory: string, filePath: string) {
		const configPylintFile = path.join(temporaryDirectory, '.pylintrc');
		await fs.promises.writeFile(configPylintFile, this.pylintConfigFile);
		const virtualEnvironment = ensurePythonVEnv();
		if (!virtualEnvironment) {
			throw new Error('No virtual environment found');
		}

		return {
			command: virtualEnvironment.pythonInterpreter,
			arguments: ['-m', 'pylint', '--rcfile', configPylintFile, '--output-format', 'json', filePath]
		};
	}

	protected override processDiagnostics(fileName: string, stdoutResult: any): ITestDiagnostic[] {
		const diagnostics = [];
		assert(Array.isArray(stdoutResult));
		if (stdoutResult.length === 0) {
			return [];
		}
		for (const stdout of stdoutResult) {
			const message = stdout.message;
			const line = stdout.line;
			const column = stdout.column;
			const endLine = stdout.endLine ?? null;
			const endColumn = stdout.endColumn ?? null;
			const code = stdout['message-id'] ?? null;
			assert(
				typeof message === 'string'
				&& typeof line === 'number'
				&& typeof column === 'number'
				&& (typeof endLine === 'number' || endColumn === null)
				&& (typeof endColumn === 'number' || endColumn === null)
			);
			diagnostics.push({
				file: fileName,
				startLine: line - 1,
				startCharacter: column,
				endLine: (endLine ?? line) - 1,
				endCharacter: (endColumn ?? column),
				message: message,
				code: code,
				relatedInformation: undefined,
				source: 'pylint'
			});
		}
		return diagnostics;
	}
}


export async function isValidPythonFile(accessor: ITestingServicesAccessor, text: string): Promise<boolean> {
	// Remove lines that start with `%xyz` as they can be cell magics in Jupyter Notebooks
	// & that doesn't work in a standalone Python file
	text = text.split(/\r?\n/g).filter(line => !line.startsWith('%')).join('\n');
	const cacheKey = computeSHA256(`python-v2${PYTHON_VALID_SYNTAX_CACHE_SALT}-${text}`);
	return accessor.get(ICachingResourceFetcher).invokeWithCache(
		CacheScope.Python,
		text,
		TestingCacheSalts.pythonCacheSalt,
		cacheKey,
		doIsValidPythonFile
	);
}

async function doIsValidPythonFile(text: string): Promise<boolean> {
	const fileName = `python-verify_${computeSHA256(`python-v${PYTHON_VALID_SYNTAX_CACHE_SALT}-${text}`)}.py`;
	const dir = path.join(tmpdir(), generateUuid());
	const tmpFile = path.join(dir, fileName);
	await promisify(fs.mkdir)(dir, { recursive: true });
	await promisify(fs.writeFile)(tmpFile, text);
	return new Promise<boolean>((resolve) => {
		cp.exec(`python3 -m py_compile "${tmpFile}"`, (error, stdout, stderr) => {
			if (error) {
				return resolve(false);
			} else if (stderr && stderr.length > 0) {
				return resolve(false);
			}

			resolve(true);
		});
	}).finally(() => {
		fs.rm(dir, { recursive: true, force: true }, () => { });
	});
}

export async function canExecutePythonCodeWithoutErrors(accessor: ITestingServicesAccessor, text: string): Promise<boolean> {
	// Remove lines that start with `%xyz` as they can be cell magics in Jupyter Notebooks
	// & that doesn't work in a standalone Python file
	text = text.split(/\r?\n/g).filter(line => !line.startsWith('%')).join('\n');
	const cacheKey = computeSHA256(`python-verify-execution_${PYTHON_EXECUTES_WITHOUT_ERRORS}-${text}`);
	return accessor.get(ICachingResourceFetcher).invokeWithCache(
		CacheScope.Python,
		text,
		TestingCacheSalts.pythonCacheSalt,
		cacheKey,
		canExecutePythonCodeWithoutErrorsImpl
	);
}

async function canExecutePythonCodeWithoutErrorsImpl(text: string): Promise<boolean> {
	const fileName = `python-verify-execution_${computeSHA256(`python-v${PYTHON_EXECUTES_WITHOUT_ERRORS}-${text}`)}.py`;
	const dir = path.join(tmpdir(), generateUuid());
	const tmpFile = path.join(dir, fileName);
	await promisify(fs.mkdir)(dir, { recursive: true });
	await promisify(fs.writeFile)(tmpFile, text);
	return new Promise<boolean>((resolve) => {
		cp.exec(`python3 "${tmpFile}"`, (error, stdout, stderr) => {
			if (error) {
				return resolve(false);
			} else if (stderr && stderr.length > 0) {
				return resolve(false);
			}

			resolve(true);
		});
	}).finally(() => {
		fs.rm(dir, { recursive: true, force: true }, () => { });
	});
}

export function ensurePythonVEnv(): { pythonInterpreter: string; env: NodeJS.ProcessEnv } | undefined {
	const repoRoot = path.join(__dirname, '../');
	const isWindows = process.platform === 'win32';
	const envBinFolder = path.join(repoRoot, '.venv', isWindows ? 'Scripts' : 'bin');
	const p = path.join(envBinFolder, isWindows ? 'python.exe' : 'python');

	for (let i = 0; i < 2; i++) {
		try {
			assert(fs.existsSync(p));

			const envs = Object.assign({}, process.env);
			envs.PATH = `${envBinFolder}${path.delimiter}${envs.PATH}`;
			envs.Path = `${envBinFolder}${path.delimiter}${envs.Path}`;

			return {
				pythonInterpreter: p,
				env: envs
			};
		} catch (err) {
			if (!err.stack.includes('AssertionError')) {
				throw err;
			}

			cp.execSync(`npm run create_venv`, { stdio: 'inherit' });
		}
	}

	throw new Error('Python virtual environment not found, create it manually with `npm run create_venv`');
}
