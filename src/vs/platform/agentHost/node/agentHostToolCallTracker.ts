/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../base/common/async.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import type { TodoStoreOperation, TodoStoreTarget } from '../../telemetry/common/todoStoreTelemetry.js';
import type { SessionToolAuthenticationRequest, SessionToolClientExecutionRequest, SessionToolConfirmationRequest } from '../common/state/protocol/state.js';
import { ToolCallContributorKind, type ToolCallContributor, type ToolCallResult } from '../common/state/sessionState.js';
import type { AgentHostModelTelemetryKind, AgentHostTelemetryReporter, IAgentHostToolInvokedReport } from './agentHostTelemetryReporter.js';

export type ToolInvokedResult = 'success' | 'error' | 'userCancelled';

const TOOL_CALL_STALL_THRESHOLD_MS = 5 * 60 * 1000;

type ToolCallBlockerRequest = SessionToolConfirmationRequest | SessionToolClientExecutionRequest | SessionToolAuthenticationRequest;

/**
 * Maps a completed tool call's result to the telemetry result bucket. Mirrors
 * the derivation previously done inline in `CopilotAgentSession`: a denied,
 * rejected, or cancelled tool call counts as `userCancelled`; any other
 * failure counts as `error`.
 */
export function deriveToolInvokedResult(result: ToolCallResult): ToolInvokedResult {
	if (result.success) {
		return 'success';
	}
	const code = result.error?.code;
	if (code === 'rejected' || code === 'denied' || code === 'cancelled') {
		return 'userCancelled';
	}
	return 'error';
}

/**
 * Maps a tool call's contributor to the telemetry `toolSourceKind`. A tool with
 * no contributor is provided by the agent host itself; an MCP contributor maps
 * to `mcp` and a client contributor to `client`.
 */
export function toolSourceKindFromContributor(contributor: ToolCallContributor | undefined): string {
	if (!contributor) {
		return 'agentHost';
	}
	// Widen to `string` so an unrecognized kind from a newer protocol version
	// falls through to a valid telemetry value rather than `undefined`.
	const kind: string = contributor.kind;
	switch (kind) {
		case ToolCallContributorKind.MCP:
			return 'mcp';
		case ToolCallContributorKind.Client:
			return 'client';
		default:
			return kind;
	}
}

function canRefineContributor(current: ToolCallContributor | undefined, next: ToolCallContributor): boolean {
	if (current?.kind === ToolCallContributorKind.Client) {
		return next.kind === ToolCallContributorKind.Client && next.clientId === current.clientId;
	}
	return next.kind !== ToolCallContributorKind.Client;
}

/** Per-tool-call timing state, keyed by `session:toolCallId`. */
interface IToolCallTiming {
	readonly lifecycleStopWatch: StopWatch;
	invocationStopWatch?: StopWatch;
	readonly provider: string;
	readonly session: string;
	readonly turnId: string;
	readonly toolId: string;
	contributor: ToolCallContributor | undefined;
	toolSourceKind: string;
	model: string | undefined;
	modelTelemetryKind: AgentHostModelTelemetryKind | undefined;
	modelResolvedFromUsage: boolean;
	todoStoreOperation: ITodoStoreOperationData | undefined;
}

interface IStalledToolCall {
	readonly blockerKind: ToolCallBlockerRequest['kind'];
	readonly completionStopWatch: StopWatch;
}

/**
 * Tracks completed and stalled tool calls for agent host sessions.
 *
 * Lifecycle per tool call:
 *   1. {@link toolCallStarted} — begins a stopwatch and records the tool's
 *      name and source kind (only the start action carries these)
 *   2. {@link toolCallCompleted} — emits the telemetry event and clears state
 *   3. {@link toolCallBlocked} / {@link toolCallUnblocked} — emits once when a
 *      confirmation or client execution remains unresolved past the threshold
 *
 * In-flight tool calls that never complete (e.g. the turn is cancelled mid
 * tool call) are dropped via {@link clearSession} / {@link clear} so the
 * tracking map cannot leak.
 */
