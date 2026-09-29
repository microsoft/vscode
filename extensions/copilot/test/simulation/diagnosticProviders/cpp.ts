/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { TestingCacheSalts } from '../../base/salts';
import { CacheScope } from '../../base/simulationContext';
import { CLANG_DIAGNOSTICS_PROVIDER_CACHE_SALT } from '../../cacheSalt';
import { createTempDir } from '../stestUtil';
import { IFile, ITestDiagnostic } from './diagnosticsProvider';
import { CachingDiagnosticsProvider, findIfInstalled, setupTemporaryWorkspace } from './utils';

/**
 * Class which finds clang diagnostics after compilation of C++ files
 */
export class CppDiagnosticsProvider extends CachingDiagnosticsProvider {
	override readonly id = 'cpp';
	override readonly cacheSalt = TestingCacheSalts.cppCacheSalt;
	override readonly cacheScope = CacheScope.CPP;
	private _isInstalled: 'local' | 'docker' | false | undefined;

	protected override get cacheVersion(): number {
		return CLANG_DIAGNOSTICS_PROVIDER_CACHE_SALT;
	}

	sources: {
		filePath: string;
		fileName: string;
		fileContents: string;
	}[] = [];

	override isInstalled(): boolean {
		if (this._isInstalled === undefined) {
			if (findIfInstalled({ command: 'clang', arguments: ['-v'] }, /\d+\.\d+\.\d+/)) {
				this._isInstalled = 'local';
			} else if (findIfInstalled({ command: 'docker', arguments: ['--version'] }, /\d+\.\d+\.\d+/)) {
				this._isInstalled = 'docker';
			} else {
				this._isInstalled = false;
			}
		}
		return this._isInstalled !== false;
	}

	override async computeDiagnostics(_files: IFile[]): Promise<ITestDiagnostic[]> {
		const temporaryDirectory = await this.setupWorkspace(_files);
		const diagnostics = await this.processDiagnostics(temporaryDirectory, _files);
		//await cleanTempDir(temporaryDirectory);
		return diagnostics;
	}

	async setupWorkspace(_files: IFile[]): Promise<string> {
		const temporaryDirectory = await createTempDir();
		await setupTemporaryWorkspace(temporaryDirectory, _files);
		return temporaryDirectory;
	}

	async processDiagnostics(temporaryDirectory: string, _files: IFile[]): Promise<ITestDiagnostic[]> {
		// Validate that the diagnostics provider is installed
		if (!this.isInstalled()) {
			throw new Error('clang or docker must be available in this environment for c++ diagnostics.');
		}

		const diagnostics: ITestDiagnostic[] = [];
		const basename = 'workspaceFolder_' + new Date().getTime();
		for (const file of _files) {

			let spawnResult;
			if (this._isInstalled === 'docker') {
				const args = ['run', '--rm', '-v', `${temporaryDirectory}:/${basename}`, 'mcr.microsoft.com/devcontainers/cpp:latest', 'clang++', `/${basename}/${file.fileName}`];
				//console.log('docker ' + args.map(arg => `'${arg}'`).join(' '));
				spawnResult = cp.spawnSync('docker', args, { shell: true, encoding: 'utf-8' });
			} else {
				spawnResult = cp.spawnSync('clang++', [`${temporaryDirectory}/${file.fileName}`]);
			}

			// If compilation was successful, no diagnostics are needed.
			if (spawnResult.status === 0) {
				return [];
			}

			// Need to capture the output of clang and convert it into diagnostics
			// Grab the diagnostic info from the error and turn it into a diagnostic object.
			// Example error:
			// /workspaceFolder/main.cpp:5:10: error: expected ';' after return statement
			// /workspaceFolder/LyraHealthComponent.cpp:3:10: fatal error: 'LyraHealthComponent.h' file not found
			// Format:
			// /${filePath}:${line}:${col}: ${code}: ${message}
			const regexp = new RegExp(`^\/${basename}\/([A-Za-z_\\-\\s0-9\\.]+):(\\d+):(\\d+): ([^:]+): (.*)`);
			let hasErrors = false;
			const lines = spawnResult.stderr.toString().split('\n');
			for (const line of lines) {
				const m = line.match(regexp);
				if (m) {
					const [, filePath, line, col, code, message] = m;
					// TODO: Add support for related information
					diagnostics.push({
						file: filePath,
						startLine: +line - 1,
						startCharacter: +col - 1,
						endLine: +line - 1,
						endCharacter: +col - 1,
						message: message,
						code: code,
						relatedInformation: undefined,
						source: this.id
					});
					hasErrors = true;
				}
			}
			if (!hasErrors || spawnResult.error) {
				throw new Error(`Error while running 'clang' \n\nstderr : ` + spawnResult.stderr + '\n\nerr : ' + spawnResult.error);
			}
		}

		return diagnostics;
	}
}
