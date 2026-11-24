/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../../base/common/objects.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { isObject } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { JsonObject, JsonValue } from '../../../../../../platform/github/common/client/types.js';
import { ApiRequestError } from '../../../../../../platform/github/common/missionControl/missionControlClient.js';
import { isRetryableMissionControlError, MISSION_CONTROL_RETRY_BUDGET_MS, missionControlMaxRetries, missionControlRetryDelay } from '../../../../../../platform/github/common/missionControl/missionControlError.js';
import { GetTaskResponse, TaskEvent } from '../../../../../../platform/github/common/missionControl/tasks.js';
import { RequestError } from '../../../../../../platform/github/common/types.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ChatSessionStatus, IChatSession, IChatSessionContentProvider, IChatSessionHistoryItem, IChatSessionItem, IChatSessionItemController, IChatSessionItemsDelta, SessionType } from '../../../../chat/common/chatSessionsService.js';
import { IChatProgress } from '../../../../chat/common/chatService/chatService.js';
import { ICloudAutomationTaskAccess } from './githubCloudAutomationStore.js';

const participant = SessionType.CopilotCloud;
const caller = 'cloudAutomations';
const pollInterval = 5_000;

function taskIdOf(resource: URI): string | undefined {
	if (resource.scheme !== participant || resource.authority || resource.query || resource.fragment) {
		return undefined;
	}
	return /^\/task\/(?<id>[^/]+)$/.exec(resource.path)?.groups?.id;
}

function active(task: GetTaskResponse): boolean {
	return task.state === 'in_progress' || task.state === 'queued';
}

function stopped(task: GetTaskResponse): boolean {
	return task.state === 'failed' || task.state === 'timed_out' || task.state === 'cancelled';
}

interface ITaskSnapshot {
	readonly task: GetTaskResponse;
	readonly events: readonly TaskEvent[];
}

function isEventObject(value: JsonValue): value is JsonObject {
	return isObject(value);
}

function eventContent(event: TaskEvent): string | undefined {
	if (!event.pending && !event.dismissed && !event.agentId && isEventObject(event.data) && !event.data.parentToolCallId && typeof event.data.content === 'string') {
		return event.data.content;
	}
	return undefined;
}

function historyPollRetryDelay(error: unknown, failures: number): number | undefined {
	if (error instanceof ApiRequestError) {
		if (!isRetryableMissionControlError(error.statusCode, error.code)) {
			return undefined;
		}
		return Math.max(pollInterval, missionControlRetryDelay(error.code, error.retryAfterSeconds, failures));
	}
	if (error instanceof RequestError && ['network', 'timeout', 'overloaded', 'rateLimit', 'server'].includes(error.kind)) {
		return Math.max(pollInterval, missionControlRetryDelay(undefined, undefined, failures));
	}
	return undefined;
}

