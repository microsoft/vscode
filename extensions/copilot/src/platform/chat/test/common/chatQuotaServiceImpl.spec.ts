/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { Emitter } from '../../../../util/vs/base/common/event';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { ChatQuotaService } from '../../common/chatQuotaServiceImpl';

function createMockAuthService(): IAuthenticationService {
	return {
		_serviceBrand: undefined,
		copilotToken: undefined,
		onDidAuthenticationChange: new Emitter().event,
	} as unknown as IAuthenticationService;
}

function createMockAuthServiceWithEmitter(opts?: { isFreeUser?: boolean }) {
	const emitter = new Emitter<void>();
	const authService = {
		_serviceBrand: undefined,
		copilotToken: undefined as { isFreeUser: boolean; quotaInfo: ReturnType<typeof makeQuotaInfo> } | undefined,
		onDidAuthenticationChange: emitter.event,
	} as unknown as IAuthenticationService;
	return {
		authService, emitter, setToken: (quotaInfo: ReturnType<typeof makeQuotaInfo>) => {
			(authService as any).copilotToken = { isFreeUser: opts?.isFreeUser ?? false, quotaInfo };
		}
	};
}

function makeQuotaInfo(overrides: { chat?: Partial<SnapshotData>; premium_interactions?: Partial<SnapshotData> } = {}, resetDate = '2026-06-01T00:00:00Z') {
	return {
		quota_reset_date: resetDate,
		quota_snapshots: {
			chat: { quota_id: 'chat', entitlement: 100, remaining: 50, unlimited: false, overage_count: 0, overage_permitted: false, percent_remaining: 50, ...overrides.chat },
			completions: { quota_id: 'completions', entitlement: 100, remaining: 100, unlimited: false, overage_count: 0, overage_permitted: false, percent_remaining: 100 },
			premium_interactions: { quota_id: 'premium', entitlement: 500, remaining: 400, unlimited: false, overage_count: 5, overage_permitted: true, percent_remaining: 80, ...overrides.premium_interactions },
		},
	};
}

type SnapshotData = { quota_id: string; entitlement: number; remaining: number; unlimited: boolean; overage_count: number; overage_permitted: boolean; percent_remaining: number };

