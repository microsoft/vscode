/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { CHAT_PROMO_DISMISS_COMMAND_ID, CHAT_PROMO_TRY_MODEL_COMMAND_ID, ChatPromoNotificationContribution } from '../../browser/chatPromoNotification.js';
import { ChatConfiguration, ChatSaleNotification } from '../../common/constants.js';
import { IChatWidgetService } from '../../browser/chat.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../common/languageModels.js';
import { ChatInputNotificationActionKind, IChatInputNotification, IChatInputNotificationService, isChatInputNotificationApplicableToSessionType } from '../../browser/widget/input/chatInputNotificationService.js';

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

function createMockCommandService() {
	const executed: { id: string; args: unknown[] }[] = [];
	const service = {
		_serviceBrand: undefined,
		onWillExecuteCommand: () => ({ dispose() { } }),
		onDidExecuteCommand: () => ({ dispose() { } }),
		executeCommand(id: string, ...args: unknown[]) {
			executed.push({ id, args });
			return Promise.resolve(undefined);
		},
	} as ICommandService;
	return { service, executed };
}

function createMockWidgetService() {
	return {
		_serviceBrand: undefined,
		revealWidget: async () => undefined,
	} as unknown as IChatWidgetService;
}

function createContribution(
	lmService: ILanguageModelsService,
	notifService: IChatInputNotificationService,
	storageService: InMemoryStorageService,
	commandService: ICommandService = createMockCommandService().service,
	saleNotification: ChatSaleNotification = ChatSaleNotification.Banner,
) {
	const configurationService = new TestConfigurationService({
		[ChatConfiguration.SaleNotification]: saleNotification,
	});
	return new ChatPromoNotificationContribution(
		lmService,
		notifService,
		storageService,
		commandService,
		createMockWidgetService(),
		configurationService,
	);
}