function turnHistory({ task, events }: ITaskSnapshot, configuredPrompt: string | undefined): IChatSessionHistoryItem[] {
	const firstSession = task.sessions?.[0];
	const initialPrompt = firstSession?.event_content?.trim() ? firstSession.event_content : configuredPrompt;
	const turns: { id: string; prompt: string; parts: IChatProgress[] }[] = [];
	const leadingParts: IChatProgress[] = [];
	let parts = leadingParts;
	let bootstrap = false;
	for (const event of events) {
		if (event.agentId || event.dismissed) {
			continue;
		}
		if (event.type === 'session.start' || event.type === 'session.requested') {
			if (event.type === 'session.start' && !turns.length && firstSession && isEventObject(event.data)) {
				const sessionId = event.data.sessionId;
				if (task.sessions?.slice(1).some(session => session.id === sessionId)) {
					turns.push({ id: firstSession.id, prompt: '', parts: leadingParts });
				}
			}
			bootstrap = true;
		}
		const content = eventContent(event);
		if (!content || !isEventObject(event.data)) {
			continue;
		}
		if (event.type === 'user.message') {
			// The first automation message can be verbatim; later verbatim prompts are runtime-injected.
			const initialExecution = !turns.length && (!firstSession?.prompt || content === firstSession.prompt);
			bootstrap = event.data.transformedContent === content && !initialExecution;
			if (!bootstrap) {
				parts = [];
				turns.push({ id: event.id, prompt: content, parts });
			}
		} else if (!bootstrap && event.type === 'assistant.message') {
			parts.push({ kind: 'markdownContent', content: new MarkdownString(content) });
		}
	}
	if (!turns.length) {
		for (const session of task.sessions ?? []) {
			turns.push({ id: session.id, prompt: session.prompt ?? '', parts: [] });
		}
		if (!turns.length) {
			turns.push({ id: task.id, prompt: '', parts: [] });
		}
		turns[turns.length - 1].parts = leadingParts;
	} else if (firstSession && firstSession.prompt !== turns[0].prompt && task.sessions?.slice(1).some(session => session.prompt === turns[0].prompt)) {
		// The log may contain the follow-up's user event but not the initial automation request.
		turns.unshift({ id: firstSession.id, prompt: '', parts: leadingParts });
	}
	const history: IChatSessionHistoryItem[] = [];
	for (const [index, turn] of turns.entries()) {
		const prompt = index === 0 ? initialPrompt : turn.prompt;
		history.push({ type: 'request', participant, id: turn.id, prompt: prompt ?? '', ...(index === 0 && !prompt && { isRequestHidden: true }) });
		history.push({
			type: 'response', participant, parts: turn.parts,
			...(index === turns.length - 1 && stopped(task) ? { errorDetails: { message: localize('cloudAutomationTask.stopped', "The GitHub task stopped: {0}.", task.state) } } : {}),
		});
	}
	return history;
}

/** Resolves existing automation tasks only. Listing the controller never creates, discovers or starts a task. */
export class CloudAutomationTaskConversations extends Disposable implements IChatSessionItemController, IChatSessionContentProvider {
	private readonly opened = new Map<string, IChatSessionItem>();
	private readonly changed = this._register(new Emitter<IChatSessionItemsDelta>());
	readonly onDidChangeChatSessionItems = this.changed.event;
	private readonly lifetime = new CancellationTokenSource();

	constructor(private readonly access: ICloudAutomationTaskAccess, private readonly logService: ILogService) {
		super();
		this._register(toDisposable(() => this.lifetime.dispose(true)));
	}

	get items(): readonly IChatSessionItem[] { return [...this.opened.values()]; }
	async refresh(): Promise<void> { }

	hasOpened(resource: URI): boolean {
		const id = taskIdOf(resource);
		return !!id && this.opened.has(id);
	}

	private async task(resource: URI, token: CancellationToken): Promise<GetTaskResponse | undefined> {
		const id = taskIdOf(resource);
		if (!id) {
			return undefined;
		}
		const task = await this.access.withTasks(token, (tasks, token) => tasks.get(id, token, { caller }));
		CancellationToken.throwIfCanceled(token);
		return task.id === id && (task.automation_id || task.custom_agent?.is_automation || this.access.isKnownRun(id) || this.opened.has(id)) ? task : undefined;
	}

	private publish(resource: URI, task: GetTaskResponse): IChatSessionItem {
		const latest = task.sessions?.at(-1);
		const item: IChatSessionItem = {
			resource, label: task.name || localize('cloudAutomationTask.run', "Automation run"),
			status: active(task) ? ChatSessionStatus.InProgress : task.state === 'waiting_for_user' ? ChatSessionStatus.NeedsInput : stopped(task) ? ChatSessionStatus.Failed : ChatSessionStatus.Completed,
			timing: {
				created: Date.parse(task.created_at), lastRequestStarted: latest && Date.parse(latest.created_at),
				lastRequestEnded: !active(task) && task.updated_at ? Date.parse(task.updated_at) : undefined,
			},
			archived: !!task.archived_at,
			metadata: { isAutomation: true, repositoryNwo: task.repository?.full_name },
		};
		if (!equals(this.opened.get(task.id), item)) {
			this.opened.set(task.id, item);
			this.changed.fire({ addedOrUpdated: [item] });
		}
		return item;
	}

