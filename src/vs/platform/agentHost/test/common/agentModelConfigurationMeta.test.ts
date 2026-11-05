/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { agentModelConfigurationMetaKey, readAgentManagedModelDefaults, readAgentModelConfigurationDefaults, readAgentRuntimeModelConfiguration, withAgentManagedModelDefaults, withAgentModelConfigurationDefaults } from '../../common/meta/agentModelConfigurationMeta.js';
import type { SessionModelInfo } from '../../common/state/protocol/state.js';
import { agentModelConfigurationReportKey, readAgentModelConfigurationReport } from '../../common/agentModelConfiguration.js';

suite('Chat-scoped model configuration report', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const report = { models: { model: { defaults: { effort: 'high' }, readOnly: ['effort'], managedDefaults: ['effort'] } }, current: { id: 'model', config: { effort: 'high' } } };

	test('reads the exact advertised chat without sharing peer state and supports removal', () => {
		const config = JSON.parse(JSON.stringify({ [agentModelConfigurationReportKey]: { 'opaque:chat-one': report, 'opaque:chat-two': null } }));
		assert.deepStrictEqual([
			readAgentModelConfigurationReport(config, 'opaque:chat-one'),
			readAgentModelConfigurationReport(config, 'opaque:chat-two'),
			readAgentModelConfigurationReport(config, 'opaque:other'),
		], [report, undefined, undefined]);
	});

	test('ignores malformed optional state rather than accepting forged option schemas', () => {
		const invalid = [null, [], {}, { models: { model: { defaults: { effort: [] }, readOnly: [] } } }, { models: { model: { defaults: {}, readOnly: ['missing'] } } }, { models: { model: { defaults: {}, readOnly: [], managedDefaults: ['missing'] } } }, { models: {}, current: { id: 1 } }];
		assert.deepStrictEqual(invalid.map(value => readAgentModelConfigurationReport({ [agentModelConfigurationReportKey]: { chat: value } }, 'chat')), invalid.map(() => undefined));
	});
});

suite('Model configuration default metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const model: SessionModelInfo = {
		id: 'opaque-model', provider: 'test-provider', name: 'Example',
		configSchema: { type: 'object', properties: { effort: { type: 'string', title: 'Effort', enum: ['low', 'high'] } } },
	};

	test('accepts declared keys and deduplicates without exposing unrelated metadata', () => {
		assert.deepStrictEqual(readAgentModelConfigurationDefaults({
			...model, _meta: withAgentModelConfigurationDefaults({ unrelated: true }, ['effort', 'effort']),
		}), ['effort']);
	});

	test('ignores absent, malformed and undeclared keys', () => {
		const values = [undefined, null, true, 'effort', {}, [1], ['absent'], ['effort', null]];
		assert.deepStrictEqual(values.map(value => readAgentModelConfigurationDefaults({
			...model, _meta: { 'vscode.modelConfiguration.defaults': value },
		})), values.map(() => undefined));
	});

	test('managed startup preferences are optional and validate declared option keys', () => {
		const valid = { model: true, keys: ['effort'] };
		const invalid = [undefined, null, [], true, {}, { model: 'true', keys: [] }, { model: true, keys: ['missing'] }, { model: false, keys: [1] }];
		assert.deepStrictEqual([
			readAgentManagedModelDefaults({ ...model, _meta: withAgentManagedModelDefaults(undefined, valid) }),
			...invalid.map(value => readAgentManagedModelDefaults({ ...model, _meta: { 'vscode.modelConfiguration.managedDefaults': value } })),
		], [valid, ...invalid.map(() => undefined)]);
	});
});

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
