/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestAccessibilityService } from '../../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { LocalModelEnabledSettingId, type ILocalModelActiveV1, type ILocalModelFamilyV1, type ILocalModelStatusV1 } from '../../../../../../platform/agentHost/common/localModel.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { InMemoryStorageService, StorageScope } from '../../../../../../platform/storage/common/storage.js';
import { LocalModelService } from '../../../../../services/agentHost/browser/localModelService.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { getLocalModelReadyOfferFlavor, LOCAL_MODEL_READY_OFFER_ACKNOWLEDGED_KEY, LocalModelReadyNotificationContribution, resolveLocalModelReadyOfferBody } from '../../../browser/agentSessions/agentHost/localModelReadyNotification.js';
import { LocalModelSetupProgress } from '../../../browser/agentSessions/agentHost/localModelSetupProgress.js';
import { ChatInputNotificationActionKind, IChatInputNotificationAction, IChatInputNotificationContext, IChatInputNotificationService, isChatInputNotificationApplicableToSession } from '../../../browser/widget/input/chatInputNotificationService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';
import { createChatInputNotificationService, createStatus, installedFamily, otherFamily, RecordingChatInputNotificationService, RecordingCommandService, RecordingTelemetryService, TestLocalModelConnection } from './localModelTestUtils.js';

const VENDOR = 'agent-host-copilotcli';

function model(id: string, vendor = VENDOR): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: `${vendor}:${id}`,
		metadata: { id, name: id, vendor, version: '1.0', family: id, maxInputTokens: 1000, maxOutputTokens: 1000, isDefaultForLocation: {} } as ILanguageModelChatMetadata,
	};
}

const autoModel = model('auto');
const serverModel = model('gpt-5.5');
const localRow = model(installedFamily.install!.modelId);
const otherVendorLocalRow = model(installedFamily.install!.modelId, 'agent-host-claude');

const readyActive: ILocalModelActiveV1 = { familyId: installedFamily.familyId, contentId: 'c1', servingGeneration: 1, server: 'ready', autoEligible: true };

/** Actions as `label (kind[, primary])`, plus which models each switch action selects. */
function describeActions(actions: readonly IChatInputNotificationAction[]): string[] {
	const candidates = [autoModel, serverModel, localRow, otherVendorLocalRow];
	return actions.map(action => {
		const target = action.kind === ChatInputNotificationActionKind.SwitchToModel
			? ` -> ${candidates.filter(action.matchesModel).map(candidate => candidate.identifier).join('|')}${action.requireUniqueModel ? ' (unique)' : ''}`
			: action.kind === ChatInputNotificationActionKind.Command ? ` -> ${action.commandId}` : '';
		return `${action.label}${action.primary ? ' [primary]' : ''}${target}`;
	});
}

function body(status: ILocalModelStatusV1, family: ILocalModelFamilyV1, currentModel: ILanguageModelChatMetadataAndIdentifier | undefined) {
	const flavor = getLocalModelReadyOfferFlavor(status, family, false);
	const resolved = flavor ? resolveLocalModelReadyOfferBody({ status, family, flavor, currentModel }) : undefined;
	return resolved && { flavor, description: resolved.description, actions: describeActions(resolved.actions) };
}

function context(currentModel: ILanguageModelChatMetadataAndIdentifier | undefined): IChatInputNotificationContext {
	return {
		sessionType: VENDOR,
		sessionResource: undefined,
		deferredNotificationsEnabled: true,
		isTransientChat: false,
		sessionStarted: true,
		modelState: { currentModel, models: [autoModel, serverModel, localRow] },
	};
}

