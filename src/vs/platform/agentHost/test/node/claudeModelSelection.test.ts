/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CLAUDE_AGENT_PROVIDER_ID, IAgentModelInfo } from '../../common/agent.js';
import { AGENT_MODEL_GROUP_ID_META_KEY } from '../../common/agentModelSource.js';
import { CLAUDE_PROVIDER_ANTHROPIC, CLAUDE_PROVIDER_COPILOT } from '../../common/claudeProviders.js';
import { claudeTransportForProvider, mergeClaudeModelCatalogs, parseClaudeModelSelection, resolveClaudeSessionTransport, toClaudeModelSelectionId, toClaudeSdkModelId } from '../../node/claude/claudeModelSelection.js';

suite('claudeModelSelection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('round trips provider and model identifiers, url-encoding separators', () => {
		const id = toClaudeModelSelectionId('custom/provider', 'org/model:latest');
		assert.strictEqual(id, '@provider=custom%2Fprovider:org%2Fmodel%3Alatest');
		assert.deepStrictEqual(parseClaudeModelSelection({ id }), {
			provider: 'custom/provider',
			modelId: 'org/model:latest',
			explicitProvider: true,
		});
	});

	test('a bare (un-prefixed) id decodes to the default Copilot provider, id passed through', () => {
		assert.deepStrictEqual(parseClaudeModelSelection({ id: 'claude-opus-4-8' }), {
			provider: CLAUDE_PROVIDER_COPILOT,
			modelId: 'claude-opus-4-8',
			explicitProvider: false,
		});
	});

	test('a malformed prefix (no separator) falls back to the default Copilot provider', () => {
		assert.deepStrictEqual(parseClaudeModelSelection({ id: '@provider=anthropic' }), {
			provider: CLAUDE_PROVIDER_COPILOT,
			modelId: '@provider=anthropic',
			explicitProvider: false,
		});
	});

	test('the same model under two providers does not collide', () => {
		assert.notStrictEqual(
			toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-opus-4-8'),
			toClaudeModelSelectionId(CLAUDE_PROVIDER_ANTHROPIC, 'claude-opus-4-8'),
		);
	});

	test('provider maps to transport: anthropic is native, everything else (incl. copilot/unknown) is proxy', () => {
		assert.deepStrictEqual(
			[
				claudeTransportForProvider(CLAUDE_PROVIDER_ANTHROPIC),
				claudeTransportForProvider(CLAUDE_PROVIDER_COPILOT),
				claudeTransportForProvider('something-else'),
			],
			['native', 'proxy', 'proxy'],
		);
	});

	suite('mergeClaudeModelCatalogs', () => {

		const model = (id: string, name: string, supportsVision = false): IAgentModelInfo =>
			({ provider: CLAUDE_AGENT_PROVIDER_ID, id, name, supportsVision });

		test('lists proxy models first, qualifies each id + stamps each transport group into _meta, preserves provider and every other field', () => {
			const merged = mergeClaudeModelCatalogs(
				[model('claude-opus-4-8', 'Claude Opus 4.8', true)],
				[model('claude-sonnet-4-5-20250929', 'Claude Sonnet 4.5')],
			);
			// The input carries the harness provider (`claude`); the merge keeps it as the
			// routing owner and instead stamps each model's transport/group token into
			// `_meta` (`modelGroupId`) so the picker groups Copilot-routed and native
			// Anthropic models into separate buckets without misrouting `create_session`.
			assert.deepStrictEqual(merged, [
				{ provider: CLAUDE_AGENT_PROVIDER_ID, id: '@provider=copilot:claude-opus-4-8', name: 'Claude Opus 4.8', supportsVision: true, _meta: { [AGENT_MODEL_GROUP_ID_META_KEY]: CLAUDE_PROVIDER_COPILOT } },
				{ provider: CLAUDE_AGENT_PROVIDER_ID, id: '@provider=anthropic:claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', supportsVision: false, _meta: { [AGENT_MODEL_GROUP_ID_META_KEY]: CLAUDE_PROVIDER_ANTHROPIC } },
			]);
		});

		test('one empty source does not blank the other (a single failed fetch keeps the other provider)', () => {
			assert.deepStrictEqual(
				[
					mergeClaudeModelCatalogs([model('claude-opus-4-8', 'Opus')], []).map(m => m.id),
					mergeClaudeModelCatalogs([], [model('claude-opus-4-8', 'Opus')]).map(m => m.id),
				],
				[
					['@provider=copilot:claude-opus-4-8'],
					['@provider=anthropic:claude-opus-4-8'],
				],
			);
		});

		test('the same model offered by both providers becomes two distinct, non-colliding rows', () => {
			assert.deepStrictEqual(
				mergeClaudeModelCatalogs([model('claude-opus-4-8', 'Opus')], [model('claude-opus-4-8', 'Opus')]).map(m => m.id),
				['@provider=copilot:claude-opus-4-8', '@provider=anthropic:claude-opus-4-8'],
			);
		});
	});

	suite('resolveClaudeSessionTransport', () => {

		test('with no explicit model, falls back to the host default (preserving today\'s default)', () => {
			assert.deepStrictEqual(
				[
					resolveClaudeSessionTransport({ model: undefined, defaultMode: 'proxy' }),
					resolveClaudeSessionTransport({ model: undefined, defaultMode: 'native' }),
				],
				['proxy', 'native'],
			);
		});

		test('derives the transport from the selected model\'s provider, overriding the default', () => {
			assert.deepStrictEqual(
				[
					resolveClaudeSessionTransport({ model: { id: toClaudeModelSelectionId(CLAUDE_PROVIDER_ANTHROPIC, 'claude-opus-4-8') }, defaultMode: 'proxy' }),
					resolveClaudeSessionTransport({ model: { id: toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-opus-4-8') }, defaultMode: 'native' }),
				],
				['native', 'proxy'],
			);
		});

		test('with a bare/legacy id (no explicit provider) follows the host default, not the copilot fallback', () => {
			// A bare id carries no explicit provider, so per-session resolution must not
			// reroute it: a session persisted before provider qualification existed —
			// e.g. a native BYO-Anthropic session, whose id is a bare SDK id — keeps its
			// host-default transport in both directions rather than being forced onto
			// the proxy (which would trigger a spurious GitHub sign-in).
			assert.deepStrictEqual(
				[
					resolveClaudeSessionTransport({ model: { id: 'claude-opus-4-8' }, defaultMode: 'native' }),
					resolveClaudeSessionTransport({ model: { id: 'claude-opus-4-8' }, defaultMode: 'proxy' }),
				],
				['native', 'proxy'],
			);
		});
	});

	suite('toClaudeSdkModelId', () => {

		test('peels off the provider qualification and normalizes to the bare SDK id; a legacy bare id and undefined pass through', () => {
			// A provider-qualified id must be stripped to its bare model id before
			// SDK-normalization, or the unparseable `@provider=…` string reaches the
			// subprocess verbatim and 400s. A bare/legacy id has no
			// wrapper and just normalizes (dotted→dashed); undefined stays undefined.
			assert.deepStrictEqual(
				[
					toClaudeSdkModelId({ id: toClaudeModelSelectionId(CLAUDE_PROVIDER_ANTHROPIC, 'claude-sonnet-4-5-20250929') }),
					toClaudeSdkModelId({ id: toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-opus-4.6') }),
					toClaudeSdkModelId({ id: 'claude-opus-4.6' }),
					toClaudeSdkModelId(undefined),
				],
				['claude-sonnet-4-5', 'claude-opus-4-6', 'claude-opus-4-6', undefined],
			);
		});
	});
});
