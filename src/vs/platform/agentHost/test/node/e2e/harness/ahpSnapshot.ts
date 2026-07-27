/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createRequire } from 'module';
import { readFileSync, realpathSync, writeFileSync } from 'fs';
import { FileAccess } from '../../../../../../base/common/network.js';
import { dirname, win32 } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { assertSnapshot } from '../../../../../../base/test/common/snapshot.js';
import { ActionType, type ActionEnvelope, type StateAction } from '../../../../common/state/sessionActions.js';
import type { DispatchActionParams } from '../../../../common/state/protocol/commands.js';
import type { AhpNotification } from '../../../../common/state/sessionProtocol.js';
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallContributorKind, ToolResultContentType, buildDefaultChatUri, type StringOrMarkdown, type ToolCallContributor } from '../../../../common/state/sessionState.js';

const nodeRequire = createRequire(import.meta.url);
const yamlModule = nodeRequire('js-yaml') as { load(input: string): unknown; dump(obj: unknown, opts?: { lineWidth?: number; noRefs?: boolean }): string };
const PLACEHOLDER_RE = /^\$\{(?<kind>[a-zA-Z]+)_(?<index>\d+)\}$/;

export const AgentHostUpdateAhpSnapshotsEnvVar = 'AGENT_HOST_UPDATE_AHP_SNAPSHOTS';
export const AgentHostUpdateSnapshotsEnvVar = 'AGENT_HOST_UPDATE_SNAPSHOTS';

const UPDATE_AHP_SNAPSHOTS = process.env[AgentHostUpdateAhpSnapshotsEnvVar] === '1';
const UPDATE_ALL_SNAPSHOTS = process.env[AgentHostUpdateSnapshotsEnvVar] === '1';

type AhpSnapshotDirection = 'c2s' | 's2c';

interface ICapturedAhpMessage {
	readonly direction: AhpSnapshotDirection;
	readonly message: object;
}

interface IMethodMessage {
	readonly method: string;
	readonly id?: number;
	readonly params?: unknown;
}

interface IResponseMessage {
	readonly id: number;
	readonly result?: unknown;
	readonly error?: {
		readonly code: number;
		readonly message: string;
	};
}

interface IAhpSnapshotEntry {
	readonly channel?: string;
	readonly action?: Record<string, unknown>;
	readonly method?: string;
}

interface IAhpSnapshotRound {
	readonly clientToServer: readonly IAhpSnapshotEntry[];
	readonly serverToClient: readonly IAhpSnapshotEntry[];
}

interface IAhpSnapshotFixture {
	readonly version: 1;
	readonly rounds: readonly IAhpSnapshotRound[];
}

interface IAhpSnapshotClient {
	beginAhpSnapshotRound(): void;
	dispatch(params: DispatchActionParams): void;
	receivedNotifications(): AhpNotification[];
	waitForNotification(predicate: (notification: AhpNotification) => boolean, timeoutMs?: number): Promise<AhpNotification>;
	serializeAhpSnapshot(options?: IAhpSnapshotOptions): string;
	takeReplayError(): Error | undefined;
}

export interface IAhpSnapshotOptions {
	readonly profile?: 'protocol' | 'behavior';
}

export interface IAhpSnapshotNormalization {
	readonly workingDirectory: string;
	readonly homeDirectory: string;
	readonly userName: string;
}

/** Captures AHP wire messages and serializes a stable semantic projection for snapshots. */
export class AhpSnapshotRecorder {
	private readonly _messages: ICapturedAhpMessage[] = [];
	private readonly _roundStarts: number[] = [];
	private _normalization: IAhpSnapshotNormalization | undefined;

	setNormalization(normalization: IAhpSnapshotNormalization): void {
		this._normalization = normalization;
	}

	record(direction: AhpSnapshotDirection, message: object): void {
		this._messages.push({ direction, message });
	}

	beginRound(): void {
		this._roundStarts.push(this._messages.length);
	}

	clear(): void {
		this._messages.length = 0;
		this._roundStarts.length = 0;
	}

