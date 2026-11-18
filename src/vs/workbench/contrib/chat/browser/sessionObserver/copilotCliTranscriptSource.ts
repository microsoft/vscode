/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ICopilotHomeService } from '../../../../services/environment/common/copilotHomeService.js';
import { ChatSessionObservedStatus, ChatSessionUserMessageOrigin, IChatSessionEventAttachment, IChatSessionEventInput, IChatSessionTranscriptSink, IChatSessionTranscriptSource } from '../../common/sessionObserver/chatSessionObserver.js';
import { buildLocalEventsUri, COPILOT_CLI_EH_SCHEME, COPILOT_CLI_LOCAL_AH_SCHEME, getCopilotCliSessionRawId } from '../copilotCliEventsUri.js';

interface IRawCliEvent {
	readonly type: string;
	readonly id: string;
	readonly timestamp: string;
	readonly agentId?: string;
	readonly data?: Record<string, unknown>;
}

const RUNTIME_SOURCES = new Set(['system', 'autopilot', 'memory', 'instruction-discovery']);
const INJECTED = /^\s*<(system_notification|system_reminder|skill-context)\b/;

function str(v: unknown): string | undefined {
	return typeof v === 'string' ? v : undefined;
}

function lineCount(s: string): number {
	return s ? s.split('\n').length : 0;
}

/** Whose words a CLI `user.message` is: the runtime injects continuations, notifications and skill context as user messages. */
export function cliUserOrigin(data: Record<string, unknown>, text: string): ChatSessionUserMessageOrigin {
	const source = str(data.source);
	if (source === 'autopilot' || data.isAutopilotContinuation === true) {
		return 'autopilot';
	}
	if (source?.startsWith('skill-')) {
		return 'skill';
	}
	if (source && RUNTIME_SOURCES.has(source)) {
		return 'system';
	}
	return INJECTED.test(text) ? 'notification' : 'user';
}

type Questions = Extract<IChatSessionEventInput, { kind: 'question' }>['questions'];
type TodoItems = Extract<IChatSessionEventInput, { kind: 'todos' }>['items'];

function questionsFromSchema(args: Record<string, unknown>): Questions {
	const schema = args.requestedSchema as { properties?: Record<string, Record<string, unknown>> } | undefined;
	const out: { text: string; kind: 'single' | 'multi' | 'text'; options?: string[] }[] = [];
	// The common shape: one question with its choices.
	const question = str(args.question);
	if (question !== undefined) {
		const choices = Array.isArray(args.choices) ? (args.choices as unknown[]).map(String) : [];
		out.push(choices.length ? { text: question, kind: 'single', options: choices } : { text: question, kind: 'text' });
		return out;
	}
	const message = str(args.message);
	if (message) {
		out.push({ text: message, kind: 'text' });
	}
	for (const [key, p] of Object.entries(schema?.properties ?? {})) {
		const text = str(p.title) ?? str(p.description) ?? key;
		const en = Array.isArray(p.enum) ? (p.enum as unknown[]).map(String) : undefined;
		const oneOf = Array.isArray(p.oneOf) ? (p.oneOf as { const?: unknown; title?: string }[]).map(o => String(o.title ?? o.const)) : undefined;
		const items = p.items as { enum?: unknown[]; anyOf?: { const?: unknown; title?: string }[] } | undefined;
		if (p.type === 'array') {
			const options = items?.enum?.map(String) ?? items?.anyOf?.map(o => String(o.title ?? o.const));
			out.push({ text, kind: 'multi', ...(options ? { options } : {}) });
		} else if (en || oneOf) {
			out.push({ text, kind: 'single', options: (en ?? oneOf)! });
		} else if (p.type === 'boolean') {
			out.push({ text, kind: 'single', options: ['yes', 'no'] });
		} else {
			out.push({ text, kind: 'text' });
		}
	}
	return out;
}

function parseTodos(markdown: string): TodoItems {
	const out: { id: string; title: string; status: 'not-started' | 'in-progress' | 'completed' }[] = [];
	for (const line of markdown.split('\n')) {
		const m = /^\s*[-*]\s*\[([ xX~>-])\]\s*(.+)$/.exec(line);
		if (m) {
			out.push({ id: String(out.length + 1), title: m[2].trim(), status: m[1] === 'x' || m[1] === 'X' ? 'completed' : m[1] === ' ' ? 'not-started' : 'in-progress' });
		}
	}
	return out;
}

