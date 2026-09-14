/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert';
import path from 'node:path';

import { API } from '@typescript/native/unstable/async';
import { afterAll, beforeAll, suite, test } from 'vitest';

import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import { TS7CodeReviewProvider } from '../codeReviewService';
import { expectedRuntimeComplexity, getExpectedTypeScriptMetrics, runtimeComplexitySource, summarizeRuntimeComplexity, summarizeTypeScriptMetrics, typeScriptMetricsSource } from './typeScriptMetricsTestData';

suite('TypeScript 7 metrics', () => {
	let api: API;
	let filePath: string;

	beforeAll(() => {
		api = new API({ cwd: process.cwd() });
		filePath = path.join(__dirname, '../../../serverPlugin/fixtures/context/p14/source/f1.ts');
	});

	afterAll(async () => {
		await api.close();
	});

	test('computes complexity from a file path', async () => {
		const provider = new TS7CodeReviewProvider(new TestLogService(), new TestTypeScript7Api(api));
		try {
			const result = await provider.computeMetrics(filePath);
			assert.ok(result !== undefined);
			assert.deepStrictEqual(summarizeTypeScriptMetrics(result), [
				{ kind: 'sourceFile', path: [], range: { start: 0, end: 32 }, cognitiveComplexity: 0, cyclomaticComplexity: 1, runtimeComplexity: 'O(1)' },
				{ kind: 'constructor', path: ['Calculator', 'constructor'], range: { start: 8, end: 10 }, cognitiveComplexity: 0, cyclomaticComplexity: 1, runtimeComplexity: 'O(1)' },
				{ kind: 'method', path: ['Calculator', 'add'], range: { start: 12, end: 15 }, cognitiveComplexity: 0, cyclomaticComplexity: 1, runtimeComplexity: 'O(1)' },
				{ kind: 'method', path: ['Calculator', 'getResult'], range: { start: 17, end: 22 }, cognitiveComplexity: 0, cyclomaticComplexity: 1, runtimeComplexity: 'O(1)' },
				{ kind: 'function', path: ['createCalculator'], range: { start: 25, end: 27 }, cognitiveComplexity: 0, cyclomaticComplexity: 1, runtimeComplexity: 'O(1)' },
				{ kind: 'function', path: ['getValue'], range: { start: 29, end: 31 }, cognitiveComplexity: 0, cyclomaticComplexity: 1, runtimeComplexity: 'O(1)' },
			]);
		} finally {
			provider.dispose();
		}
	});

	test('computes complexity for every executable entity from supplied content', async () => {
		const provider = new TS7CodeReviewProvider(new TestLogService(), new TestTypeScript7Api(api));
		try {
			const result = await provider.computeMetrics(filePath, typeScriptMetricsSource);
			assert.ok(result !== undefined);
			assert.deepStrictEqual(summarizeTypeScriptMetrics(result), getExpectedTypeScriptMetrics());
		} finally {
			provider.dispose();
		}
	});

	test('estimates runtime complexity from loop structure', async () => {
		const provider = new TS7CodeReviewProvider(new TestLogService(), new TestTypeScript7Api(api));
		try {
			const result = await provider.computeMetrics(filePath, runtimeComplexitySource);
			assert.ok(result !== undefined);
			assert.deepStrictEqual(summarizeRuntimeComplexity(result), expectedRuntimeComplexity);
		} finally {
			provider.dispose();
		}
	});
});

class TestTypeScript7Api {
	constructor(private readonly api: API) { }

	async getApi(): Promise<API> {
		return this.api;
	}

	dispose(): void { }
}
