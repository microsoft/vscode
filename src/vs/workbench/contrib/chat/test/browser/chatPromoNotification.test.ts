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
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../common/languageModels.js';
import { IChatInputNotification, IChatInputNotificationService } from '../../browser/widget/input/chatInputNotificationService.js';

function createMockNotificationService(disposables: Pick<DisposableStore, 'add'>) {
	const notifications = new Map<string, IChatInputNotification>();
	const dismissed = new Set<string>();

	const onDidChange = disposables.add(new Emitter<void>());
	const onDidDismiss = disposables.add(new Emitter<string>());

	// Mirrors ChatInputNotificationWidget#_matchesSession: a notification with a
	// `sessionTypes` allow-list only renders in a matching chat session.
	const matchesSession = (notification: IChatInputNotification, sessionType: string | undefined): boolean => {
		if (!notification.sessionTypes || notification.sessionTypes.length === 0) {
			return true;
		}
		return !!sessionType && notification.sessionTypes.includes(sessionType);
	};

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
		handleMessageSent() { },
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
			return service.getActiveNotification(n => matchesSession(n, sessionType));
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
		assert.strictEqual(notification.actions.length, 1);
		assert.ok(notification.actions[0].label.includes('GPT-5.5'));
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

		// Each session only sees the promo for the model that belongs to it, and
		// the "Use <model>" action switches to that harness's model.
		const local = notifService.getNotificationForSession('local');
		assert.ok(local, 'Expected a local promo');
		assert.ok(local.message.toString().includes('Local promo'));
		assert.deepStrictEqual(local.actions[0].commandArgs, [{ modelIdentifier: 'local:gpt-5.5', notificationId: local.id }]);

		const copilot = notifService.getNotificationForSession('copilotcli');
		assert.ok(copilot, 'Expected a Copilot promo');
		assert.ok(copilot.message.toString().includes('Copilot promo'));
		assert.deepStrictEqual(copilot.actions[0].commandArgs, [{ modelIdentifier: 'copilot:claude', notificationId: copilot.id }]);

		const codex = notifService.getNotificationForSession('openai-codex');
		assert.ok(codex, 'Expected a Codex promo');
		assert.ok(codex.message.toString().includes('Codex promo'));
		assert.deepStrictEqual(codex.actions[0].commandArgs, [{ modelIdentifier: 'codex:o4', notificationId: codex.id }]);
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
});