function attachmentsOf(data: Record<string, unknown>): IChatSessionEventAttachment[] {
	const raw = Array.isArray(data.attachments) ? data.attachments as Record<string, unknown>[] : [];
	return raw.map(a => {
		const type = str(a.type) ?? 'other';
		const path = str(a.path);
		const kind: IChatSessionEventAttachment['kind'] = type === 'file' ? 'file' : type === 'directory' ? 'directory' : type === 'selection' ? 'selection' : (str(a.mimeType) ?? '').startsWith('image/') ? 'image' : 'other';
		return { kind, label: str(a.displayName) ?? path ?? type, ...(path ? { uri: URI.file(path) } : {}) };
	});
}

/** A unified diff from an edit tool's arguments (the CLI records the edit, not a patch). */
function diffFromArgs(tool: string, args: Record<string, unknown>): { path: string; operation: 'modify' | 'create'; diff: string; added: number; removed: number } | undefined {
	const path = str(args.path);
	if (!path) {
		return undefined;
	}
	const oldStr = str(args.old_str);
	const newStr = str(args.new_str);
	if (oldStr !== undefined && newStr !== undefined) {
		return { path, operation: 'modify', diff: `@@ ${path} @@\n${oldStr.split('\n').map(l => `-${l}`).join('\n')}\n${newStr.split('\n').map(l => `+${l}`).join('\n')}`, added: lineCount(newStr), removed: lineCount(oldStr) };
	}
	const text = str(args.file_text);
	if (tool === 'create' && text !== undefined) {
		return { path, operation: 'create', diff: `@@ new file ${path} @@\n${text.split('\n').map(l => `+${l}`).join('\n')}`, added: lineCount(text), removed: 0 };
	}
	return undefined;
}

/**
 * Maps the Copilot CLI's event log into the provider-neutral schema, incrementally: the
 * mapper keeps the state the mapping needs (open tools, the current turn) across batches.
 */
export class CopilotCliEventMapper {
	private readonly toolStart = new Map<string, { at: number; name: string; args: Record<string, unknown> }>();
	private readonly emittedCalls = new Set<string>();
	private readonly runningMain = new Set<string>();
	private lastMainHadTools = false;
	private currentTurn: string | undefined;
	private lastTurnEnded = true;
	private openQuestion: string | undefined;
	private mapped = 0;
	private sinceCompaction = 0;
	model: string | undefined;
	effort: string | undefined;
	mode: string | undefined;
	createdAt: number | undefined;
	repository: string | undefined;
	branch: string | undefined;
	head: string | undefined;
	cwd: string | undefined;
	firstUserText: string | undefined;
	lastAt: number | undefined;
	lastTurnStartedAt: number | undefined;
	lastTurnEndedAt: number | undefined;

	get status(): ChatSessionObservedStatus {
		if (this.openQuestion) {
			return 'question';
		}
		return this.lastTurnEnded ? 'waiting' : 'working';
	}