suite('LocalModelReadyNotification', () => {
	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('resolveBody', () => {
		test('Auto, auto-capable and passing the Auto gate: New Auto Chat', () => {
			assert.deepStrictEqual(body(createStatus([installedFamily], { active: readyActive }), installedFamily, autoModel), {
				flavor: 'ready',
				description: 'Auto can now run some requests on this device, with cloud fallback. New Auto chats will use it.',
				actions: [
					`Switch to Example Flash 1.0 -> ${VENDOR}:MAI-Code-1.1-Flash (unique)`,
					'Not Now -> _workbench.action.chat.localModel.readyOfferNotNow',
					'New Auto Chat [primary] -> workbench.action.chat.localModel.newAutoChat',
				],
			});
		});

		test('a specific server model: Switch to the model, or Use Auto', () => {
			assert.deepStrictEqual(body(createStatus([installedFamily], { active: readyActive }), installedFamily, serverModel), {
				flavor: 'ready',
				description: 'Run this chat on your device, or let Auto choose between local and cloud.',
				actions: [
					`Use Auto -> ${VENDOR}:auto (unique)`,
					'Not Now -> _workbench.action.chat.localModel.readyOfferNotNow',
					`Switch to Example Flash 1.0 [primary] -> ${VENDOR}:MAI-Code-1.1-Flash (unique)`,
				],
			});
		});

		test('too slow for Auto, or not auto-capable: select it directly', () => {
			const tooSlow = body(createStatus([installedFamily], { active: { ...readyActive, autoEligible: false } }), installedFamily, autoModel);
			const directOnly = body(createStatus([{ ...installedFamily, autoCapable: false }], { active: readyActive }), { ...installedFamily, autoCapable: false }, serverModel);
			assert.deepStrictEqual({ tooSlow, directOnly }, {
				tooSlow: {
					flavor: 'ready',
					description: 'It\'s too slow on this device for Auto, but you can select it directly.',
					actions: ['Not Now -> _workbench.action.chat.localModel.readyOfferNotNow', `Switch to Example Flash 1.0 [primary] -> ${VENDOR}:MAI-Code-1.1-Flash (unique)`],
				},
				directOnly: {
					flavor: 'ready',
					description: 'Select it directly to run on your device.',
					actions: ['Not Now -> _workbench.action.chat.localModel.readyOfferNotNow', `Switch to Example Flash 1.0 [primary] -> ${VENDOR}:MAI-Code-1.1-Flash (unique)`],
				},
			});
		});

		test('a second install while another model is active: Load through the confirmed swap', () => {
			const status = createStatus([installedFamily, otherFamily], { active: { ...readyActive, familyId: otherFamily.familyId, contentId: 'q1' } });
			assert.deepStrictEqual(body(status, installedFamily, serverModel), {
				flavor: 'secondInstall',
				description: 'Loading it unloads Example Coder.',
				actions: ['Not Now -> _workbench.action.chat.localModel.readyOfferNotNow', 'Load Example Flash 1.0 [primary] -> _workbench.action.chat.localModel.readyOfferLoad'],
			});
		});

		test('no offer while loading, during an operation, or without a ready offer id', () => {
			assert.deepStrictEqual([
				body(createStatus([installedFamily], { active: { ...readyActive, server: 'starting' } }), installedFamily, autoModel),
				body(createStatus([{ ...installedFamily, operation: { id: 'op', kind: 'update', state: 'running', resumeOnStartup: true } }], { active: readyActive }), { ...installedFamily, operation: { id: 'op', kind: 'update', state: 'running', resumeOnStartup: true } }, autoModel),
				body(createStatus([{ ...installedFamily, readyOfferId: undefined }], { active: readyActive }), { ...installedFamily, readyOfferId: undefined }, autoModel),
			], [undefined, undefined, undefined]);
		});
	});

	suite('contribution', () => {
		function setup<T extends IChatInputNotificationService>(storage: InMemoryStorageService, connection: TestLocalModelConnection, chatInputNotifications: T, widgets: readonly IChatWidget[] = []) {
			const service = disposables.add(new LocalModelService(connection, new TestConfigurationService(), new NullLogService()));
			const telemetry = new RecordingTelemetryService();
			const contextKeyService = new MockContextKeyService();
			contextKeyService.createKey(ChatContextKeys.enabled.key, true);
			const chatWidgetService = new class extends mock<IChatWidgetService>() {
				override readonly lastFocusedWidget = undefined;
				override readonly onDidAddWidget = Event.None;
				override readonly onDidRemoveWidget = Event.None;
				override getAllWidgets(): readonly IChatWidget[] { return widgets; }
			};
			const contribution = disposables.add(new LocalModelReadyNotificationContribution(
				connection,
				service,
				chatInputNotifications,
				chatWidgetService,
				storage,
				telemetry,
				new TestConfigurationService({ [LocalModelEnabledSettingId]: true }),
				contextKeyService,
			));
			return { contribution, service, chatInputNotifications, telemetry, contextKeyService };
		}

		function createConnection(status: ILocalModelStatusV1) {
			const connection = new TestLocalModelConnection();
			disposables.add({ dispose: () => connection.dispose() });
			connection.setStatus(status);
			return connection;
		}

		test('offered once per ready offer id: shown recorded on render, acknowledged across windows, offered again after an update', () => {
			const storage = disposables.add(new InMemoryStorageService());
			const connection = createConnection(createStatus([installedFamily], { active: readyActive }));
			const firstWindow = setup(storage, connection, new RecordingChatInputNotificationService());
			const id = `localModel.ready.${installedFamily.readyOfferId}`;
			const offer = firstWindow.chatInputNotifications.notifications.get(id)!;
			offer.onDidShow!(context(autoModel));
			offer.onDidShow!(context(autoModel));
			const shown = firstWindow.telemetry.events.map(event => event.data);

			// Another window renders the same offer, then the user selects Not Now in the first window.
			const secondWindow = setup(storage, connection, new RecordingChatInputNotificationService());
			const inSecondBeforeAck = secondWindow.chatInputNotifications.notifications.has(id);
			firstWindow.chatInputNotifications.dismissNotification(id);
			const afterAck = {
				first: firstWindow.chatInputNotifications.notifications.has(id),
				second: secondWindow.chatInputNotifications.notifications.has(id),
				acknowledged: storage.get(LOCAL_MODEL_READY_OFFER_ACKNOWLEDGED_KEY, StorageScope.APPLICATION),
			};
			// A later window (or reload) doesn't offer it again.
			const reloaded = setup(storage, connection, new RecordingChatInputNotificationService());

			// An update reaches ready: a new ready offer id.
			connection.setStatus(createStatus([{ ...installedFamily, install: { ...installedFamily.install!, contentId: 'c2' }, readyOfferId: `${installedFamily.familyId}:c2` }], { active: { ...readyActive, contentId: 'c2' } }));

			assert.deepStrictEqual({
				message: offer.message,
				sessionTypes: offer.sessionTypes,
				group: offer.group,
				dismissible: offer.dismissible,
				shown,
				inSecondBeforeAck,
				afterAck,
				reloaded: [...reloaded.chatInputNotifications.notifications.keys()],
			}, {
				message: 'Example Flash 1.0 is ready on this device.',
				sessionTypes: [VENDOR],
				group: { id: 'localModel', priority: 0 },
				dismissible: true,
				shown: [{ step: 'readyOfferShown', entryPath: undefined, action: undefined, currentModelKind: 'auto' }],
				inSecondBeforeAck: true,
				afterAck: { first: false, second: false, acknowledged: `["${installedFamily.readyOfferId}"]` },
				reloaded: [`localModel.ready.${installedFamily.familyId}:c2`],
			});
		});

		test('selecting the model directly acknowledges the ready offer, as do Auto once Auto may use it and loading a second install', () => {
			const selected = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('selected', serverModel);
			const onDidSelect = disposables.add(new Emitter<{ readonly fromModelId: string; readonly toModelId: string }>());
			const widget = new class extends mock<IChatWidget>() {
				override readonly input = new class extends mock<IChatWidget['input']>() {
					override get selectedLanguageModel() { return selected; }
					override get onDidChangeUserSelectedModel() { return onDidSelect.event; }
				}();
			};
			type Step = { readonly select?: ILanguageModelChatMetadataAndIdentifier; readonly status?: ILocalModelStatusV1 };
			function run(status: ILocalModelStatusV1, steps: readonly Step[]) {
				const storage = disposables.add(new InMemoryStorageService());
				const connection = createConnection(status);
				const { chatInputNotifications } = setup(storage, connection, new RecordingChatInputNotificationService(), [widget]);
				const offers = () => [...chatInputNotifications.notifications.keys()];
				const shownOnRow = chatInputNotifications.notifications.get(`localModel.ready.${installedFamily.readyOfferId}`)?.when?.(context(localRow));
				const results = [offers()];
				for (const step of steps) {
					if (step.status) {
						connection.setStatus(step.status);
					}
					if (step.select) {
						const from = selected.get()!;
						selected.set(step.select, undefined);
						onDidSelect.fire({ fromModelId: from.identifier, toModelId: step.select.identifier });
					}
					results.push(offers());
				}
				return { results, shownOnRow };
			}

			const ready = `localModel.ready.${installedFamily.readyOfferId}`;
			const second = `localModel.ready.${otherFamily.readyOfferId}`;
			const otherActive = { ...readyActive, familyId: otherFamily.familyId, contentId: 'q1' };
			const direct = run(createStatus([installedFamily, otherFamily], { active: readyActive }), [
				{ select: serverModel },
				{ select: localRow },
				{ status: createStatus([installedFamily, otherFamily], { active: otherActive }) },
			]);
			const auto = run(createStatus([installedFamily], { active: readyActive, useInAuto: false }), [
				{ select: autoModel },
				{ status: createStatus([installedFamily], { active: readyActive }) },
				{ select: serverModel },
				{ select: autoModel },
			]);

			assert.deepStrictEqual({ direct, auto }, {
				direct: { results: [[ready, second], [ready, second], [second], []], shownOnRow: false },
				auto: { results: [[ready], [ready], [ready], [ready], []], shownOnRow: false },
			});
		});

		test('ready while another model sets up: the offer waits for the on-device status notice, then shows in the chat input', () => {
			const storage = disposables.add(new InMemoryStorageService());
			const updating: ILocalModelFamilyV1 = { ...otherFamily, readyOfferId: undefined, operation: { id: 'op-2', kind: 'update', state: 'running', resumeOnStartup: true } };
			const connection = createConnection(createStatus([installedFamily, updating], { active: readyActive }));
			const chatInputNotifications = disposables.add(createChatInputNotificationService());
			const lifecycle = new class extends mock<ILifecycleService>() { override readonly willShutdown = false; };
			const progressService = disposables.add(new LocalModelService(connection, new TestConfigurationService(), new NullLogService()));
			const contextKeyService = new MockContextKeyService();
			contextKeyService.createKey(ChatContextKeys.enabled.key, true);
			disposables.add(new LocalModelSetupProgress(connection, progressService, chatInputNotifications, new RecordingCommandService(), new TestAccessibilityService(), lifecycle, new TestConfigurationService({ [LocalModelEnabledSettingId]: true }), contextKeyService, new class extends mock<IOpenerService>() { }()));
			// Published after the status notice, so without its group the offer would win the tie.
			setup(storage, connection, chatInputNotifications);
			const active = () => chatInputNotifications.getActiveNotification(notification => isChatInputNotificationApplicableToSession(notification, VENDOR, undefined))?.message;
			const whileUpdating = active();
			connection.setStatus(createStatus([installedFamily, { ...updating, operation: undefined }], { active: readyActive }));

			assert.deepStrictEqual({ whileUpdating, afterwards: active() }, {
				whileUpdating: 'Updating Example Coder\u2026',
				afterwards: 'Example Flash 1.0 is ready on this device.',
			});
		});
	});
});
