/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 * Prototype only, behind `chat.copilotCli.handoffPrototype`: the ownership handoff between the Copilot CLI and VS Code.
 * The owner record format is a contract shared with a prototype of the Copilot CLI.
 */

import { VSBuffer } from '../../../../base/common/buffer.js';
import { timeout } from '../../../../base/common/async.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { basename, dirname, getComparisonKey, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid, isUUID } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { getAgentHostSessionResource } from '../../../../platform/agentHost/common/agentHostSessionIdentity.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * The command that Continue in Terminal runs as `<command> --resume=<id>`. Not nested under the boolean switch,
 * which can't also hold a child setting.
 */
export const COPILOT_CLI_HANDOFF_TERMINAL_COMMAND_SETTING = 'chat.copilotCli.handoffPrototypeTerminalCommand';

/** Where Continue in Terminal continues a session: `external`, a separate terminal window, or `integrated`. */
export const COPILOT_CLI_HANDOFF_TERMINAL_LOCATION_SETTING = 'chat.copilotCli.handoffPrototypeTerminalLocation';
export const COPILOT_CLI_BACK_TO_TERMINAL_COMMAND_ID = 'workbench.action.chat.copilotCli.continueInTerminal';
export const COPILOT_CLI_TAKE_BACK_COMMAND_ID = 'workbench.action.chat.copilotCli.takeBack';

export interface ICopilotCliTerminalCommand {
	/** Leading `NAME=value` assignments. */
	readonly environment: readonly string[];
	/** The program and its arguments, which can be empty. */
	readonly command: readonly string[];
	/** Whether the command line expands or substitutes something, such as `$(gh auth token)`, which only a shell does. */
	readonly needsShell: boolean;
}

/**
 * Splits the Continue in Terminal command into words as a POSIX shell does for a simple command: quotes and backslashes
 * group and escape, and a word that starts with `~/` starts in the user's home. Nothing else is expanded: a command
 * line that a shell would expand or that has operators reports {@link ICopilotCliTerminalCommand.needsShell}.
 */
export function parseCopilotCliTerminalCommand(commandLine: string, userHome: string): ICopilotCliTerminalCommand {
	const words: string[] = [];
	let word = '';
	let inWord = false;
	let quote: string | undefined;
	let needsShell = false;
	for (let i = 0; i < commandLine.length; i++) {
		const char = commandLine[i];
		const next = commandLine[i + 1];
		if (quote === '\'') {
			if (char === '\'') {
				quote = undefined;
			} else {
				word += char;
			}
		} else if (quote === '"') {
			if (char === '"') {
				quote = undefined;
			} else if (char === '\\' && next !== undefined && '"\\$`'.includes(next)) {
				word += next;
				i++;
			} else {
				needsShell ||= char === '$' || char === '`';
				word += char;
			}
		} else if (/\s/.test(char)) {
			if (inWord) {
				words.push(word);
				word = '';
				inWord = false;
			}
		} else if (char === '\'' || char === '"') {
			quote = char;
			inWord = true;
		} else if (char === '\\' && next !== undefined) {
			word += next;
			inWord = true;
			i++;
		} else if (char === '~' && !inWord && (next === undefined || next === '/' || /\s/.test(next))) {
			word += userHome;
			inWord = true;
		} else {
			needsShell ||= '$`;&|<>()'.includes(char);
			word += char;
			inWord = true;
		}
	}
	if (inWord) {
		words.push(word);
	}
	const firstCommandWord = words.findIndex(candidate => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(candidate));
	const commandStart = firstCommandWord === -1 ? words.length : firstCommandWord;
	return { environment: words.slice(0, commandStart), command: words.slice(commandStart), needsShell };
}

/** The display name that owner records use for the Copilot CLI. */
export const COPILOT_CLI_OWNER_APP = 'Copilot CLI';

export type CopilotCliOwnerSurface = 'vscode' | 'cli';
/** The VS Code window that wrote an owner record: the Agents window, or the Chat view of an editor window. */
export type CopilotCliOwnerWindow = 'agents' | 'editor';
export type CopilotCliOwnerVia = 'code-command' | 'continue-in-terminal' | 'take-back';

/**
 * Which surface owns a Copilot CLI session: the one the user last chose, not whichever process holds the runtime's
 * lock. Kept at `<Copilot home>/session-state/<session id>/owner.json`.
 */