export class AgentHostToolCallTracker extends Disposable {

	private readonly _toolCalls = new Map<string, IToolCallTiming>();
	private readonly _turnModels = new Map<string, { model: string; modelTelemetryKind: AgentHostModelTelemetryKind }>();
	private readonly _pendingToolReports = new Map<string, IAgentHostToolInvokedReport[]>();
	private readonly _toolCallStallTimers = this._register(new DisposableMap<string>());
	private readonly _stalledToolCalls = new Map<string, IStalledToolCall>();

	constructor(private readonly _reporter: AgentHostTelemetryReporter) {
		super();
	}

	toolCallStarted(provider: string, session: string, turnId: string, toolCallId: string, toolName: string, contributor: ToolCallContributor | undefined, model: string | undefined, modelTelemetryKind: AgentHostModelTelemetryKind | undefined): void {
		const resolvedModel = this._turnModels.get(this._turnKey(session, turnId));
		this._toolCalls.set(this._key(session, toolCallId), {
			lifecycleStopWatch: StopWatch.create(true),
			provider,
			session,
			turnId,
			toolId: toolName,
			contributor,
			toolSourceKind: toolSourceKindFromContributor(contributor),
			model: resolvedModel?.model ?? model,
			modelTelemetryKind: resolvedModel?.modelTelemetryKind ?? modelTelemetryKind,
			modelResolvedFromUsage: resolvedModel !== undefined,
			todoStoreOperation: undefined,
		});
	}

	updateTurnModel(session: string, turnId: string, model: string, modelTelemetryKind: AgentHostModelTelemetryKind): void {
		const turnKey = this._turnKey(session, turnId);
		this._turnModels.set(turnKey, { model, modelTelemetryKind });
		for (const timing of this._toolCalls.values()) {
			if (timing.session === session && timing.turnId === turnId) {
				timing.model = model;
				timing.modelTelemetryKind = modelTelemetryKind;
				timing.modelResolvedFromUsage = true;
			}
		}
		const pending = this._pendingToolReports.get(turnKey);
		if (pending) {
			this._pendingToolReports.delete(turnKey);
			for (const report of pending) {
				this._reporter.toolInvoked({ ...report, model, modelTelemetryKind });
			}
		}
	}

	toolCallMetadataUpdated(session: string, toolCallId: string, contributor: ToolCallContributor | undefined): void {
		const timing = this._toolCalls.get(this._key(session, toolCallId));
		if (!timing) {
			return;
		}
		if (contributor && canRefineContributor(timing.contributor, contributor)) {
			timing.contributor = contributor;
			timing.toolSourceKind = toolSourceKindFromContributor(contributor);
		}
	}

	toolCallExecutionStarted(session: string, toolCallId: string): void {
		const timing = this._toolCalls.get(this._key(session, toolCallId));
		if (timing && !timing.invocationStopWatch) {
			timing.invocationStopWatch = StopWatch.create(true);
		}
	}

	toolCallReady(session: string, toolCallId: string, toolInput: string | undefined): void {
		if (toolInput === undefined) {
			return;
		}
		const timing = this._toolCalls.get(this._key(session, toolCallId));
		if (timing?.toolSourceKind === 'agentHost') {
			timing.todoStoreOperation = getTodoStoreOperationData(timing.toolId, toolInput);
		}
	}

