/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import * as dom from '../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { URI } from '../../../../../base/common/uri.js';
import { CHAT_CLOSED_PROMO_TREATMENT, CHAT_PROMO_DISMISS_COMMAND_ID, CHAT_PROMO_TRY_MODEL_COMMAND_ID, ChatPromoNotificationContribution } from '../../browser/chatPromoNotification.js';
import { ARM_CHAT_PROMO_COMMAND_ID, ChatPromoWidgetContribution, DISARM_CHAT_PROMO_COMMAND_ID, IChatPromoCardInput } from '../../browser/chatPromoWidget.js';
import { ChatClosedPromoNotification, ChatConfiguration } from '../../common/constants.js';
import { ChatViewId, IChatWidgetService } from '../../browser/chat.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { CHAT_OPEN_ACTION_ID } from '../../browser/actions/chatActions.js';
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
		handleMessageSent() { },
		announceRendered() { },
		refresh() { },
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

function createMockWidgetService(options: { sessionScheme?: string } = {}) {
	const switched: string[] = [];
	const requested: string[] = [];
	const listeners = new Set<() => void>();
	const widget = {
		focusInput() { },
		onDidChangeViewModel: (listener: () => void) => {
			listeners.add(listener);
			return { dispose: () => listeners.delete(listener) };
		},
		viewModel: options.sessionScheme
			? { sessionResource: URI.from({ scheme: options.sessionScheme, path: '/session' }) }
			: undefined,
		input: {
			switchModelByIdentifier(identifier: string) {
				switched.push(identifier);
				return true;
			},
			async requestModelByIdentifier(identifier: string) {
				requested.push(identifier);
				return true;
			},
		},
	};
	const service = {
		_serviceBrand: undefined,
		revealWidget: async () => widget,
	} as unknown as IChatWidgetService;
	const resolveSession = (scheme: string) => {
		widget.viewModel = { sessionResource: URI.from({ scheme, path: '/session' }) };
		for (const listener of listeners) {
			listener();
		}
	};
	return { service, switched, requested, resolveSession };
}

function createMockViewsService(disposables: Pick<DisposableStore, 'add'>, visible = false) {
	const onDidChangeViewVisibility = disposables.add(new Emitter<{ id: string; visible: boolean }>());
	const state = { visible };
	const service = {
		_serviceBrand: undefined,
		onDidChangeViewVisibility: onDidChangeViewVisibility.event,
		isViewVisible(id: string) {
			return id === ChatViewId ? state.visible : false;
		},
	} as unknown as IViewsService;

	return {
		service,
		setVisible(next: boolean) {
			state.visible = next;
			onDidChangeViewVisibility.fire({ id: ChatViewId, visible: next });
		},
	};
}

function createContribution(
	lmService: ILanguageModelsService,
	notifService: IChatInputNotificationService,
	storageService: InMemoryStorageService,
	commandService: ICommandService = createMockCommandService().service,
	closedPromoNotification: ChatClosedPromoNotification = ChatClosedPromoNotification.None,
	viewsService?: IViewsService,
	widgetService?: IChatWidgetService,
	options: { configurationService?: TestConfigurationService; assignmentService?: IWorkbenchAssignmentService; logService?: ILogService; layoutService?: ILayoutService } = {},
) {
	const configurationService = options.configurationService ?? new TestConfigurationService({
		[ChatConfiguration.ChatClosedPromoNotification]: closedPromoNotification,
	});
	return new ChatPromoNotificationContribution(
		lmService,
		notifService,
		storageService,
		commandService,
		widgetService ?? createMockWidgetService().service,
		configurationService,
		viewsService ?? {
			_serviceBrand: undefined,
			onDidChangeViewVisibility: Event.None,
			isViewVisible: () => false,
		} as unknown as IViewsService,
		options.assignmentService ?? new NullWorkbenchAssignmentService(),
		options.logService ?? new NullLogService(),
		options.layoutService ?? { mainContainer: document.body, onDidLayoutMainContainer: Event.None } as ILayoutService,
	);
}