	serialize(options: IAhpSnapshotOptions = {}): string {
		const profile = options.profile ?? 'protocol';
		const clientRequests = new Map<number, string>();
		const serverRequests = new Map<number, string>();
		const channels = new Map<string, string>();
		const channelCounts = new Map<string, number>();
		const turns = new Map<string, string>();
		const toolCalls = new Map<string, string>();
		const responseParts = new Map<string, { content: string }>();
		const roundStarts = this._roundStarts.length > 0 ? this._roundStarts : [0];
		const rounds = roundStarts.map(() => ({ clientToServer: [] as object[], serverToClient: [] as object[] }));
		let roundIndex = 0;

		for (let messageIndex = 0; messageIndex < this._messages.length; messageIndex++) {
			while (roundIndex + 1 < roundStarts.length && messageIndex >= roundStarts[roundIndex + 1]) {
				roundIndex++;
			}
			const { direction, message } = this._messages[messageIndex];
			let projected: object;
			if (isMethodMessage(message)) {
				if (message.id !== undefined) {
					(direction === 'c2s' ? clientRequests : serverRequests).set(message.id, message.method);
				}
				// notifications/tools/list_changed is legitimate behavior (Copilot >= 1.0.72
				// emits session.tools_updated), but it is only forwarded for MCP servers
				// in the Ready state. The harness runs against the real homedir, so the
				// notification appears when the developer's ~/.copilot configures MCP
				// servers and is absent on clean CI runners — it cannot live in a
				// machine-independent snapshot.
				if (message.method === 'root/sessionSummaryChanged' || message.method === 'notifications/tools/list_changed') {
					continue;
				}
				if (message.method === 'dispatchAction' || message.method === 'action') {
					const params = asRecord(message.params);
					const action = params?.action as StateAction | undefined;
					if (action) {
						if (action.type === ActionType.SessionCustomizationUpdated) {
							continue;
						}
						if (profile === 'behavior' && isBehaviorSnapshotNoise(action.type)) {
							continue;
						}
						const channel = typeof params?.channel === 'string' ? params.channel : '';
						const projectedAction = projectAction(action, turns, toolCalls, responseParts, channel, profile);
						if (!projectedAction) {
							continue;
						}
						projected = {
							channel: normalizeChannel(params?.channel, channels, channelCounts),
							action: projectedAction,
						};
					} else {
						projected = { method: message.method };
					}
				} else {
					projected = { method: message.method };
				}
			} else if (isResponseMessage(message)) {
				const requests = direction === 'c2s' ? serverRequests : clientRequests;
				projected = {
					responseTo: requests.get(message.id) ?? `request-${message.id}`,
					...(message.error ? { error: { code: message.error.code, message: message.error.message } } : { result: 'success' }),
				};
			} else {
				projected = { message: 'unparsed' };
			}

			(direction === 'c2s' ? rounds[roundIndex].clientToServer : rounds[roundIndex].serverToClient).push(projected);
		}

		for (const round of rounds) {
			normalizeSnapshotObjects(round.clientToServer, this._normalization);
			normalizeSnapshotObjects(round.serverToClient, this._normalization);
		}
		return serializeFixture({ version: 1, rounds });
	}
}

/** Records code-driven AHP traffic during snapshot updates and asserts it during replay. */
export async function assertRecordedAhpSnapshot(test: Mocha.Runnable, client: IAhpSnapshotClient, options?: IAhpSnapshotOptions): Promise<void> {
	const actual = client.serializeAhpSnapshot(options);
	if (UPDATE_AHP_SNAPSHOTS || UPDATE_ALL_SNAPSHOTS) {
		writeFileSync(snapshotPathForTest(test), actual);
		return;
	}
	await assertSnapshot(actual, { name: 'traffic', extension: 'ahp.yaml' });
}

/** Loads client actions from an AHP snapshot, dispatches them, and asserts the resulting traffic. */
export class AhpSnapshotScenario {
	private constructor(
		private readonly _fixturePath: string,
		private readonly _fixture: IAhpSnapshotFixture,
	) { }

	static load(test: Mocha.Runnable): AhpSnapshotScenario {
		const fixturePath = snapshotPathForTest(test);
		return new AhpSnapshotScenario(fixturePath, parseFixture(yamlModule.load(readFileSync(fixturePath, 'utf8')), fixturePath));
	}

