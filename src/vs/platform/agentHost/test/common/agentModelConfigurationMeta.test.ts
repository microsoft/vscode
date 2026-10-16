/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { agentModelConfigurationMetaKey, readAgentRuntimeModelConfiguration } from '../../common/meta/agentModelConfigurationMeta.js';

suite('Subagent runtime model configuration metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('accepts resolved and cleared configurations without exposing extra fields', () => {
		assert.deepStrictEqual([
			{},
			{ reasoningEffort: 'xhigh', contextTier: 'long_context', extra: 'ignored' },
			{ reasoningEffort: 'future-effort' },
		].map(value => readAgentRuntimeModelConfiguration({ _meta: { [agentModelConfigurationMetaKey]: value } })), [
			{},
			{ reasoningEffort: 'xhigh', contextTier: 'long_context' },
			{ reasoningEffort: 'future-effort' },
		]);
	});

	test('ignores absent or malformed optional metadata', () => {
		const values = [undefined, null, [], 'high', { reasoningEffort: 1 }, { contextTier: false }, { reasoningEffort: '' }, { contextTier: 'x'.repeat(101) }];
		assert.deepStrictEqual([
			readAgentRuntimeModelConfiguration(undefined),
			readAgentRuntimeModelConfiguration({}),
			...values.map(value => readAgentRuntimeModelConfiguration({ _meta: { [agentModelConfigurationMetaKey]: value } })),
		], Array.from({ length: values.length + 2 }, () => undefined));
	});
});