suite('ChatPromoNotificationContribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function experimentFixture(options: {
		metadata?: Partial<ILanguageModelChatMetadata>;
		visible?: boolean;
		configured?: ChatClosedPromoNotification;
		dismissed?: boolean;
		seen?: boolean;
		treatment?: string;
		iconPresent?: boolean;
		iconVisible?: boolean;
	} = {}) {
		const anchor = dom.append(document.body, dom.$('div', { id: 'chat.statusBarEntry' }));
		anchor.textContent = 'Copilot';
		disposables.add(toDisposable(() => anchor.remove()));
		if (options.iconPresent === false) {
			anchor.remove();
		} else if (options.iconVisible === false) {
			anchor.style.display = 'none';
		}
		const layout = disposables.add(new Emitter<dom.IDimension>());
		const layoutService = { mainContainer: document.body, onDidLayoutMainContainer: layout.event } as ILayoutService;
		const models = [{
			identifier: 'copilot:model',
			metadata: { name: 'Model', id: 'model', promo: { id: 'promo', discountPercent: 20, message: 'Model promo' }, ...options.metadata },
		}];
		const languageModels = createMockLanguageModelsService(models, disposables);
		const notifications = createMockNotificationService(disposables);
		const storage = disposables.add(new InMemoryStorageService());
		if (options.dismissed) {
			storage.store('chat.dismissedPromoIds', '["promo"]', StorageScope.APPLICATION, 0);
		}
		if (options.seen) {
			storage.store('chat.seenPromoIds', '["promo"]', StorageScope.APPLICATION, 0);
		}
		const commands = createMockCommandService();
		const configuration = new TestConfigurationService(options.configured === undefined ? {} : {
			[ChatConfiguration.ChatClosedPromoNotification]: options.configured,
		});
		const assignments = new NullWorkbenchAssignmentService();
		const refetch = disposables.add(new Emitter<void>());
		sinon.stub(assignments, 'onDidRefetchAssignments').value(refetch.event);
		const getTreatment = sinon.stub(assignments, 'getTreatment').resolves(options.treatment);
		const views = createMockViewsService(disposables, options.visible);
		const log = new NullLogService();
		const warn = sinon.spy(log, 'warn');
		return {
			models, languageModels, notifications, storage, commands, configuration, getTreatment, refetch, views, warn, anchor, layout,
			start: () => disposables.add(createContribution(
				languageModels.service, notifications.service, storage, commands.service, undefined, views.service, undefined,
				{ configurationService: configuration, assignmentService: assignments, logService: log, layoutService },
			)),
		};
	}

	for (const configured of [ChatClosedPromoNotification.None, ChatClosedPromoNotification.CopilotIconPopup]) {
		test(`explicit ${configured} overrides ExP without querying it`, () => {
			const fixture = experimentFixture({ configured, treatment: configured === ChatClosedPromoNotification.None ? ChatClosedPromoNotification.CopilotIconPopup : ChatClosedPromoNotification.None });
			fixture.start();
			fixture.refetch.fire();
			assert.deepStrictEqual({
				queries: fixture.getTreatment.callCount,
				commands: fixture.commands.executed.map(command => command.id),
			}, {
				queries: 0,
				commands: configured === ChatClosedPromoNotification.CopilotIconPopup ? [ARM_CHAT_PROMO_COMMAND_ID] : [],
			});
		});
	}

	const ineligibleCases: { name: string; options: Parameters<typeof experimentFixture>[0] }[] = [
		{ name: 'missing promo', options: { metadata: { promo: undefined } } },
		{ name: 'quiet promo', options: { metadata: { promo: { id: 'promo', discountPercent: 20, message: 'Promo', showBanner: false } } } },
		{ name: 'message-only promo', options: { metadata: { promo: { id: 'promo', discountPercent: 0, message: 'Promo' } } } },
		{ name: 'other harness', options: { metadata: { targetChatSessionType: 'openai-codex' } } },
		{ name: 'other vendor', options: { metadata: { vendor: 'other' } } },
		{ name: 'expanded Chat', options: { visible: true } },
		{ name: 'dismissed promo', options: { dismissed: true } },
		{ name: 'already seen promo', options: { seen: true } },
		{ name: 'missing status icon', options: { iconPresent: false } },
		{ name: 'hidden status icon', options: { iconVisible: false } },
	];
	for (const { name, options } of ineligibleCases) {
		test(`does not query ExP for ${name}`, () => {
			const fixture = experimentFixture(options);
			fixture.start();
			fixture.refetch.fire();
			assert.strictEqual(fixture.getTreatment.callCount, 0);
		});
	}

	for (const treatment of [undefined, 'unexpected', ChatClosedPromoNotification.None, ChatClosedPromoNotification.CopilotIconPopup]) {
		test(`unconfigured eligible promo uses treatment ${treatment}`, async () => {
			const fixture = experimentFixture({ treatment });
			fixture.start();
			fixture.languageModels.onDidChangeLanguageModels.fire(undefined);
			await timeout(0);
			const popup = treatment === ChatClosedPromoNotification.CopilotIconPopup;
			assert.deepStrictEqual({
				queries: fixture.getTreatment.getCalls().map(call => call.args),
				commands: fixture.commands.executed.map(command => command.id),
				banner: !!fixture.notifications.getNotification(),
			}, {
				queries: [[CHAT_CLOSED_PROMO_TREATMENT]],
				commands: popup ? [ARM_CHAT_PROMO_COMMAND_ID] : [],
				banner: !popup,
			});
		});
	}

	test('the registered none default is not an explicit override', async () => {
		const fixture = experimentFixture({ treatment: ChatClosedPromoNotification.CopilotIconPopup });
		sinon.stub(fixture.configuration, 'inspect').returns({
			value: ChatClosedPromoNotification.None,
			defaultValue: ChatClosedPromoNotification.None,
		});
		fixture.start();
		await timeout(0);
		assert.deepStrictEqual({
			queries: fixture.getTreatment.callCount,
			commands: fixture.commands.executed.map(command => command.id),
		}, { queries: 1, commands: [ARM_CHAT_PROMO_COMMAND_ID] });
	});

	test('a refetched control assignment disarms an active treatment', async () => {
		const fixture = experimentFixture({ treatment: ChatClosedPromoNotification.CopilotIconPopup });
		fixture.start();
		await timeout(0);
		fixture.getTreatment.resolves(ChatClosedPromoNotification.None);
		fixture.refetch.fire();
		await timeout(0);
		assert.deepStrictEqual({
			queries: fixture.getTreatment.callCount,
			commands: fixture.commands.executed.map(command => command.id),
			banner: !!fixture.notifications.getNotification(),
		}, { queries: 2, commands: [ARM_CHAT_PROMO_COMMAND_ID, DISARM_CHAT_PROMO_COMMAND_ID], banner: true });
	});

	test('waits until Chat collapses before the first cohort query', async () => {
		const fixture = experimentFixture({ visible: true, treatment: ChatClosedPromoNotification.CopilotIconPopup });
		fixture.start();
		const beforeCollapse = fixture.getTreatment.callCount;
		fixture.views.setVisible(false);
		await timeout(0);
		assert.deepStrictEqual({
			beforeCollapse,
			queries: fixture.getTreatment.callCount,
			commands: fixture.commands.executed.map(command => command.id),
		}, { beforeCollapse: 0, queries: 1, commands: [ARM_CHAT_PROMO_COMMAND_ID] });
	});

	test('a promo met in an open Chat never returns as a pip', async () => {
		const fixture = experimentFixture({ visible: true, treatment: ChatClosedPromoNotification.CopilotIconPopup });
		fixture.start();
		fixture.notifications.getNotification()?.onDidShow?.();
		fixture.views.setVisible(false);
		await timeout(0);
		assert.deepStrictEqual({
			seen: fixture.storage.get('chat.seenPromoIds', StorageScope.APPLICATION),
			queries: fixture.getTreatment.callCount,
			commands: fixture.commands.executed.map(command => command.id),
		}, { seen: '["promo"]', queries: 0, commands: [] });
	});

	test('waits until the status icon is visible before the first cohort query', async () => {
		const fixture = experimentFixture({ iconVisible: false, treatment: ChatClosedPromoNotification.CopilotIconPopup });
		fixture.start();
		const beforeLayout = fixture.getTreatment.callCount;
		fixture.anchor.style.display = '';
		fixture.layout.fire({ width: 100, height: 100 });
		await timeout(0);
		assert.deepStrictEqual({
			beforeLayout,
			queries: fixture.getTreatment.callCount,
			commands: fixture.commands.executed.map(command => command.id),
		}, { beforeLayout: 0, queries: 1, commands: [ARM_CHAT_PROMO_COMMAND_ID] });
	});

	for (const change of ['expand', 'remove', 'dismiss', 'override', 'dispose', 'hideIcon']) {
		test(`does not show a stale treatment after ${change}`, async () => {
			const fixture = experimentFixture();
			const pending = new DeferredPromise<string>();
			fixture.getTreatment.returns(pending.p);
			const contribution = fixture.start();
			switch (change) {
				case 'expand':
					fixture.views.setVisible(true);
					break;
				case 'remove':
					fixture.models.length = 0;
					fixture.languageModels.onDidChangeLanguageModels.fire(undefined);
					break;
				case 'dismiss':
					fixture.notifications.dismiss();
					break;
				case 'override':
					await fixture.configuration.setUserConfiguration(ChatConfiguration.ChatClosedPromoNotification, ChatClosedPromoNotification.None);
					break;
				case 'dispose':
					contribution.dispose();
					break;
				case 'hideIcon':
					fixture.anchor.style.display = 'none';
					fixture.layout.fire({ width: 100, height: 100 });
					break;
			}
			await pending.complete(ChatClosedPromoNotification.CopilotIconPopup);
			await timeout(0);
			assert.deepStrictEqual({
				queries: fixture.getTreatment.callCount,
				commands: fixture.commands.executed,
			}, { queries: 1, commands: [] });
		});
	}

	test('ignores an older response after assignments are refetched', async () => {
		const fixture = experimentFixture();
		const old = new DeferredPromise<string>();
		fixture.getTreatment.onFirstCall().returns(old.p);
		fixture.getTreatment.onSecondCall().resolves(ChatClosedPromoNotification.None);
		fixture.start();
		fixture.refetch.fire();
		await timeout(0);
		await old.complete(ChatClosedPromoNotification.CopilotIconPopup);
		await timeout(0);
		assert.deepStrictEqual({
			queries: fixture.getTreatment.callCount,
			commands: fixture.commands.executed,
		}, { queries: 2, commands: [] });
	});

	test('logs a failed cohort query and leaves the banner in place', async () => {
		const fixture = experimentFixture();
		fixture.getTreatment.rejects(new Error('ExP unavailable'));
		fixture.start();
		await timeout(0);
		fixture.languageModels.onDidChangeLanguageModels.fire(undefined);
		assert.deepStrictEqual({
			queries: fixture.getTreatment.callCount,
			warnings: fixture.warn.callCount,
			banner: !!fixture.notifications.getNotification(),
			commands: fixture.commands.executed,
		}, { queries: 1, warnings: 1, banner: true, commands: [] });
	});

	test('shows the input banner for a discounted promo by default', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-1', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Get 20% off', showBanner: true } },
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
		assert.ok(notification);
		assertPromoAction(notification, 'copilot:gpt-5.5', 'Try GPT-5.5');
	});


	test('does not show the banner or popup when showBanner is false', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-1', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Get 20% off', showBanner: false } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
			commands.service,
			ChatClosedPromoNotification.CopilotIconPopup,
		));

		assert.strictEqual(notifService.getNotification(), undefined);
		assert.strictEqual(commands.executed.length, 0);
	});

	test('shows the popup when showBanner is missing', () => {
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
			ChatClosedPromoNotification.CopilotIconPopup,
		));

		assert.strictEqual(notifService.getNotification(), undefined, 'The closed-chat promo uses the card, not the banner');
		assert.strictEqual(commands.executed[0]?.id, ARM_CHAT_PROMO_COMMAND_ID);
	});

	test('shows the Copilot-icon popup for a discounted promo when the setting is popup', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-1', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Get 20% off', showBanner: true } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();

		const contribution = disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
			commands.service,
			ChatClosedPromoNotification.CopilotIconPopup,
		));
		assert.ok(contribution);

		assert.strictEqual(notifService.getNotification(), undefined, 'A promo must not render the chat-input banner');
		assert.strictEqual(commands.executed.length, 1);
		assert.strictEqual(commands.executed[0].id, ARM_CHAT_PROMO_COMMAND_ID);
		const payload = commands.executed[0].args[0] as IChatPromoCardInput;
		assert.deepStrictEqual(payload, {
			title: 'Get 20% off',
			subtitle: ILanguageModelChatMetadata.getPromoEndsAtLabel('2026-07-20T23:59:59Z')?.replace(/\.+$/, ''),
			promoId: 'promo-1',
			tryLabel: 'Try GPT-5.5',
			modelIdentifier: 'copilot:gpt-5.5',
			providerIcon: 'chat-model-provider-openai',
		});
	});

	test('renders the server message for a 0% promo', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:zero-discount',
			metadata: { name: 'Zero Discount', id: 'zero-discount', promo: { id: 'promo-zero', discountPercent: 0, endsAt: '2026-07-20T23:59:59Z', message: 'Featured model', showBanner: true } },
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
			{ identifier: 'copilot:featured', metadata: { name: 'Featured', id: 'featured', promo: { id: 'promo-zero', discountPercent: 0, message: 'Featured model', showBanner: true } } },
			{ identifier: 'copilot:discounted', metadata: { name: 'Discounted', id: 'discounted', promo: { id: 'promo-discount', discountPercent: 20, message: 'Get 20% off', showBanner: true } } },
		], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
			commands.service,
			ChatClosedPromoNotification.CopilotIconPopup,
		));

		assert.strictEqual(notifService.getNotification(), undefined, 'The preferred promo uses the card, not the banner');
		assert.strictEqual(commands.executed[0]?.id, ARM_CHAT_PROMO_COMMAND_ID);
		const payload = commands.executed[0].args[0] as IChatPromoCardInput;
		assert.strictEqual(payload.title, 'Get 20% off');
	});

	test('does not show notification for negative promo discounts', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:negative-discount',
			metadata: { name: 'Negative Discount', id: 'negative-discount', promo: { id: 'promo-negative', discountPercent: -10, endsAt: '2026-07-20T23:59:59Z', message: 'Featured model', showBanner: true } },
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
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-1', discountPercent: 0, message: 'Featured model', showBanner: true } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());

		disposables.add(createContribution(
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

	test('omits the end date when a 0% promo has none', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([
			{ identifier: 'local:no-end-date', metadata: { name: 'Open Ended', id: 'no-end-date', promo: { id: 'promo-open', discountPercent: 0, message: 'Featured model', showBanner: true } } },
			{ identifier: 'copilot:bad-end-date', metadata: { name: 'Bad Date', id: 'bad-end-date', targetChatSessionType: 'copilotcli', promo: { id: 'promo-bad-date', discountPercent: 0, endsAt: 'not a date', message: 'Featured model', showBanner: true } } },
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

	test('does not show a promo card for an already-dismissed promo', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-1', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Get 20% off', showBanner: true } },
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
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-2', discountPercent: 0, endsAt: '2026-08-01T00:00:00Z', message: 'Summer promo', showBanner: true } },
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
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-3', discountPercent: 0, endsAt: '2026-07-20T23:59:59Z', message: 'Promo', showBanner: true } },
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
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-4', discountPercent: 0, endsAt: '2026-07-20T23:59:59Z', message: 'Flash promo', showBanner: true } },
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

	test('shows one promo card when two discounted promos share a harness', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([
			{ identifier: 'copilot:gpt-5.5', metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-a', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'First promo', showBanner: true } } },
			{ identifier: 'copilot:claude', metadata: { name: 'Claude', id: 'claude', promo: { id: 'promo-b', discountPercent: 10, endsAt: '2026-08-01T00:00:00Z', message: 'Second promo', showBanner: true } } },
		], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
			commands.service,
			ChatClosedPromoNotification.CopilotIconPopup,
		));

		assert.strictEqual(notifService.getNotification(), undefined);
		assert.strictEqual(commands.executed.length, 1);
		const payload = commands.executed[0].args[0] as IChatPromoCardInput;
		assert.strictEqual(payload.title, 'First promo');
	});

	test('shows a scoped 0% promo per harness', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([
			{ identifier: 'local:gpt-5.5', metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-local', discountPercent: 0, endsAt: '2026-07-20T23:59:59Z', message: 'Local promo', showBanner: true } } },
			{ identifier: 'copilot:claude', metadata: { name: 'Claude', id: 'claude', targetChatSessionType: 'copilotcli', promo: { id: 'promo-copilot', discountPercent: 0, endsAt: '2026-07-20T23:59:59Z', message: 'Copilot promo', showBanner: true } } },
			{ identifier: 'codex:o4', metadata: { name: 'o4', id: 'o4', targetChatSessionType: 'openai-codex', promo: { id: 'promo-codex', discountPercent: 0, endsAt: '2026-07-20T23:59:59Z', message: 'Codex promo', showBanner: true } } },
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
			{ identifier: 'copilot:claude', metadata: { name: 'Claude', id: 'claude', targetChatSessionType: 'copilotcli', promo: { id: 'promo-copilot', discountPercent: 0, endsAt: '2026-07-20T23:59:59Z', message: 'Copilot promo', showBanner: true } } },
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

	test('opening the promo card persists its dismissal', async () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-promo', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Get 20% off', showBanner: true } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();
		disposables.add(createContribution(lmService, notifService.service, storageService, commands.service));

		await CommandsRegistry.getCommand(CHAT_PROMO_DISMISS_COMMAND_ID)?.handler(undefined!, 'promo-promo');
		const stored = JSON.parse(storageService.get('chat.dismissedPromoIds', StorageScope.APPLICATION) ?? '[]');
		assert.deepStrictEqual(stored, ['promo-promo']);
	});

	test('does not reopen the promo card when models refresh mid-session', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService, onDidChangeLanguageModels } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-1', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Get 20% off', showBanner: true } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
			commands.service,
			ChatClosedPromoNotification.CopilotIconPopup,
		));

		assert.deepStrictEqual(commands.executed.map(command => command.id), [ARM_CHAT_PROMO_COMMAND_ID]);
		onDidChangeLanguageModels.fire('copilot');
		assert.deepStrictEqual(commands.executed.map(command => command.id), [ARM_CHAT_PROMO_COMMAND_ID]);
	});

	test('updates an armed popup when the promoted model or message changes', () => {
		const models = [{
			identifier: 'copilot:first',
			metadata: { name: 'First', id: 'first', promo: { id: 'promo-first', discountPercent: 20, message: 'First promo' } },
		}];
		const notifications = createMockNotificationService(disposables);
		const { service, onDidChangeLanguageModels } = createMockLanguageModelsService(models, disposables);
		const storage = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();
		disposables.add(createContribution(service, notifications.service, storage, commands.service, ChatClosedPromoNotification.CopilotIconPopup));

		models[0] = {
			identifier: 'copilot:second',
			metadata: { name: 'Second', id: 'second', promo: { id: 'promo-second', discountPercent: 10, message: 'Second promo' } },
		};
		onDidChangeLanguageModels.fire('copilot');
		models[0].metadata.promo.message = 'Updated promo';
		onDidChangeLanguageModels.fire('copilot');
		onDidChangeLanguageModels.fire('copilot');

		assert.deepStrictEqual(commands.executed.map(command => {
			const payload = command.args[0] as IChatPromoCardInput;
			return { command: command.id, model: payload.modelIdentifier, promo: payload.promoId, title: payload.title };
		}), [
			{ command: ARM_CHAT_PROMO_COMMAND_ID, model: 'copilot:first', promo: 'promo-first', title: 'First promo' },
			{ command: ARM_CHAT_PROMO_COMMAND_ID, model: 'copilot:second', promo: 'promo-second', title: 'Second promo' },
			{ command: ARM_CHAT_PROMO_COMMAND_ID, model: 'copilot:second', promo: 'promo-second', title: 'Updated promo' },
		]);
	});

	test('does not rearm an opened promo after model refresh or chat visibility changes', async () => {
		const models = [{
			identifier: 'copilot:first',
			metadata: { name: 'First', id: 'first', promo: { id: 'promo-first', discountPercent: 20, message: 'First promo' } },
		}];
		const notifications = createMockNotificationService(disposables);
		const { service, onDidChangeLanguageModels } = createMockLanguageModelsService(models, disposables);
		const storage = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();
		const views = createMockViewsService(disposables);
		disposables.add(createContribution(service, notifications.service, storage, commands.service, ChatClosedPromoNotification.CopilotIconPopup, views.service));

		await CommandsRegistry.getCommand(CHAT_PROMO_DISMISS_COMMAND_ID)!.handler(undefined!, 'promo-first');
		onDidChangeLanguageModels.fire('copilot');
		views.setVisible(true);
		views.setVisible(false);
		assert.deepStrictEqual({
			commands: commands.executed.map(command => command.id),
			banner: notifications.getNotification(),
			dismissed: JSON.parse(storage.get('chat.dismissedPromoIds', StorageScope.APPLICATION) ?? '[]'),
		}, {
			commands: [ARM_CHAT_PROMO_COMMAND_ID],
			banner: undefined,
			dismissed: ['promo-first'],
		});
	});

	test('keeps a Codex promo on the input banner when the Copilot-icon popup is on', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'codex:o4',
			metadata: { name: 'o4', id: 'o4', targetChatSessionType: 'openai-codex', promo: { id: 'promo-codex', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Codex promo', showBanner: true } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
			commands.service,
			ChatClosedPromoNotification.CopilotIconPopup,
		));

		assert.deepStrictEqual({
			banner: notifService.getNotificationForSession('openai-codex')?.message,
			commands: commands.executed.map(command => command.id),
		}, {
			banner: 'Codex promo',
			commands: [],
		});
	});

	test('shows the input banner when the chat bar is expanded', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-1', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Get 20% off', showBanner: true } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();
		const views = createMockViewsService(disposables, true);

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
			commands.service,
			ChatClosedPromoNotification.CopilotIconPopup,
			views.service,
		));

		assert.deepStrictEqual({
			banner: notifService.getNotification()?.message,
			commands: commands.executed.map(command => command.id),
		}, {
			banner: 'Get 20% off',
			commands: [],
		});
	});

	test('hides the promo pip when the chat bar expands and restores it when the bar collapses', () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-1', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Get 20% off', showBanner: true } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();
		const views = createMockViewsService(disposables, false);

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
			commands.service,
			ChatClosedPromoNotification.CopilotIconPopup,
			views.service,
		));
		views.setVisible(true);
		views.setVisible(false);

		assert.deepStrictEqual(commands.executed.map(command => command.id), [
			ARM_CHAT_PROMO_COMMAND_ID,
			DISARM_CHAT_PROMO_COMMAND_ID,
			ARM_CHAT_PROMO_COMMAND_ID,
		]);
	});

	test('disarms the promo pip when the promo model leaves the list', () => {
		const models = [{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-4', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Get 20% off', showBanner: true } },
		}];
		const notifService = createMockNotificationService(disposables);
		const { service: lmService, onDidChangeLanguageModels } = createMockLanguageModelsService(models, disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
			commands.service,
			ChatClosedPromoNotification.CopilotIconPopup,
		));
		models.length = 0;
		onDidChangeLanguageModels.fire(undefined);

		assert.deepStrictEqual(commands.executed.map(command => command.id), [
			ARM_CHAT_PROMO_COMMAND_ID,
			DISARM_CHAT_PROMO_COMMAND_ID,
		]);
	});

	test('try-model switches the Copilot harness then the promo model', async () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-1', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Get 20% off', showBanner: true } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();
		const widget = createMockWidgetService({ sessionScheme: 'openai-codex' });

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
			commands.service,
			ChatClosedPromoNotification.CopilotIconPopup,
			undefined,
			widget.service,
		));

		await CommandsRegistry.getCommand(CHAT_PROMO_TRY_MODEL_COMMAND_ID)?.handler(undefined!, 'copilot:gpt-5.5');

		assert.deepStrictEqual({
			commands: commands.executed.map(command => ({ id: command.id, args: command.args })),
			switched: widget.switched,
		}, {
			commands: [
				{ id: ARM_CHAT_PROMO_COMMAND_ID, args: [commands.executed[0].args[0]] },
				{ id: CHAT_OPEN_ACTION_ID, args: [] },
				{ id: 'workbench.action.chat.openNewChatSessionInPlace.local', args: ['sidebar'] },
			],
			switched: ['copilot:gpt-5.5'],
		});
	});

	test('try-model waits for a cold Chat to resolve its harness before switching', async () => {
		const notifService = createMockNotificationService(disposables);
		const { service: lmService } = createMockLanguageModelsService([{
			identifier: 'copilot:gpt-5.5',
			metadata: { name: 'GPT-5.5', id: 'gpt-5.5', promo: { id: 'promo-1', discountPercent: 20, endsAt: '2026-07-20T23:59:59Z', message: 'Get 20% off', showBanner: true } },
		}], disposables);
		const storageService = disposables.add(new InMemoryStorageService());
		const commands = createMockCommandService();
		const widget = createMockWidgetService();

		disposables.add(createContribution(
			lmService,
			notifService.service,
			storageService,
			commands.service,
			ChatClosedPromoNotification.CopilotIconPopup,
			undefined,
			widget.service,
		));

		const done = CommandsRegistry.getCommand(CHAT_PROMO_TRY_MODEL_COMMAND_ID)?.handler(undefined!, 'copilot:gpt-5.5');
		setTimeout(() => widget.resolveSession('openai-codex'), 0);
		await done;

		assert.deepStrictEqual({
			commands: commands.executed.map(command => command.id),
			switched: widget.switched,
		}, {
			commands: [ARM_CHAT_PROMO_COMMAND_ID, CHAT_OPEN_ACTION_ID, 'workbench.action.chat.openNewChatSessionInPlace.local'],
			switched: ['copilot:gpt-5.5'],
		});
	});

	test('the promo card shows the model vendor icon', async () => {
		const container = dom.append(document.body, dom.$('.monaco-workbench'));
		disposables.add(toDisposable(() => container.remove()));
		const statusbar = dom.append(container, dom.$('.part.statusbar'));
		const entry = dom.append(statusbar, dom.$('div', { id: 'chat.statusBarEntry' }));
		dom.append(entry, dom.$('.codicon.codicon-copilot'));
		const instantiation = disposables.add(new TestInstantiationService());
		instantiation.stub(ILayoutService, { mainContainer: container });
		instantiation.stub(ICommandService, createMockCommandService().service);
		let card: HTMLElement | undefined;
		instantiation.stub(IHoverService, {
			hideHover() { },
			showInstantHover(options) {
				card = options.content as HTMLElement;
				return undefined;
			}
		});
		instantiation.stub(ITelemetryService, NullTelemetryService);
		disposables.add(instantiation.createInstance(ChatPromoWidgetContribution));
		const payload: IChatPromoCardInput = {
			title: 'Model promo', promoId: 'promo', tryLabel: 'Try Claude', modelIdentifier: 'copilot:claude',
			providerIcon: 'chat-model-provider-claude',
		};
		await CommandsRegistry.getCommand(ARM_CHAT_PROMO_COMMAND_ID)!.handler(undefined!, payload);
		entry.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		assert.strictEqual(card?.querySelector('.provider-icon')?.className, 'codicon codicon-chat-model-provider-claude provider-icon');
	});

	test('popup pip follows a replaced status entry and restores its icon on disposal', async () => {
		const container = dom.append(document.body, dom.$('.monaco-workbench'));
		disposables.add(toDisposable(() => container.remove()));
		const statusbar = dom.append(container, dom.$('.part.statusbar'));
		const entry = dom.append(statusbar, dom.$('div', { id: 'chat.statusBarEntry' }));
		dom.append(entry, dom.$('.codicon.codicon-copilot'));
		const instantiation = disposables.add(new TestInstantiationService());
		instantiation.stub(ILayoutService, { mainContainer: container });
		instantiation.stub(ICommandService, createMockCommandService().service);
		instantiation.stub(IHoverService, { hideHover() { } });
		instantiation.stub(ITelemetryService, NullTelemetryService);
		const widget = disposables.add(instantiation.createInstance(ChatPromoWidgetContribution));
		const payload: IChatPromoCardInput = {
			title: 'Model promo', promoId: 'promo', tryLabel: 'Try Model', modelIdentifier: 'copilot:model',
		};
		await CommandsRegistry.getCommand(ARM_CHAT_PROMO_COMMAND_ID)!.handler(undefined!, payload);
		const initiallyArmed = !!entry.querySelector('.codicon-copilot-dot');

		const replacement = dom.$('div', { id: 'chat.statusBarEntry' });
		const replacementIcon = dom.append(replacement, dom.$('.codicon.codicon-copilot-warning'));
		entry.replaceWith(replacement);
		await timeout(0);
		const replacementArmed = replacementIcon.classList.contains('codicon-copilot-dot');
		widget.dispose();

		assert.deepStrictEqual({
			initiallyArmed,
			replacementArmed,
			restored: replacementIcon.className,
		}, {
			initiallyArmed: true,
			replacementArmed: true,
			restored: 'codicon codicon-copilot-warning',
		});
	});
});
