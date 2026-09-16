/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as vscode from 'vscode';

import { TS6CodeReviewProvider } from '../ts6/codeReviewService';

suite('TypeScript 6 code review integration', () => {
	const diskContent = 'export const disk = true;\n';
	let directory: string;
	let file: vscode.Uri;
	let provider: TS6CodeReviewProvider;

	setup(async () => {
		directory = await fs.mkdtemp(join(tmpdir(), 'copilot-ts6-review-'));
		file = vscode.Uri.file(join(directory, 'source.ts'));
		await fs.writeFile(file.fsPath, diskContent);
		provider = new TS6CodeReviewProvider();
		assert.strictEqual(vscode.workspace.textDocuments.some(document => document.uri.toString() === file.toString()), false);
	});

	teardown(async () => {
		provider.dispose();
		await fs.rm(directory, { recursive: true, force: true });
	});

	test('classifies exact snapshots for an initially unloaded file without editing it', async () => {
		const result = await provider.classifyChanges({
			filePath: file.fsPath,
			modified: {
				content: 'export function after() {\n\treturn 2;\n}\n',
				added: [],
				changed: [{ start: 0, end: 3 }],
			},
			original: {
				content: 'export function before() {\n\treturn 1;\n}\n',
				deleted: [{ start: 0, end: 3 }],
			},
		});
		assert.deepStrictEqual({
			modifiedPaths: result?.modified.map(bucket => bucket.path),
			originalPaths: result?.original.map(bucket => bucket.path),
			documentContent: (await vscode.workspace.openTextDocument(file)).getText(),
			diskContent: await fs.readFile(file.fsPath, 'utf8'),
			visible: vscode.window.visibleTextEditors.some(editor => editor.document.uri.toString() === file.toString()),
		}, {
			modifiedPaths: [['after']],
			originalPaths: [['before']],
			documentContent: diskContent,
			diskContent,
			visible: false,
		});
	});

	test('computes metrics from explicit content for an initially unloaded file', async () => {
		const result = await provider.computeMetrics(file.fsPath, 'export function snapshot() { return 1; }\n');
		assert.deepStrictEqual({
			snapshotFunction: result?.entities.some(entity => entity.path.at(-1) === 'snapshot'),
			documentContent: (await vscode.workspace.openTextDocument(file)).getText(),
			diskContent: await fs.readFile(file.fsPath, 'utf8'),
		}, {
			snapshotFunction: true,
			documentContent: diskContent,
			diskContent,
		});
	});
});
