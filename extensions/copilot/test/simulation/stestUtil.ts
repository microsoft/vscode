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
import { IConversationalOutcome, IEmptyOutcome, IInlineEditOutcome, IOutcome, IWorkspaceEditOutcome } from './types';

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

export function fromFixtureDir(dirnameWithinFixturesDir: string, dirnameWithinDir?: string): FixtureFileInfo[] {
	const files = fs.readdirSync(
		path.join(getFixturesDir(),
			dirnameWithinFixturesDir,
			dirnameWithinDir ?? '',
		),
		{ withFileTypes: true },
	);

	const out: FixtureFileInfo[] = [];
	for (const file of files) {
		const nested = path.join(dirnameWithinDir ?? '', file.name);
		if (file.isFile()) {
			out.push(fromFixture(dirnameWithinFixturesDir, nested));
		} else if (file.isDirectory()) {
			out.push(...fromFixtureDir(dirnameWithinFixturesDir, nested));
		}
	}

	return out;
}

/**
 * Asserts that one of the given assertions passes.
 *
 * @template T - The type of the value returned by the assertions.
 * @param assertions - An array of functions that represent the assertions to be checked.
 * @returns - The value returned by the assertion that passes.
 * @throws {assert.AssertionError} - If none of the assertions pass.
 */
export function assertOneOf<T>(assertions: (() => T)[]): T {
	for (const assertion of assertions) {
		try {
			return assertion();
		} catch (e) {
			if (!(e instanceof assert.AssertionError)) {
				throw e; // surface unexpected errors
			}
		}
	}
	throw new assert.AssertionError({ message: 'none of the assertions passed' });
}

export interface IInlineReplaceEdit {
	kind: 'replaceEdit';
	originalStartLine: number;
	originalEndLine: number;
	modifiedStartLine: number;
	modifiedEndLine: number;
	changedOriginalLines: string[];
	changedModifiedLines: string[];
	allOriginalLines: string[];
	allModifiedLines: string[];
}

export function assertInlineEdit(outcome: IOutcome): asserts outcome is IInlineEditOutcome {
	assert.strictEqual(outcome.type, 'inlineEdit', `'${outcome.type}' === 'inlineEdit'`);
}

export function assertNoErrorOutcome(outcome: IOutcome): asserts outcome is IInlineEditOutcome | IWorkspaceEditOutcome | IConversationalOutcome | IEmptyOutcome {
	assert.notEqual(outcome.type, 'error', `no error outcome expected`);
}

export function assertConversationalOutcome(outcome: IOutcome): asserts outcome is IConversationalOutcome {
	assert.strictEqual(outcome.type, 'conversational', `'${outcome.type}' === 'conversational'`);
}

export function assertWorkspaceEdit(outcome: IOutcome): asserts outcome is IWorkspaceEditOutcome {
	assert.strictEqual(outcome.type, 'workspaceEdit', `'${outcome.type}' === 'workspaceEdit'`);
}

/**
 * returns null if the files are identical
 */
export function extractInlineReplaceEdits(outcome: IInlineEditOutcome): IInlineReplaceEdit | null {
	const originalLines = outcome.originalFileContents.split(/\r\n|\r|\n/g);
	const modifiedLines = outcome.fileContents.split(/\r\n|\r|\n/g);

	let ostart = 0;
	let mstart = 0;
	while (ostart < originalLines.length && mstart < modifiedLines.length && originalLines[ostart] === modifiedLines[mstart]) {
		ostart++;
		mstart++;
	}

	if (ostart === originalLines.length && mstart === modifiedLines.length) {
		// identical files
		return null;
	}

	let ostop = originalLines.length - 1;
	let mstop = modifiedLines.length - 1;
	while (ostop >= ostart && mstop >= mstart && originalLines[ostop] === modifiedLines[mstop]) {
		ostop--;
		mstop--;
	}

	const changedOriginalLines = originalLines.slice(ostart, ostop + 1);
	const changedModifiedLines = modifiedLines.slice(mstart, mstop + 1);

	return {
		kind: 'replaceEdit',
		originalStartLine: ostart,
		originalEndLine: ostop,
		modifiedStartLine: mstart,
		modifiedEndLine: mstop,
		changedOriginalLines,
		changedModifiedLines,
		allOriginalLines: originalLines,
		allModifiedLines: modifiedLines,
	};
}

