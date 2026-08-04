/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const DEFAULT_CREATED_AT = Date.UTC(2026, 0, 1, 12, 0, 0);
const DEFAULT_WORKSPACE = '/tmp/vscode-agents-perf-workspace';
const INTERNAL_TOOL_SOURCE = { type: 'internal', label: 'Built-In' };

const AGENTS_WINDOW_PERF_SCENARIO_ID = 'agents-restored-history';
const AGENTS_WINDOW_CONCURRENT_SCENARIO_ID = 'agents-concurrent-sessions';
const INJECT_AGENTS_PERF_LIVE_SUBAGENT_COMMAND_ID = '_workbench.sessions.perf.injectLiveSubagentTools';
const SCROLL_START_AGENTS_PERF_CHAT_COMMAND_ID = '_workbench.sessions.perf.scrollActiveChatStart';
const SCROLL_END_AGENTS_PERF_CHAT_COMMAND_ID = '_workbench.sessions.perf.scrollActiveChatEnd';
const SHOW_AGENTS_PERF_CONCURRENT_SESSIONS_COMMAND_ID = '_workbench.sessions.perf.showConcurrentSessions';
const RUN_AGENTS_PERF_CONCURRENT_BURST_COMMAND_ID = '_workbench.sessions.perf.runConcurrentBurst';
const STOP_AGENTS_PERF_CONCURRENT_SESSIONS_COMMAND_ID = '_workbench.sessions.perf.stopConcurrentSessions';
const AGENTS_PERF_CONCURRENT_BURST_TICKS = 48;
const AGENTS_PERF_CONCURRENT_FINAL_MARKER = `AGENTS_PERF_CONCURRENT_${String(AGENTS_PERF_CONCURRENT_BURST_TICKS - 1).padStart(3, '0')}`;
const AGENTS_PERF_CONCURRENT_DONE_MARKER = 'AGENTS_PERF_CONCURRENT_DONE';

interface IUriData {
	readonly scheme: string;
	readonly authority: string;
	readonly path: string;
	readonly query: string;
	readonly fragment: string;
}

interface IAgentsWindowPerfCorpusOptions {
	readonly sessionCount?: number;
	readonly primaryTurnCount?: number;
	readonly secondaryTurnCount?: number;
	readonly peerChatCount?: number;
	readonly subagentToolCount?: number;
}

interface IStoredSession {
	readonly uri: IUriData;
	readonly parentUri?: IUriData;
	readonly title: string;
	readonly createdAt: number;
	readonly lastMessageDate: number;
	readonly workingDirectory: IUriData;
	readonly isRead: boolean;
}

interface IChatIndexEntry {
	readonly sessionId: string;
	readonly title: string;
	readonly lastMessageDate: number;
	readonly timing: {
		readonly created: number;
		readonly lastRequestStarted: number;
		readonly lastRequestEnded: number;
	};
	readonly initialLocation: 'panel';
	readonly lastResponseState: number;
	readonly workingDirectory: string;
}

interface IMarkdownPart {
	readonly value: string;
	readonly isTrusted: false;
	readonly supportThemeIcons: false;
	readonly supportHtml: false;
}

interface ISerializedToolOptions {
	readonly toolCallId: string;
	readonly toolId: string;
	readonly invocationMessage: string;
	readonly pastTenseMessage: string;
	readonly isComplete?: boolean;
	readonly subAgentInvocationId?: string;
	readonly toolSpecificData?: {
		readonly kind: 'subagent';
		readonly agentName: string;
		readonly description: string;
		readonly prompt: string;
		readonly isActive: boolean;
		readonly startedAt?: number;
	};
}

interface ISerializedTool extends ISerializedToolOptions {
	readonly kind: 'toolInvocationSerialized';
	readonly originMessage: undefined;
	readonly isConfirmed: { readonly type: 0 };
	readonly isComplete: boolean;
	readonly source: typeof INTERNAL_TOOL_SOURCE;
	readonly presentation: undefined;
	readonly resultDetails: undefined;
}

