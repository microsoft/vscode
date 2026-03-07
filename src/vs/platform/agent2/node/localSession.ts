/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A live agent session. Owns the in-memory conversation state (a flat
 * list of {@link SessionEntry} items) and transparently persists entries
 * to the JSONL storage. The entry list is the single source of truth.
 */

import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import {
	AgentSession,
	IAgentSessionMetadata,
} from '../../agent/common/agentService.js';
import { IAssistantMessage } from '../common/conversation.js';
import {
	type ISessionAssistantMessage,
	type ISessionToolComplete,
	type ISessionToolStart,
	type ISessionUserMessage,
	type SessionEntry,
} from '../common/sessionTypes.js';
import { SessionWriter } from './sessionStorage.js';
import { getInvocationMessage, getPastTenseMessage, getShellLanguage, getToolDisplayName, getToolInputString, getToolKind } from './localToolDisplay.js';

export class LocalSession extends Disposable {
	private readonly _entries: SessionEntry[] = [];
	private readonly _writer: SessionWriter;
	private readonly _activeToolCalls = new Map<string, { toolName: string; args: Record<string, unknown> }>();
	private _modifiedTime: number;
	private _cts: CancellationTokenSource;
	private _running = false;

	/** Session-scoped scratchpad for tools that maintain state across turns. */
	readonly scratchpad = new Map<string, unknown>();

	/**
	 * Register a disposable for session-scoped cleanup. Tools use this to
	 * register long-lived resources (e.g., child processes).
	 */
	readonly registerDisposable = (disposable: IDisposable) => this._register(disposable);

	readonly uri: URI;
	readonly model: string;
	readonly workingDirectory: string;
	readonly startTime: number;

	constructor(
		uri: URI,
		model: string,
		workingDirectory: string,
		storageBaseDir: string,
		logService: ILogService,
		restoredTimestamps?: { startTime: number; modifiedTime: number },
	) {
		super();
		this.uri = uri;
		this.model = model;
		this.workingDirectory = workingDirectory;
		this.startTime = restoredTimestamps?.startTime ?? Date.now();
		this._modifiedTime = restoredTimestamps?.modifiedTime ?? this.startTime;
		this._cts = new CancellationTokenSource();
		this._writer = this._register(new SessionWriter(storageBaseDir, AgentSession.id(uri), workingDirectory, logService));
	}

	get entries(): readonly SessionEntry[] { return this._entries; }
	get modifiedTime(): number { return this._modifiedTime; }
	get running(): boolean { return this._running; }
	get cts(): CancellationTokenSource { return this._cts; }

	/** Persist the initial session-created record. Must be awaited before any other writes. */
	persistCreation(): Promise<void> {
		return this._writer.writeHeader(this.model, this.workingDirectory, this.startTime, AgentSession.id(this.uri));
	}

	beginTurn(): void {
		this._running = true;
		this._modifiedTime = Date.now();
	}

	endTurn(): void {
		this._running = false;
		this._modifiedTime = Date.now();
	}

	addUserMessage(prompt: string): ISessionUserMessage {
		const entry: ISessionUserMessage = {
			type: 'user-message',
			id: generateUuid(),
			content: prompt,
		};
		this._entries.push(entry);
		this._writer.append(entry);
		return entry;
	}

	addAssistantMessage(msg: IAssistantMessage, messageId: string): ISessionAssistantMessage {
		const entry: ISessionAssistantMessage = {
			type: 'assistant-message',
			id: messageId,
			parts: [...msg.content],
			modelIdentity: msg.modelIdentity,
			providerMetadata: msg.providerMetadata,
		};
		this._entries.push(entry);
		this._writer.append(entry);
		return entry;
	}

	addToolStart(toolCallId: string, toolName: string, args: Record<string, unknown>): ISessionToolStart {
		this._activeToolCalls.set(toolCallId, { toolName, args });

		const entry: ISessionToolStart = {
			type: 'tool-start',
			toolCallId,
			toolName,
			displayName: getToolDisplayName(toolName),
			invocationMessage: getInvocationMessage(toolName, args),
			toolInput: getToolInputString(toolName, args),
			toolKind: getToolKind(toolName),
			language: getShellLanguage(toolName),
		};
		this._entries.push(entry);
		this._writer.append(entry);
		return entry;
	}

	addToolComplete(toolCallId: string, toolName: string, result: string, isError: boolean): ISessionToolComplete {
		const tracked = this._activeToolCalls.get(toolCallId);
		this._activeToolCalls.delete(toolCallId);
		const toolArgs = tracked?.args ?? {};

		const entry: ISessionToolComplete = {
			type: 'tool-complete',
			toolCallId,
			toolName,
			success: !isError,
			pastTenseMessage: getPastTenseMessage(toolName, toolArgs),
			toolOutput: result,
		};
		this._entries.push(entry);
		this._writer.append(entry);
		return entry;
	}

	abort(): void {
		this._cts.cancel();
		this._cts = new CancellationTokenSource();
	}

	/**
	 * Replay a previously persisted entry into the in-memory entries list
	 * without re-persisting it. Used when restoring a session from storage.
	 */
	replayEntry(entry: SessionEntry): void {
		this._entries.push(entry);
	}

	/** Flush pending writes to disk. */
	flush(): Promise<void> {
		return this._writer.flush();
	}

	toMetadata(): IAgentSessionMetadata {
		return {
			session: this.uri,
			startTime: this.startTime,
			modifiedTime: this._modifiedTime,
		};
	}
}