	map(raw: readonly IRawCliEvent[]): IChatSessionEventInput[] {
		const out: IChatSessionEventInput[] = [];
		const push = (e: IChatSessionEventInput) => {
			out.push(e);
			this.mapped++;
		};
		for (const e of raw) {
			const at = Date.parse(e.timestamp) || Date.now();
			this.lastAt = at;
			const d = e.data ?? {};
			const parentCall = str(d.parentToolCallId);
			const nest = parentCall ? { parentId: `sa:${parentCall}` } : {};
			const env = (id: string) => ({ id, at, rawType: e.type, ...(this.currentTurn ? { turnId: this.currentTurn } : {}), ...nest });
			switch (e.type) {
				case 'session.start': {
					this.createdAt ??= at;
					this.model = str(d.selectedModel) ?? this.model;
					this.effort = str(d.reasoningEffort) ?? this.effort;
					const ctx = (d.context ?? {}) as Record<string, unknown>;
					this.repository ??= str(ctx.repository);
					this.branch ??= str(ctx.branch);
					this.head = str(ctx.headCommit) ?? this.head;
					this.cwd ??= str(ctx.cwd);
					break;
				}
				case 'user.message': {
					const text = str(d.content) ?? '';
					const origin = cliUserOrigin(d, text);
					const delivery = str(d.delivery);
					const submitKind = delivery === 'steering' ? 'steer' : delivery === 'queued' ? 'queue' : 'send';
					// A steering message joins the running turn; anything else starts one.
					if (submitKind !== 'steer' || this.lastTurnEnded) {
						this.currentTurn = `u:${e.id}`;
						this.lastTurnStartedAt = at;
						push({ ...env(`${e.id}:start`), kind: 'turnStarted', trigger: origin === 'user' ? (submitKind === 'queue' ? 'queued' : submitKind === 'steer' ? 'steering' : 'user') : origin === 'autopilot' ? 'autopilot' : 'system' });
					}
					push({ ...env(e.id), kind: 'userMessage', text, origin, submitKind, attachments: attachmentsOf(d), ...(str(d.agentMode) ? { mode: str(d.agentMode) } : {}) });
					if (origin === 'user') {
						this.firstUserText ??= text;
					}
					this.lastTurnEnded = false;
					this.lastMainHadTools = false;
					this.openQuestion = undefined;
					// A message sent to an idle agent means nothing it started still runs, even a tool whose completion was never logged.
					if (delivery === 'idle') {
						this.runningMain.clear();
					}
					break;
				}
				case 'assistant.message': {
					const reasoning = str(d.reasoningText);
					if (reasoning) {
						push({ ...env(`${e.id}:r`), kind: 'reasoning', text: reasoning, availability: 'full' });
					}
					const content = str(d.content);
					if (content?.trim()) {
						push({ ...env(e.id), kind: 'agentText', text: content, final: true });
					}
					const requests = Array.isArray(d.toolRequests) ? d.toolRequests as Record<string, unknown>[] : [];
					for (const r of requests) {
						const callId = str(r.toolCallId);
						if (!callId || this.emittedCalls.has(callId)) {
							continue;
						}
						this.emittedCalls.add(callId);
						const name = str(r.name) ?? 'tool';
						const args = (r.arguments && typeof r.arguments === 'object' ? r.arguments : { raw: r.arguments }) as Record<string, unknown>;
						// Remembered here too: a tool's start event may not follow its request.
						if (!this.toolStart.has(callId)) {
							this.toolStart.set(callId, { at, name, args });
						}
						push({ ...env(`call:${callId}`), kind: 'toolCall', callId, name, input: args, ...(str(r.toolTitle) ? { displayName: str(r.toolTitle) } : {}) });
						this.toolSideEvents(name, callId, args, env, push);
					}
					if (!parentCall) {
						this.lastMainHadTools = requests.length > 0;
					}
					break;
				}
				case 'tool.execution_start': {
					const callId = str(d.toolCallId);
					if (!callId) {
						break;
					}
					const name = str(d.toolName) ?? 'tool';
					const args = (d.arguments && typeof d.arguments === 'object' ? d.arguments : { raw: d.arguments }) as Record<string, unknown>;
					this.toolStart.set(callId, { at, name, args });
					if (!parentCall) {
						this.runningMain.add(callId);
					}
					if (!this.emittedCalls.has(callId)) {
						this.emittedCalls.add(callId);
						push({ ...env(`call:${callId}`), kind: 'toolCall', callId, name, input: args, ...(str(d.toolTitle) ? { displayName: str(d.toolTitle) } : {}) });
						this.toolSideEvents(name, callId, args, env, push);
					}
					break;
				}
				case 'tool.execution_complete': {
					const callId = str(d.toolCallId);
					if (!callId) {
						break;
					}
					this.runningMain.delete(callId);
					const start = this.toolStart.get(callId);
					const result = (d.result ?? {}) as Record<string, unknown>;
					const text = str(result.detailedContent) ?? str(result.content) ?? '';
					if (text) {
						push({ ...env(`out:${callId}`), kind: 'toolOutput', callId, stream: 'content', text, totalChars: text.length, truncated: false });
					}
					const err = d.error as Record<string, unknown> | undefined;
					const exit = (d.shellExecution as Record<string, unknown> | undefined)?.exitCode;
					const success = d.success !== false && !err;
					push({
						...env(`res:${callId}`), kind: 'toolResult', callId, status: success ? 'completed' : str(err?.code) === 'denied' ? 'denied' : 'failed',
						...(typeof exit === 'number' ? { exitCode: exit } : {}), ...(start ? { durationMs: Math.max(0, at - start.at) } : {}), ...(err ? { error: str(err.message) ?? 'error' } : {}),
					});
					if (start && success) {
						const diff = diffFromArgs(start.name, start.args);
						if (diff) {
							push({ ...env(`edit:${callId}`), kind: 'edit', callId, uri: URI.file(diff.path), operation: diff.operation, unifiedDiff: diff.diff, added: diff.added, removed: diff.removed });
						}
						if (start.name === 'ask_user') {
							push({ ...env(`qa:${callId}`), kind: 'questionAnswer', questionId: callId, answers: [{ text }], actor: 'user' });
							this.openQuestion = undefined;
						} else if (start.name === 'exit_plan_mode') {
							push({ ...env(`pd:${callId}`), kind: 'planReviewDecision', reviewId: callId, action: /approve|yes|accept/i.test(text) ? 'Approve' : 'Request changes', ...(text ? { feedback: text } : {}) });
							this.openQuestion = undefined;
						}
					}
					break;
				}
				case 'subagent.started': {
					const callId = str(d.toolCallId);
					push({ id: callId ? `sa:${callId}` : e.id, at, rawType: e.type, ...(this.currentTurn ? { turnId: this.currentTurn } : {}), kind: 'subagentStarted', name: str(d.agentDisplayName) ?? str(d.agentName) ?? 'subagent', ...(str(d.agentDescription) ? { description: str(d.agentDescription) } : {}), ...(callId ? { callId } : {}) });
					break;
				}
				case 'subagent.completed': {
					const callId = str(d.toolCallId);
					push({ id: e.id, at, rawType: e.type, ...(this.currentTurn ? { turnId: this.currentTurn } : {}), ...(callId ? { parentId: `sa:${callId}`, callId } : {}), kind: 'subagentEnded', status: d.cancelled === true ? 'cancelled' : 'completed' });
					break;
				}
				case 'session.compaction_start':
					this.sinceCompaction = this.mapped;
					break;
				case 'session.compaction_complete': {
					const summary = str(d.summaryContent);
					if (summary && d.success !== false) {
						// coversThroughSeq is relative to the log; the multiplexer numbers events from 1 in order.
						push({ ...env(e.id), kind: 'compaction', summary, coversThroughSeq: this.sinceCompaction, trigger: str(d.trigger) === 'manual' ? 'manual' : 'auto' });
					}
					break;
				}
				case 'permission.requested': {
					const req = (d.permissionRequest ?? {}) as Record<string, unknown>;
					const reqId = str(d.requestId) ?? e.id;
					push({ ...env(`perm:${reqId}`), kind: 'permission', permissionId: reqId, ...(str(req.toolCallId) ? { callId: str(req.toolCallId) } : {}), title: str(req.intention) ?? str(req.kind) ?? 'permission', ...(str(req.path) ? { detail: str(req.path) } : {}) });
					break;
				}
				case 'permission.completed': {
					const reqId = str(d.requestId) ?? e.id;
					const kind = str((d.result as Record<string, unknown> | undefined)?.kind) ?? '';
					push({ ...env(`permd:${reqId}`), kind: 'permissionDecision', permissionId: reqId, decision: /deny|reject/i.test(kind) ? 'denied' : str(d.decisionSource) === 'auto' ? 'auto' : 'allowed', option: kind });
					break;
				}
				case 'session.model_change':
					this.model = str(d.newModel) ?? this.model;
					this.effort = str(d.reasoningEffort) ?? this.effort;
					push({ ...env(e.id), kind: 'modelChanged', model: this.model ?? '', ...(this.effort ? { reasoningEffort: this.effort } : {}) });
					break;
				case 'session.mode_changed':
					this.mode = str(d.newMode) ?? this.mode;
					push({ ...env(e.id), kind: 'modeChanged', mode: this.mode ?? '' });
					break;
				// One per agent request: every log has these, while model.* events cover only some requests or none.
				case 'assistant.turn_start':
					push({ ...env(e.id), kind: 'modelCall', model: this.model ?? '', ...(this.effort ? { reasoningEffort: this.effort } : {}) });
					break;
				case 'system.notification':
					push({ ...env(e.id), kind: 'notification', text: str(d.content) ?? '', source: str((d.kind as Record<string, unknown> | undefined)?.type) ?? 'system' });
					break;
				case 'session.warning':
					push({ ...env(e.id), kind: 'notification', text: str(d.message) ?? str(d.content) ?? 'warning', source: 'warning' });
					break;
				case 'session.error':
					push({ ...env(e.id), kind: 'error', message: str(d.message) ?? 'error', ...(str(d.code) ? { code: str(d.code) } : {}) });
					break;
				case 'skill.invoked':
					push({ ...env(e.id), kind: 'notification', text: `skill invoked: ${str(d.skill) ?? str(d.name) ?? ''}`, source: 'skill' });
					break;
				case 'abort':
					// An abort kills the tools the turn had running, and their completions are never logged.
					this.runningMain.clear();
					if (this.currentTurn && !this.lastTurnEnded) {
						push({ ...env(e.id), kind: 'turnEnded', outcome: 'cancelled', cancelledBy: 'user', ...(str(d.reason) ? { reason: str(d.reason) } : {}) });
						this.endTurn(at);
					}
					break;
				case 'session.task_complete':
					if (str(d.summary)) {
						push({ ...env(`${e.id}:n`), kind: 'notification', text: `task complete: ${str(d.summary)}`, source: 'task_complete' });
					}
					if (this.currentTurn && !this.lastTurnEnded) {
						push({ ...env(e.id), kind: 'turnEnded', outcome: 'completed' });
						this.endTurn(at);
					}
					break;
				case 'assistant.turn_end':
					// A hand-back: the main agent's last message asked for no tools and nothing it started still runs.
					if (!parentCall && !e.agentId && this.currentTurn && !this.lastMainHadTools && this.runningMain.size === 0 && !this.lastTurnEnded) {
						push({ ...env(e.id), kind: 'turnEnded', outcome: 'needsInput' });
						this.endTurn(at);
					}
					break;
				case 'session.shutdown':
					this.runningMain.clear();
					break;
				default:
					// hook.*, usage and model telemetry, binary assets, instruction updates: runtime plumbing, not transcript.
					break;
			}
		}
		return out;
	}

