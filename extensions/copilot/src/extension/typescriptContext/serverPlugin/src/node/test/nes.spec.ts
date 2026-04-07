/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { beforeAll, suite, test } from 'vitest';
import { z } from 'zod';

// This is OK since we are running in a Node / CommonJS environment.
import * as fs from 'fs';
import ts from 'typescript';

// These must be type imports since the module is loaded dynamically in the beforeAll hook.
import assert from 'assert';
import path from 'path';
import type * as protocol from '../../common/protocol';
import type * as testing from './testing';

let create: typeof testing.create;
let prepareNesRename: typeof testing.prepareNesRename;
let nesRename: typeof testing.nesRename;
let RenameKind: typeof protocol.RenameKind;
let toNormalizedPath: typeof ts.server.toNormalizedPath;

// This is OK since we run tests in node loading a TS version installed in the workspace.
const root = path.join(__dirname, '../../../fixtures/nes');

const TestAnnotationSchema = z.object({
	title: z.string(),
	oldName: z.string(),
	newName: z.string(),
	expected: z.string(),
	delta: z.number().optional(),
});

type TestAnnotation = z.infer<typeof TestAnnotationSchema>;

namespace TestAnnotation {
	export function is(value: unknown): value is TestAnnotation {
		return TestAnnotationSchema.safeParse(value).success;
	}
}

const PositionSchema = z.object({
	line: z.number(),
	character: z.number(),
});

const RangeSchema = z.object({
	start: PositionSchema,
	end: PositionSchema,
});

type Range = z.infer<typeof RangeSchema>;

const TrackedRenameAnnotationSchema = z.object({
	kind: z.literal('track'),
	oldName: z.string(),
	newName: z.string(),
	delta: z.number().optional(),
});

type TrackedRenameAnnotation = z.infer<typeof TrackedRenameAnnotationSchema>;

namespace TrackedRenameAnnotation {
	export function is(value: unknown): value is TrackedRenameAnnotation {
		return TrackedRenameAnnotationSchema.safeParse(value).success;
	}
}

type NesRenameTestCase = {
	title: string;
	line: number;
	character: number;
	oldName: string;
	newName: string;
	expected: string;
};

type TrackedRenameInfo = {
	oldName: string;
	newName: string;
	range: Range;
}

type PostRenameTestCase = {
	trackedRename: TrackedRenameInfo;
	testCase: NesRenameTestCase;
}

function computeNesRenameTestCases(filePath: string): NesRenameTestCase[] {
	const text = fs.readFileSync(filePath, 'utf8');
	const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest);
	const result: NesRenameTestCase[] = [];
	const regex = /\/\/\/\/\s(\{.*\})/g;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		try {
			const parsed = JSON.parse(match[1]);
			if (!TestAnnotation.is(parsed)) {
				continue;
			}
			const testCase = parsed;
			const { line, character } = sourceFile.getLineAndCharacterOfPosition(match.index);
			result.push({
				title: testCase.title,
				oldName: testCase.oldName,
				newName: testCase.newName,
				expected: testCase.expected,
				line: line + 1,
				character: character + (testCase.delta ?? 0),
			});
		} catch {
			// Ignore
		}
	}
	return result;
}