	get clientId(): string {
		for (const round of this._fixture.rounds) {
			for (const entry of round.clientToServer) {
				if (entry.action?.type === ActionType.SessionActiveClientSet) {
					return readString(readRecord(entry.action.activeClient, 'activeClient'), 'clientId');
				}
			}
		}
		throw new Error('[ahp-snapshot] scenario must set an active client so its client id can initialize the session');
	}

	async run(client: IAhpSnapshotClient, sessionUri: string): Promise<void> {
		const bindings = new Map<string, string>([
			['${session_0}', sessionUri],
			['${chat_0}', buildDefaultChatUri(sessionUri)],
		]);
		const seenPrerequisites = new Set<object>();
		let clientSeq = 1;

		for (const round of this._fixture.rounds) {
			const notificationsBeforeRound = new Set<object>(client.receivedNotifications());
			client.beginAhpSnapshotRound();
			for (const entry of round.clientToServer) {
				if (!entry.channel || !entry.action) {
					throw new Error('[ahp-snapshot] clientToServer entries must be dispatch actions');
				}

				await bindPrerequisites(client, entry.action, bindings, seenPrerequisites);
				bindGeneratedIdentifiers(entry.action, bindings);
				client.dispatch({
					channel: resolvePlaceholder(entry.channel, bindings),
					clientSeq: clientSeq++,
					action: parseClientAction(resolvePlaceholders(entry.action, bindings)),
				});
			}
			await waitForFinalServerMessage(client, round.serverToClient, notificationsBeforeRound);
		}

		const actual = client.serializeAhpSnapshot();
		if (UPDATE_AHP_SNAPSHOTS || UPDATE_ALL_SNAPSHOTS) {
			const actualFixture = parseFixture(yamlModule.load(actual), 'recorded AHP traffic');
			if (actualFixture.rounds.length !== this._fixture.rounds.length) {
				throw new Error(`[ahp-snapshot] expected ${this._fixture.rounds.length} recorded rounds, got ${actualFixture.rounds.length}`);
			}
			writeFileSync(this._fixturePath, serializeFixture({
				version: 1,
				rounds: this._fixture.rounds.map((round, index) => ({
					clientToServer: round.clientToServer,
					serverToClient: actualFixture.rounds[index].serverToClient,
				})),
			}));
		} else {
			await assertSnapshot(actual, { name: 'traffic', extension: 'ahp.yaml' });
		}
	}
}

function isMethodMessage(message: object): message is IMethodMessage {
	return 'method' in message && typeof message.method === 'string';
}

