/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { ChatEntitlement, IChatEntitlementService, IChatSentiment, IQuotaSnapshot, IRateLimitSnapshot } from '../../../../services/chat/common/chatEntitlementService.js';
import { ChatQuotaNotificationContribution } from '../../browser/chatQuotaNotification.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../common/languageModels.js';
import { ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationService } from '../../browser/widget/input/chatInputNotificationService.js';

// --- Mock IChatEntitlementService -------------------------------------------

interface IMockQuotas {
	resetDate?: string;
	usageBasedBilling?: boolean;
	canUpgradePlan?: boolean;
	chat?: IQuotaSnapshot;
	completions?: IQuotaSnapshot;
	premiumChat?: IQuotaSnapshot;
	additionalUsageEnabled?: boolean;
	additionalUsageCount?: number;
	sessionRateLimit?: IRateLimitSnapshot;
	weeklyRateLimit?: IRateLimitSnapshot;
}

function createMockEntitlementService(opts?: {
	entitlement?: ChatEntitlement;
	quotas?: IMockQuotas;
}) {
	const onDidChangeQuotaRemaining = new Emitter<void>();
	const onDidChangeQuotaExceeded = new Emitter<void>();
	const onDidChangeEntitlement = new Emitter<void>();

	const service: IChatEntitlementService = {
		_serviceBrand: undefined,
		entitlement: opts?.entitlement ?? ChatEntitlement.Pro,
		entitlementObs: observableValue({}, opts?.entitlement ?? ChatEntitlement.Pro),
		onDidChangeEntitlement: onDidChangeEntitlement.event,
		onDidChangeQuotaExceeded: onDidChangeQuotaExceeded.event,
		onDidChangeQuotaRemaining: onDidChangeQuotaRemaining.event,
		onDidChangeUsageBasedBilling: Event.None,
		quotas: {
			resetDate: opts?.quotas?.resetDate,
			usageBasedBilling: opts?.quotas?.usageBasedBilling ?? true,
			canUpgradePlan: opts?.quotas?.canUpgradePlan,
			chat: opts?.quotas?.chat,
			completions: opts?.quotas?.completions,
			premiumChat: opts?.quotas?.premiumChat,
			additionalUsageEnabled: opts?.quotas?.additionalUsageEnabled,
			additionalUsageCount: opts?.quotas?.additionalUsageCount,
			sessionRateLimit: opts?.quotas?.sessionRateLimit,
			weeklyRateLimit: opts?.quotas?.weeklyRateLimit,
		},
		organisations: undefined,
		isInternal: false,
		sku: undefined,
		copilotTrackingId: undefined,
		previewFeaturesDisabled: false,
		clientByokEnabled: false,
		hasByokModels: false,
		onDidChangeSentiment: Event.None,
		sentiment: {} as IChatSentiment,
		sentimentObs: observableValue({}, {} as IChatSentiment) as IObservable<IChatSentiment>,
		onDidChangeAnonymous: Event.None,
		anonymous: false,
		anonymousObs: observableValue({}, false),
		acceptQuotas() { },
		clearQuotas() { },
		markAnonymousRateLimited() { },
		markSetupCompleted() { },
		setForceHidden() { },
		update() { return Promise.resolve(); },
	};

	return { service, onDidChangeQuotaRemaining, onDidChangeQuotaExceeded, onDidChangeEntitlement };
}

// --- Mock IChatInputNotificationService ------------------------------------

function createMockNotificationService() {
	let lastNotification: IChatInputNotification | undefined = undefined;
	let deleted = false;
	let setCount = 0;

	const onDidChange = new Emitter<void>();
	const onDidDismiss = new Emitter<string>();

	const service: IChatInputNotificationService = {
		_serviceBrand: undefined,
		onDidChange: onDidChange.event,
		onDidDismiss: onDidDismiss.event,
		setNotification(notification: IChatInputNotification) {
			lastNotification = notification;
			deleted = false;
			setCount++;
		},
		deleteNotification(_id: string) {
			deleted = true;
		},
		dismissNotification(id: string) {
			if (lastNotification?.id === id) {
				onDidDismiss.fire(id);
			}
		},
		getActiveNotification() { return deleted ? undefined : lastNotification; },
		handleMessageSent() { },
	};

	return {
		service,
		getNotification(): IChatInputNotification | undefined { return deleted ? undefined : lastNotification; },
		get wasDeleted() { return deleted; },
		get setCount() { return setCount; },
		dismiss() {
			if (lastNotification) {
				service.dismissNotification(lastNotification.id);
			}
		},
		reset() { lastNotification = undefined; deleted = false; setCount = 0; },
	};
}