	toolCallCompleted(session: string, toolCallId: string, result: ToolCallResult): void {
		const key = this._key(session, toolCallId);
		const timing = this._toolCalls.get(key);
		if (!timing) {
			// No matching start: either the start was never observed, or this is
			// a duplicate completion (the entry was already consumed). Either
			// way, do not emit so volume stays accurate.
			return;
		}
		this._toolCalls.delete(key);
		const resultBucket = deriveToolInvokedResult(result);
		const totalTimeMs = timing.lifecycleStopWatch.elapsed();
		const resultSizeInCharacters = JSON.stringify(result).length;

		const report: IAgentHostToolInvokedReport = {
			provider: timing.provider,
			session: timing.session,
			turnId: timing.turnId,
			toolId: timing.toolId,
			toolSourceKind: timing.toolSourceKind,
			toolCallId,
			result: resultBucket,
			invocationTimeMs: timing.invocationStopWatch?.elapsed(),
			resultSizeInCharacters,
			model: timing.model,
			modelTelemetryKind: timing.modelTelemetryKind,
		};
		if (timing.modelResolvedFromUsage) {
			this._reporter.toolInvoked(report);
		} else {
			const turnKey = this._turnKey(timing.session, timing.turnId);
			const pending = this._pendingToolReports.get(turnKey) ?? [];
			pending.push(report);
			this._pendingToolReports.set(turnKey, pending);
		}
		const todoStoreOperation = result.success ? timing.todoStoreOperation : undefined;
		if (todoStoreOperation) {
			this._reporter.todoStoreOperation({
				provider: timing.provider,
				session: timing.session,
				toolCallId,
				...todoStoreOperation,
			});
		}

		const stalled = this._stalledToolCalls.get(key);
		if (stalled) {
			this._stalledToolCalls.delete(key);
			this._reporter.stalledToolCallCompleted({
				provider: timing.provider,
				session: timing.session,
				blockerKind: stalled.blockerKind,
				toolId: timing.toolId,
				toolSourceKind: timing.toolSourceKind,
				result: resultBucket,
				totalTimeMs,
				timeAfterStallMs: stalled.completionStopWatch.elapsed(),
			});
		}
	}

	toolCallBlocked(provider: string, session: string, request: ToolCallBlockerRequest): void {
		const key = this._key(session, request.id);
		const toolCallKey = this._key(session, request.toolCall.toolCallId);
		if (this._toolCallStallTimers.has(key) || this._stalledToolCalls.has(toolCallKey)) {
			return;
		}

		const stopWatch = StopWatch.create(true);
		this._toolCallStallTimers.set(key, disposableTimeout(() => {
			const stalledTimeMs = stopWatch.elapsed();
			this._stalledToolCalls.set(toolCallKey, { blockerKind: request.kind, completionStopWatch: StopWatch.create(true) });
			this._reporter.toolCallStalled({
				provider,
				session,
				blockerKind: request.kind,
				toolId: request.toolCall.toolName,
				toolSourceKind: toolSourceKindFromContributor(request.toolCall.contributor),
				stalledTimeMs,
			});
		}, TOOL_CALL_STALL_THRESHOLD_MS));
	}

	toolCallUnblocked(session: string, requestId: string): void {
		this._toolCallStallTimers.deleteAndDispose(this._key(session, requestId));
	}

	/**
	 * Drops any in-flight (never-completed) tool calls for a session. Called
	 * when a turn ends or a session is torn down so the tracking map cannot
	 * leak. A no-op in the normal case where every tool call completes.
	 */
	clearSession(session: string): void {
		const prefix = `${session}\0`;
		for (const [key, reports] of this._pendingToolReports) {
			if (key.startsWith(prefix)) {
				this._pendingToolReports.delete(key);
				for (const report of reports) {
					this._reporter.toolInvoked(report);
				}
			}
		}
		for (const key of this._toolCalls.keys()) {
			if (key.startsWith(prefix)) {
				this._toolCalls.delete(key);
			}
		}
		for (const key of this._toolCallStallTimers.keys()) {
			if (key.startsWith(prefix)) {
				this._toolCallStallTimers.deleteAndDispose(key);
			}
		}
		for (const key of this._stalledToolCalls.keys()) {
			if (key.startsWith(prefix)) {
				this._stalledToolCalls.delete(key);
			}
		}
		for (const key of this._turnModels.keys()) {
			if (key.startsWith(prefix)) {
				this._turnModels.delete(key);
			}
		}
	}

