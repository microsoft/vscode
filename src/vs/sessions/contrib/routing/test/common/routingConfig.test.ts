/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	RoutingConfig,
	clearAgentRoute,
	defaultRoutingConfig,
	parseRoutingConfig,
	serializeRoutingConfig,
	setAgentRoute,
	validateRoutingConfig,
} from '../../common/routingConfig.js';

suite('RoutingConfig', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('parseRoutingConfig accepts a valid file', () => {
		const raw = JSON.stringify({
			version: 1,
			agents: {
				orchestrator: {
					primary: { provider: 'anthropic-oauth', model: 'claude-opus-4-7' },
					fallback: [
						{ provider: 'copilot', model: 'claude-opus' },
					],
				},
				coder: {
					primary: { provider: 'copilot', model: 'claude-sonnet' },
				},
			},
		});

		const result = parseRoutingConfig(raw);
		assert.deepStrictEqual(result, {
			ok: true,
			config: {
				version: 1,
				agents: {
					orchestrator: {
						primary: { provider: 'anthropic-oauth', model: 'claude-opus-4-7' },
						fallback: [
							{ provider: 'copilot', model: 'claude-opus' },
						],
					},
					coder: {
						primary: { provider: 'copilot', model: 'claude-sonnet' },
					},
				},
			},
		});
	});

	test('parseRoutingConfig defaults missing version to 1', () => {
		const raw = JSON.stringify({
			agents: {
				orchestrator: { primary: { provider: 'anthropic-oauth', model: 'claude-opus-4-7' } },
			},
		});
		const result = parseRoutingConfig(raw);
		assert.strictEqual(result.ok, true);
		assert.strictEqual(result.ok && result.config.version, 1);
	});

	test('parseRoutingConfig rejects malformed JSON', () => {
		const result = parseRoutingConfig('{not json');
		assert.strictEqual(result.ok, false);
		assert.match((result as { ok: false; error: string }).error, /Invalid JSON/);
	});

	test('validateRoutingConfig surfaces structural errors with field paths', () => {
		const cases: ReadonlyArray<{ value: unknown; expected: RegExp }> = [
			{ value: null, expected: /must be an object/ },
			{ value: { version: 2, agents: {} }, expected: /Unsupported version/ },
			{ value: { agents: 'no' }, expected: /agents/ },
			{ value: { agents: { 'Bad Role': { primary: { provider: 'p', model: 'm' } } } }, expected: /Invalid agent role id/ },
			{ value: { agents: { coder: { primary: 'no' } } }, expected: /agents\.coder: primary/ },
			{ value: { agents: { coder: { primary: { provider: '', model: 'm' } } } }, expected: /provider.*non-empty/ },
			{ value: { agents: { coder: { primary: { provider: 'p', model: 'm' }, fallback: 'no' } } }, expected: /fallback must be an array/ },
			{ value: { agents: { coder: { primary: { provider: 'p', model: 'm' }, fallback: [{ provider: 'x' }] } } }, expected: /fallback\[0\]: `model`/ },
		];

		const results = cases.map(({ value }) => {
			const r = validateRoutingConfig(value);
			return r.ok ? null : r.error;
		});

		assert.deepStrictEqual(
			results.map((msg, i) => msg && cases[i].expected.test(msg)),
			cases.map(() => true),
		);
	});

	test('serializeRoutingConfig produces deterministic, sorted output with trailing newline', () => {
		const config: RoutingConfig = {
			version: 1,
			agents: {
				zeta: { primary: { provider: 'p', model: 'm' } },
				alpha: {
					primary: { provider: 'a', model: 'm1' },
					fallback: [{ provider: 'b', model: 'm2' }],
				},
			},
		};

		const serialized = serializeRoutingConfig(config);
		const reparsed = parseRoutingConfig(serialized);

		assert.deepStrictEqual(
			{
				endsWithNewline: serialized.endsWith('\n'),
				orderOfRoles: Object.keys((JSON.parse(serialized.trim()) as RoutingConfig).agents),
				reparseOk: reparsed.ok,
				reparseValue: reparsed.ok ? reparsed.config : null,
			},
			{
				endsWithNewline: true,
				orderOfRoles: ['alpha', 'zeta'],
				reparseOk: true,
				reparseValue: {
					version: 1,
					agents: {
						alpha: {
							primary: { provider: 'a', model: 'm1' },
							fallback: [{ provider: 'b', model: 'm2' }],
						},
						zeta: { primary: { provider: 'p', model: 'm' } },
					},
				},
			},
		);
	});

	test('serializeRoutingConfig drops empty fallback arrays', () => {
		const config: RoutingConfig = {
			version: 1,
			agents: {
				coder: { primary: { provider: 'p', model: 'm' }, fallback: [] },
			},
		};
		const obj = JSON.parse(serializeRoutingConfig(config)) as { agents: { coder: { fallback?: unknown } } };
		assert.strictEqual('fallback' in obj.agents.coder, false);
	});

	test('setAgentRoute returns a new config without mutating the input', () => {
		const original = defaultRoutingConfig();
		const beforeRoles = Object.keys(original.agents).sort();
		const next = setAgentRoute(original, 'reviewer', {
			primary: { provider: 'copilot', model: 'claude-opus' },
		});

		assert.deepStrictEqual(
			{
				originalUntouched: Object.keys(original.agents).sort(),
				originalReviewer: original.agents['reviewer'],
				newReviewer: next.agents['reviewer'],
				originalIsNotNext: original !== next,
			},
			{
				originalUntouched: beforeRoles,
				originalReviewer: { primary: { provider: 'anthropic-oauth', model: 'claude-sonnet-4-6' } },
				newReviewer: { primary: { provider: 'copilot', model: 'claude-opus' } },
				originalIsNotNext: true,
			},
		);
	});

	test('clearAgentRoute removes a role without touching the others', () => {
		const original = defaultRoutingConfig();
		const next = clearAgentRoute(original, 'orchestrator');

		assert.deepStrictEqual(
			{
				orchestratorRemoved: !('orchestrator' in next.agents),
				othersPreserved: Object.keys(next.agents).sort(),
				originalUnchanged: 'orchestrator' in original.agents,
			},
			{
				orchestratorRemoved: true,
				othersPreserved: ['coder', 'explorer', 'reviewer', 'tester'],
				originalUnchanged: true,
			},
		);
	});

	test('defaultRoutingConfig is itself valid and round-trips through serialize/parse', () => {
		const config = defaultRoutingConfig();
		const reparsed = parseRoutingConfig(serializeRoutingConfig(config));
		assert.strictEqual(reparsed.ok, true);
		assert.deepStrictEqual(reparsed.ok && reparsed.config, config);
	});
});