	private endTurn(at: number): void {
		this.lastTurnEnded = true;
		this.lastTurnEndedAt = at;
	}

	private toolSideEvents(name: string, callId: string, args: Record<string, unknown>, env: (id: string) => { id: string; at: number; rawType?: string; turnId?: string; parentId?: string }, push: (e: IChatSessionEventInput) => void): void {
		if (name === 'ask_user') {
			push({ ...env(`q:${callId}`), kind: 'question', questionId: callId, questions: questionsFromSchema(args) });
			this.openQuestion = callId;
		} else if (name === 'exit_plan_mode') {
			push({ ...env(`p:${callId}`), kind: 'planReview', reviewId: callId, title: 'Plan', plan: str(args.summary) ?? '', actions: ['Approve', 'Request changes'], canProvideFeedback: true });
			this.openQuestion = callId;
		} else if (name === 'update_todo' && str(args.todos)) {
			push({ ...env(`td:${callId}`), kind: 'todos', items: parseTodos(str(args.todos)!) });
		}
	}
}

/**
 * The Copilot CLI transcript source: tails the session's `events.jsonl` (the same events the
 * CLI SDK emits), so the log is complete and live whether or not a widget shows the session.
 */
export class CopilotCliTranscriptSource extends Disposable implements IChatSessionTranscriptSource {
	readonly id = 'copilotCli';
	readonly priority = 100;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ICopilotHomeService private readonly copilotHomeService: ICopilotHomeService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	canObserve(resource: URI): boolean {
		return (resource.scheme === COPILOT_CLI_EH_SCHEME || resource.scheme === COPILOT_CLI_LOCAL_AH_SCHEME) && !!getCopilotCliSessionRawId(resource);
	}