function createMockAssignmentService(treatments?: Readonly<Record<string, string | undefined>>) {
	const onDidRefetchAssignments = new Emitter<void>();
	const service: IWorkbenchAssignmentService = {
		_serviceBrand: undefined,
		onDidRefetchAssignments: onDidRefetchAssignments.event,
		getTreatment(name: string) { return Promise.resolve(treatments?.[name]); },
		getCurrentExperiments() { return Promise.resolve(undefined); },
		addTelemetryAssignmentFilter() { },
	} as unknown as IWorkbenchAssignmentService;

	return { service, onDidRefetchAssignments };
}

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { name: string; data: unknown }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.events.push({ name: eventName, data });
		}
	}
}

// --- Helpers ---------------------------------------------------------------

function makeQuotaSnapshot(percentRemaining: number, opts?: Partial<IQuotaSnapshot>): IQuotaSnapshot {
	return {
		percentRemaining,
		unlimited: false,
		...opts,
	};
}

async function flushPromises(): Promise<void> {
	await new Promise(resolve => setTimeout(resolve, 0));
}

function makeRateLimitSnapshot(percentRemaining: number, opts?: Partial<IRateLimitSnapshot>): IRateLimitSnapshot {
	return {
		percentRemaining,
		unlimited: false,
		resetDate: '2026-06-01T00:00:00Z',
		...opts,
	};
}

function makeResetDate(daysUntilReset: number): string {
	const resetDate = new Date(Date.now() + daysUntilReset * 24 * 60 * 60 * 1000);
	return resetDate.toISOString();
}

// --- Tests -----------------------------------------------------------------

