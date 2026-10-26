/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import { API, type Project, type Snapshot } from '@typescript/native/unstable/async';
import type { SourceFile } from '@typescript/native/unstable/ast';
import type * as vscode from 'vscode';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { z } from 'zod';
import * as protocol from '../../../common/serverProtocol';
import { nesRename, prepareNesRename } from '../api';
import { PrepareNesRenameResult } from '../nesRenameValidator';
import { CancellationTokenWithTimer } from '../typescripts';

const fixtures = path.join(__dirname, '../../../serverPlugin/fixtures/nes');
const cancellationToken: vscode.CancellationToken = {
	isCancellationRequested: false,
	onCancellationRequested: () => ({ dispose() { } }),
};

const TestAnnotationSchema = z.object({
	title: z.string(),
	oldName: z.string(),
	newName: z.string(),
	expected: z.string(),
	delta: z.number().optional(),
});

suite.skip('TypeScript 7 NES rename engine', () => {
	let api: API;

	beforeAll(() => {
		api = new API({ cwd: process.cwd() });
	});

	afterAll(async () => {
		await api.close();
	});

	test('matches prepare rename fixture expectations', async () => {
		const state = await openProject(api, 'p1');
		try {
			const actual: { title: string; expected: protocol.RenameKind; result: protocol.PrepareNesRenameResult }[] = [];
			const expression = /\/\/\/\/\s(\{.*\})/g;
			let match: RegExpExecArray | null;
			while ((match = expression.exec(state.sourceFile.text)) !== null) {
				const parsed = TestAnnotationSchema.safeParse(JSON.parse(match[1]));
				if (!parsed.success) {
					continue;
				}
				const annotationPosition = state.sourceFile.getLineAndCharacterOfPosition(match.index);
				const position = state.sourceFile.getPositionOfLineAndCharacter(annotationPosition.line + 1, annotationPosition.character + (parsed.data.delta ?? 0));
				const result = new PrepareNesRenameResult();
				await prepareNesRename(result, api, state.snapshot, state.project, state.sourceFile, position, parsed.data.oldName, parsed.data.newName, undefined, createToken());
				actual.push({ title: parsed.data.title, expected: protocol.RenameKind.fromString(parsed.data.expected), result: result.toJsonResponse() });
			}
			assert.deepStrictEqual(actual.filter(item => item.result.canRename !== item.expected), []);
		} finally {
			await state.snapshot.dispose();
		}
	});

	test('prepares and computes edits on the old state', async () => {
		const state = await openProject(api, 'p2');
		try {
			const declarationStart = state.sourceFile.text.indexOf('bar2', state.sourceFile.text.indexOf('const bar2'));
			const declarationEnd = declarationStart + 'bar2'.length;
			const firstReference = state.sourceFile.text.indexOf('bar);');
			const secondReference = state.sourceFile.text.indexOf('bar);', firstReference + 1);
			const lastSymbolRename: protocol.Range = {
				start: toPosition(state.sourceFile, declarationStart),
				end: toPosition(state.sourceFile, declarationEnd),
			};
			const result = new PrepareNesRenameResult();
			await prepareNesRename(result, api, state.snapshot, state.project, state.sourceFile, firstReference, 'bar', 'bar2', lastSymbolRename, createToken());
			const groups = await nesRename(api, state.snapshot, state.project, state.sourceFile, firstReference, 'bar', 'bar2', lastSymbolRename, createToken());

			assert.deepStrictEqual({ prepare: result.toJsonResponse(), groups }, {
				prepare: { canRename: protocol.RenameKind.yes, oldName: 'bar', onOldState: true },
				groups: [{
					file: state.sourceFile.fileName,
					changes: [firstReference, secondReference].map(start => ({
						range: {
							start: toPosition(state.sourceFile, start),
							end: toPosition(state.sourceFile, start + 'bar'.length),
						},
					})),
				}],
			});
		} finally {
			await state.snapshot.dispose();
		}
	});

	test('rejects renames of default library symbols', async () => {
		// const state = await openProject(api, 'p2');
		// try {
		// 	const oldName = 'log';
		// 	const newName = 'collect';
		// 	const firstReference = state.sourceFile.text.indexOf(`.${oldName}`) + 1;
		// 	const secondReference = state.sourceFile.text.indexOf(`.${oldName}`, firstReference + oldName.length) + 1;
		// 	const delta = newName.length - oldName.length;
		// 	const lastSymbolRename: protocol.Range = {
		// 		start: toPosition(state.sourceFile, firstReference),
		// 		end: toPosition(state.sourceFile, firstReference + newName.length),
		// 	};
		// 	const updatedText = state.sourceFile.text.substring(0, firstReference) + newName + state.sourceFile.text.substring(firstReference + oldName.length);
		// 	const result = new PrepareNesRenameResult();
		// 	await prepareNesRename(result, api, state.snapshot, state.project, state.sourceFile, secondReference, oldName, newName, undefined, createToken());

		// 	let groups: protocol.RenameGroup[] = [];
		// 	await api.runWithTemporaryFileUpdate(state.snapshot, state.sourceFile.fileName, updatedText, async updatedSnapshot => {
		// 		const updatedProject = updatedSnapshot.getProject(state.project.configFileName) ?? await updatedSnapshot.getDefaultProjectForFile(state.sourceFile.fileName);
		// 		const updatedSourceFile = await updatedProject?.program.getSourceFile(state.sourceFile.fileName);
		// 		assert.ok(updatedProject !== undefined && updatedSourceFile !== undefined);
		// 		groups = await nesRename(api, updatedSnapshot, updatedProject, updatedSourceFile, secondReference + delta, oldName, newName, lastSymbolRename, createToken());
		// 	});

		// 	assert.deepStrictEqual({ prepare: result.toJsonResponse(), groups }, {
		// 		prepare: { canRename: protocol.RenameKind.no, timedOut: false, reason: 'The symbol is declared in a library file' },
		// 		groups: [],
		// 	});
		// } finally {
		// 	await state.snapshot.dispose();
		// }
	});
});

type ProjectState = {
	readonly snapshot: Snapshot;
	readonly project: Project;
	readonly sourceFile: SourceFile;
};

async function openProject(api: API, projectName: string): Promise<ProjectState> {
	const projectDirectory = path.join(fixtures, projectName);
	const configFile = path.join(projectDirectory, 'tsconfig.json');
	const fileName = path.join(projectDirectory, 'source/test.ts');
	assert.ok(fs.existsSync(fileName));
	const snapshot = await api.updateSnapshot({ openProjects: [configFile] });
	const project = snapshot.getProject(configFile) ?? await snapshot.getDefaultProjectForFile(fileName);
	assert.ok(project !== undefined, `No project for ${fileName}`);
	const sourceFile = await project.program.getSourceFile(fileName);
	assert.ok(sourceFile !== undefined, `No source file for ${fileName}`);
	return { snapshot, project, sourceFile };
}

function createToken(): CancellationTokenWithTimer {
	return new CancellationTokenWithTimer(cancellationToken, Date.now(), 30_000);
}

function toPosition(sourceFile: SourceFile, position: number): protocol.Position {
	const result = sourceFile.getLineAndCharacterOfPosition(position);
	return { line: result.line, character: result.character };
}