type SerializedResponsePart = IMarkdownPart | ISerializedTool;

interface ISerializedRequest {
	readonly requestId: string;
	readonly message: string;
	readonly variableData: { readonly variables: readonly [] };
	readonly response: SerializedResponsePart[];
	readonly responseId: string;
	readonly timestamp: number;
	readonly responseTimestamp: number;
	readonly modelState: { readonly value: 1; readonly completedAt: number };
	readonly elapsedMs: number;
}

interface ISerializedChat {
	readonly version: 3;
	readonly sessionId: string;
	readonly creationDate: number;
	readonly customTitle: string;
	readonly initialLocation: 'panel';
	readonly responderUsername: 'Copilot';
	readonly requests: ISerializedRequest[];
	readonly workingDirectory: string;
}

interface IAgentsWindowPerfCorpus {
	readonly storedSessions: IStoredSession[];
	readonly chatSessionIndex: { readonly version: 1; readonly entries: Record<string, IChatIndexEntry> };
	readonly chatFiles: Record<string, ISerializedChat>;
	readonly expected: {
		readonly sessionCount: number;
		readonly chatCount: number;
		readonly primarySessionId: string;
		readonly primaryTitle: string;
		readonly primarySentinel: string;
		readonly secondarySessionId: string;
		readonly secondaryTitle: string;
		readonly secondarySentinel: string;
		readonly primaryTurnCount: number;
		readonly subagentToolCount: number;
		readonly workspaceFsPath: string;
	};
}

function createAgentsWindowPerfCorpus(options: IAgentsWindowPerfCorpusOptions = {}): IAgentsWindowPerfCorpus {
	const sessionCount = options.sessionCount ?? 24;
	const primaryTurnCount = options.primaryTurnCount ?? 220;
	const secondaryTurnCount = options.secondaryTurnCount ?? 18;
	const peerChatCount = options.peerChatCount ?? 3;
	const subagentToolCount = options.subagentToolCount ?? 128;

	if (sessionCount < 2) {
		throw new Error('Agents window perf corpus requires at least two sessions');
	}

	const storedSessions: IStoredSession[] = [];
	const entries: Record<string, IChatIndexEntry> = {};
	const chatFiles: Record<string, ISerializedChat> = {};
	const workspaceUri = fileUri(DEFAULT_WORKSPACE);
	const workspaceUriString = `file://${DEFAULT_WORKSPACE}`;

	for (let index = 0; index < sessionCount; index++) {
		const sessionId = `agents-perf-session-${String(index).padStart(3, '0')}`;
		const title = index === 0 ? 'Agents Perf Primary Large History' : `Agents Perf Session ${String(index).padStart(3, '0')}`;
		const turnCount = index === 0 ? primaryTurnCount : secondaryTurnCount;
		const updatedAt = DEFAULT_CREATED_AT - index * 60_000;
		const sentinel = index === 0 ? 'AGENTS_PERF_PRIMARY_SENTINEL' : `AGENTS_PERF_SESSION_${String(index).padStart(3, '0')}_SENTINEL`;
		const uri = localChatSessionUri(sessionId);

		storedSessions.push({
			uri,
			title,
			createdAt: updatedAt - turnCount * 1_000,
			lastMessageDate: updatedAt,
			workingDirectory: workspaceUri,
			isRead: true,
		});
		entries[sessionId] = createIndexEntry(sessionId, title, updatedAt, workspaceUriString);
		chatFiles[sessionId] = createSerializedChat({
			sessionId,
			title,
			turnCount,
			createdAt: updatedAt - turnCount * 1_000,
			updatedAt,
			workspaceUriString,
			sentinel,
			subagentToolCount: index === 0 ? subagentToolCount : 0,
		});
	}

	const primarySessionId = 'agents-perf-session-000';
	const primaryUri = localChatSessionUri(primarySessionId);
	for (let index = 0; index < peerChatCount; index++) {
		const sessionId = `agents-perf-peer-${String(index).padStart(3, '0')}`;
		const title = `Agents Perf Peer Chat ${String(index).padStart(3, '0')}`;
		const updatedAt = DEFAULT_CREATED_AT - (sessionCount + index) * 60_000;
		storedSessions.push({
			uri: localChatSessionUri(sessionId),
			parentUri: primaryUri,
			title,
			createdAt: updatedAt - secondaryTurnCount * 1_000,
			lastMessageDate: updatedAt,
			workingDirectory: workspaceUri,
			isRead: true,
		});
		entries[sessionId] = createIndexEntry(sessionId, title, updatedAt, workspaceUriString);
		chatFiles[sessionId] = createSerializedChat({
			sessionId,
			title,
			turnCount: secondaryTurnCount,
			createdAt: updatedAt - secondaryTurnCount * 1_000,
			updatedAt,
			workspaceUriString,
			sentinel: `AGENTS_PERF_PEER_${String(index).padStart(3, '0')}_SENTINEL`,
			subagentToolCount: 0,
		});
	}

	return {
		storedSessions,
		chatSessionIndex: { version: 1, entries },
		chatFiles,
		expected: {
			sessionCount,
			chatCount: sessionCount + peerChatCount,
			primarySessionId,
			primaryTitle: 'Agents Perf Primary Large History',
			primarySentinel: 'AGENTS_PERF_PRIMARY_SENTINEL',
			secondarySessionId: 'agents-perf-session-001',
			secondaryTitle: 'Agents Perf Session 001',
			secondarySentinel: 'AGENTS_PERF_SESSION_001_SENTINEL',
			primaryTurnCount,
			subagentToolCount,
			workspaceFsPath: DEFAULT_WORKSPACE,
		},
	};
}