function isResponseMessage(message: object): message is IResponseMessage {
	return 'id' in message && typeof message.id === 'number' && !('method' in message);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function normalizeChannel(value: unknown, channels: Map<string, string>, channelCounts: Map<string, number>): string {
	if (typeof value !== 'string') {
		return '${channel}';
	}

	const existing = channels.get(value);
	if (existing) {
		return existing;
	}

	let kind = 'channel';
	try {
		const scheme = URI.parse(value).scheme;
		if (scheme === 'agenthost') {
			return value;
		}
		kind = scheme === 'ahp-chat' ? 'chat' : scheme.includes('terminal') ? 'terminal' : 'session';
	} catch {
		// Keep the generic channel kind for non-URI values.
	}

	const index = channelCounts.get(kind) ?? 0;
	channelCounts.set(kind, index + 1);
	const normalized = `\${${kind}_${index}}`;
	channels.set(value, normalized);
	return normalized;
}

function projectAction(
	action: StateAction,
	turns: Map<string, string>,
	toolCalls: Map<string, string>,
	responseParts: Map<string, { content: string }>,
	channel: string,
	profile: NonNullable<IAhpSnapshotOptions['profile']>,
): object | undefined {
	switch (action.type) {
		case ActionType.SessionActiveClientSet:
			return {
				type: action.type,
				activeClient: {
					clientId: action.activeClient.clientId,
					displayName: action.activeClient.displayName,
					tools: action.activeClient.tools.map(tool => ({
						name: tool.name,
						description: tool.description,
						inputSchema: tool.inputSchema,
					})),
				},
			};
		case ActionType.ChatTurnStarted:
			return {
				type: action.type,
				turnId: normalizeIdentifier(action.turnId, 'turn', turns),
				message: {
					text: action.message.text,
					origin: { kind: action.message.origin.kind },
					...(action.message.model ? { model: { id: action.message.model.id } } : {}),
				},
			};
		case ActionType.ChatResponsePart: {
			if (action.part.kind === ResponsePartKind.Markdown || action.part.kind === ResponsePartKind.Reasoning) {
				const part = { kind: action.part.kind, content: action.part.content };
				responseParts.set(responsePartKey(channel, action.part.id), part);
				return {
					type: action.type,
					turnId: normalizeIdentifier(action.turnId, 'turn', turns),
					part,
				};
			}
			return {
				type: action.type,
				turnId: normalizeIdentifier(action.turnId, 'turn', turns),
				part: { kind: action.part.kind },
			};
		}
		case ActionType.ChatDelta: {
			const part = responseParts.get(responsePartKey(channel, action.partId));
			if (part) {
				part.content += action.content;
				return undefined;
			}
			return {
				type: action.type,
				turnId: normalizeIdentifier(action.turnId, 'turn', turns),
				content: action.content,
			};
		}
		case ActionType.ChatToolCallStart:
			return {
				type: action.type,
				turnId: normalizeIdentifier(action.turnId, 'turn', turns),
				toolCallId: normalizeIdentifier(action.toolCallId, 'toolCall', toolCalls),
				toolName: action.toolName,
				...(profile === 'protocol' ? {
					displayName: action.displayName,
					contributor: projectContributor(action.contributor),
				} : {}),
			};
		case ActionType.ChatToolCallReady:
			return {
				type: action.type,
				turnId: normalizeIdentifier(action.turnId, 'turn', turns),
				toolCallId: normalizeIdentifier(action.toolCallId, 'toolCall', toolCalls),
				invocationMessage: projectStringOrMarkdown(action.invocationMessage),
				toolInput: action.toolInput,
				confirmed: action.confirmed,
			};
		case ActionType.ChatToolCallConfirmed:
			return {
				type: action.type,
				turnId: normalizeIdentifier(action.turnId, 'turn', turns),
				toolCallId: normalizeIdentifier(action.toolCallId, 'toolCall', toolCalls),
				approved: action.approved,
				...(action.approved ? { confirmed: action.confirmed } : { reason: action.reason }),
			};
		case ActionType.ChatToolCallComplete:
			return {
				type: action.type,
				turnId: normalizeIdentifier(action.turnId, 'turn', turns),
				toolCallId: normalizeIdentifier(action.toolCallId, 'toolCall', toolCalls),
				result: {
					success: action.result.success,
					...(profile === 'protocol' ? {
						pastTenseMessage: projectStringOrMarkdown(action.result.pastTenseMessage),
						content: action.result.content?.map(content => content.type === ToolResultContentType.Text
							? { type: content.type, text: content.text }
							: { type: content.type }),
					} : {}),
				},
			};
		case ActionType.ChatError:
			return profile === 'behavior' ? {
				type: action.type,
				turnId: normalizeIdentifier(action.turnId, 'turn', turns),
				error: {
					errorType: action.error.errorType,
					message: action.error.message,
				},
			} : { type: action.type };
		case ActionType.ChatUsage:
		case ActionType.ChatTurnComplete:
			return { type: action.type, turnId: normalizeIdentifier(action.turnId, 'turn', turns) };
		default:
			return { type: action.type };
	}
}

function isBehaviorSnapshotNoise(type: ActionType): boolean {
	switch (type) {
		case ActionType.SessionChatUpdated:
		case ActionType.SessionServerToolsChanged:
		case ActionType.SessionInputNeededSet:
		case ActionType.SessionInputNeededRemoved:
		case ActionType.SessionCustomizationsChanged:
		case ActionType.SessionChangesetsChanged:
		case ActionType.SessionMetaChanged:
		case ActionType.SessionActivityChanged:
		case ActionType.ChatActivityChanged:
		case ActionType.ChatUsage:
		case ActionType.ChatToolCallDelta:
		case ActionType.ChatToolCallReady:
		case ActionType.ChatToolCallConfirmed:
		case ActionType.ChatToolCallContentChanged:
			return true;
		default:
			return false;
	}
}

function responsePartKey(channel: string, partId: string): string {
	return `${channel}\0${partId}`;
}

function normalizeIdentifier(value: string, kind: string, identifiers: Map<string, string>): string {
	let normalized = identifiers.get(value);
	if (!normalized) {
		normalized = `\${${kind}_${identifiers.size}}`;
		identifiers.set(value, normalized);
	}
	return normalized;
}

function projectContributor(contributor: ToolCallContributor | undefined): object | undefined {
	if (!contributor) {
		return undefined;
	}
	return contributor.kind === ToolCallContributorKind.Client
		? { kind: contributor.kind, clientId: contributor.clientId }
		: { kind: contributor.kind, customizationId: contributor.customizationId };
}

function projectStringOrMarkdown(value: StringOrMarkdown): string {
	return typeof value === 'string' ? value : value.markdown;
}

function normalizeSnapshotObjects(values: object[], normalization: IAhpSnapshotNormalization | undefined): void {
	if (!normalization) {
		return;
	}
	for (let index = 0; index < values.length; index++) {
		values[index] = normalizeSnapshotObject(values[index], normalization);
	}
}

function normalizeSnapshotObject(value: object, normalization: IAhpSnapshotNormalization): object {
	if (Array.isArray(value)) {
		return value.map(item => normalizeSnapshotValue(item, normalization));
	}
	const result: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value)) {
		result[key] = normalizeSnapshotValue(item, normalization);
	}
	return result;
}

