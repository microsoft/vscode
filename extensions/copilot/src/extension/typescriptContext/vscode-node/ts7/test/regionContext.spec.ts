/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert';
import path from 'node:path';

import { API } from '@typescript/native/unstable/async';
import * as vscode from 'vscode';
import { afterAll, beforeAll, suite, test } from 'vitest';

import type { LineRange, RegionResult } from '../../../../../platform/languageContextProvider/common/regionContextProvider';
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

	async function getRegions(ranges: vscode.Range[], requested?: LineRange): Promise<RegionResult | undefined> {
		const provider = new TS7RegionContextProvider(new TestLogService(), new TestTypeScript7Api(api, configFile));
		try {
			return await provider.getRegions(vscode.Uri.file(fileName), 'typescript', ranges, requested);
		} finally {
			provider.dispose();
		}
	}

	test('returns enclosing structural regions', async () => {
		assert.deepStrictEqual(await getRegions([range(9, 2)]), {
			regions: [
				{ kind: 'constructor', name: 'constructor', range: { start: 8, end: 10 } },
				{ kind: 'class', name: 'Calculator', range: { start: 5, end: 23 } },
				{ kind: 'sourceFile', name: 'f1.ts', range: { start: 0, end: 32 } },
			],
			paths: { smallest: [110, 211, 226, 244, 241, 176, 263, 307] }
		} satisfies RegionResult);
	});

	test('merges distinct innermost regions', async () => {
		assert.deepStrictEqual(await getRegions([range(13, 2), range(18, 2)]), {
			regions: [
				{ kind: 'merged', range: { start: 12, end: 22 } },
				{ kind: 'class', name: 'Calculator', range: { start: 5, end: 23 } },
				{ kind: 'sourceFile', name: 'f1.ts', range: { start: 0, end: 32 } },
			],
			paths: {
				smallest: [110, 211, 226, 244, 241, 174, 263, 307],
				largest: [107, 253, 241, 174, 263, 307]
			}
		} satisfies RegionResult);
	});

	test('selects paths by region span', async () => {
		assert.deepStrictEqual((await getRegions([range(9, 2), range(13, 2)]))?.paths, {
			smallest: [110, 211, 226, 244, 241, 176, 263, 307],
			largest: [110, 211, 226, 244, 241, 174, 263, 307]
		});
	});

	test('groups property signatures within the requested range', async () => {
		assert.deepStrictEqual(await getRegions([range(1, 1), range(2, 1)], { start: 1, end: 2 }), {
			regions: [
				{ kind: 'interface-members', name: 'Result', range: { start: 1, end: 2 } },
				{ kind: 'sourceFile', name: 'f1.ts', range: { start: 0, end: 32 } },
			],
			paths: {
				smallest: [80, 171, 264, 307],
				largest: [80, 171, 264, 307]
			}
		} satisfies RegionResult);
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
