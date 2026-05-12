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
		copilotToken: hasToken ? opts.copilotToken : { isFreeUser: false, isNoAuthUser: false, isUsageBasedBilling: true },
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
		refreshQuota: vi.fn().mockResolvedValue(undefined),
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

	// --- sign-out behaviour --------------------------------------------------

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

		test('shows newly crossed threshold after sign-out + sign-in', async () => {
			setup({}, { quotaInfo: makeQuota(60) }); // 40% used — baseline

			// Establish baseline
			quotaEmitter.fire();

			// Cross 50% threshold → notification shown
			(quotaService as any).quotaInfo = makeQuota(50);
			quotaEmitter.fire();
			await Promise.resolve();
			expect(mockNotification.show).toHaveBeenCalledTimes(1);
			mockNotification.show.mockClear();

			// Sign out → prev values cleared
			(authService as any).copilotToken = undefined;
			authEmitter.fire();

			// Sign back in — quota still at 50% → baseline stored, no notification
			(authService as any).copilotToken = { isFreeUser: false, isNoAuthUser: false, isUsageBasedBilling: true };
			quotaEmitter.fire();
			expect(mockNotification.show).not.toHaveBeenCalled();

			// Usage increases past 75% → new threshold fires
			(quotaService as any).quotaInfo = makeQuota(25);
			quotaEmitter.fire();
			await Promise.resolve();
			expect(mockNotification.show).toHaveBeenCalled();
			expect(mockNotification.message).toBe('Credits at 75%');
		});

		test('sign-out resets showingExhausted flag', () => {
			setup(
				{},
				{ quotaExhausted: true },
			);

			quotaEmitter.fire();
			expect(mockNotification.show).toHaveBeenCalled();
			mockNotification.show.mockClear();

			(authService as any).copilotToken = undefined;
			authEmitter.fire();

			// Sign back in, quota no longer exhausted
			(authService as any).copilotToken = { isFreeUser: false, isNoAuthUser: false, isUsageBasedBilling: true };
			(quotaService as any).quotaExhausted = false;
			(quotaService as any).quotaInfo = undefined;
			(quotaService as any).rateLimitInfo = { session: undefined, weekly: undefined };
			authEmitter.fire();

			expect(mockNotification.show).not.toHaveBeenCalled();
		});

		test('sign-out while no notification was active is harmless', () => {
			setup();

			(authService as any).copilotToken = undefined;
			authEmitter.fire();

			expect(mockNotification.hide).not.toHaveBeenCalled();
		});

		test('anonymous UBB user with no GitHub session still sees quota notifications', () => {
			setup(
				{ anyGitHubSession: undefined, copilotToken: { isNoAuthUser: true, isFreeUser: false, isUsageBasedBilling: true } },
				{ quotaExhausted: true },
			);

			quotaEmitter.fire();

			expect(mockNotification.show).toHaveBeenCalled();
			expect(mockNotification.message).toBe('Credit Limit Reached');
			expect(mockNotification.description).toBe('Sign in to keep going.');
		});

		test('anonymous PRU user does not see quota notifications', () => {
			setup(
				{ anyGitHubSession: undefined, copilotToken: { isNoAuthUser: true, isFreeUser: false, isUsageBasedBilling: false } },
				{ quotaExhausted: true },
			);

			quotaEmitter.fire();

			expect(mockNotification.show).not.toHaveBeenCalled();
		});
	});

	// --- threshold crossing (window reload / sign-in) ------------------------

	describe('threshold crossing on reload and sign-in', () => {
		test('first data arrival stores baseline without notification', () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaInfo: makeQuota(25) }, // 75% used — already above 50% and 75%
			);

			quotaEmitter.fire();

			expect(mockNotification.show).not.toHaveBeenCalled();
		});

		test('notifies when crossing a new threshold after baseline', async () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaInfo: makeQuota(40) }, // 60% used — baseline
			);

			quotaEmitter.fire();
			expect(mockNotification.show).not.toHaveBeenCalled();

			// Usage crosses 75%
			(quotaService as any).quotaInfo = makeQuota(25);
			quotaEmitter.fire();
			await Promise.resolve();

			expect(mockNotification.show).toHaveBeenCalled();
			expect(mockNotification.message).toBe('Credits at 75%');
		});

		test('first rate limit data stores baseline without notification', () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ session: makeQuota(10) }, // 90% session used
			);

			quotaEmitter.fire();

			expect(mockNotification.show).not.toHaveBeenCalled();
		});

		test('notifies when crossing a threshold from below', async () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaInfo: makeQuota(60) }, // 40% used — below all thresholds
			);

			quotaEmitter.fire();
			expect(mockNotification.show).not.toHaveBeenCalled();

			(quotaService as any).quotaInfo = makeQuota(50); // 50% used
			quotaEmitter.fire();
			await Promise.resolve();

			expect(mockNotification.show).toHaveBeenCalled();
			expect(mockNotification.message).toBe('Credits at 50%');
		});

		test('sign-out clears baseline so next sign-in re-establishes it', () => {
			setup(
				{},
				{ quotaInfo: makeQuota(25) }, // 75% used
			);

			// Establish baseline
			quotaEmitter.fire();
			expect(mockNotification.show).not.toHaveBeenCalled();

			// Sign out → prev values cleared
			(authService as any).copilotToken = undefined;
			authEmitter.fire();

			// Sign back in — first data stores new baseline, no notification
			(authService as any).copilotToken = { isFreeUser: false, isNoAuthUser: false, isUsageBasedBilling: true };
			quotaEmitter.fire();
			expect(mockNotification.show).not.toHaveBeenCalled();
		});

		test('late sign-in stores baseline then fires on new crossing', async () => {
			setup({ copilotToken: undefined }, {});

			// Sign in — quota data arrives at 60%
			(authService as any).copilotToken = { isFreeUser: false, isNoAuthUser: false, isUsageBasedBilling: true };
			(quotaService as any).quotaInfo = makeQuota(40); // 60% used
			quotaEmitter.fire();
			expect(mockNotification.show).not.toHaveBeenCalled();

			// Usage crosses 75% → notification fires
			(quotaService as any).quotaInfo = makeQuota(25);
			quotaEmitter.fire();
			await Promise.resolve();

			expect(mockNotification.show).toHaveBeenCalled();
			expect(mockNotification.message).toBe('Credits at 75%');
		});

		test('not signed in → 0% → sign out → 60% does not fire 50% threshold', async () => {
			setup({ copilotToken: undefined }, {});

			// Sign in at 0%
			(authService as any).copilotToken = { isFreeUser: false, isNoAuthUser: false, isUsageBasedBilling: true };
			(quotaService as any).quotaInfo = makeQuota(100); // 0% used
			quotaEmitter.fire();
			expect(mockNotification.show).not.toHaveBeenCalled();

			// Sign out → prev cleared
			(authService as any).copilotToken = undefined;
			authEmitter.fire();

			// Sign in at 60% — baseline stored, no notification
			(authService as any).copilotToken = { isFreeUser: false, isNoAuthUser: false, isUsageBasedBilling: true };
			(quotaService as any).quotaInfo = makeQuota(40); // 60% used
			quotaEmitter.fire();
			expect(mockNotification.show).not.toHaveBeenCalled();

			// Usage crosses 75% → notification fires
			(quotaService as any).quotaInfo = makeQuota(25);
			quotaEmitter.fire();
			await Promise.resolve();

			expect(mockNotification.show).toHaveBeenCalled();
			expect(mockNotification.message).toBe('Credits at 75%');
		});

		test('sign-out + sign-in at higher level does not fire stale crossing', () => {
			setup(
				{},
				{ quotaInfo: makeQuota(60) }, // 40% used
			);

			quotaEmitter.fire();
			expect(mockNotification.show).not.toHaveBeenCalled();

			// Sign out
			(authService as any).copilotToken = undefined;
			authEmitter.fire();

			// Sign into different account at 75% — baseline stored, no notification
			(authService as any).copilotToken = { isFreeUser: false, isNoAuthUser: false, isUsageBasedBilling: true };
			(quotaService as any).quotaInfo = makeQuota(25); // 75%
			quotaEmitter.fire();

			expect(mockNotification.show).not.toHaveBeenCalled();
		});
	});

	// --- basic notification lifecycle ----------------------------------------

	describe('quota exhausted', () => {
		test('shows exhausted notification', () => {
			setup(
				{ copilotToken: { isFreeUser: true, isNoAuthUser: false, isUsageBasedBilling: true } },
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

			(quotaService as any).quotaExhausted = false;
			quotaEmitter.fire();

			expect(mockNotification.hide).toHaveBeenCalled();
		});
	});

	describe('quota approaching threshold', () => {
		test('shows warning when crossing 50% threshold', async () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaInfo: makeQuota(60) }, // 40% used — baseline
			);

			quotaEmitter.fire();

			(quotaService as any).quotaInfo = makeQuota(50); // 50% used
			quotaEmitter.fire();
			await Promise.resolve();

			expect(mockNotification.show).toHaveBeenCalled();
			expect(mockNotification.message).toBe('Credits at 50%');
		});

		test('does not re-show the same threshold', async () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaInfo: makeQuota(60) }, // 40% used — baseline
			);

			quotaEmitter.fire();
			(quotaService as any).quotaInfo = makeQuota(50);
			quotaEmitter.fire();
			await Promise.resolve();
			expect(mockNotification.show).toHaveBeenCalledTimes(1);

			mockNotification.show.mockClear();
			quotaEmitter.fire();
			await Promise.resolve();
			expect(mockNotification.show).not.toHaveBeenCalled();
		});

		test('shows higher threshold when usage increases', async () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaInfo: makeQuota(60) }, // 40% used — baseline
			);

			quotaEmitter.fire();
			(quotaService as any).quotaInfo = makeQuota(50); // 50% used
			quotaEmitter.fire();
			await Promise.resolve();
			expect(mockNotification.show).toHaveBeenCalledTimes(1);

			mockNotification.show.mockClear();
			(quotaService as any).quotaInfo = makeQuota(10); // 90% used
			quotaEmitter.fire();
			await Promise.resolve();

			expect(mockNotification.show).toHaveBeenCalled();
			expect(mockNotification.message).toBe('Credits at 90%');
		});
	});

	describe('rate limit warning', () => {
		test('shows session rate limit warning', () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ session: makeQuota(60) }, // 40% session used — baseline
			);

			quotaEmitter.fire();
			(quotaService as any).rateLimitInfo = { session: makeQuota(25), weekly: undefined }; // 75% used
			quotaEmitter.fire();

			expect(mockNotification.show).toHaveBeenCalled();
			expect(mockNotification.message).toContain('75%');
			expect(mockNotification.message).toContain('session');
		});

		test('shows weekly rate limit warning', () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ weekly: makeQuota(60) }, // 40% weekly used — baseline
			);

			quotaEmitter.fire();
			(quotaService as any).rateLimitInfo = { session: undefined, weekly: makeQuota(10) }; // 90% used
			quotaEmitter.fire();

			expect(mockNotification.show).toHaveBeenCalled();
			expect(mockNotification.message).toContain('90%');
			expect(mockNotification.message).toContain('weekly');
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

		test('threshold warning takes priority over rate limit', async () => {
			setup(
				{ anyGitHubSession: { accessToken: 'tok' } },
				{ quotaInfo: makeQuota(60), session: makeQuota(60) }, // 40% used — baselines
			);

			quotaEmitter.fire();
			(quotaService as any).quotaInfo = makeQuota(10); // 90% quota used
			(quotaService as any).rateLimitInfo = { session: makeQuota(25), weekly: undefined }; // 75% session used
			quotaEmitter.fire();
			await Promise.resolve();

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

			expect(mockNotification.show).toHaveBeenCalled();
			expect(mockNotification.message).toBe('Credit Limit Reached');
		});
	});

	describe('PRU users do not see quota notifications', () => {
		test('does not show exhausted notification for individual PRU user', () => {
			setup(
				{ copilotToken: { isFreeUser: false, isNoAuthUser: false, isManagedPlan: false, isUsageBasedBilling: false } },
				{ quotaExhausted: true },
			);

			quotaEmitter.fire();

			expect(mockNotification.show).not.toHaveBeenCalled();
		});

		test('does not show exhausted notification for free PRU user', () => {
			setup(
				{ copilotToken: { isFreeUser: true, isNoAuthUser: false, isManagedPlan: false, isUsageBasedBilling: false } },
				{ quotaExhausted: true },
			);

			quotaEmitter.fire();

			expect(mockNotification.show).not.toHaveBeenCalled();
		});

		test('does not show exhausted notification for managed plan PRU user', () => {
			setup(
				{ copilotToken: { isFreeUser: false, isNoAuthUser: false, isManagedPlan: true, isUsageBasedBilling: false } },
				{ quotaExhausted: true },
			);

			quotaEmitter.fire();

			expect(mockNotification.show).not.toHaveBeenCalled();
		});

		test('does not show approaching notification for PRU user', () => {
			setup(
				{ copilotToken: { isFreeUser: false, isNoAuthUser: false, isManagedPlan: false, isUsageBasedBilling: false } },
				{ quotaInfo: makeQuota(5) }, // 95% used
			);

			quotaEmitter.fire();

			expect(mockNotification.show).not.toHaveBeenCalled();
		});

		test('still shows rate limit warning for PRU user', () => {
			setup(
				{ copilotToken: { isFreeUser: false, isNoAuthUser: false, isManagedPlan: false, isUsageBasedBilling: false } },
				{ session: makeQuota(60) }, // 40% session used — baseline
			);

			quotaEmitter.fire();
			(quotaService as any).rateLimitInfo = { session: makeQuota(25), weekly: undefined }; // 75% used
			quotaEmitter.fire();

			expect(mockNotification.show).toHaveBeenCalled();
			expect(mockNotification.message).toContain('session');
		});
	});
});