describe('ChatQuotaService', () => {
	function create() {
		return new ChatQuotaService(createMockAuthService());
	}

	const TURN_A = 'turn-a';
	const TURN_B = 'turn-b';

	describe('setLastCopilotUsage', () => {
		test('converts nano-AIUs to AIC credits', () => {
			const svc = create();
			svc.setLastCopilotUsage(1_000_000_000, TURN_A); // 1 AIC
			expect(svc.getCreditsForTurn(TURN_A)).toBe(1);
		});

		test('handles fractional AIC values', () => {
			const svc = create();
			svc.setLastCopilotUsage(500_000_000, TURN_A); // 0.5 AIC
			expect(svc.getCreditsForTurn(TURN_A)).toBe(0.5);
		});

		test('accumulates across multiple calls', () => {
			const svc = create();
			svc.setLastCopilotUsage(300_000_000, TURN_A); // 0.3 AIC
			svc.setLastCopilotUsage(200_000_000, TURN_A); // 0.2 AIC
			expect(svc.getCreditsForTurn(TURN_A)).toBeCloseTo(0.5);
		});

		test('accumulates many small calls correctly', () => {
			const svc = create();
			// Simulate 5 gpt-4o-mini calls at ~0.02 AIC each
			for (let i = 0; i < 5; i++) {
				svc.setLastCopilotUsage(16_470_000, TURN_A);
			}
			// Plus 2 Claude calls at ~25 AIC each
			svc.setLastCopilotUsage(24_782_500_000, TURN_A);
			svc.setLastCopilotUsage(25_580_500_000, TURN_A);
			expect(svc.getCreditsForTurn(TURN_A)).toBeCloseTo(50.45);
		});

		test('ignores zero nano-AIU values', () => {
			const svc = create();
			svc.setLastCopilotUsage(0, TURN_A);
			expect(svc.getCreditsForTurn(TURN_A)).toBeUndefined();
		});

		test('ignores negative nano-AIU values', () => {
			const svc = create();
			svc.setLastCopilotUsage(-100, TURN_A);
			expect(svc.getCreditsForTurn(TURN_A)).toBeUndefined();
		});

		test('does not accumulate zero after valid value', () => {
			const svc = create();
			svc.setLastCopilotUsage(1_000_000_000, TURN_A);
			svc.setLastCopilotUsage(0, TURN_A);
			expect(svc.getCreditsForTurn(TURN_A)).toBe(1);
		});
	});

	describe('resetTurnCredits', () => {
		test('resets accumulated credits to undefined', () => {
			const svc = create();
			svc.setLastCopilotUsage(1_000_000_000, TURN_A);
			expect(svc.getCreditsForTurn(TURN_A)).toBe(1);
			svc.resetTurnCredits(TURN_A);
			expect(svc.getCreditsForTurn(TURN_A)).toBeUndefined();
		});

		test('allows fresh accumulation after reset', () => {
			const svc = create();
			svc.setLastCopilotUsage(1_000_000_000, TURN_A);
			svc.resetTurnCredits(TURN_A);
			svc.setLastCopilotUsage(500_000_000, TURN_A);
			expect(svc.getCreditsForTurn(TURN_A)).toBe(0.5);
		});

		test('is idempotent when already undefined', () => {
			const svc = create();
			svc.resetTurnCredits(TURN_A);
			expect(svc.getCreditsForTurn(TURN_A)).toBeUndefined();
		});
	});

	describe('concurrent turn isolation', () => {
		test('credits for different turns are independent', () => {
			const svc = create();
			svc.setLastCopilotUsage(1_000_000_000, TURN_A);
			svc.setLastCopilotUsage(2_000_000_000, TURN_B);
			expect(svc.getCreditsForTurn(TURN_A)).toBe(1);
			expect(svc.getCreditsForTurn(TURN_B)).toBe(2);
		});

		test('resetting one turn does not affect another', () => {
			const svc = create();
			svc.setLastCopilotUsage(1_000_000_000, TURN_A);
			svc.setLastCopilotUsage(2_000_000_000, TURN_B);
			svc.resetTurnCredits(TURN_A);
			expect(svc.getCreditsForTurn(TURN_A)).toBeUndefined();
			expect(svc.getCreditsForTurn(TURN_B)).toBe(2);
		});

		test('subagent credits accumulate into the parent turn', () => {
			const svc = create();
			// Main agent call
			svc.setLastCopilotUsage(1_000_000_000, TURN_A);
			// Subagent call attributed to same turn
			svc.setLastCopilotUsage(500_000_000, TURN_A);
			expect(svc.getCreditsForTurn(TURN_A)).toBe(1.5);
		});
	});

	describe('realistic turn lifecycle simulation', () => {
		/**
		 * Simulates a single LLM API call in a turn, with a delay to model
		 * real async timing (network latency, streaming, etc.)
		 */
		async function simulateApiCall(
			svc: ChatQuotaService,
			turnId: string,
			nanoAiu: number,
			delayMs: number = 0
		): Promise<void> {
			if (delayMs > 0) {
				await new Promise(resolve => setTimeout(resolve, delayMs));
			}
			svc.setLastCopilotUsage(nanoAiu, turnId);
		}

		/**
		 * Simulates a full agent turn:
		 * 1. resetTurnCredits (turn start)
		 * 2. N API calls with timing
		 * 3. getCreditsForTurn (turn complete → display)
		 */
		async function simulateTurn(
			svc: ChatQuotaService,
			turnId: string,
			calls: { nanoAiu: number; delayMs: number }[]
		): Promise<number | undefined> {
			svc.resetTurnCredits(turnId);
			for (const call of calls) {
				await simulateApiCall(svc, turnId, call.nanoAiu, call.delayMs);
			}
			return svc.getCreditsForTurn(turnId);
		}

		test('simple single-turn with tool loop (3 iterations)', async () => {
			const svc = create();
			const result = await simulateTurn(svc, 'turn-1', [
				{ nanoAiu: 500_000_000, delayMs: 0 },   // initial agent call
				{ nanoAiu: 300_000_000, delayMs: 0 },   // tool call iteration 1
				{ nanoAiu: 200_000_000, delayMs: 0 },   // tool call iteration 2
			]);
			expect(result).toBe(1.0);
		});

		test('agentic turn with subagents and helper calls', async () => {
			const svc = create();
			const turnId = 'turn-agentic';
			svc.resetTurnCredits(turnId);

			// title generation (gpt-4o-mini)
			svc.setLastCopilotUsage(8_640_000, turnId);
			// prompt categorization (gpt-4o-mini)
			svc.setLastCopilotUsage(56_160_000, turnId);
			// progress messages x2 (gpt-4o-mini)
			svc.setLastCopilotUsage(16_470_000, turnId);
			svc.setLastCopilotUsage(16_350_000, turnId);
			// main agent call (Claude Opus)
			svc.setLastCopilotUsage(24_782_500_000, turnId);
			// subagent call (Claude Opus)
			svc.setLastCopilotUsage(25_580_500_000, turnId);
			// final agent call (Claude Opus)
			svc.setLastCopilotUsage(61_741_750_000, turnId);
			// language model wrapper (gpt-4o-mini)
			svc.setLastCopilotUsage(63_180_000, turnId);

			const result = svc.getCreditsForTurn(turnId);
			expect(result).toBeCloseTo(112.27, 1);
		});

		test('two parallel turns in different chat windows — fully isolated', async () => {
			const svc = create();

			// Simulate two turns running concurrently:
			// Turn A: Claude Opus (expensive, slow)
			// Turn B: GPT-4o-mini (cheap, fast — finishes first)
			const [resultA, resultB] = await Promise.all([
				simulateTurn(svc, 'window-1-turn', [
					{ nanoAiu: 56_160_000, delayMs: 0 },      // categorization
					{ nanoAiu: 24_782_500_000, delayMs: 10 },  // Claude main call (slow)
					{ nanoAiu: 25_580_500_000, delayMs: 10 },  // Claude follow-up
				]),
				simulateTurn(svc, 'window-2-turn', [
					{ nanoAiu: 56_160_000, delayMs: 0 },      // categorization
					{ nanoAiu: 8_640_000, delayMs: 5 },        // fast gpt-4o-mini
				]),
			]);

			expect(resultA).toBeCloseTo(50.42, 1);
			expect(resultB).toBeCloseTo(0.06, 1);
		});

		test('interleaved API responses from parallel turns', async () => {
			const svc = create();
			// Simulate the worst case: responses arriving in interleaved order
			// from two different turns
			const turnX = 'panel-turn-x';
			const turnY = 'panel-turn-y';

			svc.resetTurnCredits(turnX);
			svc.resetTurnCredits(turnY);

			// Response from turn X arrives
			svc.setLastCopilotUsage(1_000_000_000, turnX);
			// Response from turn Y arrives (interleaved)
			svc.setLastCopilotUsage(2_000_000_000, turnY);
			// Another response from turn X
			svc.setLastCopilotUsage(3_000_000_000, turnX);
			// Another response from turn Y
			svc.setLastCopilotUsage(4_000_000_000, turnY);
			// Final response from turn X
			svc.setLastCopilotUsage(500_000_000, turnX);

			expect(svc.getCreditsForTurn(turnX)).toBe(4.5);  // 1 + 3 + 0.5
			expect(svc.getCreditsForTurn(turnY)).toBe(6);     // 2 + 4
		});

		test('turn reset during a concurrent turn does not affect the other', async () => {
			const svc = create();
			const turnA = 'turn-a-multi';
			const turnB = 'turn-b-multi';

			svc.setLastCopilotUsage(5_000_000_000, turnA);
			svc.setLastCopilotUsage(3_000_000_000, turnB);

			// User sends a new message in window A → new turn resets A
			svc.resetTurnCredits(turnA);

			// Meanwhile, turn B is still accumulating
			svc.setLastCopilotUsage(2_000_000_000, turnB);

			// New turn A starts accumulating fresh
			svc.setLastCopilotUsage(1_000_000_000, turnA);

			expect(svc.getCreditsForTurn(turnA)).toBe(1);   // fresh after reset
			expect(svc.getCreditsForTurn(turnB)).toBe(5);   // 3 + 2, unaffected
		});

		test('many concurrent turns (stress test)', () => {
			const svc = create();
			const turnCount = 20;
			const callsPerTurn = 10;

			for (let t = 0; t < turnCount; t++) {
				const turnId = `stress-turn-${t}`;
				svc.resetTurnCredits(turnId);
				for (let c = 0; c < callsPerTurn; c++) {
					svc.setLastCopilotUsage(100_000_000, turnId); // 0.1 AIC each
				}
			}

			for (let t = 0; t < turnCount; t++) {
				const turnId = `stress-turn-${t}`;
				expect(svc.getCreditsForTurn(turnId)).toBeCloseTo(1.0); // 10 × 0.1
			}
		});

		test('completed turns are cleaned up on reset', () => {
			const svc = create();
			svc.setLastCopilotUsage(1_000_000_000, 'old-turn');
			expect(svc.getCreditsForTurn('old-turn')).toBe(1);

			svc.resetTurnCredits('old-turn');
			expect(svc.getCreditsForTurn('old-turn')).toBeUndefined();
		});

		test('querying a non-existent turn returns undefined', () => {
			const svc = create();
			expect(svc.getCreditsForTurn('never-existed')).toBeUndefined();
		});
	});

	describe('runSubagent dual-key aggregation', () => {
		// The parent handler reads credits from two keys:
		//   - request.id (parent's own API calls via turnId)
		//   - turn.id (subagent API calls via parentTurnId)
		// This simulates the flow in chatParticipantRequestHandler.getResult()

		function getTotalCredits(svc: ChatQuotaService, requestId: string, turnId: string): number | undefined {
			const ownCredits = svc.getCreditsForTurn(requestId);
			const subagentCredits = svc.getCreditsForTurn(turnId);
			return ownCredits !== undefined || subagentCredits !== undefined
				? (ownCredits ?? 0) + (subagentCredits ?? 0)
				: undefined;
		}

		test('parent-only turn (no subagents) uses request.id key', () => {
			const svc = create();
			const requestId = 'request_abc-123';
			const turnId = 'turn-xyz-456';

			svc.resetTurnCredits(requestId);
			svc.resetTurnCredits(turnId);

			// Parent API calls accumulate under request.id (parentTurnId is undefined)
			svc.setLastCopilotUsage(24_000_000_000, requestId);
			svc.setLastCopilotUsage(2_000_000_000, requestId);

			expect(getTotalCredits(svc, requestId, turnId)).toBe(26);
		});

		test('subagent credits accumulate under parent turn.id', () => {
			const svc = create();
			const parentRequestId = 'request_parent-111';
			const parentTurnId = 'turn-parent-222';

			svc.resetTurnCredits(parentRequestId);
			svc.resetTurnCredits(parentTurnId);

			// Parent's own call (creditKey = parentRequestId since parentTurnId is undefined)
			svc.setLastCopilotUsage(24_000_000_000, parentRequestId);

			// Subagent calls (creditKey = parentTurnId, routed via chatRequestId)
			svc.setLastCopilotUsage(33_000_000_000, parentTurnId);
			svc.setLastCopilotUsage(33_000_000_000, parentTurnId);

			expect(getTotalCredits(svc, parentRequestId, parentTurnId)).toBe(90);
		});

		test('two subagent turns do not interfere', () => {
			const svc = create();
			const reqA = 'request_a';
			const turnA = 'turn-a';
			const reqB = 'request_b';
			const turnB = 'turn-b';

			svc.resetTurnCredits(reqA);
			svc.resetTurnCredits(turnA);
			svc.resetTurnCredits(reqB);
			svc.resetTurnCredits(turnB);

			// Turn A: parent + 2 subagents
			svc.setLastCopilotUsage(24_000_000_000, reqA);
			svc.setLastCopilotUsage(33_000_000_000, turnA);
			svc.setLastCopilotUsage(33_000_000_000, turnA);

			// Turn B: parent + 5 subagents
			svc.setLastCopilotUsage(25_000_000_000, reqB);
			for (let i = 0; i < 5; i++) {
				svc.setLastCopilotUsage(33_000_000_000, turnB);
			}

			expect(getTotalCredits(svc, reqA, turnA)).toBe(90);
			expect(getTotalCredits(svc, reqB, turnB)).toBe(190);
		});

		test('subagent handler does not corrupt parent credits', () => {
			const svc = create();
			const parentReqId = 'request_parent';
			const parentTurnId = 'turn-parent';
			const subagentReqId = 'subagent-call-id';
			const subagentTurnId = 'turn-subagent';

			// Parent starts
			svc.resetTurnCredits(parentReqId);
			svc.resetTurnCredits(parentTurnId);
			svc.setLastCopilotUsage(24_000_000_000, parentReqId);

			// Subagent handler starts — resets its OWN keys (not parent's)
			svc.resetTurnCredits(subagentReqId);
			svc.resetTurnCredits(subagentTurnId);

			// Subagent's API call accumulates under parent's turnId
			svc.setLastCopilotUsage(33_000_000_000, parentTurnId);

			// Subagent reads its own credits (should be undefined — it accumulated under parent)
			expect(svc.getCreditsForTurn(subagentReqId)).toBeUndefined();

			// Parent reads combined credits
			expect(getTotalCredits(svc, parentReqId, parentTurnId)).toBe(57);
		});

		test('overhead calls (title, categorization) are separate from turn credits', () => {
			const svc = create();
			const parentReqId = 'request_main';
			const parentTurnId = 'turn-main';
			const titleTurnId = 'title-turn';
			const categorizationTurnId = 'categorization-turn';

			svc.resetTurnCredits(parentReqId);
			svc.resetTurnCredits(parentTurnId);

			// Title and categorization use their own turnIds
			svc.setLastCopilotUsage(8_000_000, titleTurnId);
			svc.setLastCopilotUsage(56_000_000, categorizationTurnId);

			// Main agent call
			svc.setLastCopilotUsage(24_000_000_000, parentReqId);

			// Subagent call
			svc.setLastCopilotUsage(33_000_000_000, parentTurnId);

			// Parent sees only its own + subagent, not title/categorization
			expect(getTotalCredits(svc, parentReqId, parentTurnId)).toBe(57);
		});
	});

	describe('processUserInfoQuotaSnapshot via auth change', () => {
		test('free user reads from chat snapshot', () => {
			const { authService, emitter, setToken } = createMockAuthServiceWithEmitter({ isFreeUser: true });
			const svc = new ChatQuotaService(authService);

			setToken(makeQuotaInfo({
				chat: { percent_remaining: 30, overage_permitted: false, overage_count: 0, entitlement: 100 },
				premium_interactions: { percent_remaining: 80, overage_permitted: true, overage_count: 5, entitlement: 500 },
			}));
			emitter.fire();

			const quota = svc.quotaInfo;
			expect(quota).toBeDefined();
			expect(quota!.percentRemaining).toBe(30);
			expect(quota!.additionalUsageEnabled).toBe(false);
			expect(quota!.additionalUsageUsed).toBe(0);
			expect(quota!.quota).toBe(100);
		});

		test('paid user reads from premium_interactions snapshot', () => {
			const { authService, emitter, setToken } = createMockAuthServiceWithEmitter({ isFreeUser: false });
			const svc = new ChatQuotaService(authService);

			setToken(makeQuotaInfo({
				chat: { percent_remaining: 30, overage_permitted: false, overage_count: 0, entitlement: 100 },
				premium_interactions: { percent_remaining: 80, overage_permitted: true, overage_count: 5, entitlement: 500 },
			}));
			emitter.fire();

			const quota = svc.quotaInfo;
			expect(quota).toBeDefined();
			expect(quota!.percentRemaining).toBe(80);
			expect(quota!.additionalUsageEnabled).toBe(true);
			expect(quota!.additionalUsageUsed).toBe(5);
			expect(quota!.quota).toBe(500);
		});

		test('fires onDidChange when quota is updated', () => {
			const { authService, emitter, setToken } = createMockAuthServiceWithEmitter({ isFreeUser: true });
			const svc = new ChatQuotaService(authService);
			let changeCount = 0;
			svc.onDidChange(() => changeCount++);

			setToken(makeQuotaInfo());
			emitter.fire();

			expect(changeCount).toBe(1);
		});

		test('no-ops when copilotToken has no quotaInfo', () => {
			const { authService, emitter } = createMockAuthServiceWithEmitter({ isFreeUser: true });
			const svc = new ChatQuotaService(authService);

			(authService as any).copilotToken = { isFreeUser: true, quotaInfo: undefined };
			emitter.fire();

			expect(svc.quotaInfo).toBeUndefined();
		});
	});
});
