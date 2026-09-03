/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert';
import path from 'node:path';

import { API } from '@typescript/native/unstable/async';
import * as vscode from 'vscode';
import { afterAll, beforeAll, suite, test } from 'vitest';

import type { LineRange, Region } from '../../../../../platform/languageContextProvider/common/regionContextProvider';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import { TS7RegionContextProvider } from '../regionContextProvider';

const fixtures = path.join(__dirname, '../../../serverPlugin/fixtures/context');
const projectDirectory = path.join(fixtures, 'p14');
const configFile = path.join(projectDirectory, 'tsconfig.json');
const fileName = path.join(projectDirectory, 'source/f1.ts');

suite('TypeScript 7 region context', () => {
	let api: API;

	beforeAll(() => {
		api = new API({ cwd: process.cwd() });
	});

	afterAll(async () => {
		await api.close();
	});

	async function getRegions(ranges: vscode.Range[], requested?: LineRange): Promise<Region[] | undefined> {
		const provider = new TS7RegionContextProvider(new TestLogService(), new TestTypeScript7Api(api, configFile));
		try {
			return await provider.getRegions(vscode.Uri.file(fileName), 'typescript', ranges, requested);
		} finally {
			provider.dispose();
		}
	}

	test('returns enclosing structural regions', async () => {
		assert.deepStrictEqual(await getRegions([range(9, 2)]), [
			{ kind: 'constructor', name: 'constructor', range: { start: 8, end: 10 } },
			{ kind: 'class', name: 'Calculator', range: { start: 5, end: 23 } },
			{ kind: 'sourceFile', name: 'f1.ts', range: { start: 0, end: 32 } },
		] satisfies Region[]);
	});

	test('merges distinct innermost regions', async () => {
		assert.deepStrictEqual(await getRegions([range(13, 2), range(18, 2)]), [
			{ kind: 'merged', range: { start: 12, end: 22 } },
			{ kind: 'class', name: 'Calculator', range: { start: 5, end: 23 } },
			{ kind: 'sourceFile', name: 'f1.ts', range: { start: 0, end: 32 } },
		] satisfies Region[]);
	});

	test('groups property signatures within the requested range', async () => {
		assert.deepStrictEqual(await getRegions([range(1, 1), range(2, 1)], { start: 1, end: 2 }), [
			{ kind: 'interface-members', name: 'Result', range: { start: 1, end: 2 } },
			{ kind: 'sourceFile', name: 'f1.ts', range: { start: 0, end: 32 } },
		] satisfies Region[]);
	});
});

class TestTypeScript7Api {
	constructor(
		private readonly api: API,
		private readonly configFile: string,
	) { }

	async getApi() {
		return {
			clearSourceFileCache: () => this.api.clearSourceFileCache(),
			updateSnapshot: () => this.api.updateSnapshot({ openProjects: [this.configFile] }),
		};
	}

	dispose(): void { }
}

function range(line: number, character: number = 0): vscode.Range {
	return new vscode.Range(line, character, line, character);
}