	clear(): void {
		this._toolCalls.clear();
		this._turnModels.clear();
		this._pendingToolReports.clear();
		this._toolCallStallTimers.clearAndDisposeAll();
		this._stalledToolCalls.clear();
	}

	private _key(session: string, toolCallId: string): string {
		return `${session}\0${toolCallId}`;
	}

	private _turnKey(session: string, turnId: string): string {
		return `${session}\0${turnId}`;
	}
}

interface ITodoStoreOperationData {
	readonly operation: TodoStoreOperation;
	readonly target: TodoStoreTarget;
}

interface ISqlToken {
	readonly value: string;
	readonly kind: 'identifier' | 'punctuation';
}

export function getTodoStoreOperationData(toolId: string, toolInput: string | undefined): ITodoStoreOperationData | undefined {
	if (toolId !== 'sql') {
		return undefined;
	}

	const query = parseToolInput(toolInput)?.query;
	if (typeof query !== 'string') {
		return undefined;
	}

	const tokens = tokenizeSql(query);
	const readTargets = new Set<TodoStoreTarget>();
	const writeTargets = new Set<TodoStoreTarget>();
	const deleteFromIndexes = new Set<number>();

	for (let i = 0; i < tokens.length; i++) {
		switch (tokens[i].value) {
			case 'insert':
			case 'replace': {
				const intoIndex = findToken(tokens, i + 1, 'into', ['or', 'rollback', 'abort', 'replace', 'fail', 'ignore']);
				addTodoStoreTarget(writeTargets, readTableIdentifier(tokens, intoIndex + 1));
				break;
			}
			case 'update':
				addTodoStoreTarget(writeTargets, readTableIdentifier(tokens, i + 1, ['or', 'rollback', 'abort', 'replace', 'fail', 'ignore']));
				break;
			case 'delete': {
				const fromIndex = findToken(tokens, i + 1, 'from');
				deleteFromIndexes.add(fromIndex);
				addTodoStoreTarget(writeTargets, readTableIdentifier(tokens, fromIndex + 1));
				break;
			}
			case 'create':
			case 'drop':
			case 'alter': {
				const tableIndex = findToken(tokens, i + 1, 'table', ['temp', 'temporary']);
				addTodoStoreTarget(writeTargets, readTableIdentifier(tokens, tableIndex + 1, ['if', 'not', 'exists']));
				break;
			}
		}
	}

	for (let i = 0; i < tokens.length; i++) {
		if (tokens[i].value === 'from' && !deleteFromIndexes.has(i)) {
			addFromClauseTargets(tokens, i + 1, readTargets);
		} else if (tokens[i].value === 'join') {
			addTodoStoreTarget(readTargets, readTableIdentifier(tokens, i + 1));
		}
	}

	if (readTargets.size === 0 && writeTargets.size === 0) {
		return undefined;
	}

	const referencesTodos = readTargets.has('todos') || writeTargets.has('todos');
	const referencesTodoDeps = readTargets.has('todo_deps') || writeTargets.has('todo_deps');
	return {
		operation: readTargets.size > 0 && writeTargets.size > 0 ? 'mixed' : writeTargets.size > 0 ? 'write' : 'read',
		target: referencesTodos && referencesTodoDeps ? 'both' : referencesTodoDeps ? 'todo_deps' : 'todos',
	};
}

