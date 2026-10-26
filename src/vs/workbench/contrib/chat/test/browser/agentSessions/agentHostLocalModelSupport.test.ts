/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ILocalModelFamilyV1, ILocalModelStatusV1, LOCAL_MODEL_STATUS_KEY, LocalModelEnabledSettingId } from '../../../../../../platform/agentHost/common/localModel.js';
import { createLocalModelTurnExecutionMeta } from '../../../../../../platform/agentHost/common/meta/agentUsageMeta.js';
import type { RootState, UsageInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ILocalModelService, LocalModelSendCheck } from '../../../../../services/agentHost/common/localModelService.js';
import { AgentHostLocalModelSupport, getLocalModelDisplayName, getLocalModelTurnPresentation } from '../../../browser/agentSessions/agentHost/agentHostLocalModelSupport.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { ChatInputNotificationActionKind, IChatInputNotification, IChatInputNotificationService } from '../../../browser/widget/input/chatInputNotificationService.js';
import { IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { IChatRequestSubmittedEvent, IChatService } from '../../../common/chatService/chatService.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';
import type { IChatModel, IChatModelInputState, IInputModel } from '../../../common/model/chatModel.js';
import type { IChatAgentRequest } from '../../../common/participants/chatAgents.js';

/** The agent-host model row the chat input selects for a direct-selection row id. */
function createDirectModel(rowId: string): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: `${SessionType.AgentHostCopilot}:${rowId}`,
		metadata: upcastPartial<ILanguageModelChatMetadata>({ id: rowId, name: rowId, vendor: SessionType.AgentHostCopilot, targetChatSessionType: SessionType.AgentHostCopilot }),
	};
}

/** Direct rows are published as `vscode-on-device/<alias>`, and installs name that same row id. */
const MAI_ROW_ID = 'vscode-on-device/MAI-Code-1.1-Flash';
const QWEN_ROW_ID = 'vscode-on-device/Qwen-Coder';

function createFamily(overrides: Partial<ILocalModelFamilyV1>): ILocalModelFamilyV1 {
	return {
		familyId: 'mai-code-1.1-flash-local',
		capiId: 'MAI-Code-1.1-Flash-Local',
		autoCapable: true,
		displayName: 'Example Flash 1.0',
		install: { contentId: 'c1', adopted: false, owned: true, modelId: MAI_ROW_ID },
		usage: { runningStreams: 0, boundDirectChats: 0, liveAutoRoutes: 0 },
		consentGiven: true,
		...overrides,
	};
}

const mai = createFamily({});
const qwen = createFamily({ familyId: 'qwen-coder-local', capiId: 'qwen-coder-local', displayName: 'Qwen Coder', install: { contentId: 'q1', adopted: false, owned: true, modelId: QWEN_ROW_ID } });

/** The status with the given active model, and Example Flash's operation when it has one. */
function createStatus(active: ILocalModelStatusV1['active'], maiOperation?: ILocalModelFamilyV1['operation']): ILocalModelStatusV1 {
	return {
		schemaVersion: 1,
		device: { confidence: 'measured' },
		runtime: { version: 'b11459' },
		catalog: { state: 'ready', registries: { azureml: 'ready' } },
		families: [maiOperation ? { ...mai, operation: maiOperation } : mai, qwen],
		active,
		useInAuto: true,
	};
}

function usage(meta: Record<string, unknown>, model = 'mai-code-1.1-flash-local'): UsageInfo {
	return { inputTokens: 1, outputTokens: 1, model, _meta: meta };
}

