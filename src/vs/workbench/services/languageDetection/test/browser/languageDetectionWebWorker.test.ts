/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { ModelResult } from '@vscode/vscode-languagedetection';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { adjustLanguageConfidence, minimumConfidenceFor, rankModelResults } from '../../browser/languageDetectionWebWorker.js';

suite('LanguageDetectionWorker - ranking model results', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Builds model output the way the model reports it: ranked by descending confidence.
	 */
	function results(...pairs: [languageId: string, confidence: number][]): ModelResult[] {
		return pairs.map(([languageId, confidence]) => ({ languageId, confidence }));
	}

	function rank(...pairs: [languageId: string, confidence: number][]): string[] {
		return [...rankModelResults(results(...pairs))].map(r => r.languageId);
	}

	test('reports a runaway winner', () => {
		assert.deepStrictEqual(rank(['rs', 0.92], ['go', 0.04], ['c', 0.01]), ['rs']);
	});

	// The cases below all used to detect nothing at all, because the previous implementation
	// accumulated candidates into an array that it then never yielded.

	test('reports a moderate leader with a close runner up', () => {
		assert.deepStrictEqual(rank(['rs', 0.35], ['go', 0.19], ['lua', 0.05]), ['rs']);
	});

	test('reports the leader when confidence falls off gradually', () => {
		assert.deepStrictEqual(rank(['rs', 0.30], ['go', 0.25], ['lua', 0.22], ['pl', 0.19]), ['rs', 'go', 'lua']);
	});

	test('reports every plausible language when no gap ever opens up', () => {
		assert.deepStrictEqual(rank(['rs', 0.40], ['go', 0.35], ['lua', 0.30], ['pl', 0.25]), ['rs', 'go', 'lua', 'pl']);
	});

	test('reports a leader that only just clears the bar', () => {
		assert.deepStrictEqual(rank(['rs', 0.25], ['go', 0.15]), ['rs']);
	});

	test('reports the leaders ahead of a clear drop-off', () => {
		assert.deepStrictEqual(rank(['rs', 0.50], ['go', 0.35], ['lua', 0.10]), ['rs', 'go']);
	});

	test('reports nothing when the leader is below the bar', () => {
		assert.deepStrictEqual(rank(['rs', 0.19], ['go', 0.15]), []);
	});

	test('reports nothing when there is no model output', () => {
		assert.deepStrictEqual([...rankModelResults([])], []);
		assert.deepStrictEqual([...rankModelResults(undefined)], []);
	});

	test('a positive correction can lift a language over the bar', () => {
		// 'js' is in the first correction bucket (+0.05), so 0.17 becomes 0.22
		assert.deepStrictEqual(rank(['js', 0.17]), ['js']);
		// ...while an uncorrected language at the same confidence stays below it
		assert.deepStrictEqual(rank(['rs', 0.17]), []);
	});

	test('languages held to a stricter bar are reachable but demanding', () => {
		assert.deepStrictEqual(rank(['sql', 0.55]), ['sql']);
		assert.deepStrictEqual(rank(['sql', 0.35]), []);
		assert.deepStrictEqual(rank(['ini', 0.55]), ['ini']);
		assert.deepStrictEqual(rank(['makefile', 0.35]), []);
	});

	test('a strict language does not suppress the leaders before it', () => {
		assert.deepStrictEqual(rank(['py', 0.45], ['sql', 0.30]), ['py']);
	});

	test('minimumConfidenceFor distinguishes strict languages', () => {
		assert.strictEqual(minimumConfidenceFor('rs'), 0.2);
		assert.strictEqual(minimumConfidenceFor('js'), 0.2);
		for (const languageId of ['bat', 'ini', 'makefile', 'sql', 'csv', 'toml']) {
			assert.strictEqual(minimumConfidenceFor(languageId), 0.5, languageId);
		}
	});

	test('adjustLanguageConfidence does not mutate its input', () => {
		const original: ModelResult = { languageId: 'js', confidence: 0.17 };
		const adjusted = adjustLanguageConfidence(original);

		assert.strictEqual(original.confidence, 0.17);
		assert.ok(adjusted.confidence > original.confidence);
		// evaluating the same result twice must not compound the correction
		assert.strictEqual(adjustLanguageConfidence(original).confidence, adjusted.confidence);
	});

	test('adjustLanguageConfidence leaves uncorrected languages alone', () => {
		assert.strictEqual(adjustLanguageConfidence({ languageId: 'rs', confidence: 0.4 }).confidence, 0.4);
		assert.strictEqual(adjustLanguageConfidence({ languageId: 'yaml', confidence: 0.4 }).confidence, 0.4);
	});
});
