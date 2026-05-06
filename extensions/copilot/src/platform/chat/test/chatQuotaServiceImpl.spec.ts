/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { Emitter } from '../../../util/vs/base/common/event';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { ChatQuotaService } from '../common/chatQuotaServiceImpl';

function createMockAuthService(): IAuthenticationService {
	return {
		_serviceBrand: undefined,
		copilotToken: undefined,
		onDidAuthenticationChange: new Emitter().event,
	} as unknown as IAuthenticationService;
}

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

	describe('processQuotaHeaders with totRem', () => {
		test('parses totalRemaining from header', () => {
			const svc = create();
			const mockAuthService = createMockAuthService();
			(mockAuthService as any).copilotToken = { isFreeUser: false };
			(svc as any)._authService = mockAuthService;

			const headers = {
				get: (name: string) => {
					if (name === 'x-quota-snapshot-premium_models') {
						return 'ent=3900&rem=97.4&ovPerm=true&ov=0.0&totRem=3800.0';
					}
					return null;
				}
			};
			svc.processQuotaHeaders(headers as any);
			expect(svc.quotaInfo?.totalRemaining).toBe(3800.0);
			expect(svc.quotaInfo?.quota).toBe(3900);
		});
	});
});
