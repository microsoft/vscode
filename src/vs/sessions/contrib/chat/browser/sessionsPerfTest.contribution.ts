/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../workbench/services/environment/common/environmentService.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatWidget } from '../../../../workbench/contrib/chat/browser/widget/chatWidget.js';
import { ChatModel, ChatRequestModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatRequestTextPart } from '../../../../workbench/contrib/chat/common/requestParser/chatParserTypes.js';
import { OffsetRange } from '../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export const INJECT_AGENTS_PERF_LIVE_SUBAGENT_COMMAND_ID = '_workbench.sessions.perf.injectLiveSubagentTools';
export const SCROLL_START_AGENTS_PERF_CHAT_COMMAND_ID = '_workbench.sessions.perf.scrollActiveChatStart';
export const SCROLL_END_AGENTS_PERF_CHAT_COMMAND_ID = '_workbench.sessions.perf.scrollActiveChatEnd';
export const SHOW_AGENTS_PERF_CONCURRENT_SESSIONS_COMMAND_ID = '_workbench.sessions.perf.showConcurrentSessions';
export const RUN_AGENTS_PERF_CONCURRENT_BURST_COMMAND_ID = '_workbench.sessions.perf.runConcurrentBurst';
export const STOP_AGENTS_PERF_CONCURRENT_SESSIONS_COMMAND_ID = '_workbench.sessions.perf.stopConcurrentSessions';

const CONCURRENT_BURST_TICKS = 48;

interface IConcurrentSessionContext {
	readonly model: ChatModel;
	readonly request: ChatRequestModel;
	readonly parentToolCallId: string;
	readonly sessionIndex: number;
}

class SessionsPerfTestContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsPerfTest';
	private readonly _concurrentModelRefs = this._register(new MutableDisposable<DisposableStore>());
	private _concurrentSessions: IConcurrentSessionContext[] = [];

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@ISessionsService sessionsService: ISessionsService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IChatService chatService: IChatService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
	) {
		super();

		if (!environmentService.enableSmokeTestDriver) {
			return;
		}

		this._register(CommandsRegistry.registerCommand(INJECT_AGENTS_PERF_LIVE_SUBAGENT_COMMAND_ID, () => {
			const model = getActiveChatModel(sessionsService, chatService);
			const messageText = 'Run the live Agents performance subagent';
			const request = model.addRequest({
				text: messageText,
				parts: [new ChatRequestTextPart(
					new OffsetRange(0, messageText.length),
					new Range(1, 1, 1, messageText.length + 1),
					messageText,
				)],
			}, { variables: [] }, 0);

			const parentToolCallId = 'agents-perf-live-subagent';
			chatService.appendProgress(request, {
				kind: 'externalToolInvocationUpdate',
				toolCallId: parentToolCallId,
				toolName: 'runSubagent',
				isComplete: false,
				invocationMessage: 'Running live performance subagent',
				toolSpecificData: {
					kind: 'subagent',
					agentName: 'PerfAgent',
					description: 'Inspecting live performance history',
					prompt: 'Inspect the restored performance corpus.',
					isActive: true,
					startedAt: Date.now(),
				},
			});

			for (let index = 0; index < 128; index++) {
				const toolCallId = `${parentToolCallId}-child-${index}`;
				chatService.appendProgress(request, {
					kind: 'externalToolInvocationUpdate',
					toolCallId,
					toolName: index % 2 === 0 ? 'search_files' : 'read_file',
					isComplete: false,
					invocationMessage: `Live subagent tool ${index}`,
					subagentInvocationId: parentToolCallId,
				});
				chatService.appendProgress(request, {
					kind: 'externalToolInvocationUpdate',
					toolCallId,
					toolName: index % 2 === 0 ? 'search_files' : 'read_file',
					isComplete: true,
					invocationMessage: `Live subagent tool ${index}`,
					pastTenseMessage: `Completed live subagent tool ${index}`,
					subagentInvocationId: parentToolCallId,
				});
			}
		}));

		this._register(CommandsRegistry.registerCommand(
			SCROLL_START_AGENTS_PERF_CHAT_COMMAND_ID,
			() => getActiveChatWidget(sessionsService, chatService, chatWidgetService).scrollTop = 0,
		));
		this._register(CommandsRegistry.registerCommand(
			SCROLL_END_AGENTS_PERF_CHAT_COMMAND_ID,
			() => {
				const widget = getActiveChatWidget(sessionsService, chatService, chatWidgetService);
				widget.scrollTop = widget.scrollHeight;
			},
		));

		this._register(CommandsRegistry.registerCommand(SHOW_AGENTS_PERF_CONCURRENT_SESSIONS_COMMAND_ID, async () => {
			this._concurrentModelRefs.clear();
			this._concurrentSessions = [];
			const expectedTitles = ['Agents Perf Primary Large History', 'Agents Perf Session 001', 'Agents Perf Session 002'];
			const localSessions = sessionsManagementService.getSessions().filter(session => session.sessionType === 'local');
			const sessions = expectedTitles.map(title => localSessions.find(session => session.title.get() === title));
			if (sessions.some(session => !session)) {
				throw new Error(`Expected concurrent performance sessions ${expectedTitles.join(', ')}, found ${localSessions.map(session => session.title.get()).join(', ')}`);
			}
			const concurrentSessions = sessions.map(session => session!);

			await sessionsService.openSession(concurrentSessions[0].resource, { preserveFocus: true });
			for (let index = 1; index < concurrentSessions.length; index++) {
				sessionsService.insertAt(concurrentSessions[index], concurrentSessions[index - 1].sessionId, 'right', false);
				await sessionsService.openSession(concurrentSessions[index].resource, { preserveFocus: true });
			}

			const visibleSessions = sessionsService.visibleSessions.get().filter(session => !!session);
			if (visibleSessions.length !== 3) {
				throw new Error(`Expected three visible sessions for concurrent performance scenario, found ${visibleSessions.length}`);
			}

			const refs = new DisposableStore();
			this._concurrentModelRefs.value = refs;
			for (let sessionIndex = 0; sessionIndex < visibleSessions.length; sessionIndex++) {
				const session = visibleSessions[sessionIndex]!;
				const chat = session.activeChat.get();
				const ref = await chatService.acquireOrLoadSession(chat.resource, ChatAgentLocation.Chat, CancellationToken.None, 'SessionsPerfTest');
				if (!ref || !(ref.object instanceof ChatModel)) {
					throw new Error(`Unable to load chat model for concurrent session ${session.sessionId}`);
				}
				refs.add(ref);
				const messageText = `Run concurrent Agents performance session ${sessionIndex}`;
				const request = ref.object.addRequest({
					text: messageText,
					parts: [new ChatRequestTextPart(
						new OffsetRange(0, messageText.length),
						new Range(1, 1, 1, messageText.length + 1),
						messageText,
					)],
				}, { variables: [] }, 0);
				const parentToolCallId = `agents-perf-concurrent-subagent-${sessionIndex}`;
				chatService.appendProgress(request, {
					kind: 'externalToolInvocationUpdate',
					toolCallId: parentToolCallId,
					toolName: 'runSubagent',
					isComplete: false,
					invocationMessage: `Running concurrent performance subagent ${sessionIndex}`,
					toolSpecificData: {
						kind: 'subagent',
						agentName: `PerfAgent${sessionIndex}`,
						description: `Concurrent session ${sessionIndex}`,
						prompt: 'Exercise concurrent toolbar and chat rendering.',
						isActive: true,
						startedAt: Date.now(),
					},
				});
				this._concurrentSessions.push({ model: ref.object, request, parentToolCallId, sessionIndex });
			}
		}));

		this._register(CommandsRegistry.registerCommand(RUN_AGENTS_PERF_CONCURRENT_BURST_COMMAND_ID, async () => {
			if (this._concurrentSessions.length !== 3) {
				throw new Error('Concurrent performance sessions have not been initialized');
			}
			for (let tick = 0; tick < CONCURRENT_BURST_TICKS; tick++) {
				await nextAnimationFrame();
				for (const context of this._concurrentSessions) {
					if (tick > 0) {
						appendConcurrentChild(chatService, context, tick - 1, true);
					}
					appendConcurrentChild(chatService, context, tick, false);
					if (tick % 8 === 0) {
						chatService.appendProgress(context.request, {
							kind: 'markdownContent',
							content: { value: `Concurrent progress ${context.sessionIndex}:${tick}` },
						});
					}
				}
			}
			for (const context of this._concurrentSessions) {
				chatService.appendProgress(context.request, {
					kind: 'markdownContent',
					content: { value: `AGENTS_PERF_CONCURRENT_${String(CONCURRENT_BURST_TICKS - 1).padStart(3, '0')}` },
				});
			}
		}));

		this._register(CommandsRegistry.registerCommand(STOP_AGENTS_PERF_CONCURRENT_SESSIONS_COMMAND_ID, () => {
			for (const context of this._concurrentSessions) {
				appendConcurrentChild(chatService, context, CONCURRENT_BURST_TICKS - 1, true);
				chatService.appendProgress(context.request, {
					kind: 'externalToolInvocationUpdate',
					toolCallId: context.parentToolCallId,
					toolName: 'runSubagent',
					isComplete: true,
					pastTenseMessage: `Completed concurrent performance subagent ${context.sessionIndex}`,
					toolSpecificData: {
						kind: 'subagent',
						agentName: `PerfAgent${context.sessionIndex}`,
						description: `Concurrent session ${context.sessionIndex}`,
						prompt: 'Exercise concurrent toolbar and chat rendering.',
						isActive: false,
					},
				});
				chatService.appendProgress(context.request, {
					kind: 'markdownContent',
					content: { value: 'AGENTS_PERF_CONCURRENT_DONE' },
				});
				context.request.response?.complete();
			}
		}));
	}
}