suite('AgentHostLocalModelSupport', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('names a family\'s capiId and direct row id from status, with no fixed table', () => {
		const status = createStatus(undefined);
		assert.deepStrictEqual([
			getLocalModelDisplayName(status, 'mai-code-1.1-flash-local'),
			getLocalModelDisplayName(status, MAI_ROW_ID),
			// The runtime may report a direct turn's model as the bare alias.
			getLocalModelDisplayName(status, 'MAI-Code-1.1-Flash'),
			getLocalModelDisplayName(status, 'gpt-5', 'qwen-coder-local'),
			getLocalModelDisplayName(status, 'gpt-5'),
			getLocalModelDisplayName(status, 'vscode-on-device/Unknown'),
			getLocalModelDisplayName(undefined, 'mai-code-1.1-flash-local'),
		], ['Example Flash 1.0', 'Example Flash 1.0', 'Example Flash 1.0', 'Qwen Coder', undefined, undefined, undefined]);
	});

	test('labels each execution kind', () => {
		const context = { isAuto: true, localName: 'Example Flash 1.0', localModelId: 'mai-code-1.1-flash-local', resolveCloudModelName: (id: string) => id === 'gpt-5-mini' ? 'GPT-5 mini' : undefined };
		assert.deepStrictEqual({
			local: getLocalModelTurnPresentation({ execution: 'local', familyId: mai.familyId }, context),
			fallback: getLocalModelTurnPresentation({ execution: 'fallback', fallbackReason: 'slotsFull', fallbackModel: 'gpt-5-mini' }, context),
			mixed: getLocalModelTurnPresentation({ execution: 'mixed', fallbackModel: 'gpt-5-mini' }, context),
			unknown: getLocalModelTurnPresentation({ execution: 'unknown' }, context),
			fallbackExplainabilityHidden: getLocalModelTurnPresentation({ execution: 'fallback', fallbackModel: 'gpt-5-mini' }, { ...context, hideCloudModelName: true })?.name,
			direct: getLocalModelTurnPresentation({ execution: 'local' }, { ...context, isAuto: false }),
			unnamed: [getLocalModelTurnPresentation({ execution: 'local' }, { ...context, localName: undefined })?.name, getLocalModelTurnPresentation({ execution: 'local' }, { ...context, isAuto: false, localName: undefined })?.name],
		}, {
			local: {
				name: 'Auto (Example Flash 1.0 \u00b7 On-device)',
				routed: { id: 'mai-code-1.1-flash-local', name: 'Example Flash 1.0 \u00b7 On-device' },
				billed: { rawModelId: 'mai-code-1.1-flash-local', name: 'Example Flash 1.0 \u00b7 On-device' },
			},
			fallback: {
				name: 'Auto (GPT-5 mini)',
				hover: 'The on-device model was unavailable, so a cloud model was used.',
				routed: { id: 'gpt-5-mini', name: 'GPT-5 mini', reason: 'Auto routed task to GPT-5 mini. The on-device model was unavailable, so a cloud model was used.' },
				billed: { rawModelId: 'gpt-5-mini', name: 'GPT-5 mini' },
			},
			mixed: {
				name: 'Auto (On-device + GPT-5 mini)',
				hover: 'Auto ran part of this task on this device and part on GPT-5 mini.',
				routed: { id: 'gpt-5-mini', name: 'GPT-5 mini', reason: 'Auto ran part of this task on this device and part on GPT-5 mini.' },
				billed: { rawModelId: 'gpt-5-mini', name: 'GPT-5 mini' },
			},
			unknown: undefined,
			fallbackExplainabilityHidden: 'Auto (a cloud model)',
			direct: { name: 'Example Flash 1.0 \u00b7 On-device', pricing: 'No usage limit' },
			unnamed: ['Auto (On-device model)', 'On-device model'],
		});
	});

	suite('pre-send guard and notices', () => {
		const sessionResource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session-1' });

		function createSupport(check: LocalModelSendCheck, options: { enabled?: boolean; active?: ILocalModelStatusV1['active']; swapResult?: boolean } = {}) {
			const status = observableValue<ILocalModelStatusV1 | undefined>('status', createStatus(options.active ?? { familyId: qwen.familyId, contentId: 'q1', servingGeneration: 1, server: 'ready' }));
			// The host publishes its status as a root config value, which the service reads back.
			const connection = upcastPartial<IAgentConnection>({
				rootState: upcastPartial<IAgentConnection['rootState']>({
					get value(): RootState { return { agents: [], config: { schema: { type: 'object', properties: {} }, values: { [LOCAL_MODEL_STATUS_KEY]: status.get() } } }; },
				}),
			});
			const calls: string[] = [];
			const notifications: IChatInputNotification[] = [];
			// The chat input: its draft text, attachments and selected model, mirrored into the chat model's input state.
			let input = '';
			const attachments: IChatRequestVariableEntry[] = [];
			const selectedModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('selectedModel', createDirectModel(MAI_ROW_ID));
			const inputState = observableValue<IChatModelInputState | undefined>('inputState', undefined);
			const syncInputState = () => inputState.set(upcastPartial<IChatModelInputState>({ inputText: input, attachments: [...attachments], selectedModel: selectedModel.get() }), undefined);
			const onDidSubmitRequest = store.add(new Emitter<IChatRequestSubmittedEvent>());
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(ILocalModelService, upcastPartial<ILocalModelService>({
				getStatus: () => status,
				checkBeforeSend: async (_connection, _resource, modelId) => { calls.push(`checkBeforeSend:${modelId}`); return check; },
				makeActive: (_connection, familyId) => { calls.push(`makeActive:${familyId}`); return options.swapResult ?? true; },
			}));
			instantiationService.stub(IChatInputNotificationService, upcastPartial<IChatInputNotificationService>({
				setNotification: notification => { notifications.push(notification); },
				deleteNotification: id => { calls.push(`deleteNotification:${id}`); },
			}));
			instantiationService.stub(IChatService, upcastPartial<IChatService>({
				removeRequest: async (_resource, requestId) => { calls.push(`removeRequest:${requestId}`); },
				onDidSubmitRequest: onDidSubmitRequest.event,
				getSession: () => upcastPartial<IChatModel>({ inputModel: upcastPartial<IInputModel>({ state: inputState }) }),
			}));
			const widget = upcastPartial<IChatWidget>({
				getInput: () => input,
				input: upcastPartial<IChatWidget['input']>({
					setValue: (value: string) => { input = value; calls.push(`setValue:${value}`); syncInputState(); },
					attachmentModel: upcastPartial<IChatWidget['input']['attachmentModel']>({ get attachments() { return attachments; } }),
					selectedLanguageModel: selectedModel,
					get currentLanguageModel() { return selectedModel.get()?.identifier; },
				}),
				acceptInput: async () => { calls.push(`acceptInput:${input}`); return undefined; },
			});
			instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({ getWidgetBySessionResource: () => widget }));
			instantiationService.stub(IConfigurationService, new TestConfigurationService({ [LocalModelEnabledSettingId]: options.enabled ?? true }));
			instantiationService.stub(ILogService, new NullLogService());
			const support = store.add(instantiationService.createInstance(AgentHostLocalModelSupport, connection, SessionType.AgentHostCopilot));
			const request = upcastPartial<IChatAgentRequest>({ sessionResource, requestId: 'request-1', agentId: 'agent', message: 'Explain this file', variables: { variables: [] }, location: ChatAgentLocation.Chat });

			/** Blocks the send, then chooses "Load {0}" on the guard notice. */
			const blockAndLoad = async () => {
				assert.strictEqual(await support.checkBeforeSend(request, MAI_ROW_ID), false);
				await timeout(0);
				const load = notifications[0].actions[0];
				assert.ok(load.kind === ChatInputNotificationActionKind.Command);
				await CommandsRegistry.getCommand(load.commandId)!.handler(upcastPartial<ServicesAccessor>({}), ...(load.commandArgs ?? []));
			};
			const qwenActive = { familyId: qwen.familyId, contentId: 'q1', servingGeneration: 1 } as const;
			const maiActive = { familyId: mai.familyId, contentId: 'c1', servingGeneration: 2 } as const;
			const swap = (phase: 'draining' | 'loading', state: 'running' | 'error' = 'running') => ({ id: 'swap-1', kind: 'swap', state, resumeOnStartup: false, phase } as const);
			/** The host takes up the request: it drains Qwen Coder, then loads Example Flash. */
			const publishSwap = () => {
				status.set(createStatus({ ...qwenActive, server: 'stopping', swapTo: mai.familyId, drain: { runningStreams: 1 } }, swap('draining')), undefined);
				status.set(createStatus({ ...maiActive, server: 'starting' }, swap('loading')), undefined);
			};
			const publishReady = () => status.set(createStatus({ ...maiActive, server: 'ready' }), undefined);
			return {
				support, status, calls, notifications, request, blockAndLoad, publishSwap, publishReady, qwenActive, maiActive, swap,
				editDraft: (text: string) => { input = text; syncInputState(); },
				selectModel: (rowId: string) => { selectedModel.set(createDirectModel(rowId), undefined); syncInputState(); },
				submitAnother: () => onDidSubmitRequest.fire({ chatSessionResource: sessionResource }),
			};
		}

		const block: LocalModelSendCheck = { kind: 'block', reason: 'modelNotActive', familyId: mai.familyId, activeFamilyId: qwen.familyId };

		test('allowed sends go through untouched', async () => {
			const allowed = createSupport({ kind: 'allow' });
			const settingOff = createSupport(block, { enabled: false });
			assert.deepStrictEqual({
				allowed: await allowed.support.checkBeforeSend(allowed.request, QWEN_ROW_ID),
				allowedCalls: allowed.calls,
				settingOff: await settingOff.support.checkBeforeSend(settingOff.request, MAI_ROW_ID),
				settingOffCalls: settingOff.calls,
				notifications: [...allowed.notifications, ...settingOff.notifications],
			}, {
				allowed: true,
				allowedCalls: [`checkBeforeSend:${QWEN_ROW_ID}`],
				settingOff: true,
				settingOffCalls: [],
				notifications: [],
			});
		});

		test('a direct model being swapped in is sent; the host queues it', async () => {
			const { support, request, notifications } = createSupport(block, { active: { familyId: qwen.familyId, contentId: 'q1', servingGeneration: 1, server: 'stopping', swapTo: mai.familyId } });
			assert.deepStrictEqual({ sent: await support.checkBeforeSend(request, MAI_ROW_ID), notifications }, { sent: true, notifications: [] });
		});

		test('a model that isn\'t loaded blocks the send, keeps the draft and offers Load, Switch and Auto', async () => {
			const { support, request, calls, notifications } = createSupport(block);
			const sent = await support.checkBeforeSend(request, MAI_ROW_ID);
			await timeout(0);
			const notice = notifications[0];
			const switchTo = notice.actions[1];
			assert.ok(switchTo.kind === ChatInputNotificationActionKind.SwitchToModel);
			assert.deepStrictEqual({
				sent,
				calls,
				notice: {
					id: notice.id,
					message: notice.message,
					sessionResources: notice.sessionResources?.map(resource => resource.toString()),
					group: notice.group,
					actions: notice.actions.map(action => ({ kind: action.kind, label: action.label })),
				},
				switchesToActiveRow: [switchTo.matchesModel(createDirectModel(QWEN_ROW_ID)), switchTo.matchesModel(createDirectModel(MAI_ROW_ID))],
			}, {
				sent: false,
				calls: [`checkBeforeSend:${MAI_ROW_ID}`, 'removeRequest:request-1', 'setValue:Explain this file'],
				notice: {
					id: `localModel.modelNotActive.${sessionResource.toString()}`,
					message: 'Example Flash 1.0 isn\'t loaded.',
					sessionResources: [sessionResource.toString()],
					// Defers to the on-device status notice of a failure, running operation or pause.
					group: { id: 'localModel', priority: 0 },
					actions: [
						{ kind: ChatInputNotificationActionKind.Command, label: 'Load Example Flash 1.0 (unloads Qwen Coder)' },
						{ kind: ChatInputNotificationActionKind.SwitchToModel, label: 'Switch to Qwen Coder' },
						{ kind: ChatInputNotificationActionKind.SwitchToModel, label: 'Use Auto' },
					],
				},
				switchesToActiveRow: [true, false],
			});
		});

		test('Load sends the kept draft once, when the load it started has the model ready', async () => {
			const { status, calls, notifications, blockAndLoad, publishSwap, publishReady, qwenActive, swap } = createSupport(block);
			// A failed swap from earlier, which the request replaces, isn't this load.
			status.set(createStatus({ ...qwenActive, server: 'ready' }, { ...swap('loading', 'error'), id: 'swap-0' }), undefined);
			await blockAndLoad();
			const beforeReady = calls.length;
			publishSwap();
			publishReady();
			await timeout(0);
			publishReady();
			await timeout(0);
			assert.deepStrictEqual({ loading: notifications[1].message, loadingGroup: notifications[1].group, afterReady: calls.slice(beforeReady) }, {
				loading: 'Loading Example Flash 1.0…',
				loadingGroup: { id: 'localModel', priority: 0 },
				afterReady: [
					`deleteNotification:localModel.modelNotActive.${sessionResource.toString()}`,
					'acceptInput:Explain this file',
				],
			});
		});

		const endedBy: Record<string, (support: ReturnType<typeof createSupport>) => void> = {
			// Cancel removes the swap: the previous model keeps serving, or the new one stops.
			'a cancel while draining': support => {
				support.status.set(createStatus({ ...support.qwenActive, server: 'stopping', swapTo: mai.familyId, drain: { runningStreams: 1 } }, support.swap('draining')), undefined);
				support.status.set(createStatus({ ...support.qwenActive, server: 'ready' }), undefined);
			},
			'a cancel while loading': support => {
				support.publishSwap();
				support.status.set(createStatus({ ...support.maiActive, server: 'stopping' }), undefined);
				support.status.set(createStatus({ ...support.maiActive, server: 'stopped' }), undefined);
			},
			'a failed load': support => {
				support.publishSwap();
				support.status.set(createStatus({ ...support.maiActive, server: 'stopped' }, support.swap('loading', 'error')), undefined);
			},
			// The swap is removed while the host still finishes preparing the cancelled launch.
			'a cancel while the load is being prepared': support => {
				support.publishSwap();
				support.status.set(createStatus({ ...support.maiActive, server: 'starting' }), undefined);
			},
		};
		for (const [name, end] of Object.entries(endedBy)) {
			test(`Load never sends after ${name}, even when the model loads later on its own`, async () => {
				const support = createSupport(block);
				await support.blockAndLoad();
				const beforeEnd = support.calls.length;
				end(support);
				await timeout(0);
				const ended = support.calls.slice(beforeEnd);
				// Later, a request for Auto or Start loads it again.
				support.status.set(createStatus({ ...support.maiActive, servingGeneration: 3, server: 'starting' }), undefined);
				support.publishReady();
				await timeout(0);
				assert.deepStrictEqual({ ended, later: support.calls.slice(beforeEnd + ended.length) }, {
					// The "your message will be sent" notice goes away, and the draft stays in the input.
					ended: [`deleteNotification:localModel.modelNotActive.${sessionResource.toString()}`],
					later: [],
				});
			});
		}

		const supersededBy: Record<string, (support: ReturnType<typeof createSupport>) => void> = {
			'an edited draft': support => support.editDraft('Explain this file, and another one'),
			'another model': support => support.selectModel(QWEN_ROW_ID),
			'another send in the session': support => {
				// The user switched model, sent the kept draft, and started a new one.
				support.submitAnother();
				support.editDraft('A new question');
			},
		};
		for (const [name, supersede] of Object.entries(supersededBy)) {
			test(`Load never submits once ${name} supersedes the kept draft`, async () => {
				const support = createSupport(block);
				await support.blockAndLoad();
				const beforeChange = support.calls.length;
				supersede(support);
				support.publishReady();
				await timeout(0);
				assert.deepStrictEqual(support.calls.slice(beforeChange).filter(call => call.startsWith('acceptInput') || call.startsWith('deleteNotification')), [
					// The "your message will be sent" notice goes away; nothing is sent.
					`deleteNotification:localModel.modelNotActive.${sessionResource.toString()}`,
				]);
			});
		}

		test('the fallback notice is shown once per session', () => {
			const { support, notifications } = createSupport({ kind: 'allow' });
			const fallback = usage(createLocalModelTurnExecutionMeta({ execution: 'fallback', fallbackModel: 'gpt-5-mini', familyId: mai.familyId }));
			support.noteCompletedTurn(sessionResource, usage(createLocalModelTurnExecutionMeta({ execution: 'local', familyId: mai.familyId })));
			support.noteCompletedTurn(sessionResource, fallback);
			support.noteCompletedTurn(sessionResource, fallback);
			assert.deepStrictEqual(notifications.map(notification => ({ message: notification.message, autoDismissOnMessage: notification.autoDismissOnMessage, actions: notification.actions.length, priority: notification.group?.priority })), [
				{ message: 'Example Flash 1.0 couldn\'t respond, so Auto used a cloud model.', autoDismissOnMessage: true, actions: 0, priority: 0 },
			]);
		});
	});
});