export interface ICopilotCliOwnerRecord {
	readonly version: 1;
	readonly surface: CopilotCliOwnerSurface;
	/** Display name of the owning app. */
	readonly app: string;
	/** The product's URI scheme, recorded by VS Code only. */
	readonly uriScheme?: string;
	/** Absolute path of the VS Code window folder or of the CLI working directory. */
	readonly folder: string;
	readonly pid?: number;
	/** ISO 8601 UTC time ownership moved. */
	readonly since: string;
	readonly via: CopilotCliOwnerVia;
	/** The VS Code window that wrote the record, recorded by VS Code only. */
	readonly window?: CopilotCliOwnerWindow;
}

export function getCopilotCliOwnerRecordUri(copilotHome: URI, sessionId: string): URI {
	return joinPath(copilotHome, 'session-state', sessionId, 'owner.json');
}

export const COPILOT_CLI_HANDOFF_REQUEST_TIMEOUT_MS = 10_000;
export type CopilotCliHandoffRejection = 'busy' | 'unknown' | 'owner-changed' | 'expired';

export interface ICopilotCliHandoffRequest {
	readonly version: 1;
	readonly requestId: string;
	readonly expectedOwnerSince: string;
	readonly expiresAt: number;
	readonly target: ICopilotCliOwnerRecord;
	readonly status: 'requested' | 'accepted' | 'rejected';
	readonly reason?: CopilotCliHandoffRejection;
}

export function getCopilotCliHandoffRequestUri(copilotHome: URI, sessionId: string): URI {
	return joinPath(copilotHome, 'session-state', sessionId, 'handoff.json');
}

export function parseCopilotCliHandoffRequest(text: string): ICopilotCliHandoffRequest | undefined {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const { version, requestId, expectedOwnerSince, expiresAt, target, status, reason } = value as Partial<Record<keyof ICopilotCliHandoffRequest, unknown>>;
	const owner = target && typeof target === 'object' ? parseCopilotCliOwnerRecord(JSON.stringify(target)) : undefined;
	if (version !== 1 || typeof requestId !== 'string' || !isUUID(requestId)
		|| typeof expectedOwnerSince !== 'string' || !Number.isFinite(Date.parse(expectedOwnerSince))
		|| typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)
		|| !owner || (status !== 'requested' && status !== 'accepted' && status !== 'rejected')
		|| (reason !== undefined && reason !== 'busy' && reason !== 'unknown' && reason !== 'owner-changed' && reason !== 'expired')) {
		return undefined;
	}
	return { version, requestId, expectedOwnerSince, expiresAt, target: owner, status, ...(reason ? { reason } : {}) };
}

export async function readCopilotCliHandoffRequest(fileService: IFileService, copilotHome: URI, sessionId: string): Promise<ICopilotCliHandoffRequest | undefined> {
	let text: string;
	try {
		text = (await fileService.readFile(getCopilotCliHandoffRequestUri(copilotHome, sessionId))).value.toString();
	} catch (error) {
		if (error instanceof Error && toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
			return undefined;
		}
		throw error;
	}
	const request = parseCopilotCliHandoffRequest(text);
	if (!request) {
		throw new Error(localize('copilotCliHandoff.invalidRequest', "The session handoff request could not be read."));
	}
	return request;
}

export function writeCopilotCliHandoffRequest(fileService: IFileService, copilotHome: URI, sessionId: string, request: ICopilotCliHandoffRequest): Promise<void> {
	return writeCopilotCliRecord(fileService, getCopilotCliHandoffRequestUri(copilotHome, sessionId), request);
}

/** Only the current owner may accept a takeover, after it has verified and released its idle runtime. */
export async function requestCopilotCliHandoff(fileService: IFileService, copilotHome: URI, sessionId: string, target: ICopilotCliOwnerRecord): Promise<CopilotCliHandoffRejection | undefined> {
	const owner = await readCopilotCliOwnerRecord(fileService, copilotHome, sessionId);
	if (!owner || owner.surface === target.surface) {
		return 'owner-changed';
	}
	const pending = await readCopilotCliHandoffRequest(fileService, copilotHome, sessionId);
	if (pending?.status === 'requested' && pending.expiresAt > Date.now()) {
		return 'busy';
	}
	const request: ICopilotCliHandoffRequest = {
		version: 1, requestId: generateUuid(), expectedOwnerSince: owner.since,
		expiresAt: Date.now() + COPILOT_CLI_HANDOFF_REQUEST_TIMEOUT_MS, target, status: 'requested',
	};
	await writeCopilotCliHandoffRequest(fileService, copilotHome, sessionId, request);
	for (; ;) {
		const response = await readCopilotCliHandoffRequest(fileService, copilotHome, sessionId);
		if (!response || response.requestId !== request.requestId) {
			return 'owner-changed';
		}
		if (response.status === 'rejected') {
			return response.reason ?? 'unknown';
		}
		if (response.status === 'accepted') {
			const currentOwner = await readCopilotCliOwnerRecord(fileService, copilotHome, sessionId);
			return currentOwner?.surface === target.surface && currentOwner.since === target.since ? undefined : 'owner-changed';
		}
		if (Date.now() >= request.expiresAt) {
			return 'expired';
		}
		await timeout(50);
	}
}

