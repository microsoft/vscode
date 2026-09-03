/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ChatPromoNotificationContribution } from '../../browser/chatPromoNotification.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../common/languageModels.js';
import { ChatInputNotificationActionKind, IChatInputNotification, IChatInputNotificationContext, IChatInputNotificationService, isChatInputNotificationApplicableToSessionType } from '../../browser/widget/input/chatInputNotificationService.js';

function inputContext(overrides: Partial<IChatInputNotificationContext> = {}): IChatInputNotificationContext {
	return {
		sessionType: undefined,
		sessionResource: undefined,
		deferredNotificationsEnabled: true,
		isTransientChat: false,
		sessionStarted: false,
		modelState: { currentModel: undefined, models: [] },
		...overrides,
	};
}

function assertPromoAction(notification: IChatInputNotification, identifier: string, label: string): void {
	const action = notification.actions[0];
	const model = { identifier, metadata: { id: identifier, vendor: 'test', family: identifier } as ILanguageModelChatMetadata } satisfies ILanguageModelChatMetadataAndIdentifier;
	const otherModel = { ...model, identifier: 'other/model' };
	assert.deepStrictEqual({
		label: action?.label,
		kind: action?.kind,
		matches: action?.kind === ChatInputNotificationActionKind.SwitchToModel && action.matchesModel(model),
		matchesOther: action?.kind === ChatInputNotificationActionKind.SwitchToModel && action.matchesModel(otherModel),
	}, {
		label,
		kind: ChatInputNotificationActionKind.SwitchToModel,
		matches: true,
		matchesOther: false,
	});
}

function createMockNotificationService(disposables: Pick<DisposableStore, 'add'>) {
	const notifications = new Map<string, IChatInputNotification>();
	const dismissed = new Set<string>();

	const onDidChange = disposables.add(new Emitter<void>());
	const onDidDismiss = disposables.add(new Emitter<string>());

	const service: IChatInputNotificationService = {
		_serviceBrand: undefined,
		onDidChange: onDidChange.event,
		onDidDismiss: onDidDismiss.event,
		setNotification(notification: IChatInputNotification) {
			notifications.set(notification.id, notification);
			dismissed.delete(notification.id);
			onDidChange.fire();
		},
		deleteNotification(id: string) {
			if (notifications.delete(id)) {
				dismissed.delete(id);
				onDidChange.fire();
			}
		},
		dismissNotification(id: string) {
			if (!notifications.has(id) || dismissed.has(id)) {
				return;
			}
			dismissed.add(id);
			onDidDismiss.fire(id);
			onDidChange.fire();
		},
		getActiveNotification(filter?: (notification: IChatInputNotification) => boolean) {
			let active: IChatInputNotification | undefined;
			for (const notification of notifications.values()) {
				if (dismissed.has(notification.id) || (filter && !filter(notification))) {
					continue;
				}
				active = notification; // Map preserves insertion order: last match wins.
			}
			return active;
		},
		refresh() { },
		handleMessageSent() { },
		announceRendered() { },
	};

	return {
		service,
		onDidDismiss,
		/** The active notification, ignoring session scoping. */
		getNotification(): IChatInputNotification | undefined {
			return service.getActiveNotification();
		},
		/** The active notification a chat input of the given session type would render. */
		getNotificationForSession(sessionType: string | undefined): IChatInputNotification | undefined {
			return service.getActiveNotification(n => isChatInputNotificationApplicableToSessionType(n, sessionType));
		},
		/** All notifications that are currently set and not dismissed. */
		getAllNotifications(): IChatInputNotification[] {
			return [...notifications.values()].filter(n => !dismissed.has(n.id));
		},
		dismiss(id?: string) {
			const notificationId = id ?? [...notifications.keys()].reverse().find(k => !dismissed.has(k));
			if (notificationId) {
				service.dismissNotification(notificationId);
			}
		},
	};
}

function createMockLanguageModelsService(models: { identifier: string; metadata: Partial<ILanguageModelChatMetadata> }[], disposables: Pick<DisposableStore, 'add'>) {
	const onDidChangeLanguageModels = disposables.add(new Emitter<string | undefined>());
	const service = {
		_serviceBrand: undefined,
		onDidChangeLanguageModels: onDidChangeLanguageModels.event,
		getLanguageModelIds() { return models.map(m => m.identifier); },
		lookupLanguageModel(id: string) {
			const match = models.find(m => m.identifier === id);
			return match?.metadata as ILanguageModelChatMetadata | undefined;
		},
	} as unknown as ILanguageModelsService;

	return { service, onDidChangeLanguageModels };
}

