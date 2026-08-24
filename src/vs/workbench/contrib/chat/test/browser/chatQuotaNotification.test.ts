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
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IAssignmentFilter, IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { ChatEntitlement, IChatEntitlementService, IChatSentiment, IQuotaSnapshot, IRateLimitSnapshot } from '../../../../services/chat/common/chatEntitlementService.js';
import { ChatQuotaNotificationContribution } from '../../browser/chatQuotaNotification.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../common/languageModels.js';
import { ChatInputNotificationActionKind, IChatInputNotification, IChatInputNotificationCommandAction, IChatInputNotificationService } from '../../browser/widget/input/chatInputNotificationService.js';

const SWITCH_TO_AUTO_TREATMENT_NAME = 'config.chatQuotaWarningSwitchToAuto';

// --- Mock IChatEntitlementService -------------------------------------------

interface IMockQuotas {
	usageBasedBilling?: boolean;
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
			usageBasedBilling: opts?.quotas?.usageBasedBilling ?? true,
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
	let dismissed = false;
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
			dismissed = false;
			setCount++;
			onDidChange.fire();
		},
		deleteNotification(id: string) {
			if (lastNotification?.id === id && !deleted) {
				deleted = true;
				dismissed = false;
				onDidChange.fire();
			}
		},
		dismissNotification(id: string) {
			if (!lastNotification || lastNotification.id !== id || deleted || dismissed) {
				return;
			}
			dismissed = true;
			onDidDismiss.fire(id);
			onDidChange.fire();
		},
		getActiveNotification(filter?: (notification: IChatInputNotification) => boolean) {
			if (deleted || dismissed || !lastNotification) {
				return undefined;
			}
			return !filter || filter(lastNotification) ? lastNotification : undefined;
		},
		handleMessageSent() { },
		announceRendered() { },
	};

	return {
		service,
		getNotification(): IChatInputNotification | undefined { return deleted || dismissed ? undefined : lastNotification; },
		get wasDeleted() { return deleted; },
		get setCount() { return setCount; },
		dismiss(id?: string) {
			const notificationId = id ?? lastNotification?.id;
			if (notificationId) {
				service.dismissNotification(notificationId);
			}
		},
		reset() { lastNotification = undefined; deleted = false; dismissed = false; setCount = 0; },
	};
}

function getCommandAction(notification: IChatInputNotification): IChatInputNotificationCommandAction {
	const action = notification.actions[0];
	if (action.kind !== ChatInputNotificationActionKind.Command) {
		assert.fail(`Expected command action, got ${action.kind}`);
	}
	return action;
}

function createMockAssignmentService(
	switchToAutoTreatment?: boolean | Promise<boolean | undefined>,
) {
	const getTreatmentCalls: string[] = [];
	const service: IWorkbenchAssignmentService = {
		_serviceBrand: undefined,
		onDidRefetchAssignments: Event.None,
		getCurrentExperiments: async () => [],
		addTelemetryAssignmentFilter(_filter: IAssignmentFilter): void { },
		getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
			getTreatmentCalls.push(name);
			if (name === SWITCH_TO_AUTO_TREATMENT_NAME) {
				return Promise.resolve(switchToAutoTreatment as T | undefined);
			}
			return Promise.resolve(undefined);
		},
	};

	return { service, getTreatmentCalls };
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

// --- Tests -----------------------------------------------------------------