function normalizeSnapshotValue(value: unknown, normalization: IAhpSnapshotNormalization): unknown {
	if (typeof value === 'string') {
		return normalizeSnapshotText(value, normalization);
	}
	if (Array.isArray(value)) {
		return value.map(item => normalizeSnapshotValue(item, normalization));
	}
	if (value && typeof value === 'object') {
		return normalizeSnapshotObject(value, normalization);
	}
	return value;
}

function normalizeSnapshotText(value: string, normalization: IAhpSnapshotNormalization): string {
	const workDirs = new Set([normalization.workingDirectory]);
	try {
		workDirs.add(realpathSync.native(normalization.workingDirectory));
	} catch {
		// The workspace can be deleted during teardown after the traffic was captured.
	}
	let normalized = value;
	for (const workDir of [...workDirs].sort((a, b) => b.length - a.length)) {
		normalized = normalized
			.replaceAll(JSON.stringify(workDir).slice(1, -1), '${workdir}')
			.replaceAll(workDir, '${workdir}')
			.replaceAll(URI.file(workDir).toString(), '${workdir}');
	}
	normalized = normalized.replaceAll('/private${workdir}', '${workdir}');
	const tempRoots = new Set([...workDirs].flatMap(workDir => [dirname(workDir), win32.dirname(workDir)]).filter(root => root !== '.'));
	for (const tempRoot of tempRoots) {
		const win32FileUri = win32.isAbsolute(tempRoot) ? `file:///${tempRoot.replaceAll('\\', '/')}` : undefined;
		const rootVariants = new Set([
			tempRoot,
			JSON.stringify(tempRoot).slice(1, -1),
			URI.file(tempRoot).toString(),
			...(win32FileUri ? [win32FileUri] : []),
		]);
		for (const rootVariant of [...rootVariants].sort((a, b) => b.length - a.length)) {
			const escapedRoot = escapeRegExpCharacters(rootVariant);
			normalized = normalized.replace(new RegExp(`${escapedRoot}(?:/|\\\\|\\\\\\\\)ahp-coverage-[^\\s\`"')]*`, 'g'), '${workdir}');
		}
	}
	normalized = normalized
		.replaceAll(normalization.homeDirectory, '${homedir}')
		.replaceAll(URI.file(normalization.homeDirectory).toString(), '${homedir}')
		.replaceAll(normalization.userName, '${user}');
	if (!normalized.includes('${temp}')) {
		normalized = normalized.replace(/ahp-coverage-([a-z-]+)-[A-Za-z0-9]{6}/g, 'ahp-coverage-$1-${temp}');
	}
	normalized = normalized.replace(/<shellId: \d+/g, '<shellId: ${shellId}');
	return normalized.replace(/^[dlcbps-][rwxStTs-]{9}[+@.]?\s+\d+\s+\S+\s+\S+\s+\d+\s+\w{3}\s+\d{1,2}\s+(?:\d{2}:\d{2}|\d{4})\s+/gm, '${listing} ');
}