suite('ChatPromoNotificationContribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows notification for model with promo', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-1', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Get 20% off' } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		const contribution = disposables.add(new ChatPromoNotificationContribution(
			lmService,
			notifService.service,
			storageService,
		));
		assert.ok(contribution);

		const notification = notifService.getNotification();
		assert.ok(notification, 'Expected a notification to be shown');
		assert.ok(notification.message.toString().includes('20% off'));
		assert.ok(notification.description?.toString().includes('2026'), 'Expected the end date to be rendered');
		assertPromoAction(notification, 'copilot:gpt-5.5', 'Try GPT-5.5');
	});

	test('scopes promos to unstarted persistent chats', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-1', discountPercent: 20, message: 'Get 20% off' } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		disposables.add(new ChatPromoNotificationContribution(
			lmService,
			notifService.service,
			storageService,
		));

		const notification = notifService.getNotification();
		assert.deepStrictEqual({
			newUser: notification?.when?.(inputContext({ deferredNotificationsEnabled: false })),
			transient: notification?.when?.(inputContext({ isTransientChat: true })),
			started: notification?.when?.(inputContext({ sessionStarted: true })),
			eligible: notification?.when?.(inputContext()),
			autoDismissOnMessage: notification?.autoDismissOnMessage,
		}, {
			newUser: false,
			transient: false,
			started: false,
			eligible: true,
			autoDismissOnMessage: false,
		});
	});

	test('renders the server message for a 0% promo', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:zero-discount',
			metadata: { name: 'Zero Discount', id: 'zero-discount', promo: { id: 'promo-zero', discountPercent: 0, endsAt: '2026-07-20T23:59:59Z', message: 'Featured model' } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		disposables.add(new ChatPromoNotificationContribution(
			lmService,
			notifService.service,
			storageService,
		));

		const notification = notifService.getNotification();
		assert.ok(notification, 'Expected a notification for the 0% promo');
		assert.strictEqual(notification.message, 'Featured model');
	});

	test('prefers a discounted promo over a 0% one in the same harness', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([
			{ identifier: 'copilot:featured', metadata: { name: 'Featured', id: 'featured', promo: { id: 'promo-zero', discountPercent: 0, message: 'Featured model' } } },
			{ identifier: 'copilot:discounted', metadata: { name: 'Discounted', id: 'discounted', promo: { id: 'promo-discount', discountPercent: 20, message: 'Get 20% off' } } },
		], disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		disposables.add(new ChatPromoNotificationContribution(
			lmService,
			notifService.service,
			storageService,
		));

		const notification = notifService.getNotification();
		assert.ok(notification);
		assert.strictEqual(notification.message, 'Get 20% off');
	});

	test('does not show notification for negative promo discounts', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:negative-discount',
			metadata: { name: 'Negative Discount', id: 'negative-discount', promo: { id: 'promo-negative', discountPercent: -10, endsAt: '2026-07-20T23:59:59Z', message: 'Featured model' } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		disposables.add(new ChatPromoNotificationContribution(
			lmService,
			notifService.service,
			storageService,
		));

		assert.strictEqual(notifService.getNotification(), undefined);
	});

	test('skips a promo that opts out of the banner', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([
			{ identifier: 'copilot:picker-only', metadata: { name: 'Picker Only', id: 'picker-only', promo: { id: 'promo-picker-only', discountPercent: 20, message: 'Get 20% off', showBanner: false } } },
			{ identifier: 'copilot:featured', metadata: { name: 'Featured', id: 'featured', promo: { id: 'promo-featured', discountPercent: 0, message: 'Featured model' } } },
		], disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		disposables.add(new ChatPromoNotificationContribution(
			lmService,
			notifService.service,
			storageService,
		));

		// The opt-out promo is skipped even though its discount would otherwise win the harness.
		assert.strictEqual(notifService.getNotification()?.message, 'Featured model');
	});

	test('omits the end date when the promo has none', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([
			{ identifier: 'local:no-end-date', metadata: { name: 'Open Ended', id: 'no-end-date', promo: { id: 'promo-open', discountPercent: 20, message: 'Get 20% off' } } },
			{ identifier: 'copilot:bad-end-date', metadata: { name: 'Bad Date', id: 'bad-end-date', targetChatSessionType: 'copilotcli', promo: { id: 'promo-bad-date', discountPercent: 20, endsAt: 'not a date', message: 'Get 20% off' } } },
		], disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		disposables.add(new ChatPromoNotificationContribution(
			lmService,
			notifService.service,
			storageService,
		));

		assert.deepStrictEqual(
			notifService.getAllNotifications().map(n => ({ message: n.message, description: n.description })),
			[
				{ message: 'Get 20% off', description: undefined },
				{ message: 'Get 20% off', description: undefined },
			],
		);
	});

	test('does not show notification for already-dismissed promo', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-1', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Get 20% off' } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		// Pre-seed dismissed promo
		storageService.store('chat.dismissedPromoIds', JSON.stringify(['promo-1']), StorageScope.APPLICATION, 0 /* StorageTarget.USER */);

		const contribution = disposables.add(new ChatPromoNotificationContribution(
			lmService,
			notifService.service,
			storageService,
		));
		assert.ok(contribution);

		const notification = notifService.getNotification();
		assert.strictEqual(notification, undefined, 'Should not show notification for dismissed promo');
	});

	test('persists promo id on dismiss', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-2', discountPercent: 15, endsAt: '2026-08-01T00:00:00Z', message: 'Summer promo' } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		const contribution = disposables.add(new ChatPromoNotificationContribution(
			lmService,
			notifService.service,
			storageService,
		));
		assert.ok(contribution);
		assert.ok(notifService.getNotification(), 'Notification should be shown initially');

		// Simulate user dismissing the notification
		notifService.dismiss();

		// Verify persisted
		const stored = storageService.get('chat.dismissedPromoIds', StorageScope.APPLICATION);
		assert.ok(stored);
		const parsed = JSON.parse(stored);
		assert.ok(Array.isArray(parsed));
		assert.ok(parsed.includes('promo-2'));
	});

	test('does not show notification when no models have promo', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-4o',
			metadata: { name: 'GPT-4o', id: 'gpt-4o' },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		const contribution = disposables.add(new ChatPromoNotificationContribution(
			lmService,
			notifService.service,
			storageService,
		));
		assert.ok(contribution);

		assert.strictEqual(notifService.getNotification(), undefined);
	});

	test('handles malformed stored JSON gracefully', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-3', discountPercent: 10, endsAt: '2026-07-20T23:59:59Z', message: 'Promo' } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		// Store malformed JSON
		storageService.store('chat.dismissedPromoIds', '{not valid json', StorageScope.APPLICATION, 0);

		const contribution = disposables.add(new ChatPromoNotificationContribution(
			lmService,
			notifService.service,
			storageService,
		));
		assert.ok(contribution);

		// Should still show the notification (malformed data ignored)
		assert.ok(notifService.getNotification());
	});

	test('removes notification when promo model disappears', () => {
		const models = [{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-4', discountPercent: 25, endsAt: '2026-07-20T23:59:59Z', message: 'Flash sale' } },
		}];
		const notifService = createMockNotificationService(disposables);
		const { service: lmService, onDidChangeLanguageModels } = createMockLanguageModelsService(models, disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		const contribution = disposables.add(new ChatPromoNotificationContribution(
			lmService,
			notifService.service,
			storageService,
		));
		assert.ok(contribution);
		assert.ok(notifService.getNotification());

		// Remove the promo model
		models.length = 0;
		onDidChangeLanguageModels.fire(undefined);

		assert.strictEqual(notifService.getNotification(), undefined, 'Notification should be removed when promo model is gone');
	});

	test('skips second promo if first is not dismissed', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([
			{ identifier: 'copilot:gpt-5.5', metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-a', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'First promo' } } },
			{ identifier: 'copilot:claude', metadata: { name: 'Claude', id: 'claude', promo: { id: 'promo-b', discountPercent: 10, endsAt: '2026-08-01T00:00:00Z', message: 'Second promo' } } },
		], disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		const contribution = disposables.add(new ChatPromoNotificationContribution(
			lmService,
			notifService.service,
			storageService,
		));
		assert.ok(contribution);

		const notification = notifService.getNotification();
		assert.ok(notification);
		// Should show the first promo, not the second
		assert.ok(notification.message.toString().includes('First promo'));
	});

	test('shows a scoped promo per harness', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([
			{ identifier: 'local:gpt-5.5', metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-local', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Local promo' } } },
			{ identifier: 'copilot:claude', metadata: { name: 'Claude', id: 'claude', targetChatSessionType: 'copilotcli', promo: { id: 'promo-copilot', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Copilot promo' } } },
			{ identifier: 'codex:o4', metadata: { name: 'o4', id: 'o4', targetChatSessionType: 'openai-codex', promo: { id: 'promo-codex', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Codex promo' } } },
		], disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		const contribution = disposables.add(new ChatPromoNotificationContribution(
			lmService,
			notifService.service,
			storageService,
		));
		assert.ok(contribution);

		// One notification per harness.
		assert.strictEqual(notifService.getAllNotifications().length, 3);

		// Each session only sees the promo for the model that belongs to it.
		const local = notifService.getNotificationForSession('local');
		assert.ok(local, 'Expected a local promo');
		assert.ok(local.message.toString().includes('Local promo'));
		assertPromoAction(local, 'local:gpt-5.5', 'Try GPT-5.5');

		const copilot = notifService.getNotificationForSession('copilotcli');
		assert.ok(copilot, 'Expected a Copilot promo');
		assert.ok(copilot.message.toString().includes('Copilot promo'));
		assertPromoAction(copilot, 'copilot:claude', 'Try Claude');

		const codex = notifService.getNotificationForSession('openai-codex');
		assert.ok(codex, 'Expected a Codex promo');
		assert.ok(codex.message.toString().includes('Codex promo'));
		assertPromoAction(codex, 'codex:o4', 'Try o4');
	});

	test('does not leak a harness promo into a different session type', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([
			{ identifier: 'copilot:claude', metadata: { name: 'Claude', id: 'claude', targetChatSessionType: 'copilotcli', promo: { id: 'promo-copilot', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Copilot promo' } } },
		], disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		const contribution = disposables.add(new ChatPromoNotificationContribution(
			lmService,
			notifService.service,
			storageService,
		));
		assert.ok(contribution);

		assert.ok(notifService.getNotificationForSession('copilotcli'), 'Promo should show in its own harness');
		assert.strictEqual(notifService.getNotificationForSession('local'), undefined, 'Promo should not leak into the local harness');
		assert.strictEqual(notifService.getNotificationForSession('openai-codex'), undefined, 'Promo should not leak into another harness');
	});

	test('dismissing a promo in one harness hides the same promo in the others', () => {
		const notifService = createMockNotificationService(disposables);
		const sharedPromo = { id: 'promo-shared', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Shared promo' };
		const { service: lmService } = createMockLanguageModelsService([
			{ identifier: 'copilot:claude', metadata: { name: 'Claude', id: 'claude', targetChatSessionType: 'copilotcli', promo: sharedPromo } },
			{ identifier: 'codex:o4', metadata: { name: 'o4', id: 'o4', targetChatSessionType: 'openai-codex', promo: sharedPromo } },
		], disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		const contribution = disposables.add(new ChatPromoNotificationContribution(
			lmService,
			notifService.service,
			storageService,
		));
		assert.ok(contribution);
		assert.strictEqual(notifService.getAllNotifications().length, 2);

		// Dismiss the Copilot notification.
		const copilot = notifService.getNotificationForSession('copilotcli');
		assert.ok(copilot);
		notifService.dismiss(copilot.id);

		// Both notifications carry the same promo id, so dismissing one removes both.
		assert.strictEqual(notifService.getAllNotifications().length, 0);
		const stored = JSON.parse(storageService.get('chat.dismissedPromoIds', StorageScope.APPLICATION) ?? '[]');
		assert.deepStrictEqual(stored, ['promo-shared']);
	});

	test('dismissing a promo in one window hides it in other windows', () => {
		const promo = { id: 'promo-1', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Get 20% off' };
		const models = [{ identifier: 'copilot:gpt-5.5', metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo } }];
		// Both windows of the same app share application-scoped storage.
		const storageService = disposables.add(new InMemoryStorageService());

		const windowA = createMockNotificationService(disposables);
		const windowB = createMockNotificationService(disposables);
		disposables.add(new ChatPromoNotificationContribution(createMockLanguageModelsService(models, disposables).service, windowA.service, storageService));
		disposables.add(new ChatPromoNotificationContribution(createMockLanguageModelsService(models, disposables).service, windowB.service, storageService));

		assert.ok(windowA.getNotification());
		assert.ok(windowB.getNotification());

		windowA.dismiss();

		assert.strictEqual(windowA.getNotification(), undefined, 'Dismissing window should hide the promo');
		assert.strictEqual(windowB.getNotification(), undefined, 'Other windows should hide the promo too');
	});
});