function isCopilotCliOwnerVia(value: unknown): value is CopilotCliOwnerVia {
	return value === 'code-command' || value === 'continue-in-terminal' || value === 'take-back';
}

/** Parses an owner record. Anything that isn't a version 1 record means that no owner is recorded, today's behavior. */
export function parseCopilotCliOwnerRecord(text: string): ICopilotCliOwnerRecord | undefined {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const { version, surface, app, uriScheme, folder, pid, since, via, window } = value as Partial<Record<keyof ICopilotCliOwnerRecord, unknown>>;
	if (version !== 1 || (surface !== 'vscode' && surface !== 'cli') || !isCopilotCliOwnerVia(via) || typeof since !== 'string' || isNaN(Date.parse(since))) {
		return undefined;
	}
	return {
		version,
		surface,
		app: typeof app === 'string' ? app : '',
		...(typeof uriScheme === 'string' ? { uriScheme } : {}),
		folder: typeof folder === 'string' ? folder : '',
		...(typeof pid === 'number' && Number.isSafeInteger(pid) ? { pid } : {}),
		since,
		via,
		...(window === 'agents' || window === 'editor' ? { window } : {}),
	};
}

/** Reads a session's owner record: `undefined` when it is missing or can't be parsed. */
export async function readCopilotCliOwnerRecord(fileService: IFileService, copilotHome: URI, sessionId: string): Promise<ICopilotCliOwnerRecord | undefined> {
	try {
		const content = await fileService.readFile(getCopilotCliOwnerRecordUri(copilotHome, sessionId));
		return parseCopilotCliOwnerRecord(content.value.toString());
	} catch {
		return undefined;
	}
}

/** Writes a session's owner record atomically: to a temporary file in the same folder, which is then renamed over it. */
export async function writeCopilotCliOwnerRecord(fileService: IFileService, copilotHome: URI, sessionId: string, record: ICopilotCliOwnerRecord): Promise<void> {
	return writeCopilotCliRecord(fileService, getCopilotCliOwnerRecordUri(copilotHome, sessionId), record);
}

async function writeCopilotCliRecord(fileService: IFileService, target: URI, record: ICopilotCliOwnerRecord | ICopilotCliHandoffRequest): Promise<void> {
	const temporary = joinPath(dirname(target), `.${basename(target)}.${generateUuid()}.tmp`);
	await fileService.writeFile(temporary, VSBuffer.fromString(`${JSON.stringify(record, undefined, 2)}\n`));
	try {
		await fileService.move(temporary, target, true);
	} catch (error) {
		await fileService.del(temporary).catch(() => { });
		throw error;
	}
}

/** Why a chat in this window doesn't accept input because another surface owns its session; `since` is the record's. */
export type CopilotCliHandoffState =
	| { readonly kind: 'none' }
	/** The session moved to the terminal with Continue in Terminal. */
	| { readonly kind: 'continuedInTerminal'; readonly since: string }
	/** Copilot CLI took the session back. */
	| { readonly kind: 'takenByCli'; readonly since: string }
	/** The user chose to keep viewing the session that Copilot CLI took back. */
	| { readonly kind: 'viewOnly'; readonly since: string };

export const COPILOT_CLI_HANDOFF_NONE: CopilotCliHandoffState = { kind: 'none' };

/**
 * The state of a chat once its session's owner record reads `record`. Only records that give the session to the CLI
 * change it: this window returns to `none` itself, once it imported the session again.
 */
export function getNextCopilotCliHandoffState(current: CopilotCliHandoffState, record: ICopilotCliOwnerRecord | undefined): CopilotCliHandoffState {
	if (record?.surface !== 'cli') {
		return current;
	}
	if (record.via === 'take-back') {
		return (current.kind === 'takenByCli' || current.kind === 'viewOnly') && current.since === record.since
			? current
			: { kind: 'takenByCli', since: record.since };
	}
	return current.kind === 'none' ? { kind: 'continuedInTerminal', since: record.since } : current;
}

const pausedChatSessions = observableValue<ReadonlySet<string>>('copilotCliHandoffPausedChatSessions', new Set<string>());

