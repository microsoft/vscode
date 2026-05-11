/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Emitter } from '../../../../util/vs/base/common/event';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { IChatQuota, IChatQuotaService } from '../../../../platform/chat/common/chatQuotaService';

// ---- vscode mock -----------------------------------------------------------

const mockNotification = {
	severity: 0,
	dismissible: false,
	autoDismissOnMessage: false,
	message: '',
	description: '',
	actions: [] as { label: string; commandId: string }[],
	show: vi.fn(),
	hide: vi.fn(),
	dispose: vi.fn(),
};

vi.mock('vscode', () => ({
	ChatInputNotificationSeverity: { Info: 1 },
	chat: {
		createInputNotification: vi.fn(() => mockNotification),
	},
	l10n: { t: (str: string, ...args: unknown[]) => str.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)])) },
}));

import { ChatInputNotificationContribution } from '../chatInputNotification.contribution';

// ---- helpers ---------------------------------------------------------------

function createAuthService(opts?: { anyGitHubSession?: unknown; copilotToken?: unknown }) {
	const emitter = new Emitter<void>();
	const hasSession = opts && 'anyGitHubSession' in opts;
	const hasToken = opts && 'copilotToken' in opts;
	const authService = {
		_serviceBrand: undefined,
		anyGitHubSession: hasSession ? opts.anyGitHubSession : { accessToken: 'tok' },
		copilotToken: hasToken ? opts.copilotToken : { isFreeUser: false, isNoAuthUser: false },
		onDidAuthenticationChange: emitter.event,
	} as unknown as IAuthenticationService;
	return { authService, emitter };
}

function makeQuota(percentRemaining: number, opts?: Partial<IChatQuota>): IChatQuota {
	return {
		quota: 100,
		percentRemaining,
		unlimited: false,
		additionalUsageUsed: 0,
		additionalUsageEnabled: false,
		resetDate: new Date('2026-06-01T00:00:00Z'),
		...opts,
	};
}

function createQuotaService(opts?: {
	quotaExhausted?: boolean;
	quotaInfo?: IChatQuota;
	session?: IChatQuota;
	weekly?: IChatQuota;
	additionalUsageEnabled?: boolean;
}) {
	const emitter = new Emitter<void>();
	const quotaService = {
		_serviceBrand: undefined,
		onDidChange: emitter.event,
		quotaExhausted: opts?.quotaExhausted ?? false,
		quotaInfo: opts?.quotaInfo,
		rateLimitInfo: { session: opts?.session, weekly: opts?.weekly },
		additionalUsageEnabled: opts?.additionalUsageEnabled ?? false,
		getCreditsForTurn: () => undefined,
		processQuotaHeaders: vi.fn(),
		processQuotaSnapshots: vi.fn(),
		setLastCopilotUsage: vi.fn(),
		resetTurnCredits: vi.fn(),
		clearQuota: vi.fn(),
	} as unknown as IChatQuotaService;
	return { quotaService, emitter };
}

// ---- tests -----------------------------------------------------------------