export interface IInlineEditShape {
	line: number;
	originalLength: number;
	modifiedLength: number | undefined;
}

export function assertInlineEditShape(outcome: IOutcome, _expected: IInlineEditShape | IInlineEditShape[]): IInlineReplaceEdit {
	assertInlineEdit(outcome);
	const actual = extractInlineReplaceEdits(outcome);
	assert.ok(actual, 'unexpected identical files');
	const actualLines = {
		line: actual.originalStartLine,
		originalLength: actual.originalEndLine - actual.originalStartLine + 1,
		modifiedLength: actual.modifiedEndLine - actual.modifiedStartLine + 1,
	};
	const originalLineCount = outcome.originalFileContents.split(/\r\n|\r|\n/g).length;
	const _expectedArr = Array.isArray(_expected) ? _expected : [_expected];
	const expectedArr = _expectedArr.map((expected) => {
		const line = (
			expected.line < 0 ? actual.allOriginalLines.length - ~expected.line : expected.line
		);
		const originalLength = expected.originalLength;
		const modifiedLength = (
			typeof expected.modifiedLength === 'undefined'
				? (actual.allModifiedLines.length + originalLength - originalLineCount)
				: expected.modifiedLength
		);
		return { line, originalLength, modifiedLength };
	});
	let err: Error | undefined;
	for (const expected of expectedArr) {
		try {
			assert.deepStrictEqual(actualLines, expected);
			return actual;
		} catch (e) {
			// Let's try the next one
			err = e;
		}
	}
	// No options matched
	// console.log(`\n`, JSON.stringify(actualLines), '\n', JSON.stringify(expectedArr));
	throw err;
}

export function assertQualifiedFile(file: IFile | { srcUri: string; post: string }): asserts file is IQualifiedFile {
	if ('srcUri' in file && 'post' in file) {
		// New format - nothing to assert, it's already a qualified file equivalent
		return;
	}
	// Old format - check the kind
	assert.strictEqual(file.kind, 'qualifiedFile', `'${file.kind}' === 'qualifiedFile'`);
}


/**
 * Asserts that at least `n` out of `expected.length` strings are present in `actual` string.
 *
 * If `n` is not given, `n = Math.floor(1, expected.length / 2)` is used.
 */
export function assertSomeStrings(actual: string, expected: string[], n?: number) {
	assert.ok(expected.length > 0, 'Need to expect at least one string');

	if (n === undefined) {
		n = Math.max(1, Math.floor(expected.length / 2));
	}

	let seen = 0;
	for (const item of expected) {
		if (actual.includes(item)) {
			seen++;
		}
	}

	assert.ok(seen >= n, `Expected to see at least ${n} of ${expected.join(',')}, but only saw ${seen} in ${actual}`);
}

export function assertNoStrings(actual: string, expected: string[],) {
	assertSomeStrings(actual, expected, 0);
}

export function assertOccursOnce(hay: string, needle: string) {
	const firstOccurrence = hay.indexOf(needle);
	assert(firstOccurrence > -1, `assertOccursOnce: no occurrence\n${JSON.stringify({ hay, needle }, null, '\t')}`);
	assert(hay.indexOf(needle, firstOccurrence + needle.length) === -1, `assertOccursOnce: more than 1 occurrence\n${JSON.stringify({ hay, needle }, null, '\t')}`);
}

export function assertNoOccurrence(hay: string, needles: string | string[]): void {
	needles = Array.isArray(needles) ? needles : [needles];
	for (const needle of needles) {
		assert(hay.indexOf(needle) === -1, `assertDoesNotOccur: occurrence\n${JSON.stringify({ hay, needle }, null, '\t')}`);
	}
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
