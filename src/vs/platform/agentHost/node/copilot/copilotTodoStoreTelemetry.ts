/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import type { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { AgentSession } from '../../common/agent.js';
import type { IAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { isSubagentSession } from '../../common/state/sessionState.js';
import { toInitiatorTelemetry, type IAgentHostEventClassification, type IAgentHostEventTelemetry } from '../agentHostTelemetryReporter.js';

type TodoStoreOperation = 'read' | 'write' | 'mixed';
type TodoStoreTarget = 'todos' | 'todo_deps' | 'both';

type TodoStoreOperationEvent = IAgentHostEventTelemetry & {
	operation: TodoStoreOperation;
	target: TodoStoreTarget;
	toolCallId: string;
	provider: string;
	agentSessionId: string;
	isSubagentSession: boolean;
};

type TodoStoreOperationClassification = IAgentHostEventClassification & {
	operation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the SQL operation read from, wrote to, or both read from and wrote to todo storage.' };
	target: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the SQL operation referenced todo items, todo dependencies, or both.' };
	toolCallId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the SQL tool call, used to correlate with generic tool telemetry.' };
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the todo storage operation belongs to a subagent session.' };
	owner: 'amunger';
	comment: 'Tracks successful Copilot CLI SQL operations that access todo item or dependency storage.';
};

interface ITodoStoreOperationData {
	readonly operation: TodoStoreOperation;
	readonly target: TodoStoreTarget;
}

interface ISqlToken {
	readonly value: string;
	readonly kind: 'identifier' | 'punctuation';
}

export function reportCopilotTodoStoreOperation(telemetryService: ITelemetryService, session: URI, toolCallId: string, toolName: string, toolInput: Readonly<Record<string, unknown>> | undefined, clientContext?: IAgentHostClientTelemetryContext): void {
	const operation = getCopilotTodoStoreOperationData(toolName, toolInput);
	if (!operation) {
		return;
	}

	telemetryService.publicLog2<TodoStoreOperationEvent, TodoStoreOperationClassification>('todoStoreOperation', {
		...toInitiatorTelemetry(clientContext),
		...operation,
		toolCallId,
		provider: session.scheme,
		agentSessionId: AgentSession.id(session),
		isSubagentSession: isSubagentSession(session),
	});
}

export function getCopilotTodoStoreOperationData(toolName: string, toolInput: Readonly<Record<string, unknown>> | undefined): ITodoStoreOperationData | undefined {
	if (toolName !== 'sql') {
		return undefined;
	}

	const query = toolInput?.query;
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