	async observe(resource: URI, sink: IChatSessionTranscriptSink): Promise<IDisposable> {
		const rawId = getCopilotCliSessionRawId(resource)!;
		const eventsUri = buildLocalEventsUri(this.copilotHomeService.home, rawId);
		const workspaceUri = URI.joinPath(eventsUri, '..', 'workspace.yaml');
		// An agent host may back its session with a CLI session of another id (the backing is
		// created at the first send, under its own id). Without a log under this id, the
		// agent-host protocol source observes the session instead.
		if (resource.scheme === COPILOT_CLI_LOCAL_AH_SCHEME && !await this.fileService.exists(URI.joinPath(eventsUri, '..'))) {
			throw new Error(`No Copilot CLI log for ${resource.toString()}`);
		}
		const mapper = new CopilotCliEventMapper();
		let offset = 0;
		let partial = '';
		let disposed = false;
		let reading: Promise<void> | undefined;

		const meta = await this.readWorkspaceYaml(workspaceUri);
		const readMore = async (): Promise<void> => {
			let content: VSBuffer;
			try {
				const stat = await this.fileService.stat(eventsUri);
				if (stat.size === undefined || stat.size <= offset) {
					return;
				}
				content = (await this.fileService.readFile(eventsUri, { position: offset })).value;
			} catch {
				return;
			}
			offset += content.byteLength;
			const text = partial + content.toString();
			const lines = text.split('\n');
			partial = lines.pop() ?? '';
			const raw: IRawCliEvent[] = [];
			for (const line of lines) {
				if (line.trim()) {
					try {
						raw.push(JSON.parse(line));
					} catch {
						// a torn line is completed by the next read
					}
				}
			}
			const events = mapper.map(raw);
			if (disposed) {
				return;
			}
			if (events.length) {
				sink.append(events);
			}
			const [owner, name] = (meta.repository ?? mapper.repository ?? '').split('/');
			const repo = meta.repository ?? mapper.repository;
			sink.patchInfo({
				status: mapper.status,
				...(mapper.model ? { model: mapper.model } : {}),
				...(mapper.effort ? { reasoningEffort: mapper.effort } : {}),
				...(mapper.mode ? { mode: mapper.mode } : {}),
				...(mapper.lastAt ? { lastActivityAt: mapper.lastAt } : {}),
				...(mapper.lastTurnStartedAt ? { lastRequestStartedAt: mapper.lastTurnStartedAt } : {}),
				...(mapper.lastTurnEndedAt ? { lastRequestEndedAt: mapper.lastTurnEndedAt } : {}),
				...(repo ? { repository: { remoteUrl: `https://github.com/${repo}`, ...(owner ? { owner } : {}), ...(name ? { name } : {}), ...(meta.branch ?? mapper.branch ? { branch: meta.branch ?? mapper.branch } : {}), ...(mapper.head ? { head: mapper.head } : {}) } } : {}),
				...(meta.cwd ?? mapper.cwd ? { workspace: { folder: URI.file((meta.cwd ?? mapper.cwd)!) } } : {}),
				fidelity: { reasoning: 'full', toolOutput: 'full', diffs: 'perEdit', timestamps: 'perEvent', modelCalls: true, liveWithoutWidget: true, liveLatencyMs: 500 },
			});
		};
		const pump = () => {
			reading ??= readMore().finally(() => { reading = undefined; });
			return reading;
		};
		await pump();

		const watcher = this.fileService.createWatcher(eventsUri, { recursive: false, excludes: [] });
		const listener = watcher.onDidChange(e => {
			if (e.contains(eventsUri)) {
				void pump();
			}
		});
		// File events can coalesce or drop on some platforms: a slow poll backs them up.
		const timer = new IntervalTimer();
		timer.cancelAndSet(() => void pump(), 2_000);
		this.logService.trace(`[chatSessionObserver] tailing ${eventsUri.toString()}`);
		return toDisposable(() => {
			disposed = true;
			timer.dispose();
			listener.dispose();
			watcher.dispose();
		});
	}

	private async readWorkspaceYaml(uri: URI): Promise<Record<string, string>> {
		const out: Record<string, string> = {};
		try {
			for (const line of (await this.fileService.readFile(uri)).value.toString().split('\n')) {
				const m = /^([a-z_]+):\s*(.*)$/.exec(line);
				if (m) {
					out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
				}
			}
		} catch {
			// no metadata
		}
		return out;
	}
}
