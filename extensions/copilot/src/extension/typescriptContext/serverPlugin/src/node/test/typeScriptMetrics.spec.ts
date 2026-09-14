/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert';

import ts from 'typescript';
import { beforeAll, suite, test } from 'vitest';

import type * as codeMetrics from '../../common/codeMetrics';
import { getExpectedTypeScriptMetrics, summarizeTypeScriptMetrics, typeScriptMetricsSource } from './typeScriptMetricsTestData';

let TypeScriptMetricsProvider: typeof codeMetrics.TypeScriptMetricsProvider;

beforeAll(async () => {
	const TS = await import('../../common/typescript');
	TS.default.install(ts);
	TypeScriptMetricsProvider = (await import('../../common/codeMetrics')).TypeScriptMetricsProvider;
});

suite('TypeScript 6 metrics', () => {
	test('computes complexity for every executable entity', () => {
		const sourceFile = ts.createSourceFile('metrics.ts', typeScriptMetricsSource, ts.ScriptTarget.Latest, true);
		const result = new TypeScriptMetricsProvider().compute(sourceFile);

		assert.deepStrictEqual(summarizeTypeScriptMetrics(result), getExpectedTypeScriptMetrics());
	});
});