function escapeRegExpCharacters(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function snapshotPathForTest(test: Mocha.Runnable): string {
	if (!test.file) {
		throw new Error('[ahp-snapshot] current test file is not set');
	}
	const src = URI.joinPath(FileAccess.asFileUri(''), '../src');
	const parts = test.file.split(/[/\\]/g);
	const snapshotsDir = URI.joinPath(src, ...parts.slice(0, -1), '__snapshots__');
	const fileName = `${sanitizeName(test.fullTitle())}.traffic.ahp.yaml`;
	return URI.joinPath(snapshotsDir, fileName).fsPath;
}

function sanitizeName(name: string): string {
	return name.replace(/[^a-z0-9_-]/gi, '_');
}

function parseFixture(value: unknown, fixturePath: string): IAhpSnapshotFixture {
	const fixture = readRecord(value, 'fixture');
	if (fixture.version !== 1) {
		throw new Error(`[ahp-snapshot] unsupported fixture version in ${fixturePath}`);
	}
	if (!Array.isArray(fixture.rounds) || fixture.rounds.length === 0) {
		throw new Error(`[ahp-snapshot] rounds must be a non-empty array in ${fixturePath}`);
	}
	return {
		version: 1,
		rounds: fixture.rounds.map((value, index) => {
			const round = readRecord(value, `rounds[${index}]`);
			return {
				clientToServer: readEntries(round.clientToServer, `rounds[${index}].clientToServer`),
				serverToClient: readEntries(round.serverToClient, `rounds[${index}].serverToClient`),
			};
		}),
	};
}

function serializeFixture(fixture: IAhpSnapshotFixture): string {
	return yamlModule.dump(fixture, { lineWidth: -1, noRefs: true });
}

function readEntries(value: unknown, name: string): IAhpSnapshotEntry[] {
	if (!Array.isArray(value)) {
		throw new Error(`[ahp-snapshot] ${name} must be an array`);
	}
	return value.map((item, index) => {
		const entry = readRecord(item, `${name}[${index}]`);
		return {
			channel: readOptionalString(entry, 'channel'),
			action: entry.action === undefined ? undefined : readRecord(entry.action, `${name}[${index}].action`),
			method: readOptionalString(entry, 'method'),
		};
	});
}

async function bindPrerequisites(
	client: IAhpSnapshotClient,
	action: Record<string, unknown>,
	bindings: Map<string, string>,
	seenNotifications: Set<object>,
): Promise<void> {
	const actionType = readString(action, 'type');
	if (actionType !== ActionType.ChatToolCallConfirmed) {
		return;
	}

	const notification = await client.waitForNotification(candidate => {
		if (seenNotifications.has(candidate as object) || candidate.method !== 'action') {
			return false;
		}
		const action = (candidate.params as ActionEnvelope).action;
		return action.type === ActionType.ChatToolCallReady || action.type === ActionType.ChatError;
	}, 90_000);
	seenNotifications.add(notification as object);

	const readyAction = (notification.params as ActionEnvelope).action;
	if (readyAction.type === ActionType.ChatError) {
		const replayError = client.takeReplayError();
		if (replayError) {
			throw replayError;
		}
		throw new Error(`[ahp-snapshot] turn failed before chat/toolCallReady: ${readyAction.error.errorType}: ${readyAction.error.message}`);
	}
	if (readyAction.type !== ActionType.ChatToolCallReady) {
		throw new Error('[ahp-snapshot] expected chat/toolCallReady prerequisite');
	}
	bindFieldPlaceholder(action, 'toolCallId', readyAction.toolCallId, bindings);
}

function bindFieldPlaceholder(record: Record<string, unknown>, key: string, actual: string, bindings: Map<string, string>): void {
	const expected = readString(record, key);
	if (!PLACEHOLDER_RE.test(expected)) {
		if (expected !== actual) {
			throw new Error(`[ahp-snapshot] expected ${key} ${expected}, got ${actual}`);
		}
		return;
	}
	const existing = bindings.get(expected);
	if (existing !== undefined && existing !== actual) {
		throw new Error(`[ahp-snapshot] ${expected} was already bound to ${existing}, got ${actual}`);
	}
	bindings.set(expected, actual);
}

function bindGeneratedIdentifiers(value: unknown, bindings: Map<string, string>): void {
	if (typeof value === 'string') {
		const match = PLACEHOLDER_RE.exec(value);
		if (match?.groups?.kind === 'turn' && !bindings.has(value)) {
			bindings.set(value, generateUuid());
		}
		return;
	}
	if (Array.isArray(value)) {
		for (const item of value) {
			bindGeneratedIdentifiers(item, bindings);
		}
		return;
	}
	if (value && typeof value === 'object') {
		for (const item of Object.values(value)) {
			bindGeneratedIdentifiers(item, bindings);
		}
	}
}

function resolvePlaceholders(value: unknown, bindings: Map<string, string>): unknown {
	if (typeof value === 'string') {
		return resolvePlaceholder(value, bindings);
	}
	if (Array.isArray(value)) {
		return value.map(item => resolvePlaceholders(item, bindings));
	}
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolvePlaceholders(item, bindings)]));
	}
	return value;
}