function createAgentsWindowConcurrentPerfCorpus(): IAgentsWindowPerfCorpus {
	return createAgentsWindowPerfCorpus({
		sessionCount: 3,
		primaryTurnCount: 40,
		secondaryTurnCount: 40,
		peerChatCount: 0,
		subagentToolCount: 0,
	});
}

interface ICreateSerializedChatOptions {
	readonly sessionId: string;
	readonly title: string;
	readonly turnCount: number;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly workspaceUriString: string;
	readonly sentinel: string;
	readonly subagentToolCount: number;
}

function createSerializedChat(options: ICreateSerializedChatOptions): ISerializedChat {
	const requests: ISerializedRequest[] = [];
	const subagentTurn = Math.floor(options.turnCount / 2);

	for (let index = 0; index < options.turnCount; index++) {
		const timestamp = options.createdAt + index * 1_000;
		const response: SerializedResponsePart[] = [
			markdownPart([
				index === 0 || index === options.turnCount - 1 ? `${options.sentinel}\n\n` : '',
				`## Restored turn ${index + 1}\n\n`,
				`Deterministic restored response ${index + 1} for ${options.title}. `,
				'This content exercises virtualized chat row rendering, recycling, dynamic height measurement, and scrolling.\n\n',
				index % 7 === 0 ? '```typescript\nconst restoredTurn = true;\n```\n' : '',
			].join('')),
		];

		if (index % 4 === 0) {
			response.push(serializedTool({
				toolCallId: `${options.sessionId}-tool-${index}`,
				toolId: 'read_file',
				invocationMessage: `Reading restored file ${index}`,
				pastTenseMessage: `Read restored file ${index}`,
			}));
		}

		if (options.subagentToolCount > 0 && index === subagentTurn) {
			const parentToolCallId = `${options.sessionId}-subagent`;
			response.push(serializedTool({
				toolCallId: parentToolCallId,
				toolId: 'runSubagent',
				invocationMessage: 'Running restored performance subagent',
				pastTenseMessage: 'Ran restored performance subagent',
				isComplete: false,
				toolSpecificData: {
					kind: 'subagent',
					agentName: 'PerfAgent',
					description: 'Inspecting a large restored history',
					prompt: 'Inspect the deterministic performance corpus.',
					isActive: true,
					startedAt: timestamp,
				},
			}));
			for (let childIndex = 0; childIndex < options.subagentToolCount; childIndex++) {
				response.push(serializedTool({
					toolCallId: `${parentToolCallId}-child-${childIndex}`,
					toolId: childIndex % 2 === 0 ? 'search_files' : 'read_file',
					invocationMessage: `Restored subagent tool ${childIndex}`,
					pastTenseMessage: `Completed restored subagent tool ${childIndex}`,
					subAgentInvocationId: parentToolCallId,
				}));
			}
		}

		requests.push({
			requestId: `${options.sessionId}-request-${index}`,
			message: `Restore performance turn ${index + 1}`,
			variableData: { variables: [] },
			response,
			responseId: `${options.sessionId}-response-${index}`,
			timestamp,
			responseTimestamp: timestamp + 500,
			modelState: { value: 1, completedAt: timestamp + 750 },
			elapsedMs: 750,
		});
	}

	return {
		version: 3,
		sessionId: options.sessionId,
		creationDate: options.createdAt,
		customTitle: options.title,
		initialLocation: 'panel',
		responderUsername: 'Copilot',
		requests,
		workingDirectory: options.workspaceUriString,
	};
}