function appendConcurrentChild(chatService: IChatService, context: IConcurrentSessionContext, tick: number, isComplete: boolean): void {
	const toolCallId = `${context.parentToolCallId}-child-${tick}`;
	const variableLabel = `${'x'.repeat(tick % 32)}`;
	chatService.appendProgress(context.request, {
		kind: 'externalToolInvocationUpdate',
		toolCallId,
		toolName: tick % 2 === 0 ? 'search_files' : 'read_file',
		isComplete,
		invocationMessage: `Concurrent tool ${context.sessionIndex}:${tick} ${variableLabel}`,
		pastTenseMessage: isComplete ? `Completed concurrent tool ${context.sessionIndex}:${tick}` : undefined,
		subagentInvocationId: context.parentToolCallId,
	});
}

function nextAnimationFrame(): Promise<void> {
	return new Promise(resolve => mainWindow.requestAnimationFrame(() => resolve()));
}

function getActiveChatModel(sessionsService: ISessionsService, chatService: IChatService): ChatModel {
	const activeSession = sessionsService.activeSession.get();
	const chat = activeSession?.activeChat.get();
	const model = chat && chatService.getSession(chat.resource);
	if (!(model instanceof ChatModel)) {
		throw new Error('No active restored chat model is available for Agents performance injection');
	}
	return model;
}

function getActiveChatWidget(sessionsService: ISessionsService, chatService: IChatService, chatWidgetService: IChatWidgetService): ChatWidget {
	const model = getActiveChatModel(sessionsService, chatService);
	const widget = chatWidgetService.getWidgetBySessionResource(model.sessionResource);
	if (!(widget instanceof ChatWidget)) {
		throw new Error('No active Agents chat widget is available for performance scrolling');
	}
	return widget;
}

registerWorkbenchContribution2(SessionsPerfTestContribution.ID, SessionsPerfTestContribution, WorkbenchPhase.AfterRestored);