function resolvePlaceholder(value: string, bindings: Map<string, string>): string {
	if (!PLACEHOLDER_RE.test(value)) {
		return value;
	}
	const resolved = bindings.get(value);
	if (resolved === undefined) {
		throw new Error(`[ahp-snapshot] no value is bound for ${value}`);
	}
	return resolved;
}

function parseClientAction(value: unknown): StateAction {
	const action = readRecord(value, 'action');
	switch (readString(action, 'type')) {
		case ActionType.SessionActiveClientSet: {
			const activeClient = readRecord(action.activeClient, 'activeClient');
			return {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: readString(activeClient, 'clientId'),
					displayName: readOptionalString(activeClient, 'displayName'),
					tools: readTools(activeClient.tools),
				},
			};
		}
		case ActionType.ChatTurnStarted: {
			const message = readRecord(action.message, 'message');
			const origin = readRecord(message.origin, 'message.origin');
			const model = message.model === undefined ? undefined : readRecord(message.model, 'message.model');
			const originKind = readString(origin, 'kind');
			if (originKind !== MessageKind.User) {
				throw new Error(`[ahp-snapshot] client turn origin must be ${MessageKind.User}`);
			}
			return {
				type: ActionType.ChatTurnStarted,
				turnId: readString(action, 'turnId'),
				startedAt: new Date().toISOString(),
				message: {
					text: readString(message, 'text'),
					origin: { kind: MessageKind.User },
					...(model ? { model: { id: readString(model, 'id') } } : {}),
				},
			};
		}
		case ActionType.ChatToolCallConfirmed:
			if (action.approved !== true || action.confirmed !== ToolCallConfirmationReason.UserAction) {
				throw new Error('[ahp-snapshot] executable tool confirmations currently require user approval');
			}
			return {
				type: ActionType.ChatToolCallConfirmed,
				turnId: readString(action, 'turnId'),
				toolCallId: readString(action, 'toolCallId'),
				approved: true,
				confirmed: ToolCallConfirmationReason.UserAction,
			};
		case ActionType.ChatToolCallComplete: {
			const result = readRecord(action.result, 'result');
			return {
				type: ActionType.ChatToolCallComplete,
				turnId: readString(action, 'turnId'),
				toolCallId: readString(action, 'toolCallId'),
				result: {
					success: readBoolean(result, 'success'),
					pastTenseMessage: readString(result, 'pastTenseMessage'),
					content: readToolResultContent(result.content),
				},
			};
		}
		default:
			throw new Error(`[ahp-snapshot] unsupported executable client action: ${readString(action, 'type')}`);
	}
}

