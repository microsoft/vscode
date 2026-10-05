/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentSession, IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agent.js';
import { ICodexAccountInfo } from '../../../../../platform/agentHost/common/codexAccount.js';
import { toCodexModelProvider } from '../../../../../platform/agentHost/common/codexModelSelection.js';
import { PolicyState, SessionModelInfo, SessionStatus } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ChatEntitlement, hasUsableCopilotPremiumQuota } from '../../../chat/common/chatEntitlementService.js';
import { CODEX_CONTINUATION_MAX_AGE, getCodexContinuationCandidates, getCodexTriggeringLimits, ICodexContinuationEpisode, updateCodexEpisode } from '../../browser/codexContinuation.js';

suite('Codex continuation eligibility', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const now = 1_000_000_000;
	const account = (overrides: Partial<ICodexAccountInfo> = {}): ICodexAccountInfo => ({ status: 'signedIn', planType: 'plus', observedAt: now, rateLimits: [{ usedPercent: 90, windowDurationMins: 300, resetsAt: now / 1000 + 60 }], ...overrides });

	for (const plan of ['go', 'plus', 'pro', 'prolite', 'team', 'business', 'enterprise', 'edu', 'edu_plus', 'self_serve_business_usage_based']) {
		test(`accepts paid ChatGPT plan ${plan}`, () => assert.strictEqual(getCodexTriggeringLimits(account({ planType: plan }), now).length, 1));
	}
	for (const plan of ['free', 'unknown', 'future-plan', undefined]) {
		test(`rejects unresolved or free ChatGPT plan ${plan}`, () => assert.deepStrictEqual(getCodexTriggeringLimits(account({ planType: plan }), now), []));
	}
	test('requires fresh observations, supported durations, threshold, and a future reset', () => {
		const cases: Partial<ICodexAccountInfo>[] = [
			{ status: 'signedOut' }, { observedAt: undefined }, { observedAt: now + 1 }, { observedAt: now - CODEX_CONTINUATION_MAX_AGE - 1 },
			...[89.99, NaN, 101].map(usedPercent => ({ rateLimits: [{ usedPercent, windowDurationMins: 300 }] })),
			{ rateLimits: [{ usedPercent: 95, windowDurationMins: 60 }] },
			{ rateLimits: [{ usedPercent: 95, windowDurationMins: 300, resetsAt: now / 1000 }] },
		];
		assert.deepStrictEqual(cases.map(value => getCodexTriggeringLimits(account(value), now)), cases.map(() => []));
		assert.strictEqual(getCodexTriggeringLimits(account({ observedAt: now - CODEX_CONTINUATION_MAX_AGE }), now).length, 1);
	});
	test('overlapping limits extend suppression until the last reset', () => {
		const episode: ICodexContinuationEpisode = { owner: 'one', surface: 'editorWindow', limits: getCodexTriggeringLimits(account(), now) };
		const both = account({ rateLimits: [...account().rateLimits!, { usedPercent: 95, windowDurationMins: 10080, resetsAt: now / 1000 + 180 }] });
		const extended = updateCodexEpisode(episode, both, now)!;
		assert.deepStrictEqual([extended.limits.length, updateCodexEpisode(extended, both, now + 60_000)?.limits.length, updateCodexEpisode(extended, both, now + 180_000)], [2, 1, undefined]);
	});
	for (const windowDurationMins of [300, 10080]) {
		test(`configurable thresholds are inclusive for the ${windowDurationMins}-minute limit`, () => {
			const cases = [
				{ threshold: 0, usage: -1, eligible: false }, { threshold: 0, usage: 0, eligible: true },
				{ threshold: 80, usage: 79.99, eligible: false }, { threshold: 80, usage: 80, eligible: true }, { threshold: 80, usage: 85, eligible: true },
				{ threshold: 90, usage: 89.99, eligible: false }, { threshold: 90, usage: 90, eligible: true },
				{ threshold: 95.5, usage: 95.49, eligible: false }, { threshold: 95.5, usage: 95.5, eligible: true },
				{ threshold: 100, usage: 99.99, eligible: false }, { threshold: 100, usage: 100, eligible: true }, { threshold: 100, usage: 101, eligible: false },
			];
			assert.deepStrictEqual(cases.map(({ threshold, usage }) => getCodexTriggeringLimits(account({
				rateLimits: [{ usedPercent: usage, windowDurationMins }],
			}), now, threshold).length > 0), cases.map(value => value.eligible));
		});
	}
	test('a custom threshold extends suppression to another qualifying usage window', () => {
		const initial = account({ rateLimits: [{ usedPercent: 80, windowDurationMins: 300, resetsAt: now / 1000 + 60 }] });
		const episode: ICodexContinuationEpisode = { owner: 'one', surface: 'editorWindow', limits: getCodexTriggeringLimits(initial, now, 80) };
		const both = { ...initial, rateLimits: [...initial.rateLimits!, { usedPercent: 85, windowDurationMins: 10080, resetsAt: now / 1000 + 180 }] };
		assert.deepStrictEqual(updateCodexEpisode(episode, both, now, 80)?.limits.map(limit => limit.duration), [300, 10080]);
	});
	test('unknown-reset suppression clears below the configured threshold, not the default', () => {
		const initial = account({ rateLimits: [{ usedPercent: 80, windowDurationMins: 300 }] });
		const episode: ICodexContinuationEpisode = { owner: 'one', surface: 'agentsWindow', limits: getCodexTriggeringLimits(initial, now, 80) };
		assert.deepStrictEqual([79.99, 80, 85].map(usedPercent => updateCodexEpisode(episode, {
			...initial, observedAt: now + 1000, rateLimits: [{ usedPercent, windowDurationMins: 300 }],
		}, now + 1000, 80)?.limits[0].until), [undefined, now + 300 * 60_000, now + 300 * 60_000]);
	});
	test('legacy episodes retain their original 90-percent recovery boundary', () => {
		const episode: ICodexContinuationEpisode = {
			owner: 'one', surface: 'agentsWindow',
			limits: [{ duration: 300, until: now + 300 * 60_000, observedAt: now, reliable: false }],
		};
		const fresh = account({ observedAt: now + 1000, rateLimits: [{ usedPercent: 85, windowDurationMins: 300 }] });
		assert.strictEqual(updateCodexEpisode(episode, fresh, now + 1000, 80), undefined);
	});
	test('unknown resets do not slide and clear only on newer fresh below-threshold data', () => {
		const unknown = account({ rateLimits: [{ usedPercent: 95, windowDurationMins: 300 }] });
		const episode: ICodexContinuationEpisode = { owner: 'one', surface: 'agentsWindow', limits: getCodexTriggeringLimits(unknown, now) };
		const below = { ...unknown, observedAt: now + 1000, rateLimits: [{ usedPercent: 10, windowDurationMins: 300 }] };
		assert.deepStrictEqual([
			updateCodexEpisode(episode, { ...unknown, observedAt: now + 1000 }, now + 1000)?.limits[0].until,
			updateCodexEpisode(episode, below, now + 1000),
			updateCodexEpisode(episode, below, now + CODEX_CONTINUATION_MAX_AGE + 1001)?.limits.length,
			updateCodexEpisode(episode, unknown, now + 300 * 60_000),
		], [now + 300 * 60_000, undefined, 1, undefined]);
	});
	test('individual overage is eligible at zero credits; managed blocks and missing allowances fail closed', () => {
		const zero = { premiumChat: { unlimited: false, percentRemaining: 0, hasQuota: false } };
		assert.deepStrictEqual([
			hasUsableCopilotPremiumQuota(ChatEntitlement.Pro, zero),
			hasUsableCopilotPremiumQuota(ChatEntitlement.Pro, { ...zero, additionalUsageEnabled: true }),
			hasUsableCopilotPremiumQuota(ChatEntitlement.Business, { ...zero, additionalUsageEnabled: true }),
			hasUsableCopilotPremiumQuota(ChatEntitlement.Enterprise, { premiumChat: { unlimited: true, percentRemaining: 100, hasQuota: false } }),
			hasUsableCopilotPremiumQuota(ChatEntitlement.Free, { premiumChat: { unlimited: false, percentRemaining: 100 } }),
			hasUsableCopilotPremiumQuota(ChatEntitlement.Pro, {}),
			hasUsableCopilotPremiumQuota(ChatEntitlement.Pro, { premiumChat: { unlimited: false, percentRemaining: NaN } }),
		], [false, true, false, false, false, false, false]);
	});
	test('exact qualified pairing requires subscription metadata and prefers active then recency', () => {
		const source: SessionModelInfo = { provider: 'codex', id: '@provider=openai:gpt', name: 'Source name', _meta: { modelSourceId: 'chatgptSubscription' } };
		const target: SessionModelInfo = { provider: 'codex', id: '@provider=vscode-proxy:gpt', name: 'Different target name' };
		const session = (id: string, modifiedTime: number, model = source.id): IAgentSessionMetadata => ({ session: AgentSession.uri('codex', id), startTime: 0, modifiedTime, model: { id: model } });
		const sessions = [session('old', 1), session('new', 2), session('bare', 3, 'gpt'), session('custom', 4, '@provider=custom:gpt')];
		assert.deepStrictEqual([
			getCodexContinuationCandidates(sessions, [source, target]).map(candidate => AgentSession.id(candidate.session.session)),
			getCodexContinuationCandidates(sessions, [source, target], sessions[0].session.toString()).map(candidate => AgentSession.id(candidate.session.session)),
			getCodexContinuationCandidates(sessions, [{ ...source, _meta: undefined }, target]),
			getCodexContinuationCandidates(sessions, [source, { ...target, policyState: PolicyState.Disabled }]),
			getCodexContinuationCandidates(sessions, [source, { ...target, id: '@provider=vscode-proxy:other', name: source.name }]),
		], [['new', 'old'], ['old', 'new'], [], [], []]);
	});
	test('archived active sessions do not outrank newer candidates', () => {
		const source: SessionModelInfo = { provider: 'codex', id: '@provider=openai:gpt', name: 'GPT', _meta: { modelSourceId: 'chatgptSubscription' } };
		const target: SessionModelInfo = { provider: 'codex', id: '@provider=vscode-proxy:gpt', name: 'GPT Copilot' };
		const archived: IAgentSessionMetadata = { session: AgentSession.uri('codex', 'archived'), startTime: 0, modifiedTime: 1, model: { id: source.id }, status: SessionStatus.IsArchived };
		const external: IAgentSessionMetadata = { session: AgentSession.uri('codex', 'external'), startTime: 0, modifiedTime: 2, model: { id: source.id } };
		assert.deepStrictEqual(
			getCodexContinuationCandidates([archived, external], [source, target], archived.session.toString()).map(candidate => AgentSession.id(candidate.session.session)),
			['external'],
		);
	});
	test('turn provider is a bounded dispatch fact', () => {
		assert.deepStrictEqual(['openai', 'vscode-proxy', 'private-provider', '', undefined].map(toCodexModelProvider), ['openai', 'copilot', 'other', 'unknown', 'unknown']);
	});
});