function tokenizeSql(query: string): ISqlToken[] {
	const tokens: ISqlToken[] = [];
	for (let i = 0; i < query.length;) {
		const char = query[i];
		const next = query[i + 1];
		if (/\s/.test(char)) {
			i++;
		} else if (char === '-' && next === '-') {
			i = skipUntil(query, i + 2, '\n');
		} else if (char === '/' && next === '*') {
			i = skipUntil(query, i + 2, '*/');
		} else if (char === '\'') {
			i = skipQuoted(query, i + 1, '\'', '\'');
		} else if (char === '"' || char === '`') {
			const end = skipQuoted(query, i + 1, char, char);
			tokens.push({ value: query.slice(i + 1, end - 1).replaceAll(char + char, char).toLowerCase(), kind: 'identifier' });
			i = end;
		} else if (char === '[') {
			const end = skipQuoted(query, i + 1, ']', ']');
			tokens.push({ value: query.slice(i + 1, end - 1).replaceAll(']]', ']').toLowerCase(), kind: 'identifier' });
			i = end;
		} else if (/[a-z_$]/i.test(char)) {
			let end = i + 1;
			while (end < query.length && /[\w$]/.test(query[end])) {
				end++;
			}
			tokens.push({ value: query.slice(i, end).toLowerCase(), kind: 'identifier' });
			i = end;
		} else {
			if (char === '.' || char === ',' || char === '(' || char === ')' || char === ';') {
				tokens.push({ value: char, kind: 'punctuation' });
			}
			i++;
		}
	}
	return tokens;
}

function skipUntil(query: string, start: number, terminator: string): number {
	const index = query.indexOf(terminator, start);
	return index === -1 ? query.length : index + terminator.length;
}

function skipQuoted(query: string, start: number, terminator: string, escape: string): number {
	for (let i = start; i < query.length; i++) {
		if (query[i] !== terminator) {
			continue;
		}
		if (query[i + 1] === escape) {
			i++;
		} else {
			return i + 1;
		}
	}
	return query.length;
}

function findToken(tokens: readonly ISqlToken[], start: number, value: string, skippedValues: readonly string[] = []): number {
	for (let i = start; i < tokens.length && tokens[i].value !== ';'; i++) {
		if (tokens[i].value === value) {
			return i;
		}
		if (!skippedValues.includes(tokens[i].value)) {
			break;
		}
	}
	return -1;
}

function readTableIdentifier(tokens: readonly ISqlToken[], start: number, skippedValues: readonly string[] = []): string | undefined {
	let index = start;
	while (index < tokens.length && skippedValues.includes(tokens[index].value)) {
		index++;
	}
	if (tokens[index]?.kind !== 'identifier') {
		return undefined;
	}

	let table = tokens[index].value;
	while (tokens[index + 1]?.value === '.' && tokens[index + 2]?.kind === 'identifier') {
		table = tokens[index + 2].value;
		index += 2;
	}
	return table;
}

function addFromClauseTargets(tokens: readonly ISqlToken[], start: number, targets: Set<TodoStoreTarget>): void {
	const terminators = new Set(['where', 'group', 'order', 'having', 'limit', 'union', 'intersect', 'except', 'returning', 'set', 'values', ';']);
	let expectsTable = true;
	let depth = 0;
	for (let i = start; i < tokens.length; i++) {
		const value = tokens[i].value;
		if (value === '(') {
			if (depth === 0 && expectsTable) {
				expectsTable = false;
			}
			depth++;
		} else if (value === ')') {
			if (depth === 0) {
				return;
			}
			depth--;
		} else if (depth === 0 && terminators.has(value)) {
			return;
		} else if (depth === 0 && (value === ',' || value === 'join')) {
			expectsTable = true;
		} else if (depth === 0 && expectsTable && tokens[i].kind === 'identifier') {
			addTodoStoreTarget(targets, readTableIdentifier(tokens, i));
			expectsTable = false;
		}
	}
}

function addTodoStoreTarget(targets: Set<TodoStoreTarget>, identifier: string | undefined): void {
	if (identifier === 'todos' || identifier === 'todo_deps') {
		targets.add(identifier);
	}
}

function parseToolInput(toolInput: string | undefined): Record<string, unknown> | undefined {
	if (toolInput === undefined) {
		return undefined;
	}
	try {
		const parsed: unknown = JSON.parse(toolInput);
		return isRecord(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
