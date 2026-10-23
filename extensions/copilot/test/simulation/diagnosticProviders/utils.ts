/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type * as vscode from 'vscode';
import { ITestingServicesAccessor } from '../../../src/platform/test/node/services';
import { ResourceMap } from '../../../src/util/vs/base/common/map';
import { Diagnostic, DiagnosticRelatedInformation, Location, Range } from '../../../src/vscodeTypes';
import { computeSHA256 } from '../../base/hash';
import { CacheScope, ICachingResourceFetcher } from '../../base/simulationContext';
import { CACHING_DIAGNOSTICS_PROVIDER_CACHE_SALT } from '../../cacheSalt';
import { cleanTempDirWithRetry, createTempDir } from '../stestUtil';
import { DiagnosticsProvider, IFile, ITestDiagnostic } from './diagnosticsProvider';

/**
 * Abstract class which finds diagnostics for a set of files and stores them in a cache path
 */
export abstract class CachingDiagnosticsProvider extends DiagnosticsProvider {
	protected readonly id = this.constructor.name;

	abstract readonly cacheSalt: string;
	abstract readonly cacheScope: CacheScope;

	protected get cacheVersion(): number { return CACHING_DIAGNOSTICS_PROVIDER_CACHE_SALT; }

	override async getDiagnostics(accessor: ITestingServicesAccessor, files: IFile[]): Promise<ITestDiagnostic[]> {
		// Always use / as separators in file names to avoid cache misses on Windows
		files = files.map(f => ({ ...f, fileName: f.fileName.replace(/\\/g, '/') }));

		// Keep files stable and maximize cache hits by sorting them by file name
		files.sort((a, b) => a.fileName.localeCompare(b.fileName));

		const cacheKey = computeSHA256(`${this.id}-v${this.cacheVersion}-${JSON.stringify(files)}`);

		return await accessor.get(ICachingResourceFetcher).invokeWithCache(
			this.cacheScope,
			files,
			this.cacheSalt,
			cacheKey,
			this.computeDiagnostics.bind(this)
		);
	}

	protected abstract computeDiagnostics(files: IFile[]): Promise<ITestDiagnostic[]>;
}

/**
 * Abstract class for defining diagnostics provider which provide linting errors
 */
export abstract class LintingDiagnosticsProvider extends CachingDiagnosticsProvider {

	protected override async computeDiagnostics(_files: IFile[]): Promise<ITestDiagnostic[]> {
		const temporaryDirectory = await createTempDir();
		const diagnostics: ITestDiagnostic[] = [];
		const files = await setupTemporaryWorkspace(temporaryDirectory, _files);
		for (const file of files) {
			const command = await this.fetchCommand(temporaryDirectory, file.filePath);
			const spawnResult = spawnSync(command.command, command.arguments, { shell: true, encoding: 'utf-8', env: command.env });
			const processedDiagnostics = this.processDiagnostics(file.fileName, JSON.parse(spawnResult.stdout || '{}'));
			diagnostics.push(...processedDiagnostics);
		}
		await cleanTempDirWithRetry(temporaryDirectory);
		return diagnostics;
	}

	protected abstract fetchCommand(temporaryDirectory: string, filePath: string): Promise<{ command: string; arguments: string[]; env?: NodeJS.ProcessEnv }>;

	protected abstract processDiagnostics(fileName: string, stdoutResult: any): ITestDiagnostic[];
}

export async function setupTemporaryWorkspace(workspacePath: string, _files: IFile[]): Promise<{ filePath: string; fileName: string; fileContents: string }[]> {
	const files = _files.map((file) => {
		return {
			filePath: path.join(workspacePath, file.fileName),
			fileName: file.fileName,
			fileContents: file.fileContents
		};
	});
	await fs.promises.rm(workspacePath, { recursive: true, force: true });
	await fs.promises.mkdir(workspacePath, { recursive: true });
	for (const file of files) {
		await fs.promises.mkdir(path.dirname(file.filePath), { recursive: true });
		await fs.promises.writeFile(file.filePath, file.fileContents);
	}
	return files;
}

export function convertTestToVSCodeDiagnostics(diagnostics: ITestDiagnostic[], pathToUri: (path: string) => vscode.Uri): ResourceMap<vscode.Diagnostic[]> {
	const result = new ResourceMap<vscode.Diagnostic[]>();
	for (const d of diagnostics) {
		const diagnostic = new Diagnostic(new Range(d.startLine, d.startCharacter, d.endLine, d.endCharacter), d.message);
		diagnostic.code = d.code;
		diagnostic.source = d.source;
		diagnostic.relatedInformation = d.relatedInformation?.map(r => {
			const range = new Range(r.location.startLine, r.location.startCharacter, r.location.endLine, r.location.endCharacter);
			const relatedLocation = new Location(pathToUri(r.location.file), range);
			return new DiagnosticRelatedInformation(relatedLocation, r.message);
		});
		const uri = pathToUri(d.file);
		if (!result.has(uri)) {
			result.set(uri, []);
		}
		result.get(uri)!.push(diagnostic);
	}
	return result;
}

export function findIfInstalled(verificationCommand: { command: string; arguments: string[] }, verificationRegex: RegExp): boolean {
	const spawnResult = cp.spawnSync(verificationCommand.command, verificationCommand.arguments, { shell: true, encoding: 'utf-8' });
	const regexMatch = spawnResult.stdout.match(verificationRegex);
	if (!regexMatch || regexMatch.length === 0) {
		return false;
	}
	return true;
}