describe('ChatInputNotificationContribution', () => {
	let authEmitter: Emitter<void>;
	let authService: IAuthenticationService;
	let quotaEmitter: Emitter<void>;
	let quotaService: IChatQuotaService;
	let contribution: ChatInputNotificationContribution;

	function setup(authOpts?: Parameters<typeof createAuthService>[0], quotaOpts?: Parameters<typeof createQuotaService>[0]) {
		const auth = createAuthService(authOpts);
		const quota = createQuotaService(quotaOpts);
		authEmitter = auth.emitter;
		authService = auth.authService;
		quotaEmitter = quota.emitter;
		quotaService = quota.quotaService;
		contribution = new ChatInputNotificationContribution(authService, quotaService);
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockNotification.show.mockClear();
		mockNotification.hide.mockClear();
		mockNotification.message = '';
		mockNotification.description = '';
		mockNotification.actions = [];
	});

	afterEach(() => {
		contribution?.dispose();
	});

	// --- sign-out behaviour (the PR change) ---------------------------------

	describe('sign-out clears state and hides notification', () => {
		test('hides notification when copilot token disappears (sign out)', () => {
			setup(
				{},
				{ quotaExhausted: true },
			);

			// Trigger _update with exhausted quota → shows notification
			quotaEmitter.fire();
			expect(mockNotification.show).toHaveBeenCalled();

			// User signs out — copilot token cleared
			(authService as any).copilotToken = undefined;
			authEmitter.fire();

			expect(mockNotification.hide).toHaveBeenCalled();
		});

		test('records state after sign-out + sign-in and warns on new crossing', () => {
			setup(
				{},
				{ quotaInfo: makeQuota(30) }, // 70% used, below 75%
			);

			// Seed on initial load — no notification
			quotaEmitter.fire();
			expect(mockNotification.show).not.toHaveBeenCalled();

			// Cross 75% threshold during session
			(quotaService as any).quotaInfo = makeQuota(20); // 80% used
			quotaEmitter.fire();
			expect(mockNotification.show).toHaveBeenCalledTimes(1);
			mockNotification.show.mockClear();

			// Sign out → thresholds and seed flag cleared
			(authService as any).copilotToken = undefined;
			authEmitter.fire();

			// Sign back in — same usage level re-seeds, no notification
			(authService as any).copilotToken = { isFreeUser: false, isNoAuthUser: false };
			authEmitter.fire();
			expect(mockNotification.show).not.toHaveBeenCalled();

			// Usage increases past 90% → new crossing shows notification
			(quotaService as any).quotaInfo = makeQuota(5); // 95% used
			quotaEmitter.fire();
			expect(mockNotification.show).toHaveBeenCalled();
		});

		test('sign-out resets showingExhausted flag', () => {
			setup(
				{},
				{ quotaExhausted: true },
			);

			// Show exhausted notification
			quotaEmitter.fire();
			expect(mockNotification.show).toHaveBeenCalled();
			mockNotification.show.mockClear();

			// Sign out — copilot token cleared
			(authService as any).copilotToken = undefined;
			authEmitter.fire();

			// Sign back in, quota no longer exhausted
			(authService as any).copilotToken = { isFreeUser: false, isNoAuthUser: false };
			(quotaService as any).quotaExhausted = false;
			(quotaService as any).quotaInfo = undefined;
			(quotaService as any).rateLimitInfo = { session: undefined, weekly: undefined };
			authEmitter.fire();

			// Should NOT call hide again (showingExhausted was reset on sign-out)
			// and should NOT show a new notification (no thresholds crossed)
			expect(mockNotification.show).not.toHaveBeenCalled();
		});

		test('sign-out while no notification was active is harmless', () => {
			setup();

			// No quota events fired yet → no notification created
			(authService as any).copilotToken = undefined;
			authEmitter.fire();

			// hide is only called on the notification object; since none was
			// created, this should not throw.
			expect(mockNotification.hide).not.toHaveBeenCalled();
		});

		test('anonymous user with no GitHub session still sees quota notifications', () => {
			setup(
				{ anyGitHubSession: undefined, copilotToken: { isNoAuthUser: true, isFreeUser: false } },
				{ quotaExhausted: true },
			);

			// Anonymous user has a copilotToken but no GitHub session.
			// They should still see the exhausted notification.
			quotaEmitter.fire();

			expect(mockNotification.show).toHaveBeenCalled();
			expect(mockNotification.message).toBe('Credit Limit Reached');
			expect(mockNotification.description).toBe('Sign in to keep going.');
		});
	});

	// --- basic notification lifecycle ----------------------------------------

	describe('quota exhausted', () => {
		test('shows exhausted notification', () => {
			setup(
				{ copilotToken: { isFreeUser: true, isNoAuthUser: false } },
				{ quotaExhausted: true },
			);

			quotaEmitter.fire();

			expect(mockNotification.show).toHaveBeenCalled();
			expect(mockNotification.message).toBe('Credit Limit Reached');
		});

		test('hides exhausted when quota is no longer exhausted', () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaExhausted: true },
			);

			quotaEmitter.fire();
			expect(mockNotification.show).toHaveBeenCalled();

			// Quota replenished
			(quotaService as any).quotaExhausted = false;
			quotaEmitter.fire();

			expect(mockNotification.hide).toHaveBeenCalled();
		});
	});

	describe('quota approaching threshold', () => {
		test('does not show approaching warning on initial load', () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaInfo: makeQuota(5) }, // 95% used on initial load
			);

			quotaEmitter.fire();

			expect(mockNotification.show).not.toHaveBeenCalled();
		});

		test('does not warn when quota info first appears (no previous state)', () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{}, // no quotaInfo initially
			);

			quotaEmitter.fire();
			expect(mockNotification.show).not.toHaveBeenCalled();

			// Quota info arrives for the first time already past 90%
			(quotaService as any).quotaInfo = makeQuota(10);
			quotaEmitter.fire();

			expect(mockNotification.show).not.toHaveBeenCalled();
		});

		test('shows warning when crossing 50% threshold during session', () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaInfo: makeQuota(100) }, // 0% used initially
			);

			// Seed
			quotaEmitter.fire();
			expect(mockNotification.show).not.toHaveBeenCalled();

			// Cross 50% threshold
			(quotaService as any).quotaInfo = makeQuota(50);
			quotaEmitter.fire();

			expect(mockNotification.show).toHaveBeenCalled();
			expect(mockNotification.message).toBe('Credits at 50%');
		});

		test('reports highest crossed threshold when skipping multiple', () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaInfo: makeQuota(100) }, // 0% used
			);

			quotaEmitter.fire();

			// Jump from 0% to 92% — crosses 50, 75, 90 at once
			(quotaService as any).quotaInfo = makeQuota(8);
			quotaEmitter.fire();

			expect(mockNotification.show).toHaveBeenCalled();
			expect(mockNotification.message).toBe('Credits at 92%');
		});

		test('does not re-show the same threshold', () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaInfo: makeQuota(100) }, // 0% used initially
			);

			// Seed
			quotaEmitter.fire();

			// Cross 50% threshold
			(quotaService as any).quotaInfo = makeQuota(50);
			quotaEmitter.fire();
			expect(mockNotification.show).toHaveBeenCalledTimes(1);

			mockNotification.show.mockClear();
			quotaEmitter.fire();
			expect(mockNotification.show).not.toHaveBeenCalled();
		});

		test('does not warn when usage increases within the same threshold band', () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaInfo: makeQuota(100) }, // 0% used
			);

			quotaEmitter.fire();

			// Cross 50%
			(quotaService as any).quotaInfo = makeQuota(45); // 55%
			quotaEmitter.fire();
			expect(mockNotification.show).toHaveBeenCalledTimes(1);
			mockNotification.show.mockClear();

			// Increase to 60% — still between 50 and 75, no new threshold
			(quotaService as any).quotaInfo = makeQuota(40); // 60%
			quotaEmitter.fire();
			expect(mockNotification.show).not.toHaveBeenCalled();
		});

		test('re-warns when usage drops below a threshold and re-crosses it', () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaInfo: makeQuota(100) }, // 0% used
			);

			quotaEmitter.fire();

			// Cross 50%
			(quotaService as any).quotaInfo = makeQuota(45); // 55%
			quotaEmitter.fire();
			expect(mockNotification.show).toHaveBeenCalledTimes(1);
			mockNotification.show.mockClear();

			// Usage drops to 40% (below 50%)
			(quotaService as any).quotaInfo = makeQuota(60); // 40%
			quotaEmitter.fire();
			expect(mockNotification.show).not.toHaveBeenCalled();

			// Re-cross 50%
			(quotaService as any).quotaInfo = makeQuota(45); // 55%
			quotaEmitter.fire();
			expect(mockNotification.show).toHaveBeenCalledTimes(1);
			expect(mockNotification.message).toBe('Credits at 55%');
		});

		test('shows higher threshold when usage increases', () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaInfo: makeQuota(100) }, // 0% used initially
			);

			// Seed
			quotaEmitter.fire();

			// Cross 50% threshold
			(quotaService as any).quotaInfo = makeQuota(50);
			quotaEmitter.fire();
			expect(mockNotification.show).toHaveBeenCalledTimes(1);

			mockNotification.show.mockClear();
			(quotaService as any).quotaInfo = makeQuota(10); // 90% used
			quotaEmitter.fire();

			expect(mockNotification.show).toHaveBeenCalled();
			expect(mockNotification.message).toBe('Credits at 90%');
		});

		test('caps percentage at 100% when percentRemaining is negative', () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaInfo: makeQuota(100) }, // 0% used
			);

			quotaEmitter.fire();

			// Somehow percentRemaining goes negative
			(quotaService as any).quotaInfo = makeQuota(-5);
			quotaEmitter.fire();

			expect(mockNotification.show).toHaveBeenCalled();
			// Should say 100%, not 105%
			expect(mockNotification.message).toBe('Credits at 100%');
		});
	});

	describe('rate limit warning', () => {
		test('shows session rate limit warning when crossing threshold', () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaInfo: makeQuota(100), session: makeQuota(100) }, // 0% session initially
			);

			// Record initial state
			quotaEmitter.fire();

			// Session rate limit crosses 75%
			(quotaService as any).rateLimitInfo = { session: makeQuota(25), weekly: undefined };
			quotaEmitter.fire();

			expect(mockNotification.show).toHaveBeenCalled();
			expect(mockNotification.message).toContain('75%');
			expect(mockNotification.message).toContain('session');
		});

		test('shows weekly rate limit warning when crossing threshold', () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaInfo: makeQuota(100), weekly: makeQuota(100) }, // 0% weekly initially
			);

			// Record initial state
			quotaEmitter.fire();

			// Weekly rate limit crosses 90%
			(quotaService as any).rateLimitInfo = { session: undefined, weekly: makeQuota(10) };
			quotaEmitter.fire();

			expect(mockNotification.show).toHaveBeenCalled();
			expect(mockNotification.message).toContain('90%');
			expect(mockNotification.message).toContain('weekly');
		});

		test('does not show rate limit warning on initial load', () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaInfo: makeQuota(100), session: makeQuota(25) }, // session at 75% on load
			);

			quotaEmitter.fire();

			expect(mockNotification.show).not.toHaveBeenCalled();
		});
	});

	describe('priority ordering', () => {
		test('exhausted takes priority over threshold warning', () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaExhausted: true, quotaInfo: makeQuota(5) },
			);

			quotaEmitter.fire();

			expect(mockNotification.message).toBe('Credit Limit Reached');
		});

		test('threshold warning takes priority over rate limit', () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaInfo: makeQuota(100) }, // 0% used initially
			);

			// Seed
			quotaEmitter.fire();

			// Both quota and rate limit cross thresholds
			(quotaService as any).quotaInfo = makeQuota(10); // 90% quota
			(quotaService as any).rateLimitInfo = { session: makeQuota(25), weekly: undefined }; // 75% session
			quotaEmitter.fire();

			expect(mockNotification.message).toBe('Credits at 90%');
		});
	});

	describe('never-signed-in user still gets notifications', () => {
		test('shows exhausted notification even with no copilot token initially', () => {
			setup(
				{ copilotToken: undefined },
				{ quotaExhausted: true, quotaInfo: makeQuota(5) },
			);

			quotaEmitter.fire();

			// User was never signed in, so no transition occurred —
			// notifications should still flow through normally.
			expect(mockNotification.show).toHaveBeenCalled();
			expect(mockNotification.message).toBe('Credit Limit Reached');
		});
	});

	describe('non-UBB (PRU) users see no notifications', () => {
		test('hides notification when quota is unlimited', () => {
			setup(
				{},
				{ quotaInfo: makeQuota(10, { unlimited: true }) },
			);

			quotaEmitter.fire();

			expect(mockNotification.show).not.toHaveBeenCalled();
		});

		test('hides existing notification when quota becomes unlimited', () => {
			setup(
				{},
				{ quotaInfo: makeQuota(100) }, // 0% used initially
			);

			// Seed, then cross threshold
			quotaEmitter.fire();
			(quotaService as any).quotaInfo = makeQuota(10); // 90% used
			quotaEmitter.fire();
			expect(mockNotification.show).toHaveBeenCalled();

			// Quota switches to unlimited (PRU)
			(quotaService as any).quotaInfo = makeQuota(10, { unlimited: true });
			quotaEmitter.fire();

			expect(mockNotification.hide).toHaveBeenCalled();
		});

		test('does not show rate limit warning for unlimited quota users', () => {
			setup(
				{},
				{ quotaInfo: makeQuota(100, { unlimited: true }), session: makeQuota(25) },
			);

			quotaEmitter.fire();

			expect(mockNotification.show).not.toHaveBeenCalled();
		});

		test('does not show exhausted notification for unlimited quota users', () => {
			setup(
				{},
				{ quotaExhausted: true, quotaInfo: makeQuota(0, { unlimited: true }) },
			);

			quotaEmitter.fire();

			expect(mockNotification.show).not.toHaveBeenCalled();
		});
	});
});