suite('ChatQuotaNotificationContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createContribution(entitlementOpts?: Parameters<typeof createMockEntitlementService>[0], modelOpts?: { vendor?: string; trajectoryTreatment?: string; telemetryService?: ITelemetryService }) {
		const entitlementMock = createMockEntitlementService(entitlementOpts);
		const notificationMock = createMockNotificationService();
		const assignmentMock = createMockAssignmentService({
			chatQuotaTrajectoryNudge: modelOpts?.trajectoryTreatment,
		});
		const contextKeyService = store.add(new MockContextKeyService());
		const storageService = store.add(new InMemoryStorageService());
		const vendor = modelOpts?.vendor ?? 'copilot';
		// Persist model selection in storage (used by getSelectedModelVendor)
		storageService.store('chat.currentLanguageModel.panel', `${vendor}/test-model`, StorageScope.APPLICATION, StorageTarget.USER);
		const languageModelsService = {
			_serviceBrand: undefined,
			onDidChangeLanguageModelVendors: Event.None,
			onDidChangeLanguageModels: Event.None,
			getLanguageModelIds: () => ['test-model'],
			getVendors: () => [],
			lookupLanguageModel: (_id: string): ILanguageModelChatMetadata | undefined => ({ vendor } as ILanguageModelChatMetadata),
			lookupLanguageModelByQualifiedName: () => undefined,
		} as unknown as ILanguageModelsService;

		// Track disposables for emitters
		store.add(entitlementMock.onDidChangeQuotaRemaining);
		store.add(entitlementMock.onDidChangeQuotaExceeded);
		store.add(entitlementMock.onDidChangeEntitlement);
		store.add(assignmentMock.onDidRefetchAssignments);

		const contribution = store.add(new ChatQuotaNotificationContribution(
			entitlementMock.service,
			notificationMock.service,
			contextKeyService as IContextKeyService,
			languageModelsService,
			storageService,
			assignmentMock.service,
			modelOpts?.telemetryService ?? new NullTelemetryServiceShape(),
		));

		return { contribution, entitlementMock, notificationMock, storageService, assignmentMock };
	}

	function updateQuotas(
		entitlementMock: ReturnType<typeof createMockEntitlementService>,
		quotas: IMockQuotas,
		opts?: { entitlement?: ChatEntitlement },
	) {
		const svc: { entitlement: ChatEntitlement; quotas: IMockQuotas } = entitlementMock.service as IChatEntitlementService & { entitlement: ChatEntitlement; quotas: IMockQuotas };
		if (opts?.entitlement !== undefined) {
			svc.entitlement = opts.entitlement;
		}
		svc.quotas = { ...svc.quotas, ...quotas };
		entitlementMock.onDidChangeQuotaRemaining.fire();
	}

	// --- Quota exhausted ---------------------------------------------------

	suite('quota exhausted', () => {
		test('shows exhausted notification at startup when premiumChat is at 0%', () => {
			const { notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) },
			});

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.message, 'Credit Limit Reached');
		});

		test('shows exhausted notification for free user via chat snapshot', () => {
			const { notificationMock } = createContribution({
				entitlement: ChatEntitlement.Free,
				quotas: { usageBasedBilling: true, chat: makeQuotaSnapshot(0) },
			});

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.message, 'Credit Limit Reached');
		});

		test('hides exhausted notification when quota recovers', () => {
			const { entitlementMock, notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) },
			});

			assert.ok(notificationMock.getNotification());

			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });

			assert.ok(notificationMock.wasDeleted);
		});

		test('does not show spurious threshold notification after exhaustion recovery', () => {
			const { entitlementMock, notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) }, // 40% used baseline
			});

			// Exhaust quota
			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(0) });
			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.message, 'Credit Limit Reached');

			notificationMock.reset();

			// Recover to 55% used — should NOT trigger "Credits at 50%" from stale baseline
			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(45) });
			assert.strictEqual(notificationMock.getNotification(), undefined);
		});

		test('does not show exhausted for unlimited quota with hasQuota=true', () => {
			const { notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0, { unlimited: true, hasQuota: true }) },
			});

			assert.strictEqual(notificationMock.getNotification(), undefined);
		});

		test('shows exhausted for unlimited quota with hasQuota=false', () => {
			const { notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0, { unlimited: true, hasQuota: false }) },
			});

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.message, 'Credit Limit Reached');
		});
	});

	// --- Exhausted notification descriptions --------------------------------

	suite('exhausted notification descriptions', () => {
		test('anonymous user gets sign-in action', () => {
			const { notificationMock } = createContribution({
				entitlement: ChatEntitlement.Unknown,
				quotas: { usageBasedBilling: false, premiumChat: makeQuotaSnapshot(0) },
			});

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.description, 'Sign in to keep going.');
			assert.strictEqual(notificationMock.getNotification()!.actions.length, 1);
			assert.strictEqual(notificationMock.getNotification()!.actions[0].commandId, 'workbench.action.chat.triggerSetup');
		});

		test('free user gets upgrade action', () => {
			const { notificationMock } = createContribution({
				entitlement: ChatEntitlement.Free,
				quotas: { usageBasedBilling: true, chat: makeQuotaSnapshot(0) },
			});

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.description, 'Upgrade to keep going.');
			assert.strictEqual(notificationMock.getNotification()!.actions[0].commandId, 'workbench.action.chat.upgradePlan');
		});

		test('managed plan user gets admin message', () => {
			const { notificationMock } = createContribution({
				entitlement: ChatEntitlement.Business,
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) },
			});

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.description, 'Contact your admin to increase your limits.');
			assert.strictEqual(notificationMock.getNotification()!.actions.length, 0);
		});

		test('managed plan user with hasQuota=false gets budget exceeded message', () => {
			const { notificationMock } = createContribution({
				entitlement: ChatEntitlement.Business,
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0, { unlimited: true, hasQuota: false }) },
			});

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.message, 'Usage Blocked');
			assert.strictEqual(notificationMock.getNotification()!.description, 'Your organization or enterprise has exceeded its Copilot budget. Contact your admin to resume usage.');
			assert.strictEqual(notificationMock.getNotification()!.actions.length, 0);
		});

		test('managed plan user with hasQuota=false and overages enabled still gets budget exceeded message', () => {
			const { notificationMock } = createContribution({
				entitlement: ChatEntitlement.Enterprise,
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0, { unlimited: true, hasQuota: false }), additionalUsageEnabled: true },
			});

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.message, 'Usage Blocked');
			assert.strictEqual(notificationMock.getNotification()!.description, 'Your organization or enterprise has exceeded its Copilot budget. Contact your admin to resume usage.');
			assert.strictEqual(notificationMock.getNotification()!.actions.length, 0);
		});

		test('paid user with overage gets increase budget action', () => {
			const { notificationMock } = createContribution({
				entitlement: ChatEntitlement.Pro,
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0), additionalUsageCount: 5 },
			});

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.description, 'Increase your budget to keep building.');
			assert.strictEqual(notificationMock.getNotification()!.actions[0].commandId, 'workbench.action.chat.manageAdditionalSpend');
		});

		test('paid user without overage gets manage budget action', () => {
			const { notificationMock } = createContribution({
				entitlement: ChatEntitlement.Pro,
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) },
			});

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.description, 'Manage your budget to keep building.');
		});
	});

	// --- Quota approaching threshold ----------------------------------------

	suite('quota approaching threshold', () => {
		test('first data arrival stores baseline without notification', () => {
			const { notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(25) }, // 75% used
			});

			// Initial _update runs in constructor but 75% is baseline, no crossing
			assert.strictEqual(notificationMock.getNotification(), undefined);
		});

		test('notifies when crossing 50% threshold', () => {
			const { entitlementMock, notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) }, // 40% used baseline
			});

			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) }); // 50% used

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.message, 'Credits at 50%');
		});

		test('does not re-show the same threshold', () => {
			const { entitlementMock, notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) },
			});

			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });
			assert.ok(notificationMock.getNotification());

			notificationMock.reset();

			// Fire again at the same level
			entitlementMock.onDidChangeQuotaRemaining.fire();
			assert.strictEqual(notificationMock.getNotification(), undefined);
		});

		test('shows higher threshold when usage increases', () => {
			const { entitlementMock, notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) },
			});

			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) }); // 50%
			assert.strictEqual(notificationMock.getNotification()!.message, 'Credits at 50%');

			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(10) }); // 90%
			assert.strictEqual(notificationMock.getNotification()!.message, 'Credits at 90%');
		});
	});

	// --- PRU users ----------------------------------------------------------

	suite('PRU users do not see quota notifications', () => {
		test('does not show exhausted notification for PRU user', () => {
			const { notificationMock } = createContribution({
				entitlement: ChatEntitlement.Pro,
				quotas: { usageBasedBilling: false, premiumChat: makeQuotaSnapshot(0) },
			});

			assert.strictEqual(notificationMock.getNotification(), undefined);
		});

		test('does not show approaching notification for PRU user', () => {
			const { entitlementMock, notificationMock } = createContribution({
				entitlement: ChatEntitlement.Pro,
				quotas: { usageBasedBilling: false, premiumChat: makeQuotaSnapshot(60) },
			});

			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(5) });
			assert.strictEqual(notificationMock.getNotification(), undefined);
		});
	});

	// --- Overage activation -------------------------------------------------

	suite('overage activation notification', () => {
		test('shows overage notification on live transition to 100%', () => {
			const { entitlementMock, notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(10), additionalUsageEnabled: true },
			});

			// Transition to 100%
			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(0), additionalUsageEnabled: true });

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.message, 'Credit Limit Reached');
			assert.strictEqual(notificationMock.getNotification()!.description, 'Additional budget is now covering extra usage.');
		});

		test('does not show overage notification at startup when already at 100%', () => {
			const { notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0), additionalUsageEnabled: true },
			});

			// At startup with overages enabled and already at 0%, no notification
			assert.strictEqual(notificationMock.getNotification(), undefined);
		});

		test('shows standard exhausted on startup at 100% without overages', () => {
			const { notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0), additionalUsageEnabled: false },
			});

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.message, 'Credit Limit Reached');
			assert.notStrictEqual(notificationMock.getNotification()!.description, 'Additional budget is now covering extra usage.');
		});

		test('shows overage notification when overages are enabled while already at 100%', () => {
			const { entitlementMock, notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0), additionalUsageEnabled: false },
			});

			assert.ok(notificationMock.getNotification());

			// Enable overages while still at 0%
			updateQuotas(entitlementMock, { additionalUsageEnabled: true, premiumChat: makeQuotaSnapshot(0) });

			assert.strictEqual(notificationMock.getNotification()!.description, 'Additional budget is now covering extra usage.');
		});
	});

	// --- Quota trajectory warning --------------------------------------------

	suite('quota trajectory warning', () => {
		test('does not show when experiment treatment is disabled', async () => {
			const { notificationMock } = createContribution({
				quotas: {
					resetDate: makeResetDate(24),
					canUpgradePlan: true,
					usageBasedBilling: true,
					premiumChat: makeQuotaSnapshot(75),
				},
			});

			await flushPromises();

			assert.strictEqual(notificationMock.getNotification(), undefined);
		});

		test('does not show outside monthly usage window', async () => {
			const results = [];
			for (const percentRemaining of [91, 64]) {
				const { notificationMock } = createContribution({
					entitlement: ChatEntitlement.Pro,
					quotas: {
						resetDate: makeResetDate(24),
						usageBasedBilling: true,
						premiumChat: makeQuotaSnapshot(percentRemaining),
					},
				}, { trajectoryTreatment: 'enabled' });

				await flushPromises();

				results.push(notificationMock.getNotification()?.message);
			}

			assert.deepStrictEqual(results, [undefined, undefined]);
		});

		test('shows info notification when projected daily usage is above threshold', async () => {
			const { notificationMock } = createContribution({
				entitlement: ChatEntitlement.Pro,
				quotas: {
					resetDate: makeResetDate(24),
					usageBasedBilling: true,
					premiumChat: makeQuotaSnapshot(78),
				},
			}, { trajectoryTreatment: 'enabled' });

			await flushPromises();

			assert.ok(notificationMock.getNotification());
			assert.deepStrictEqual({
				message: notificationMock.getNotification()!.message,
				severity: notificationMock.getNotification()!.severity,
				action: notificationMock.getNotification()!.actions[0].label,
				autoDismissOnMessage: notificationMock.getNotification()!.autoDismissOnMessage,
			}, {
				message: 'Fast Credit Usage',
				severity: ChatInputNotificationSeverity.Info,
				action: 'Review Credit Tips',
				autoDismissOnMessage: false,
			});
		});

		test('does not show when reset date implies no elapsed billing days', async () => {
			const { notificationMock } = createContribution({
				entitlement: ChatEntitlement.Pro,
				quotas: {
					resetDate: makeResetDate(31),
					usageBasedBilling: true,
					premiumChat: makeQuotaSnapshot(78),
				},
			}, { trajectoryTreatment: 'enabled' });

			await flushPromises();

			assert.strictEqual(notificationMock.getNotification(), undefined);
		});

		test('logs shown telemetry once per quota period', async () => {
			const telemetryService = new TestTelemetryService();
			const { entitlementMock } = createContribution({
				entitlement: ChatEntitlement.Pro,
				quotas: {
					resetDate: makeResetDate(24),
					usageBasedBilling: true,
					premiumChat: makeQuotaSnapshot(78),
				},
			}, { trajectoryTreatment: 'enabled', telemetryService });

			await flushPromises();
			entitlementMock.onDidChangeQuotaRemaining.fire();

			assert.deepStrictEqual(telemetryService.events, [{
				name: 'chatQuotaTrajectoryNudgeShown',
				data: {
					severity: 'info',
					entitlement: 'Pro',
					averageDailyUsage: 3.67,
					percentUsed: 22,
				},
			}]);
		});

		test('logs action click telemetry', async () => {
			const telemetryService = new TestTelemetryService();
			const { notificationMock } = createContribution({
				entitlement: ChatEntitlement.Pro,
				quotas: {
					resetDate: makeResetDate(24),
					usageBasedBilling: true,
					premiumChat: makeQuotaSnapshot(78),
				},
			}, { trajectoryTreatment: 'enabled', telemetryService });

			await flushPromises();
			notificationMock.getNotification()!.actions[0].run?.();

			assert.deepStrictEqual(telemetryService.events, [
				{
					name: 'chatQuotaTrajectoryNudgeShown',
					data: {
						severity: 'info',
						entitlement: 'Pro',
						averageDailyUsage: 3.67,
						percentUsed: 22,
					},
				},
				{
					name: 'chatQuotaTrajectoryNudgeActionClicked',
					data: {
						severity: 'info',
						entitlement: 'Pro',
						averageDailyUsage: 3.67,
						percentUsed: 22,
						action: 'learnMore',
					},
				},
			]);
		});

		test('action click dismisses trajectory nudge for the quota period', async () => {
			const { entitlementMock, notificationMock } = createContribution({
				entitlement: ChatEntitlement.Pro,
				quotas: {
					resetDate: makeResetDate(24),
					usageBasedBilling: true,
					premiumChat: makeQuotaSnapshot(78),
				},
			}, { trajectoryTreatment: 'enabled' });

			await flushPromises();
			assert.ok(notificationMock.getNotification());

			notificationMock.getNotification()!.actions[0].run?.();
			await flushPromises();

			assert.strictEqual(notificationMock.getNotification(), undefined);

			notificationMock.reset();
			entitlementMock.onDidChangeQuotaRemaining.fire();

			assert.strictEqual(notificationMock.getNotification(), undefined);
		});

		test('remembers trajectory dismissal for the quota period', async () => {
			const { entitlementMock, notificationMock } = createContribution({
				entitlement: ChatEntitlement.EDU,
				quotas: {
					resetDate: makeResetDate(24),
					usageBasedBilling: true,
					premiumChat: makeQuotaSnapshot(72),
				},
			}, { trajectoryTreatment: 'enabled' });

			await flushPromises();
			assert.ok(notificationMock.getNotification());

			notificationMock.dismiss();
			notificationMock.reset();
			entitlementMock.onDidChangeQuotaRemaining.fire();

			assert.strictEqual(notificationMock.getNotification(), undefined);
		});

		test('does not show for Max, Business, Enterprise, Free, or Unknown users', async () => {
			for (const entitlement of [ChatEntitlement.Max, ChatEntitlement.Business, ChatEntitlement.Enterprise, ChatEntitlement.Free, ChatEntitlement.Unknown]) {
				const { notificationMock } = createContribution({
					entitlement,
					quotas: {
						resetDate: makeResetDate(24),
						usageBasedBilling: true,
						premiumChat: makeQuotaSnapshot(72),
						chat: makeQuotaSnapshot(72),
					},
				}, { trajectoryTreatment: 'enabled' });

				await flushPromises();

				assert.strictEqual(notificationMock.getNotification(), undefined, `Expected no trajectory notification for ${entitlement}`);
			}
		});
	});

	// --- Rate-limit warnings ------------------------------------------------

	suite('rate-limit warnings', () => {
		test('shows session rate limit warning on threshold crossing', () => {
			const { entitlementMock, notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, sessionRateLimit: makeRateLimitSnapshot(60) }, // baseline
			});

			updateQuotas(entitlementMock, { sessionRateLimit: makeRateLimitSnapshot(25) }); // 75% used

			assert.ok(notificationMock.getNotification());
			assert.ok((notificationMock.getNotification()!.message as string).includes('75%'));
			assert.ok((notificationMock.getNotification()!.message as string).includes('session'));
		});

		test('shows weekly rate limit warning on threshold crossing', () => {
			const { entitlementMock, notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, weeklyRateLimit: makeRateLimitSnapshot(60) }, // baseline
			});

			updateQuotas(entitlementMock, { weeklyRateLimit: makeRateLimitSnapshot(10) }); // 90% used

			assert.ok(notificationMock.getNotification());
			assert.ok((notificationMock.getNotification()!.message as string).includes('90%'));
			assert.ok((notificationMock.getNotification()!.message as string).includes('weekly'));
		});

		test('first rate limit data stores baseline without notification', () => {
			const { notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, sessionRateLimit: makeRateLimitSnapshot(10) }, // 90% used
			});

			assert.strictEqual(notificationMock.getNotification(), undefined);
		});
	});

	// --- Priority ordering --------------------------------------------------

	suite('priority ordering', () => {
		test('exhausted takes priority over approaching threshold', () => {
			const { notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) },
			});

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.message, 'Credit Limit Reached');
		});

		test('approaching threshold takes priority over rate limit', () => {
			const { entitlementMock, notificationMock } = createContribution({
				quotas: {
					usageBasedBilling: true,
					premiumChat: makeQuotaSnapshot(60), // 40% — baseline
					sessionRateLimit: makeRateLimitSnapshot(60), // 40% — baseline
				},
			});

			updateQuotas(entitlementMock, {
				premiumChat: makeQuotaSnapshot(10), // 90% — crosses threshold
				sessionRateLimit: makeRateLimitSnapshot(25), // 75% — crosses threshold
			});

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.message, 'Credits at 90%');
		});
	});

	// --- Approaching notification descriptions ------------------------------

	suite('approaching notification descriptions', () => {
		test('free user gets upgrade action', () => {
			const { entitlementMock, notificationMock } = createContribution({
				entitlement: ChatEntitlement.Free,
				quotas: { usageBasedBilling: true, chat: makeQuotaSnapshot(60) },
			});

			updateQuotas(entitlementMock, { chat: makeQuotaSnapshot(50) });

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.description, 'Upgrade to continue past the limit.');
		});

		test('managed plan user gets admin message', () => {
			const { entitlementMock, notificationMock } = createContribution({
				entitlement: ChatEntitlement.Enterprise,
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) },
			});

			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.description, 'Contact your admin to increase your limits.');
		});

		test('paid user with overages enabled gets budget message', () => {
			const { entitlementMock, notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60), additionalUsageEnabled: true },
			});

			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.description, 'Additional budget is enabled to cover extra usage.');
		});

		test('paid user without overages gets set budget action', () => {
			const { entitlementMock, notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) },
			});

			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.description, 'Set additional budget to cover extra usage.');
			assert.strictEqual(notificationMock.getNotification()!.actions[0].commandId, 'workbench.action.chat.manageAdditionalSpend');
		});
	});

	// --- BYOK model suppression ---------------------------------------------

	suite('BYOK model suppression', () => {
		test('defers notifications when BYOK model is selected', () => {
			const { notificationMock } = createContribution(
				{ quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) } },
				{ vendor: 'customendpoint' },
			);

			assert.strictEqual(notificationMock.getNotification(), undefined);
		});

		test('shows notification when Copilot model is selected', () => {
			const { notificationMock } = createContribution(
				{ quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) } },
				{ vendor: 'copilot' },
			);

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()?.message, 'Credit Limit Reached');
		});

		test('shows notification when switching from BYOK to Copilot model', () => {
			const entitlementMock = createMockEntitlementService({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) },
			});
			const notificationMock = createMockNotificationService();
			const assignmentMock = createMockAssignmentService();
			const contextKeyService = store.add(new MockContextKeyService());
			const storageService = store.add(new InMemoryStorageService());
			// Start with BYOK model
			storageService.store('chat.currentLanguageModel.panel', 'customendpoint/ANT/claude-sonnet-4-6', StorageScope.APPLICATION, StorageTarget.USER);
			// Registry returns undefined — vendor detection relies on prefix extraction
			const languageModelsService = {
				_serviceBrand: undefined,
				onDidChangeLanguageModelVendors: Event.None,
				onDidChangeLanguageModels: Event.None,
				getLanguageModelIds: () => [],
				getVendors: () => [],
				lookupLanguageModel: (): ILanguageModelChatMetadata | undefined => undefined,
				lookupLanguageModelByQualifiedName: () => undefined,
			} as unknown as ILanguageModelsService;

			store.add(entitlementMock.onDidChangeQuotaRemaining);
			store.add(entitlementMock.onDidChangeQuotaExceeded);
			store.add(entitlementMock.onDidChangeEntitlement);
			store.add(assignmentMock.onDidRefetchAssignments);

			store.add(new ChatQuotaNotificationContribution(
				entitlementMock.service,
				notificationMock.service,
				contextKeyService as IContextKeyService,
				languageModelsService,
				storageService,
				assignmentMock.service,
				new NullTelemetryServiceShape(),
			));

			// Initially deferred — BYOK model
			assert.strictEqual(notificationMock.getNotification(), undefined);

			// Switch to Copilot model via storage — triggers storage listener
			storageService.store('chat.currentLanguageModel.panel', 'copilot/gpt-4.1', StorageScope.APPLICATION, StorageTarget.USER);

			assert.strictEqual(notificationMock.getNotification()?.message, 'Credit Limit Reached');
		});
	});
});