suite('ChatPromoNotificationContribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows the input banner for a discounted promo by default', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-1', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Get 20% off' } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
			commands.service,
		));

		const notification = notifService.getNotification();
		assert.deepStrictEqual({
			message: notification?.message,
			commandCount: commands.executed.length,
		}, {
			message: 'Get 20% off',
			commandCount: 0,
		});
	});

	test('shows the post-update card for a discounted promo when the setting is popup', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-1', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Get 20% off' } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();

		const contribution = disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
			commands.service,
			ChatSaleNotification.Popup,
		));
		assert.ok(contribution);

		assert.strictEqual(notifService.getNotification(), undefined, 'A sale must not render the chat-input banner');
		assert.strictEqual(commands.executed.length, 1);
		assert.strictEqual(commands.executed[0].id, '_update.showUpdateInfo');
		const payload = JSON.parse(String(commands.executed[0].args[0]));
		assert.deepStrictEqual({
			title: payload.title,
			badge: payload.badge,
			dismissCommandId: payload.dismissCommandId,
			dismissArgs: payload.dismissArgs,
			buttons: payload.buttons,
			featureTitles: payload.features.map((f: { title: string }) => f.title),
			featureIcons: payload.features.map((f: { icon: string }) => f.icon),
		}, {
			title: 'Limited-time model offer',
			badge: 'SALE',
			dismissCommandId: CHAT_PROMO_DISMISS_COMMAND_ID,
			dismissArgs: ['promo-1'],
			buttons: [{
				label: 'Try GPT-5.5',
				commandId: CHAT_PROMO_TRY_MODEL_COMMAND_ID,
				args: ['promo-1', 'copilot:gpt-5.5'],
				style: 'primary',
			}],
			featureTitles: ['20% off GPT-5.5', 'Limited time', 'Try it in Chat'],
			featureIcons: ['$(sparkle)', '$(calendar)', '$(comment-discussion)'],
		});
	});

	test('renders the server message for a 0% promo', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:zero-discount',
			metadata: { name: 'Zero Discount', id: 'zero-discount', promo: { id: 'promo-zero', discountPercent: 0, endsAt: '2026-07-20T23:59:59Z', message: 'Featured model' } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
			commands.service,
		));

		const notification = notifService.getNotification();
		assert.ok(notification, 'Expected a notification for the 0% promo');
		assert.strictEqual(notification.message, 'Featured model');
		assert.strictEqual(commands.executed.length, 0);
	});

	test('prefers a discounted promo over a 0% one in the same harness', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([
			{ identifier: 'copilot:featured', metadata: { name: 'Featured', id: 'featured', promo: { id: 'promo-zero', discountPercent: 0, message: 'Featured model' } } },
			{ identifier: 'copilot:discounted', metadata: { name: 'Discounted', id: 'discounted', promo: { id: 'promo-discount', discountPercent: 20, message: 'Get 20% off' } } },
		], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
			commands.service,
			ChatSaleNotification.Popup,
		));

		assert.strictEqual(notifService.getNotification(), undefined, 'The preferred sale uses the card, not the banner');
		assert.strictEqual(commands.executed[0]?.id, '_update.showUpdateInfo');
		const payload = JSON.parse(String(commands.executed[0].args[0]));
		assert.strictEqual(payload.features[0].title, '20% off Discounted');
	});

	test('does not show notification for negative promo discounts', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:negative-discount',
			metadata: { name: 'Negative Discount', id: 'negative-discount', promo: { id: 'promo-negative', discountPercent: -10, endsAt: '2026-07-20T23:59:59Z', message: 'Featured model' } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
			commands.service,
		));

		assert.strictEqual(notifService.getNotification(), undefined);
		assert.strictEqual(commands.executed.length, 0);
	});

	test('scopes a 0% promo to unstarted persistent chats', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-1', discountPercent: 0, message: 'Featured model' } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
		));

		const notification = notifService.getNotification();
		assert.deepStrictEqual({
			hideInTransientChats: notification?.hideInTransientChats,
			hideInStartedSessions: notification?.hideInStartedSessions,
			autoDismissOnMessage: notification?.autoDismissOnMessage,
		}, {
			hideInTransientChats: true,
			hideInStartedSessions: true,
			autoDismissOnMessage: false,
		});
	});

	test('omits the end date when a 0% promo has none', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([
			{ identifier: 'local:no-end-date', metadata: { name: 'Open Ended', id: 'no-end-date', promo: { id: 'promo-open', discountPercent: 0, message: 'Featured model' } } },
			{ identifier: 'copilot:bad-end-date', metadata: { name: 'Bad Date', id: 'bad-end-date', targetChatSessionType: 'copilotcli', promo: { id: 'promo-bad-date', discountPercent: 0, endsAt: 'not a date', message: 'Featured model' } } },
		], disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
		));

		assert.deepStrictEqual(
			notifService.getAllNotifications().map(n => ({ message: n.message, description: n.description })),
			[
				{ message: 'Featured model', description: undefined },
				{ message: 'Featured model', description: undefined },
			],
		);
	});

	test('does not show a sale card for an already-dismissed promo', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-1', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Get 20% off' } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store('chat.dismissedPromoIds', JSON.stringify(['promo-1']), StorageScope.APPLICATION, 0 /* StorageTarget.USER */);
		const commands = createMockCommandService();

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
			commands.service,
		));

		assert.strictEqual(notifService.getNotification(), undefined);
		assert.strictEqual(commands.executed.length, 0);
	});

	test('persists promo id on dismiss of a 0% banner', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-2', discountPercent: 0, endsAt: '2026-08-01T00:00:00Z', message: 'Summer promo' } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
		));
		assert.ok(notifService.getNotification(), 'Notification should be shown initially');

		notifService.dismiss();

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
		const commands = createMockCommandService();

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
			commands.service,
		));

		assert.strictEqual(notifService.getNotification(), undefined);
		assert.strictEqual(commands.executed.length, 0);
	});

	test('handles malformed stored JSON gracefully', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-3', discountPercent: 0, endsAt: '2026-07-20T23:59:59Z', message: 'Promo' } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store('chat.dismissedPromoIds', '{not valid json', StorageScope.APPLICATION, 0);
		const commands = createMockCommandService();

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
			commands.service,
		));

		assert.ok(notifService.getNotification());
		assert.strictEqual(commands.executed.length, 0);
	});

	test('removes notification when promo model disappears', () => {
		const models = [{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-4', discountPercent: 0, endsAt: '2026-07-20T23:59:59Z', message: 'Flash sale' } },
		}];
		const notifService = createMockNotificationService(disposables);
		const { service: lmService, onDidChangeLanguageModels } = createMockLanguageModelsService(models, disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
		));
		assert.ok(notifService.getNotification());

		models.length = 0;
		onDidChangeLanguageModels.fire(undefined);

		assert.strictEqual(notifService.getNotification(), undefined, 'Notification should be removed when promo model is gone');
	});

	test('shows one sale card when two discounted promos share a harness', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([
			{ identifier: 'copilot:gpt-5.5', metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-a', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'First promo' } } },
			{ identifier: 'copilot:claude', metadata: { name: 'Claude', id: 'claude', promo: { id: 'promo-b', discountPercent: 10, endsAt: '2026-08-01T00:00:00Z', message: 'Second promo' } } },
		], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
			commands.service,
		));

		assert.strictEqual(notifService.getNotification(), undefined);
		assert.strictEqual(commands.executed.length, 1);
		const payload = JSON.parse(String(commands.executed[0].args[0]));
		assert.strictEqual(payload.features[0].description, 'First promo');
	});

	test('shows a scoped 0% promo per harness', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([
			{ identifier: 'local:gpt-5.5', metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-local', discountPercent: 0, endsAt: '2026-07-20T23:59:59Z', message: 'Local promo' } } },
			{ identifier: 'copilot:claude', metadata: { name: 'Claude', id: 'claude', targetChatSessionType: 'copilotcli', promo: { id: 'promo-copilot', discountPercent: 0, endsAt: '2026-07-20T23:59:59Z', message: 'Copilot promo' } } },
			{ identifier: 'codex:o4', metadata: { name: 'o4', id: 'o4', targetChatSessionType: 'openai-codex', promo: { id: 'promo-codex', discountPercent: 0, endsAt: '2026-07-20T23:59:59Z', message: 'Codex promo' } } },
		], disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
		));

		assert.strictEqual(notifService.getAllNotifications().length, 3);

		const local = notifService.getNotificationForSession('local');
		assert.ok(local, 'Expected a local promo');
		assert.ok(local.message.toString().includes('Local promo'));
		assert.deepStrictEqual(local.actions, [{ label: 'Try GPT-5.5', kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: 'local:gpt-5.5' }]);

		const copilot = notifService.getNotificationForSession('copilotcli');
		assert.ok(copilot, 'Expected a Copilot promo');
		assert.ok(copilot.message.toString().includes('Copilot promo'));
		assert.deepStrictEqual(copilot.actions, [{ label: 'Try Claude', kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: 'copilot:claude' }]);

		const codex = notifService.getNotificationForSession('openai-codex');
		assert.ok(codex, 'Expected a Codex promo');
		assert.ok(codex.message.toString().includes('Codex promo'));
		assert.deepStrictEqual(codex.actions, [{ label: 'Try o4', kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: 'codex:o4' }]);
	});

	test('does not leak a harness promo into a different session type', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([
			{ identifier: 'copilot:claude', metadata: { name: 'Claude', id: 'claude', targetChatSessionType: 'copilotcli', promo: { id: 'promo-copilot', discountPercent: 0, endsAt: '2026-07-20T23:59:59Z', message: 'Copilot promo' } } },
		], disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
		));

		assert.ok(notifService.getNotificationForSession('copilotcli'), 'Promo should show in its own harness');
		assert.strictEqual(notifService.getNotificationForSession('local'), undefined, 'Promo should not leak into the local harness');
		assert.strictEqual(notifService.getNotificationForSession('openai-codex'), undefined, 'Promo should not leak into another harness');
	});

	test('dismissing a promo in one harness hides the same promo in the others', () => {
		const notifService = createMockNotificationService(disposables);
		const sharedPromo = { id: 'promo-shared', discountPercent: 0, endsAt: '2026-07-20T23:59:59Z', message: 'Shared promo' };
		const { service: lmService } = createMockLanguageModelsService([
			{ identifier: 'copilot:claude', metadata: { name: 'Claude', id: 'claude', targetChatSessionType: 'copilotcli', promo: sharedPromo } },
			{ identifier: 'codex:o4', metadata: { name: 'o4', id: 'o4', targetChatSessionType: 'openai-codex', promo: sharedPromo } },
		], disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
		));
		assert.strictEqual(notifService.getAllNotifications().length, 2);

		const copilot = notifService.getNotificationForSession('copilotcli');
		assert.ok(copilot);
		notifService.dismiss(copilot.id);

		assert.strictEqual(notifService.getAllNotifications().length, 0);
		const stored = JSON.parse(storageService.get('chat.dismissedPromoIds', StorageScope.APPLICATION) ?? '[]');
		assert.deepStrictEqual(stored, ['promo-shared']);
	});

	test('dismissing a promo in one window hides it in other windows', () => {
		const promo = { id: 'promo-1', discountPercent: 0, endsAt: '2026-07-20T23:59:59Z', message: 'Featured model' };
		const models = [{ identifier: 'copilot:gpt-5.5', metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo } }];
		const storageService = disposables.add(new InMemoryStorageService());

		const windowA = createMockNotificationService(disposables);
		const windowB = createMockNotificationService(disposables);
		disposables.add(createContribution(createMockLanguageModelsService(models, disposables).service, windowA.service, storageService));
		disposables.add(createContribution(createMockLanguageModelsService(models, disposables).service, windowB.service, storageService));

		assert.ok(windowA.getNotification());
		assert.ok(windowB.getNotification());

		windowA.dismiss();

		assert.strictEqual(windowA.getNotification(), undefined, 'Dismissing window should hide the promo');
		assert.strictEqual(windowB.getNotification(), undefined, 'Other windows should hide the promo too');
	});

	test('sale card close and try commands persist the same dismissed promo store', async () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-sale', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Get 20% off' } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();
		disposables.add(createContribution(lmService, notifService.service, storageService, commands.service));

		await CommandsRegistry.getCommand(CHAT_PROMO_DISMISS_COMMAND_ID)?.handler(undefined!, 'promo-sale');
		const stored = JSON.parse(storageService.get('chat.dismissedPromoIds', StorageScope.APPLICATION) ?? '[]');
		assert.deepStrictEqual(stored, ['promo-sale']);
	});
});
