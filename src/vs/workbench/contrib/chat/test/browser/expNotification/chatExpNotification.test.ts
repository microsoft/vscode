/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatAIDisabledSettingId } from '../../../../../../platform/chat/common/chatSettings.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IAssignmentFilter, IWorkbenchAssignmentService } from '../../../../../services/assignment/common/assignmentService.js';
import { CHAT_EXP_NOTIFICATION_VERSION, IChatExpNotificationMatchContext, matchesChatExpNotification, parseChatExpNotifications } from '../../../browser/expNotification/chatExpNotificationConfig.js';
import { ChatExpNotificationContribution } from '../../../browser/expNotification/chatExpNotificationContribution.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationContext, IChatInputNotificationService } from '../../../browser/widget/input/chatInputNotificationService.js';
import { getChatSessionType, LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';

suite('ChatExpNotification', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const validNotification = {
		id: 'auto-tier-nudge',
		title: 'Auto now picks stronger models',
		description: 'Auto routes each request to the best available model.',
		match: { sessionTypes: ['copilotcli'], selectedModels: ['gpt-4o'] },
		actions: [
			{ id: 'learn', kind: 'command', label: 'Learn More', commandId: 'vscode.open', args: ['https://aka.ms/x'] },
			{ id: 'switch', kind: 'switchToModel', label: 'Switch to Auto', model: 'auto', config: { thinkingLevel: 'high' } },
		],
	};

	function payload(...notifications: unknown[]): string {
		return JSON.stringify({ version: CHAT_EXP_NOTIFICATION_VERSION, notifications });
	}

	function parseOne(notification: unknown): ReturnType<typeof parseChatExpNotifications> {
		return parseChatExpNotifications(payload(notification));
	}

	suite('config', () => {

		test('builds a runtime notification from a well formed payload', () => {
			const parsed = parseOne(validNotification).notifications?.[0];

			assert.deepStrictEqual({
				...parsed,
				signature: undefined,
				actions: parsed?.actions.map(action => ({ ...action, matchesModel: undefined })),
			}, {
				id: 'auto-tier-nudge',
				telemetryId: 'auto-tier-nudge',
				severity: ChatInputNotificationSeverity.Info,
				message: 'Auto now picks stronger models',
				description: 'Auto routes each request to the best available model.',
				match: { sessionTypes: ['copilotcli'], selectedModels: ['gpt-4o'], excludeSelectedModels: [] },
				signature: undefined,
				actions: [
					{ kind: ChatInputNotificationActionKind.Command, label: 'Learn More', telemetryActionId: 'learn', commandId: 'vscode.open', commandArgs: ['https://aka.ms/x'], matchesModel: undefined },
					{ kind: ChatInputNotificationActionKind.SwitchToModel, label: 'Switch to Auto', telemetryActionId: 'switch', config: { thinkingLevel: 'high' }, requireUniqueModel: true, matchesModel: undefined },
				],
				dismissible: true,
				autoDismissOnMessage: false,
			});
		});

		test('normalizes a switch target the same way a match selector is normalized', () => {
			const model: ILanguageModelChatMetadataAndIdentifier = {
				identifier: 'copilot/claude-sonnet-4.5',
				metadata: { id: 'claude-sonnet-4.5', family: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', vendor: 'copilot' } as ILanguageModelChatMetadata,
			};
			const parsed = parseOne({
				...validNotification,
				match: { selectedModels: ['Claude Sonnet 4.5'] },
				actions: [{ id: 'switch', kind: 'switchToModel', label: 'Switch', model: '  Claude Sonnet 4.5 ' }],
			}).notifications?.[0];
			const action = parsed?.actions[0];

			assert.deepStrictEqual({
				selector: parsed?.match.selectedModels,
				switchMatches: action?.kind === ChatInputNotificationActionKind.SwitchToModel && action.matchesModel(model),
			}, {
				selector: ['claude-sonnet-4.5'],
				switchMatches: true,
			});
		});

		test('rejects malformed payloads whole', () => {
			assert.deepStrictEqual([
				parseChatExpNotifications(undefined).error,
				parseChatExpNotifications('not json').error?.replace(/:.*/, ''),
				parseChatExpNotifications(JSON.stringify({ version: 99, notifications: [validNotification] })).error,
				parseChatExpNotifications(JSON.stringify({ version: CHAT_EXP_NOTIFICATION_VERSION, notifications: 'nope' })).error,
				parseOne({ ...validNotification, id: 'Has Spaces' }).error,
				parseOne({ ...validNotification, title: undefined }).error,
				parseOne({ ...validNotification, match: {} }).error,
				parseOne({ ...validNotification, severity: 'critical' }).error,
				parseOne({ ...validNotification, severity: 'constructor' }).error,
				parseOne({ ...validNotification, actions: [{ id: 'a', kind: 'explode', label: 'Go' }] }).error,
				parseOne({ ...validNotification, actions: [{ id: 'a', kind: 'command', label: 'Go' }] }).error,
				parseOne({ ...validNotification, actions: [{ id: 'a', kind: 'switchToModel', label: 'Go' }] }).error,
				parseOne({ ...validNotification, dismissible: 'no' }).error,
				parseChatExpNotifications(payload(validNotification, validNotification)).error,
			], [
				'empty payload',
				'payload is not valid JSON',
				'unsupported version 99, expected 1',
				'notifications must be an array',
				'notifications[0].id is missing or malformed',
				'notifications[0].title is missing or too long',
				'notifications[0].match must narrow at least one dimension',
				'notifications[0].severity must be "info", "warning" or "error"',
				'notifications[0].severity must be "info", "warning" or "error"',
				'notifications[0].actions[0].kind must be "command", "openModelPicker" or "switchToModel"',
				'notifications[0].actions[0].commandId is missing',
				'notifications[0].actions[0].model is missing',
				'notifications[0].dismissible and notifications[0].autoDismissOnMessage must be booleans',
				'notifications[1].id "auto-tier-nudge" is duplicated',
			]);
		});

		suite('matching', () => {

			const context = (overrides: Partial<IChatExpNotificationMatchContext> = {}): IChatExpNotificationMatchContext => ({
				sessionType: 'agent-host-copilotcli',
				harness: 'copilotcli',
				selectedModelId: 'agent-host-copilotcli:claude-sonnet-4.5',
				selectedModelAliases: ['claude-sonnet-4.5', 'claude-sonnet-4.5', 'Claude Sonnet 4.5', 'agent-host-copilotcli'],
				...overrides,
			});

			function matches(match: { sessionTypes?: string[]; selectedModels?: string[]; excludeSelectedModels?: string[] }, overrides?: Partial<IChatExpNotificationMatchContext>): boolean {
				const parsed = parseOne({ ...validNotification, actions: [], match }).notifications?.[0];
				assert.ok(parsed);
				return matchesChatExpNotification(parsed.match, context(overrides));
			}

			test('a session selector matches either the session type or its harness', () => {
				assert.deepStrictEqual([
					matches({ sessionTypes: ['copilotcli'] }),
					matches({ sessionTypes: ['agent-host-copilotcli'] }),
					matches({ sessionTypes: ['copilotcli'] }, { sessionType: 'remote-foo-copilotcli' }),
					matches({ sessionTypes: ['agent-host-copilotcli'] }, { sessionType: 'remote-foo-copilotcli' }),
					matches({ sessionTypes: ['local'] }),
					matches({ sessionTypes: ['local'] }, { sessionType: 'local', harness: undefined }),
				], [true, true, true, false, false, true]);
			});

			test('"local" selects the session type real in-editor chat resources produce', () => {
				// Pins the authored selector against the resource schemes chat actually uses, so
				// `local` cannot silently stop selecting normal chat.
				const sessionTypeOf = (resource: URI) => getChatSessionType(resource);
				assert.deepStrictEqual([
					sessionTypeOf(URI.from({ scheme: Schemas.vscodeChatEditor, authority: 'x', path: '/untitled-1' })),
					sessionTypeOf(LocalChatSessionUri.forSession('untitled-1')),
					matches({ sessionTypes: ['local'] }, { sessionType: sessionTypeOf(LocalChatSessionUri.forSession('untitled-1')), harness: undefined }),
					// Before any session exists there is nothing to match against.
					matches({ sessionTypes: ['local'] }, { sessionType: undefined, harness: undefined }),
				], ['local', 'local', true, false]);
			});

			test('an excluded model suppresses the notification', () => {
				assert.deepStrictEqual([
					matches({ sessionTypes: ['copilotcli'], excludeSelectedModels: ['auto'] }),
					matches({ sessionTypes: ['copilotcli'], excludeSelectedModels: ['claude-sonnet-4.5'] }),
					matches({ sessionTypes: ['copilotcli'], excludeSelectedModels: ['Claude Sonnet 4.5'] }),
					matches({ excludeSelectedModels: ['auto'] }, { selectedModelId: undefined, selectedModelAliases: undefined }),
				], [true, false, false, true]);
			});

			test('a model selector matches across identifier shapes, and every dimension must match', () => {
				assert.deepStrictEqual([
					matches({ selectedModels: ['claude-sonnet-4.5'] }),
					matches({ selectedModels: ['Claude Sonnet 4.5'] }),
					matches({ selectedModels: ['claude-sonnet-4.5'] }, { selectedModelId: 'copilot/claude-sonnet-4.5', selectedModelAliases: undefined }),
					matches({ selectedModels: ['gpt-4o'] }),
					matches({ sessionTypes: ['copilotcli'], selectedModels: ['gpt-4o'] }),
				], [true, true, true, false, false]);
			});
		});
	});

	suite('contribution', () => {

		function createContribution(treatments: (string | undefined)[]) {
			const store = disposables.add(new DisposableStore());
			const onDidRefetchAssignments = store.add(new Emitter<void>());
			const onDidDismiss = store.add(new Emitter<string>());
			const notifications = new Map<string, IChatInputNotification>();
			const setCalls: string[] = [];
			const configurationService = new TestConfigurationService();
			const onDidChangeSentiment = store.add(new Emitter<void>());
			const entitlementSentiment = { hidden: false };

			const notificationService: IChatInputNotificationService = {
				_serviceBrand: undefined,
				onDidChange: Event.None,
				onDidDismiss: onDidDismiss.event,
				setNotification(notification) { setCalls.push(notification.id); notifications.set(notification.id, notification); },
				deleteNotification(id) { notifications.delete(id); },
				dismissNotification(id) { onDidDismiss.fire(id); },
				getActiveNotification() { return undefined; },
				refresh() { },
				handleMessageSent() { },
				announceRendered() { },
			};

			store.add(new ChatExpNotificationContribution(
				{
					_serviceBrand: undefined,
					onDidRefetchAssignments: onDidRefetchAssignments.event,
					getCurrentExperiments: async () => [],
					addTelemetryAssignmentFilter(_filter: IAssignmentFilter): void { },
					getTreatment: async <T extends string | number | boolean>() => (treatments.length > 1 ? treatments.shift() : treatments[0]) as T,
				} satisfies IWorkbenchAssignmentService,
				notificationService,
				{ getChatSessionContribution: (type: string) => type === 'agent-host-copilotcli' ? { agentHostProviderId: 'copilotcli' } : undefined } as IChatSessionsService,
				configurationService,
				{ sentiment: entitlementSentiment, onDidChangeSentiment: onDidChangeSentiment.event } as IChatEntitlementService,
				store.add(new InMemoryStorageService()),
				new NullLogService(),
			));

			const settled = () => new Promise<void>(resolve => setTimeout(resolve, 0));
			return {
				notifications, setCalls, configurationService, notificationService, settled, entitlementSentiment,
				refetch: () => { onDidRefetchAssignments.fire(); return settled(); },
				ids: () => [...notifications.keys()],
			};
		}

		function context(overrides: Partial<IChatInputNotificationContext> = {}): IChatInputNotificationContext {
			return {
				sessionType: 'agent-host-copilotcli',
				sessionResource: undefined,
				deferredNotificationsEnabled: true,
				isTransientChat: false,
				sessionStarted: false,
				modelState: { currentModel: undefined, models: [] },
				...overrides,
			};
		}

		test('registers a namespaced notification bound to the payload targeting', async () => {
			const test = createContribution([payload({ ...validNotification, match: { sessionTypes: ['copilotcli'] } })]);
			await test.settled();
			const registered = test.notifications.get('chat.expNotification.auto-tier-nudge');

			assert.deepStrictEqual({
				ids: test.ids(),
				telemetryId: registered?.telemetryId,
				message: registered?.message,
				matchingSession: registered?.when?.(context()),
				otherSession: registered?.when?.(context({ sessionType: 'local' })),
			}, {
				ids: ['chat.expNotification.auto-tier-nudge'],
				telemetryId: 'auto-tier-nudge',
				message: 'Auto now picks stronger models',
				matchingSession: true,
				otherSession: false,
			});
		});

		test('ignores an invalid payload rather than throwing', async () => {
			const test = createContribution(['{ not json']);
			await test.settled();

			assert.deepStrictEqual(test.ids(), []);
		});

		test('a dismissal survives a refetch, and an unchanged payload is never re-set', async () => {
			const test = createContribution([payload(validNotification)]);
			await test.settled();

			test.notificationService.dismissNotification('chat.expNotification.auto-tier-nudge');
			await test.refetch();

			assert.deepStrictEqual({ ids: test.ids(), setCalls: test.setCalls }, {
				ids: [],
				setCalls: ['chat.expNotification.auto-tier-nudge'],
			});
		});

		test('an unrelated payload edit leaves an unchanged notification alone, even reformatted', async () => {
			const reordered = { title: validNotification.title, actions: validNotification.actions, description: validNotification.description, match: validNotification.match, id: validNotification.id };
			const test = createContribution([payload(validNotification), payload(reordered, { ...validNotification, id: 'second' })]);
			await test.settled();
			await test.refetch();

			assert.deepStrictEqual(test.setCalls, ['chat.expNotification.auto-tier-nudge', 'chat.expNotification.second']);
		});

		test('removes notifications dropped from the treatment, and an empty list retires them', async () => {
			const test = createContribution([payload(validNotification, { ...validNotification, id: 'second' }), payload(validNotification), payload()]);
			await test.settled();
			const before = test.ids();

			await test.refetch();
			const afterDrop = test.ids();

			await test.refetch();
			assert.deepStrictEqual({ before, afterDrop, afterRetire: test.ids() }, {
				before: ['chat.expNotification.auto-tier-nudge', 'chat.expNotification.second'],
				afterDrop: ['chat.expNotification.auto-tier-nudge'],
				afterRetire: [],
			});
		});

		test('removing the assignment clears what is showing', async () => {
			const test = createContribution([payload(validNotification), undefined]);
			await test.settled();
			await test.refetch();

			assert.deepStrictEqual(test.ids(), []);
		});

		test('stops matching when chat UI is hidden by policy', async () => {
			const test = createContribution([payload({ ...validNotification, match: { sessionTypes: ['copilotcli'] } })]);
			await test.settled();
			const registered = test.notifications.get('chat.expNotification.auto-tier-nudge');
			const beforeHide = registered?.when?.(context());

			test.entitlementSentiment.hidden = true;

			assert.deepStrictEqual({ beforeHide, afterHide: registered?.when?.(context()) }, {
				beforeHide: true,
				afterHide: false,
			});
		});

		test('stops matching when AI features are disabled, without unregistering', async () => {
			const test = createContribution([payload({ ...validNotification, match: { sessionTypes: ['copilotcli'] } })]);
			await test.settled();
			const registered = test.notifications.get('chat.expNotification.auto-tier-nudge');
			const beforeDisable = registered?.when?.(context());

			await test.configurationService.setUserConfiguration(ChatAIDisabledSettingId, true);

			// Still registered, so the service keeps the in-memory dismissal it holds for
			// `autoDismissOnMessage`, but the notification no longer matches any input.
			assert.deepStrictEqual({ beforeDisable, afterDisable: registered?.when?.(context()), ids: test.ids() }, {
				beforeDisable: true,
				afterDisable: false,
				ids: ['chat.expNotification.auto-tier-nudge'],
			});
		});
	});
});
