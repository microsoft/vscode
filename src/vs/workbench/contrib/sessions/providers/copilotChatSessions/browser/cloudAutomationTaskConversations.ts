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
import { GetTaskResponse, TaskEvent } from '../../../../../../platform/github/common/missionControl/tasks.js';
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
	if (!event.dismissed && !event.agentId && isEventObject(event.data) && !event.data.parentToolCallId && typeof event.data.content === 'string') {
		return event.data.content;
	}
	return undefined;
}

function turnHistory({ task, events }: ITaskSnapshot): IChatSessionHistoryItem[] {
	const history: IChatSessionHistoryItem[] = [];
	let parts: IChatProgress[] = [];
	let bootstrap = false;
	const request = (id: string, prompt: string) => {
		if (history.length) {
			history.push({ type: 'response', participant, parts });
		}
		parts = [];
		history.push({ type: 'request', participant, id, prompt });
	};
	const fallbackRequests = () => {
		for (const session of task.sessions ?? []) {
			request(session.id, session.prompt ?? task.name ?? '');
		}
		if (!history.length) {
			request(task.id, task.name ?? '');
		}
	};
	for (const event of events) {
		if (event.agentId || event.dismissed) {
			continue;
		}
		if (event.type === 'session.start' || event.type === 'session.requested') {
			bootstrap = true;
		}
		const content = eventContent(event);
		if (!content || !isEventObject(event.data)) {
			continue;
		}
		if (event.type === 'user.message') {
			// A verbatim transformed prompt is runtime-injected, not a new user turn.
			bootstrap = event.data.transformedContent === content;
			if (!bootstrap) {
				request(event.id, content);
			}
		} else if (!bootstrap && event.type === 'assistant.message') {
			if (!history.length) {
				fallbackRequests();
			}
			parts.push({ kind: 'markdownContent', content: new MarkdownString(content) });
		}
	}
	if (!history.length) {
		fallbackRequests();
	}
	history.push({
		type: 'response', participant, parts,
		...(stopped(task) ? { errorDetails: { message: localize('cloudAutomationTask.stopped', "The GitHub task stopped: {0}.", task.state) } } : {}),
	});
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
			resource, label: task.name || latest?.prompt || localize('cloudAutomationTask.run', "Automation run"),
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
			try {
				snapshot = await this.read(resource, CancellationToken.any([token, lifetime.token], opening));
			} finally {
				opening.dispose();
			}
			const disposed = scope.add(new Emitter<void>());
			let history = turnHistory(snapshot);
			const observation = new CancellationTokenSource(lifetime.token);
			scope.add(toDisposable(() => observation.dispose(true)));
			const refresh = scope.add(new RunOnceScheduler(async () => {
				try {
					const current = await this.read(resource, observation.token);
					CancellationToken.throwIfCanceled(observation.token);
					snapshot = current;
					history = turnHistory(current);
					changed.fire(history);
					if (active(current.task) && changed.hasListeners()) {
						refresh.schedule();
					}
				} catch (error) {
					if (!isCancellationError(error)) {
						this.logService.warn('[CloudAutomations] Could not update open task history', error);
					}
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
						history = turnHistory(await this.followReply(resource, request.message, baseline, progress, combined));
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

	private async followReply(resource: URI, prompt: string, baseline: ITaskSnapshot, progress: (parts: IChatProgress[]) => void, token: CancellationToken): Promise<ITaskSnapshot> {
		const seen = new Set(baseline.events.map(event => event.id));
		const priorTurn = baseline.task.sessions?.at(-1)?.id;
		const start = Date.now();
		let started = active(baseline.task);
		progress([{ kind: 'progressMessage', content: new MarkdownString(localize('cloudAutomationTask.sent', "Reply sent to GitHub.")) }]);
		for (; ;) {
			const current = await this.read(resource, token);
			const fresh = current.events.filter(event => !seen.has(event.id));
			const echo = fresh.findIndex(event => event.type === 'user.message' && eventContent(event) === prompt && !event.pending && isEventObject(event.data) && event.data.transformedContent !== prompt);
			// A user echo alone can arrive while GET still reports the previous, completed turn.
			const replyEvents = !started && echo >= 0 ? fresh.slice(echo + 1) : fresh;
			started ||= current.task.sessions?.at(-1)?.id !== priorTurn || active(current.task)
				|| echo >= 0 && replyEvents.some(event => event.type === 'assistant.message' && eventContent(event));
			if (started) {
				for (const event of fresh) {
					seen.add(event.id);
				}
				for (const event of replyEvents) {
					const content = eventContent(event);
					if (content && event.type === 'assistant.message') {
						progress([{ kind: 'markdownContent', content: new MarkdownString(content) }]);
					}
				}
				if (!active(current.task)) {
					if (stopped(current.task)) {
						throw new Error(localize('cloudAutomationTask.stopped', "The GitHub task stopped: {0}.", current.task.state));
					}
					return current;
				}
			} else if (Date.now() - start >= 120_000) {
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
