/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CODEX_SESSION_MODEL_META_KEY, readCodexSessionModel, withCodexSessionModel } from '../../common/meta/codexSessionModel.js';

suite('Codex session model metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips canonical provider model ids', () => {
		const model = { id: '@provider=openai:gpt-5.6-sol' };
		const meta = withCodexSessionModel({ other: true }, model);

		assert.deepStrictEqual({ meta, model: readCodexSessionModel({ _meta: meta }) }, {
			meta: { other: true, [CODEX_SESSION_MODEL_META_KEY]: model },
			model,
		});
	});

	test('fails closed for absent, malformed, legacy, and non-canonical values', () => {
		const values = [
			undefined,
			{ [CODEX_SESSION_MODEL_META_KEY]: true },
			{ [CODEX_SESSION_MODEL_META_KEY]: {} },
			{ [CODEX_SESSION_MODEL_META_KEY]: { id: 'gpt-5.6-sol' } },
			{ [CODEX_SESSION_MODEL_META_KEY]: { id: '@provider=openai:' } },
			{ [CODEX_SESSION_MODEL_META_KEY]: { id: '@provider=%6fpenai:gpt-5.6-sol' } },
		];

		assert.deepStrictEqual(values.map(_meta => readCodexSessionModel({ _meta })), values.map(() => undefined));
	});

	test('removes invalid or missing selections without dropping other metadata', () => {
		const meta = { other: true, [CODEX_SESSION_MODEL_META_KEY]: { id: '@provider=openai:gpt' } };

		assert.deepStrictEqual([
			withCodexSessionModel(meta, undefined),
			withCodexSessionModel(meta, { id: 'legacy-model' }),
			withCodexSessionModel({ [CODEX_SESSION_MODEL_META_KEY]: { id: '@provider=openai:gpt' } }, undefined),
		], [{ other: true }, { other: true }, undefined]);
	});
});