	async resolveChatSessionItem(resource: URI, token: CancellationToken): Promise<IChatSessionItem | undefined> {
		const scope = new DisposableStore();
		try {
			const combined = CancellationToken.any([this.lifetime.token, token], scope);
			const task = await this.task(resource, combined);
			CancellationToken.throwIfCanceled(combined);
			return task && this.publish(resource, task);
		} finally {
			scope.dispose();
		}
	}

	private async read(resource: URI, token: CancellationToken): Promise<ITaskSnapshot> {
		const task = await this.task(resource, token);
		if (!task) {
			throw new Error(localize('cloudAutomationTask.notFound', "This link does not identify a cloud automation run for the current account."));
		}
		const events = await this.access.withTasks(token, async (tasks, token) => {
			const result = new Map<string, TaskEvent>();
			for (let page = 1; page <= 100; page++) {
				const response = await tasks.getEvents(task.id, token, { caller, query: { page, per_page: 100 } });
				CancellationToken.throwIfCanceled(token);
				const before = result.size;
				for (const event of response.data.events) {
					result.set(event.id, event);
				}
				if (!response.nextLink && result.size >= response.data.total) {
					return [...result.values()];
				}
				if (before === result.size) {
					throw new Error(localize('cloudAutomationTask.incomplete', "GitHub did not return the complete task history."));
				}
			}
			throw new Error(localize('cloudAutomationTask.tooLarge', "This run is too large to open in VS Code. Open it on GitHub."));
		});
		CancellationToken.throwIfCanceled(token);
		this.publish(resource, task);
		return { task, events };
	}

	async provideChatSessionContent(resource: URI, token: CancellationToken): Promise<IChatSession> {
		const scope = new DisposableStore();
		const lifetime = new CancellationTokenSource(this.lifetime.token);
		scope.add(toDisposable(() => lifetime.dispose(true)));
		try {
			const opening = new DisposableStore();
			let snapshot: ITaskSnapshot;
			let configuredPrompt: string | undefined;
			try {
				const openingToken = CancellationToken.any([token, lifetime.token], opening);
				snapshot = await this.read(resource, openingToken);
				if (!snapshot.task.sessions?.[0]?.event_content?.trim()) {
					try {
						configuredPrompt = await this.access.getAutomationPrompt(snapshot.task, openingToken);
					} catch (error) {
						if (isCancellationError(error)) {
							throw error;
						}
						this.logService.warn('[CloudAutomations] Could not load the initial run prompt');
					}
					CancellationToken.throwIfCanceled(openingToken);
				}
			} finally {
				opening.dispose();
			}
			const disposed = scope.add(new Emitter<void>());
			let history = turnHistory(snapshot, configuredPrompt);
			const observation = new CancellationTokenSource(lifetime.token);
			scope.add(toDisposable(() => observation.dispose(true)));
			let pollFailures = 0;
			const refresh = scope.add(new RunOnceScheduler(async () => {
				let delay: number | undefined = pollInterval;
				try {
					const current = await this.read(resource, observation.token);
					CancellationToken.throwIfCanceled(observation.token);
					snapshot = current;
					pollFailures = 0;
					history = turnHistory(current, configuredPrompt);
					changed.fire(history);
				} catch (error) {
					if (isCancellationError(error)) {
						return;
					}
					this.logService.warn('[CloudAutomations] Could not update open task history', error);
					delay = historyPollRetryDelay(error, ++pollFailures);
				}
				if (delay !== undefined && !observation.token.isCancellationRequested && active(snapshot.task) && changed.hasListeners()) {
					refresh.schedule(delay);
				}
			}, pollInterval));
			const changed = scope.add(new Emitter<readonly IChatSessionHistoryItem[]>({
				onDidAddFirstListener: () => { if (!observation.token.isCancellationRequested && active(snapshot.task)) { refresh.schedule(); } },
				onDidRemoveLastListener: () => refresh.cancel(),
			}));
			return {
				sessionResource: resource, title: snapshot.task.name, get history() { return history; },
				onDidChangeHistory: changed.event, onWillDispose: disposed.event,
				dispose: () => { disposed.fire(); scope.dispose(); },
				requestHandler: async (request, progress, _history, requestToken) => {
					if (!isEqual(request.sessionResource, resource) || !request.message.trim() || request.variables.variables.length) {
						throw new Error(localize('cloudAutomationTask.text', "Send a text reply to this automation run without attachments."));
					}
					const send = new DisposableStore();
					try {
						const combined = CancellationToken.any([requestToken, lifetime.token], send);
						const baseline = await this.read(resource, combined);
						// From here the chat service owns the local request bubble; publishing it again as history would duplicate it.
						observation.cancel();
						refresh.cancel();
						await this.access.withTasks(combined, (tasks, token) => tasks.steer(baseline.task.id, { type: 'user_message', content: request.message }, token, { caller }));
						history = turnHistory(await this.followReply(resource, request.message, baseline, progress, combined), configuredPrompt);
					} finally {
						send.dispose();
					}
				},
			};
		} catch (error) {
			scope.dispose();
			throw error;
		}
	}