function serializedTool(options: ISerializedToolOptions): ISerializedTool {
	return {
		kind: 'toolInvocationSerialized',
		toolCallId: options.toolCallId,
		toolId: options.toolId,
		invocationMessage: options.invocationMessage,
		originMessage: undefined,
		pastTenseMessage: options.pastTenseMessage,
		isConfirmed: { type: 0 },
		isComplete: options.isComplete ?? true,
		source: INTERNAL_TOOL_SOURCE,
		presentation: undefined,
		resultDetails: undefined,
		subAgentInvocationId: options.subAgentInvocationId,
		toolSpecificData: options.toolSpecificData,
	};
}

function markdownPart(value: string): IMarkdownPart {
	return { value, isTrusted: false, supportThemeIcons: false, supportHtml: false };
}

function localChatSessionUri(sessionId: string): IUriData {
	const encodedId = Buffer.from(sessionId, 'utf8').toString('base64url');
	return {
		scheme: 'vscode-chat-session',
		authority: 'local',
		path: `/${encodedId}`,
		query: '',
		fragment: '',
	};
}

function fileUri(fsPath: string): IUriData {
	return { scheme: 'file', authority: '', path: fsPath, query: '', fragment: '' };
}

function createIndexEntry(sessionId: string, title: string, updatedAt: number, workingDirectory: string): IChatIndexEntry {
	return {
		sessionId,
		title,
		lastMessageDate: updatedAt,
		timing: {
			created: updatedAt - 60_000,
			lastRequestStarted: updatedAt - 1_000,
			lastRequestEnded: updatedAt,
		},
		initialLocation: 'panel',
		lastResponseState: 1,
		workingDirectory,
	};
}

module.exports = {
	AGENTS_WINDOW_PERF_SCENARIO_ID,
	AGENTS_WINDOW_CONCURRENT_SCENARIO_ID,
	AGENTS_PERF_CONCURRENT_BURST_TICKS,
	AGENTS_PERF_CONCURRENT_FINAL_MARKER,
	AGENTS_PERF_CONCURRENT_DONE_MARKER,
	INJECT_AGENTS_PERF_LIVE_SUBAGENT_COMMAND_ID,
	SCROLL_START_AGENTS_PERF_CHAT_COMMAND_ID,
	SCROLL_END_AGENTS_PERF_CHAT_COMMAND_ID,
	SHOW_AGENTS_PERF_CONCURRENT_SESSIONS_COMMAND_ID,
	RUN_AGENTS_PERF_CONCURRENT_BURST_COMMAND_ID,
	STOP_AGENTS_PERF_CONCURRENT_SESSIONS_COMMAND_ID,
	createAgentsWindowPerfCorpus,
	createAgentsWindowConcurrentPerfCorpus,
};