export interface ICopilotCliHandoffHistoryEntry {
	readonly id: string;
	readonly kind: 'arrival' | 'departure' | 'takenByCli' | 'takeBack';
	readonly timestamp: number;
	readonly afterRequestId?: string;
	readonly returnCommand: '/code' | '/code-insiders';
}

const handoffHistory = observableValue<ReadonlyMap<string, readonly ICopilotCliHandoffHistoryEntry[]>>('copilotCliHandoffHistory', new Map());

export function isCopilotCliHandoffHistoryEntry(value: unknown): value is ICopilotCliHandoffHistoryEntry {
	if (!value || typeof value !== 'object') {
		return false;
	}
	return 'id' in value && typeof value.id === 'string'
		&& 'kind' in value && typeof value.kind === 'string' && ['arrival', 'departure', 'takenByCli', 'takeBack'].includes(value.kind)
		&& 'timestamp' in value && typeof value.timestamp === 'number' && Number.isFinite(value.timestamp)
		&& (!('afterRequestId' in value) || typeof value.afterRequestId === 'string')
		&& 'returnCommand' in value && (value.returnCommand === '/code' || value.returnCommand === '/code-insiders');
}

export function observeCopilotCliHandoffHistory(sessionResource: URI): IObservable<readonly ICopilotCliHandoffHistoryEntry[]> {
	const key = getPausedChatSessionKey(sessionResource);
	return derived(reader => handoffHistory.read(reader).get(key) ?? []);
}

export function setCopilotCliHandoffHistory(sessionResource: URI, entries: readonly ICopilotCliHandoffHistoryEntry[]): void {
	const next = new Map(handoffHistory.get());
	if (entries.length) {
		next.set(getPausedChatSessionKey(sessionResource), entries);
	} else {
		next.delete(getPausedChatSessionKey(sessionResource));
	}
	handoffHistory.set(next, undefined);
}

export function getCopilotCliHandoffHistoryLabel(entry: ICopilotCliHandoffHistoryEntry): string {
	switch (entry.kind) {
		case 'arrival': return localize('copilotCliHandoff.history.arrival', "Continued from Copilot CLI");
		case 'takeBack': return localize('copilotCliHandoff.history.takeBack', "Continued in VS Code");
		case 'departure': return localize('copilotCliHandoff.history.departure', "Continued in Terminal. To return here, run {0}.", entry.returnCommand);
		case 'takenByCli': return localize('copilotCliHandoff.history.takenByCli', "Continued in Copilot CLI. Take It Back to keep working here.");
	}
}

function getPausedChatSessionKey(sessionResource: URI): string {
	return getComparisonKey(getAgentHostSessionResource(sessionResource));
}

/** Whether the handoff paused the input of an agent host chat session, because another surface owns it. */
export function observeCopilotCliHandoffInputPaused(sessionResource: URI): IObservable<boolean> {
	const key = getPausedChatSessionKey(sessionResource);
	return derived(reader => pausedChatSessions.read(reader).has(key));
}

export function setCopilotCliHandoffInputPaused(sessionResource: URI, paused: boolean): void {
	const key = getPausedChatSessionKey(sessionResource);
	const current = pausedChatSessions.get();
	if (current.has(key) === paused) {
		return;
	}
	const next = new Set(current);
	if (paused) {
		next.add(key);
	} else {
		next.delete(key);
	}
	pausedChatSessions.set(next, undefined);
}

export const ICopilotCliHandoffService = createDecorator<ICopilotCliHandoffService>('copilotCliHandoffService');

/** Moves Copilot CLI sessions between this window and the terminal, and shows which surface owns them. */
export interface ICopilotCliHandoffService {
	readonly _serviceBrand: undefined;

	/** After `/code`, records that this window owns the imported session and confirms the move. No-op while off. */
	didContinueFromCli(sessionId: string, sessionResource: URI): Promise<void>;

	/** Refuses or negotiates an incoming handoff before the session is imported. No-op while the prototype is off. */
	prepareToOpenFromCli(sessionId: string): Promise<boolean>;

	/** Releases the session and continues it in a separate terminal by default, pausing the chat here. */
	continueInTerminal(sessionResource: URI): Promise<void>;

	/** Makes this window the owner again, reloading the session with the turns made elsewhere. */
	takeBack(sessionResource: URI): Promise<void>;

	/** Shows the terminal that the session continued in. */
	showTerminal(sessionResource: URI): Promise<void>;

	/** Keeps viewing a session that Copilot CLI took back without enabling its input here. */
	viewOnly(sessionResource: URI): void;

	/** Lets this window open the sessions Take It Back imports where it shows sessions, such as the Agents window. */
	setImportedSessionOpener(opener: (backendSession: URI) => Promise<URI | undefined>): IDisposable;
}