	private async readAcceptedReply(resource: URI, token: CancellationToken): Promise<ITaskSnapshot> {
		const deadline = Date.now() + MISSION_CONTROL_RETRY_BUDGET_MS;
		for (let failures = 1; ; failures++) {
			CancellationToken.throwIfCanceled(token);
			try {
				return await this.read(resource, token);
			} catch (error) {
				CancellationToken.throwIfCanceled(token);
				const delay = historyPollRetryDelay(error, failures);
				if (delay === undefined) {
					throw error;
				}
				if (failures > missionControlMaxRetries(error instanceof ApiRequestError ? error.code : undefined) || Date.now() + delay >= deadline) {
					throw new Error(localize('cloudAutomationTask.progressUnavailable', "GitHub accepted the reply, but its progress could not be read. Reopen this run to check it."), { cause: error });
				}
				await timeout(delay, token);
			}
		}
	}

	private async followReply(resource: URI, prompt: string, baseline: ITaskSnapshot, progress: (parts: IChatProgress[]) => void, token: CancellationToken): Promise<ITaskSnapshot> {
		const seen = new Set(baseline.events.map(event => event.id));
		const priorSessions = new Set(baseline.task.sessions?.map(session => session.id));
		const start = Date.now();
		let echoId: string | undefined;
		let receivedAnswer = false;
		progress([{ kind: 'progressMessage', content: new MarkdownString(localize('cloudAutomationTask.sent', "Reply sent to GitHub.")) }]);
		for (; ;) {
			const current = await this.readAcceptedReply(resource, token);
			let inReply = false;
			for (const event of current.events) {
				const content = eventContent(event);
				if (!content) {
					continue;
				}
				if (event.type === 'user.message') {
					if (echoId === undefined && !seen.has(event.id) && content === prompt && isEventObject(event.data) && event.data.transformedContent !== prompt) {
						echoId = event.id;
					}
					inReply = event.id === echoId;
				} else if (inReply && event.type === 'assistant.message' && !seen.has(event.id)) {
					receivedAnswer = true;
					progress([{ kind: 'markdownContent', content: new MarkdownString(content) }]);
				}
				seen.add(event.id);
			}
			// A confirmed echo may arrive before GET stops reporting the previous, completed session.
			const latest = current.task.sessions?.at(-1);
			const replySession = latest && !priorSessions.has(latest.id) && latest.prompt === prompt;
			if (echoId !== undefined && !active(current.task) && (receivedAnswer || replySession)) {
				if (stopped(current.task)) {
					throw new Error(localize('cloudAutomationTask.stopped', "The GitHub task stopped: {0}.", current.task.state));
				}
				return current;
			}
			if ((echoId === undefined || !active(current.task)) && Date.now() - start >= 120_000) {
				throw new Error(localize('cloudAutomationTask.waiting', "GitHub accepted the reply, but its turn has not appeared yet. Reopen this run to check its progress."));
			}
			await timeout(pollInterval, token);
		}
	}

	override dispose(): void {
		this.changed.fire({ removed: this.items.map(item => item.resource) });
		this.opened.clear();
		super.dispose();
	}
}