suite('ChatQuotaNotificationContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createContribution(
		entitlementOpts?: Parameters<typeof createMockEntitlementService>[0],
		modelOpts?: { contextModelId?: string; vendor?: string; selectedModelId?: string; switchToAutoTreatment?: boolean | Promise<boolean | undefined> },
		sharedStorageService?: InMemoryStorageService,
	) {
		const entitlementMock = createMockEntitlementService(entitlementOpts);
		const notificationMock = createMockNotificationService();
		const assignmentMock = createMockAssignmentService(modelOpts?.switchToAutoTreatment);
		const contextKeyService = store.add(new MockContextKeyService());
		if (modelOpts?.contextModelId) {
			contextKeyService.createKey<string | undefined>(ChatContextKeys.chatModelId.key, undefined).set(modelOpts.contextModelId);
		}
		const storageService = sharedStorageService ?? store.add(new InMemoryStorageService());
		const vendor = modelOpts?.vendor ?? 'copilot';
		const selectedModelId = modelOpts?.selectedModelId ?? `${vendor}/test-model`;
		// Persist model selection in storage (used by getSelectedModelVendor)
		storageService.store('chat.currentLanguageModel.panel', selectedModelId, StorageScope.PROFILE, StorageTarget.USER);
		const modelIds = ['copilot/auto', selectedModelId];
		const languageModelsService = {
			_serviceBrand: undefined,
			onDidChangeLanguageModelVendors: Event.None,
			onDidChangeLanguageModels: Event.None,
			getLanguageModelIds: () => modelIds,
			getVendors: () => [],
			lookupLanguageModel: (id: string): ILanguageModelChatMetadata | undefined => {
				if (id === 'copilot/auto') {
					return { id: 'auto', vendor: 'copilot', family: 'auto', isBYOK: false } as ILanguageModelChatMetadata;
				}
				// Agent-host models (e.g. the Copilot CLI harness) are registered
				// under a `${vendor}:${id}` identifier and are CAPI-backed (not BYOK).
				if (id.includes(':')) {
					const [modelVendor, modelId] = id.split(':');
					return { id: modelId, vendor: modelVendor, family: modelId, isBYOK: false } as ILanguageModelChatMetadata;
				}
				const [modelVendor, modelId] = id.includes('/') ? id.split('/') : [vendor, id];
				return { id: modelId, vendor: modelVendor, family: modelId, isBYOK: modelVendor !== 'copilot' } as ILanguageModelChatMetadata;
			},
			lookupLanguageModelByQualifiedName: () => undefined,
		} as unknown as ILanguageModelsService;

		// Track disposables for emitters
		store.add(entitlementMock.onDidChangeQuotaRemaining);
		store.add(entitlementMock.onDidChangeQuotaExceeded);
		store.add(entitlementMock.onDidChangeEntitlement);

		const contribution = store.add(new ChatQuotaNotificationContribution(
			entitlementMock.service,
			notificationMock.service,
			contextKeyService as IContextKeyService,
			languageModelsService,
			storageService,
			assignmentMock.service,
			new NullLogService(),
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

			assert.strictEqual(notificationMock.getNotification()?.message, 'Credit Limit Reached');
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

	// --- Exhausted dismissal persistence ------------------------------------

	suite('exhausted dismissal persistence', () => {
		test('does not re-show exhausted notification after reload when previously dismissed', () => {
			const storageService = store.add(new InMemoryStorageService());

			// First window: exhausted notification shown, then dismissed by the user.
			const first = createContribution(
				{ quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) } },
				undefined,
				storageService,
			);
			const notification = first.notificationMock.getNotification();
			assert.ok(notification);
			first.notificationMock.dismiss(notification!.id);
			first.contribution.dispose();

			// Reload: new contribution with the same (persisted) storage and still-exhausted quota.
			const second = createContribution(
				{ quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) } },
				undefined,
				storageService,
			);
			assert.strictEqual(second.notificationMock.getNotification(), undefined);
		});

		test('re-shows exhausted notification after quota recovers and is exhausted again', () => {
			const storageService = store.add(new InMemoryStorageService());

			// Exhausted and dismissed.
			const first = createContribution(
				{ quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) } },
				undefined,
				storageService,
			);
			first.notificationMock.dismiss(first.notificationMock.getNotification()!.id);

			// Quota recovers — persisted dismissal is cleared.
			updateQuotas(first.entitlementMock, { premiumChat: makeQuotaSnapshot(50) });
			first.contribution.dispose();

			// Reload while exhausted again — notification shows because the flag was cleared.
			const second = createContribution(
				{ quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) } },
				undefined,
				storageService,
			);
			assert.ok(second.notificationMock.getNotification());
			assert.strictEqual(second.notificationMock.getNotification()!.message, 'Credit Limit Reached');
		});

		test('keeps dismissal across reload when quota data is not loaded yet at startup', () => {
			const storageService = store.add(new InMemoryStorageService());

			// First window: exhausted notification shown, then dismissed by the user.
			const first = createContribution(
				{ quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) } },
				undefined,
				storageService,
			);
			first.notificationMock.dismiss(first.notificationMock.getNotification()!.id);
			first.contribution.dispose();

			// Reload: quota snapshots have not been fetched yet (no relevant snapshot),
			// so the dismissal must NOT be cleared by the transient "no data" state.
			const second = createContribution(
				{ quotas: { usageBasedBilling: true, premiumChat: undefined } },
				undefined,
				storageService,
			);
			assert.strictEqual(second.notificationMock.getNotification(), undefined);

			// Quota data arrives showing it is still exhausted — banner stays suppressed.
			updateQuotas(second.entitlementMock, { premiumChat: makeQuotaSnapshot(0) });
			assert.strictEqual(second.notificationMock.getNotification(), undefined);
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
			assert.strictEqual(getCommandAction(notificationMock.getNotification()!).commandId, 'workbench.action.chat.triggerSetup');
		});

		test('free user gets upgrade action', () => {
			const { notificationMock } = createContribution({
				entitlement: ChatEntitlement.Free,
				quotas: { usageBasedBilling: true, chat: makeQuotaSnapshot(0) },
			});

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.description, 'Upgrade to keep going.');
			assert.strictEqual(getCommandAction(notificationMock.getNotification()!).commandId, 'workbench.action.chat.upgradePlan');
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
			assert.strictEqual(getCommandAction(notificationMock.getNotification()!).commandId, 'workbench.action.chat.manageAdditionalSpend');
		});

		test('paid user without overage gets manage budget action even in switch-to-Auto treatment', () => {
			const { assignmentMock, notificationMock } = createContribution(
				{
					entitlement: ChatEntitlement.Pro,
					quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) },
				},
				{ switchToAutoTreatment: true },
			);

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.description, 'Manage your budget to keep building.');
			assert.strictEqual(getCommandAction(notificationMock.getNotification()!).commandId, 'workbench.action.chat.manageAdditionalSpend');
			assert.deepStrictEqual(assignmentMock.getTreatmentCalls, []);
		});
	});

	// --- Quota approaching threshold ----------------------------------------

	suite('quota approaching threshold', () => {
		test('first data arrival stores baseline without notification', async () => {
			const { notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(25) }, // 75% used
			});

			await flushPromises();

			// First data arrival stores 75% as the baseline without notifying.
			assert.strictEqual(notificationMock.getNotification(), undefined);
		});

		test('notifies when crossing 50% threshold', async () => {
			const { entitlementMock, notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) }, // 40% used baseline
			});

			await flushPromises();
			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) }); // 50% used

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.message, 'Credits at 50%');
		});

		test('treatment suggests switching to Auto when another model is selected', async () => {
			const { assignmentMock, entitlementMock, notificationMock } = createContribution(
				{ quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) } },
				{ switchToAutoTreatment: true },
			);

			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });
			await flushPromises();

			assert.deepStrictEqual({
				treatments: assignmentMock.getTreatmentCalls,
				description: notificationMock.getNotification()?.description,
				actions: notificationMock.getNotification()?.actions,
			}, {
				treatments: [SWITCH_TO_AUTO_TREATMENT_NAME],
				description: 'Switch to Auto to reduce credit usage.',
				actions: [{
					kind: ChatInputNotificationActionKind.SwitchToModel,
					label: 'Switch to Auto',
					modelIdentifier: 'copilot/auto',
				}],
			});
		});

		test('does not enroll and suggests managing budget when Auto is already selected', async () => {
			const { assignmentMock, entitlementMock, notificationMock } = createContribution(
				{ quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) } },
				{ selectedModelId: 'copilot/auto', switchToAutoTreatment: true },
			);

			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });
			await flushPromises();

			assert.strictEqual(notificationMock.getNotification()?.description, 'Set additional budget to cover extra usage.');
			assert.strictEqual(getCommandAction(notificationMock.getNotification()!).commandId, 'workbench.action.chat.manageAdditionalSpend');
			assert.deepStrictEqual(assignmentMock.getTreatmentCalls, []);
		});

		test('recognizes the live short Auto model id before persisted selection updates', async () => {
			const { assignmentMock, entitlementMock, notificationMock } = createContribution(
				{ quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) } },
				{ contextModelId: 'auto', selectedModelId: 'copilot/test-model', switchToAutoTreatment: true },
			);

			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });
			await flushPromises();

			assert.strictEqual(notificationMock.getNotification()?.description, 'Set additional budget to cover extra usage.');
			assert.strictEqual(getCommandAction(notificationMock.getNotification()!).commandId, 'workbench.action.chat.manageAdditionalSpend');
			assert.deepStrictEqual(assignmentMock.getTreatmentCalls, []);
		});

		test('control suggests managing budget when another model is selected', async () => {
			const { entitlementMock, notificationMock } = createContribution(
				{ quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) } },
				{ switchToAutoTreatment: false },
			);

			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });
			await flushPromises();

			assert.strictEqual(notificationMock.getNotification()?.description, 'Set additional budget to cover extra usage.');
			assert.strictEqual(getCommandAction(notificationMock.getNotification()!).commandId, 'workbench.action.chat.manageAdditionalSpend');
		});

		test('does not re-show the same threshold', async () => {
			const { entitlementMock, notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) },
			});

			await flushPromises();
			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });
			assert.ok(notificationMock.getNotification());

			notificationMock.reset();

			// Fire again at the same level
			entitlementMock.onDidChangeQuotaRemaining.fire();
			assert.strictEqual(notificationMock.getNotification(), undefined);
		});

		test('shows higher threshold when usage increases', async () => {
			const { entitlementMock, notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) },
			});

			await flushPromises();
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

		test('does not show approaching notification for PRU user', async () => {
			const { entitlementMock, notificationMock } = createContribution({
				entitlement: ChatEntitlement.Pro,
				quotas: { usageBasedBilling: false, premiumChat: makeQuotaSnapshot(60) },
			});

			await flushPromises();
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

	// --- Rate-limit warnings ------------------------------------------------

	suite('rate-limit warnings', () => {
		test('shows session rate limit warning on threshold crossing', async () => {
			const { entitlementMock, notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, sessionRateLimit: makeRateLimitSnapshot(60) }, // baseline
			});

			await flushPromises();
			updateQuotas(entitlementMock, { sessionRateLimit: makeRateLimitSnapshot(25) }); // 75% used

			assert.ok(notificationMock.getNotification());
			assert.ok((notificationMock.getNotification()!.message as string).includes('75%'));
			assert.ok((notificationMock.getNotification()!.message as string).includes('session'));
		});

		test('shows weekly rate limit warning on threshold crossing', async () => {
			const { entitlementMock, notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, weeklyRateLimit: makeRateLimitSnapshot(60) }, // baseline
			});

			await flushPromises();
			updateQuotas(entitlementMock, { weeklyRateLimit: makeRateLimitSnapshot(10) }); // 90% used

			assert.ok(notificationMock.getNotification());
			assert.ok((notificationMock.getNotification()!.message as string).includes('90%'));
			assert.ok((notificationMock.getNotification()!.message as string).includes('weekly'));
		});

		test('first rate limit data stores baseline without notification', async () => {
			const { notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, sessionRateLimit: makeRateLimitSnapshot(10) }, // 90% used
			});

			await flushPromises();
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

		test('approaching threshold takes priority over rate limit', async () => {
			const { entitlementMock, notificationMock } = createContribution({
				quotas: {
					usageBasedBilling: true,
					premiumChat: makeQuotaSnapshot(60), // 40% — baseline
					sessionRateLimit: makeRateLimitSnapshot(60), // 40% — baseline
				},
			});

			await flushPromises();
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
		test('free user gets upgrade action', async () => {
			const { entitlementMock, notificationMock } = createContribution({
				entitlement: ChatEntitlement.Free,
				quotas: { usageBasedBilling: true, chat: makeQuotaSnapshot(60) },
			});

			await flushPromises();
			updateQuotas(entitlementMock, { chat: makeQuotaSnapshot(50) });

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.description, 'Upgrade to continue past the limit.');
		});

		test('managed plan user gets admin message', async () => {
			const { entitlementMock, notificationMock } = createContribution({
				entitlement: ChatEntitlement.Enterprise,
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) },
			});

			await flushPromises();
			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.description, 'Contact your admin to increase your limits.');
		});

		test('paid user with overages enabled gets budget message', async () => {
			const { entitlementMock, notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60), additionalUsageEnabled: true },
			});

			await flushPromises();
			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.description, 'Additional budget is enabled to cover extra usage.');
		});

		test('paid user without overages gets set budget action', async () => {
			const { entitlementMock, notificationMock } = createContribution({
				quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) },
			});

			await flushPromises();
			updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });

			assert.ok(notificationMock.getNotification());
			assert.strictEqual(notificationMock.getNotification()!.description, 'Set additional budget to cover extra usage.');
			assert.strictEqual(getCommandAction(notificationMock.getNotification()!).commandId, 'workbench.action.chat.manageAdditionalSpend');
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
			storageService.store('chat.currentLanguageModel.panel', 'customendpoint/ANT/claude-sonnet-4-6', StorageScope.PROFILE, StorageTarget.USER);
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

			store.add(new ChatQuotaNotificationContribution(
				entitlementMock.service,
				notificationMock.service,
				contextKeyService as IContextKeyService,
				languageModelsService,
				storageService,
				assignmentMock.service,
				new NullLogService(),
			));

			// Initially deferred — BYOK model
			assert.strictEqual(notificationMock.getNotification(), undefined);

			// Switch to Copilot model via storage — triggers storage listener
			storageService.store('chat.currentLanguageModel.panel', 'copilot/gpt-4.1', StorageScope.PROFILE, StorageTarget.USER);

			assert.strictEqual(notificationMock.getNotification()?.message, 'Credit Limit Reached');
		});
	});
});
