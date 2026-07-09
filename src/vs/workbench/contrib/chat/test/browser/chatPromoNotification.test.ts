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
	let lastNotification: IChatInputNotification | undefined;
	let deleted = false;
	let dismissed = false;

	const onDidChange = disposables.add(new Emitter<void>());
	const onDidDismiss = disposables.add(new Emitter<string>());

	const service: IChatInputNotificationService = {
		_serviceBrand: undefined,
		onDidChange: onDidChange.event,
		onDidDismiss: onDidDismiss.event,
		setNotification(notification: IChatInputNotification) {
			lastNotification = notification;
			deleted = false;
			dismissed = false;
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
		getActiveNotification() { return deleted || dismissed ? undefined : lastNotification; },
		handleMessageSent() { },
	};

	return {
		service,
		onDidDismiss,
		getNotification(): IChatInputNotification | undefined { return deleted || dismissed ? undefined : lastNotification; },
		dismiss(id?: string) {
			const notificationId = id ?? lastNotification?.id;
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
});
