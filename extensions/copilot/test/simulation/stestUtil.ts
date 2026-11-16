/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { IFile, IQualifiedFile, IRelativeFile } from '../../src/platform/test/node/simulationWorkspace';
import { timeout } from '../../src/util/vs/base/common/async';
import { URI } from '../../src/util/vs/base/common/uri';
import { generateUuid } from '../../src/util/vs/base/common/uuid';
import { SIMULATION_FOLDER_NAME } from './shared/sharedTypes';
import { IInlineEditOutcome, IOutcome } from './types';

export function forEachModel(models: readonly string[], func: (model: string) => void) {
	return () => models.forEach(func);
}

interface FixtureFileInfo {
	readonly kind: 'relativeFile';
	readonly fileName: string;
	readonly fileContents: string;
}

/** See https://github.com/microsoft/vscode-ts-file-path-support */
type RelativeFilePath<T extends string> = string & { baseDir?: T };

/** This function allows [tools](https://github.com/microsoft/vscode-ts-file-path-support/tree/main) to inline/extract the file content. */
export function toFile(data: { filePath: string | FixtureFileInfo } | { fileName: string; fileContents: string } | { uri: URI; fileContents: string }): IFile {
	if ('filePath' in data) {
		if (typeof data.filePath === 'string') {
			return fromFixture(data.filePath);
		} else {
			return data.filePath;
		}
	} else if ('fileName' in data) {
		return {
			kind: 'relativeFile',
			fileName: data.fileName,
			fileContents: data.fileContents,
		} satisfies IRelativeFile;
	} else {
		return {
			kind: 'qualifiedFile',
			uri: data.uri,
			fileContents: data.fileContents,
		} satisfies IQualifiedFile;
	}
}

let _fixturesDir: string | undefined;

export function getFixturesDir() {
	if (!_fixturesDir) {
		_fixturesDir = [
			path.join(__dirname, '../test/simulation/fixtures'), // after bundling with esbuild
			path.join(__dirname, './fixtures'), // when running from sources
		].filter(p => fs.existsSync(p))[0];
		if (!_fixturesDir) {
			throw new Error('Could not find fixtures directory');
		}
	}
	return _fixturesDir;
}

export function fromFixture(pathWithinFixturesDir: RelativeFilePath<'$dir/fixtures'>): FixtureFileInfo;
export function fromFixture(dirnameWithinFixturesDir: string, relativePathWithinBaseDir: string): FixtureFileInfo;
export function fromFixture(pathOrDirnameWithinFixturesDir: string, relativePathWithinBaseDir?: string): FixtureFileInfo {

	let filePath: string;
	let baseDirname: string;
	if (relativePathWithinBaseDir === undefined) {
		filePath = path.join(getFixturesDir(), pathOrDirnameWithinFixturesDir);
		baseDirname = path.dirname(filePath);
	} else {
		baseDirname = path.join(getFixturesDir(), pathOrDirnameWithinFixturesDir);
		filePath = path.join(baseDirname, relativePathWithinBaseDir);
	}

	const fileName = path.relative(baseDirname, filePath);
	const fileContents = fs.readFileSync(filePath).toString();
	return { kind: 'relativeFile' as const, fileName, fileContents };
}

export function assertInlineEdit(outcome: IOutcome): asserts outcome is IInlineEditOutcome {
	assert.strictEqual(outcome.type, 'inlineEdit', `'${outcome.type}' === 'inlineEdit'`);
}

function generateTempDirPath(): string {
	return path.join(__dirname, `../${SIMULATION_FOLDER_NAME}/tmp-${generateUuid()}`);
}

export async function createTempDir(): Promise<string> {
	const folderPath = generateTempDirPath();
	await fs.promises.mkdir(folderPath, { recursive: true });
	return folderPath;
}

export async function cleanTempDir(folderPath: string): Promise<void> {
	await fs.promises.rm(folderPath, { recursive: true, force: true });
}

export async function cleanTempDirWithRetry(path: string, retry = 3): Promise<void> {
	// On windows, sometimes the tsc process holds locks on the directory even after it exits.
	// This tries to delete the folder a few times with a delay in between.
	let err = null;
	for (let i = 0; i < retry; i++) {
		try {
			await cleanTempDir(path);
			return;
		} catch (e) {
			err = e;
			await timeout(1000);
			// Ignore error
		}
	}

	console.error(`Failed to delete ${path} after ${retry} attempts.`, err);
}
