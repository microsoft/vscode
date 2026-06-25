/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ILanguageModelConfigurationSchema } from '../../../../common/languageModels.js';
import { resolveContextWindowInputTokens } from '../../../../browser/widgetHosts/viewPane/chatContextUsageWidget.js';

const FULL_WINDOW = 1_000_000;
const DEFAULT_TIER = 200_000;

const schemaWithContextSize: ILanguageModelConfigurationSchema = {
	properties: {
		thinkingEffort: { enum: ['low', 'medium', 'high'], default: 'medium' },
		contextSize: { type: 'number', default: DEFAULT_TIER },
	}
};

// A model that exposes no context-size picker (e.g. no tiered pricing).
const schemaWithoutContextSize: ILanguageModelConfigurationSchema = {
	properties: {
		thinkingEffort: { enum: ['low', 'medium', 'high'], default: 'medium' },
	}
};

suite('resolveContextWindowInputTokens', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses an explicit configured contextSize over everything else', () => {
		assert.strictEqual(
			resolveContextWindowInputTokens({ contextSize: 500_000 }, schemaWithContextSize, FULL_WINDOW),
			500_000,
		);
	});

	test('falls back to the schema default tier when contextSize is absent (regression for #320393)', () => {
		// The exact bug: a resolved configuration missing `contextSize` must NOT
		// make the gauge jump to the model's full native window. It must match the
		// default tier the request uses.
		assert.strictEqual(
			resolveContextWindowInputTokens({ thinkingEffort: 'high' }, schemaWithContextSize, FULL_WINDOW),
			DEFAULT_TIER,
		);
		assert.strictEqual(
			resolveContextWindowInputTokens(undefined, schemaWithContextSize, FULL_WINDOW),
			DEFAULT_TIER,
		);
	});

	test('ignores a non-numeric configured contextSize and uses the schema default', () => {
		assert.strictEqual(
			resolveContextWindowInputTokens({ contextSize: 'big' }, schemaWithContextSize, FULL_WINDOW),
			DEFAULT_TIER,
		);
	});

	test('falls through to the full window when the schema has no contextSize default', () => {
		// Models without a context-size picker have no schema default, so default
		// and max are the same value and the full window is correct.
		assert.strictEqual(
			resolveContextWindowInputTokens({ thinkingEffort: 'high' }, schemaWithoutContextSize, FULL_WINDOW),
			FULL_WINDOW,
		);
		assert.strictEqual(
			resolveContextWindowInputTokens(undefined, undefined, FULL_WINDOW),
			FULL_WINDOW,
		);
	});

	test('returns undefined when neither a configured value, schema default, nor max window is available', () => {
		assert.strictEqual(resolveContextWindowInputTokens(undefined, undefined, undefined), undefined);
	});
});