function readTools(value: unknown): { name: string; description?: string; inputSchema?: { type: 'object'; properties?: Record<string, object>; required?: string[] } }[] {
	if (!Array.isArray(value)) {
		throw new Error('[ahp-snapshot] activeClient.tools must be an array');
	}
	return value.map((item, index) => {
		const tool = readRecord(item, `tools[${index}]`);
		const inputSchema = tool.inputSchema === undefined ? undefined : readRecord(tool.inputSchema, `tools[${index}].inputSchema`);
		if (inputSchema && inputSchema.type !== 'object') {
			throw new Error(`[ahp-snapshot] tools[${index}].inputSchema.type must be object`);
		}
		const properties = inputSchema?.properties === undefined ? undefined : readObjectProperties(inputSchema.properties, `tools[${index}].inputSchema.properties`);
		const required = inputSchema?.required === undefined ? undefined : readStringArray(inputSchema.required, `tools[${index}].inputSchema.required`);
		return {
			name: readString(tool, 'name'),
			description: readOptionalString(tool, 'description'),
			...(inputSchema ? { inputSchema: { type: 'object', properties, required } } : {}),
		};
	});
}

function readToolResultContent(value: unknown): { type: ToolResultContentType.Text; text: string }[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value)) {
		throw new Error('[ahp-snapshot] tool result content must be an array');
	}
	return value.map((item, index) => {
		const content = readRecord(item, `result.content[${index}]`);
		if (content.type !== ToolResultContentType.Text) {
			throw new Error(`[ahp-snapshot] unsupported executable tool result content: ${String(content.type)}`);
		}
		return { type: ToolResultContentType.Text, text: readString(content, 'text') };
	});
}

function readObjectProperties(value: unknown, name: string): Record<string, object> {
	const properties = readRecord(value, name);
	for (const [key, property] of Object.entries(properties)) {
		if (!property || typeof property !== 'object') {
			throw new Error(`[ahp-snapshot] ${name}.${key} must be an object`);
		}
	}
	return properties as Record<string, object>;
}

function readStringArray(value: unknown, name: string): string[] {
	if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
		throw new Error(`[ahp-snapshot] ${name} must be a string array`);
	}
	return value;
}

async function waitForFinalServerMessage(client: IAhpSnapshotClient, entries: readonly IAhpSnapshotEntry[], seenNotifications: Set<object>): Promise<void> {
	const finalEntry = entries.at(-1);
	if (!finalEntry) {
		throw new Error('[ahp-snapshot] serverToClient must not be empty');
	}
	const finalActionType = finalEntry.action ? readString(finalEntry.action, 'type') : undefined;
	const notification = await client.waitForNotification(candidate => {
		if (seenNotifications.has(candidate as object)) {
			return false;
		}
		if (candidate.method === 'action') {
			const actionType = (candidate.params as ActionEnvelope).action.type;
			return actionType === finalActionType || actionType === ActionType.ChatError;
		}
		return candidate.method === finalEntry.method;
	}, 90_000);
	seenNotifications.add(notification as object);
	if (notification.method === 'action') {
		const action = (notification.params as ActionEnvelope).action;
		if (action.type === ActionType.ChatError && finalActionType !== ActionType.ChatError) {
			const replayError = client.takeReplayError();
			if (replayError) {
				throw replayError;
			}
			throw new Error(`[ahp-snapshot] round failed before ${finalActionType}: ${action.error.errorType}: ${action.error.message}`);
		}
	}
}

function readRecord(value: unknown, name: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`[ahp-snapshot] ${name} must be an object`);
	}
	return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, key: string): string {
	const value = record[key];
	if (typeof value !== 'string') {
		throw new Error(`[ahp-snapshot] ${key} must be a string`);
	}
	return value;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	if (value !== undefined && typeof value !== 'string') {
		throw new Error(`[ahp-snapshot] ${key} must be a string`);
	}
	return value;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
	const value = record[key];
	if (typeof value !== 'boolean') {
		throw new Error(`[ahp-snapshot] ${key} must be a boolean`);
	}
	return value;
}