function computePostRenameTestCases(filePath: string): PostRenameTestCase[] {
	const text = fs.readFileSync(filePath, 'utf8');
	const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest);
	const result: PostRenameTestCase[] = [];
	const regex = /\/\/\/\/\s(\{.*\})/g;

	type ParsedAnnotation = {
		annotation: TrackedRenameAnnotation | TestAnnotation;
		range: Range;
	};

	const annotations: ParsedAnnotation[] = [];
	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		try {
			const parsed = JSON.parse(match[1]);
			const { line, character } = sourceFile.getLineAndCharacterOfPosition(match.index);
			const endPos = sourceFile.getLineAndCharacterOfPosition(match.index + match[0].length);
			if (TrackedRenameAnnotation.is(parsed) || TestAnnotation.is(parsed)) {
				annotations.push({
					annotation: parsed,
					range: {
						start: { line: line, character: character },
						end: { line: endPos.line, character: endPos.character },
					},
				});
			}
		} catch {
			// Ignore
		}
	}

	for (let i = 0; i < annotations.length - 1; i++) {
		const first = annotations[i];
		const second = annotations[i + 1];

		if (
			TrackedRenameAnnotation.is(first.annotation) &&
			TestAnnotation.is(second.annotation) &&
			first.annotation.oldName === second.annotation.oldName &&
			first.annotation.newName === second.annotation.newName
		) {
			let start = first.range.start;
			let delta = first.annotation.delta ?? 0;
			const trackedRename: TrackedRenameInfo = {
				oldName: first.annotation.oldName,
				newName: first.annotation.newName,
				range: {
					start: { line: start.line + 1, character: start.character + delta },
					end: { line: start.line + 1, character: start.character + delta + first.annotation.newName.length }
				},
			};
			start = second.range.start;
			delta = second.annotation.delta ?? 0;
			const testCase: NesRenameTestCase = {
				title: second.annotation.title,
				oldName: second.annotation.oldName,
				newName: second.annotation.newName,
				expected: second.annotation.expected,
				line: start.line + 1,
				character: start.character + delta,
			};
			result.push({ trackedRename, testCase });
			i++; // Skip the next annotation since it's part of this pair
		}
	}

	return result;
}

beforeAll(async function () {
	const TS = await import('../../common/typescript');
	TS.default.install(ts);

	const [protocolModule, testingModule] = await Promise.all([
		import('../../common/protocol'),
		import('./testing'),
	]);
	create = testingModule.create;
	prepareNesRename = testingModule.prepareNesRename;
	nesRename = testingModule.nesRename;
	RenameKind = protocolModule.RenameKind;
	toNormalizedPath = ts.server.toNormalizedPath;
}, 10000);

suite('NES Test Suite', function () {

	let session: testing.TestSession;
	beforeAll(() => {
		session = create(path.join(root, 'p1'));
	});

	const filePath = path.join(root, 'p1', 'source', 'test.ts');
	const testCases = computeNesRenameTestCases(filePath);
	for (const testCase of testCases) {
		test(testCase.title, () => {
			const renameKind = prepareNesRename(
				session,
				filePath,
				{ line: testCase.line, character: testCase.character },
				testCase.oldName,
				testCase.newName,
			);
			assert.strictEqual(renameKind, RenameKind.fromString(testCase.expected));
		});
	}
});

suite('NES Post Rename Test Suite', function () {

	let session: testing.TestSession;
	beforeAll(() => {
		session = create(path.join(root, 'p2'));
	});

	const filePath = path.join(root, 'p2', 'source', 'test.ts');
	const postRenameTestCases = computePostRenameTestCases(filePath);
	for (const { trackedRename, testCase } of postRenameTestCases) {
		const start = trackedRename.range.start;
		const end = trackedRename.range.end;
		test(testCase.title, () => {
			const normalizedFilePath = toNormalizedPath(filePath);
			const position = { line: testCase.line, character: testCase.character };
			const lastSymbolRename: Range = {
				start: { line: start.line, character: start.character },
				end: { line: end.line, character: end.character },
			};
			// First, perform the tracked rename.
			const trackedRenameKind = prepareNesRename(
				session,
				normalizedFilePath,
				position,
				testCase.oldName,
				testCase.newName,
				lastSymbolRename,
			);
			assert.strictEqual(trackedRenameKind, RenameKind.fromString(testCase.expected));
			const renameGroups = nesRename(session, normalizedFilePath, position, testCase.oldName, testCase.newName, lastSymbolRename);
			assert.strictEqual(renameGroups.length > 0, true);
		});
	}
});