/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64 } from '../../../base/common/buffer.js';
import { SESSION_ROW_OWNER_CHAT_METADATA_KEY } from '../common/sessionDataService.js';
import { URI } from '../../../base/common/uri.js';
import { isEqual } from '../../../base/common/resources.js';
import { AgentSession } from '../common/agent.js';
import { AHP_CHAT_SCHEME, buildChatUri, buildDefaultChatUri, buildSubagentChatUri, buildSubagentSessionUri, parseChatUri, parseSubagentSessionUri, ResponsePartKind, ToolCallStatus, ToolResultContentType, type ToolCallState, type Turn } from '../common/state/sessionState.js';
import { getCanonicalOpaqueChatUuid, isShapedChatUri, uuidFromSha1 } from '../common/agentHostChatIdentity.js';
import { readToolCallMeta } from '../common/meta/agentToolCallMeta.js';
import { stableStringify } from '../../../base/common/objects.js';
import { LRUCache } from '../../../base/common/map.js';
import { decodeAgentHostCatalogPayloadData, hashAgentHostCatalogPayload } from './agentHostCatalogProjection.js';
import { readAgentMessageDelegationMeta, toAgentMessageDelegationMeta } from '../common/meta/agentMessageDelegationMeta.js';
import { MessageAttachmentKind, type Message } from '../common/state/protocol/state.js';

export interface ISessionStorageIdentityRecord {
	readonly runtime: string;
	readonly storage: string;
	readonly provider: string;
}

/**
 * The storage spelling of a chat that is not shaped (an opaque chat) of a
 * session with a {@link ISessionStorageIdentityRecord}. Older builds can only
 * read shaped chats, so its persisted data uses the shaped URI today's code
 * would mint for it with the session's storage spelling.
 */
export interface IChatStorageIdentityRecord {
	readonly runtime: string;
	readonly storage: string;
}

/** The role a chat was minted for, which selects the shaped URI that spells it in storage. */
export type ChatStorageRole =
	| { readonly kind: 'default'; readonly generation: string | undefined }
	| { readonly kind: 'peer' }
	| { readonly kind: 'subagent'; readonly toolCallId: string };

/**
 * The shaped URI that stores an opaque chat of a compatibility session: what
 * today's code would mint for the chat's role with the session's storage
 * spelling. A peer keeps its uuid; a peer without a canonical uuid uses one
 * derived from its complete URI.
 */
export function storedChatUri(storageSession: string, chat: string, role: ChatStorageRole): string {
	switch (role.kind) {
		case 'default':
			return buildDefaultChatUri(storageSession) + (role.generation === undefined ? '' : `?generation=${role.generation}`);
		case 'peer':
			return buildChatUri(storageSession, getCanonicalOpaqueChatUuid(chat) ?? uuidFromSha1(chat));
		case 'subagent':
			return buildSubagentChatUri(storageSession, role.toolCallId);
	}
}

/**
 * Address translation only, between the runtime and storage spellings of the
 * same session. Never use it to determine a chat's owner.
 *
 * Rewrites the session a chat URI was minted for through `translate`, keeping
 * its chat id (including the subagent tool-call form) and any `?`/`#` suffix.
 * Returns `undefined` when `value` is not a chat URI or `translate` has no
 * spelling for its session.
 */
function translateChatUriSession(value: string, translate: (session: string) => string | undefined): string | undefined {
	const chatId = parseChatUri(value)?.chatId;
	if (chatId === undefined) {
		return undefined;
	}
	let encodedSession: string | undefined;
	try {
		encodedSession = URI.parse(value).path.split('/')[1];
	} catch {
		return undefined;
	}
	if (!encodedSession) {
		return undefined;
	}
	const translated = translate(decodeBase64(encodedSession).toString());
	if (translated === undefined) {
		return undefined;
	}
	const subagentPrefix = 'subagent/';
	const rewritten = chatId.startsWith(subagentPrefix)
		? buildSubagentChatUri(translated, chatId.slice(subagentPrefix.length))
		: buildChatUri(translated, chatId);
	const suffix = value.search(/[?#]/);
	return rewritten + (suffix === -1 ? '' : value.slice(suffix));
}

/** Maps local identities at persistence boundaries; unregistered and opaque host resources remain unchanged. */
export class SessionStorageIdentity {
	private readonly _runtime = new Map<string, ISessionStorageIdentityRecord>();
	private readonly _storage = new Map<string, ISessionStorageIdentityRecord>();
	private readonly _chatRuntime = new Map<string, IChatStorageIdentityRecord>();
	private readonly _chatStorage = new Map<string, IChatStorageIdentityRecord>();
	private readonly _runtimeHashes = new LRUCache<string, string>(256);
	private readonly _storageHashes = new LRUCache<string, string>(256);

	add(record: ISessionStorageIdentityRecord): void {
		const runtime = URI.parse(record.runtime);
		const storage = URI.parse(record.storage);
		if (!['copilotcli', 'claude', 'codex'].includes(record.provider)
			|| !isEqual(runtime, AgentSession.uri('ahp-session', AgentSession.id(runtime)))
			|| !isEqual(storage, AgentSession.uri(record.provider, AgentSession.id(runtime)))) {
			throw new Error(`Invalid session storage identity: ${record.runtime}`);
		}
		const previous = this._runtime.get(record.runtime);
		const owner = this._storage.get(record.storage);
		if (previous && previous.storage !== record.storage || owner && owner.runtime !== record.runtime) {
			throw new Error(`Conflicting session storage identity: ${record.runtime}`);
		}
		this._runtime.set(record.runtime, record);
		this._storage.set(record.storage, record);
	}

	/** The storage spelling recorded for a session, or `undefined` when the session is stored as itself. */
	getSessionStorage(session: string): string | undefined {
		return this._runtime.get(session)?.storage;
	}

	/**
	 * Records the storage spelling of an opaque chat. Shaped chats are never
	 * recorded: their session translates through {@link toStorage}.
	 */
	addChat(record: IChatStorageIdentityRecord): void {
		if (!record.runtime.startsWith(`${AHP_CHAT_SCHEME}:`) || isShapedChatUri(record.runtime) || !isShapedChatUri(record.storage)) {
			throw new Error(`Invalid chat storage identity: ${record.runtime}`);
		}
		this._addChat(record);
	}

	/** Adds persisted chat records; {@link addChat} validated each before it was written. */
	addPersistedChats(records: readonly IChatStorageIdentityRecord[]): void {
		for (const record of records) {
			this._chatRuntime.set(record.runtime, record);
			this._chatStorage.set(record.storage, record);
		}
	}

	private _addChat(record: IChatStorageIdentityRecord): void {
		const previous = this._chatRuntime.get(record.runtime);
		const owner = this._chatStorage.get(record.storage);
		if (previous && previous.storage !== record.storage || owner && owner.runtime !== record.runtime) {
			throw new Error(`Conflicting chat storage identity: ${record.runtime}`);
		}
		this._chatRuntime.set(record.runtime, record);
		this._chatStorage.set(record.storage, record);
	}

	hasChat(chat: string): boolean {
		return this._chatRuntime.has(chat);
	}

	toStorage(resource: string): string {
		return this._chatRuntime.get(resource)?.storage ?? this._map(resource, this._runtime, 'storage');
	}

	toRuntime(resource: string): string {
		return this._chatStorage.get(resource)?.runtime ?? this._map(resource, this._storage, 'runtime');
	}

	private _map(value: string, records: ReadonlyMap<string, ISessionStorageIdentityRecord>, direction: 'storage' | 'runtime'): string {
		const known = records.get(value);
		if (known) {
			return known[direction];
		}
		const chat = translateChatUriSession(value, session => records.get(session)?.[direction]);
		if (chat !== undefined) {
			return chat;
		}
		const subagent = parseSubagentSessionUri(value);
		const parent = subagent && records.get(subagent.parentSession.toString());
		if (subagent && parent) {
			return buildSubagentSessionUri(parent[direction], subagent.toolCallId);
		}
		return value;
	}

	metadataKey(key: string, direction: 'storage' | 'runtime'): string {
		const map = direction === 'storage' ? (value: string) => this.toStorage(value) : (value: string) => this.toRuntime(value);
		for (const prefix of ['customChatTitle:', 'customChatTitleSource:', 'agentHost.changes:']) {
			if (key.startsWith(prefix)) {
				return prefix + map(key.slice(prefix.length));
			}
		}
		return key;
	}

	rememberHash(runtime: string, storage: string): void {
		this._runtimeHashes.set(runtime, storage);
		this._storageHashes.set(storage, runtime);
	}

	hash(value: string, direction: 'storage' | 'runtime'): string {
		return (direction === 'storage' ? this._runtimeHashes : this._storageHashes).get(value) ?? value;
	}

	/** Translates identity fields in owned persistence records, never arbitrary text or opaque provider data. */
	record<T>(value: T, direction: 'storage' | 'runtime'): T {
		return this._record(value, direction) as T;
	}

	private _record(value: unknown, direction: 'storage' | 'runtime', key?: string): unknown {
		if (key === 'providerData') {
			return value;
		}
		const map = (resource: string) => direction === 'storage' ? this.toStorage(resource) : this.toRuntime(resource);
		if (typeof value === 'string') {
			if (key && ['session', 'chat', 'chatUri', 'uri', 'resource', 'ownerSession', 'parentChat', 'storageResource', 'defaultChatUri', 'sourceSession', 'sourceChat'].includes(key)) {
				return map(value);
			}
			if (key && ['payloadHash', 'acknowledgedHash', 'normalizationPayloadHash'].includes(key)) {
				return this.hash(value, direction);
			}
			if (key && ['payload', 'origin', 'metadata', 'legacyMirroredPayload'].includes(key)) {
				// Leave invalid and future projections intact for the catalog reader to diagnose.
				if (key === 'payload' && !decodeAgentHostCatalogPayloadData(value).ok) {
					return value;
				}
				const original = JSON.parse(value);
				const converted = this._record(original, direction);
				const changed = JSON.stringify(original) !== JSON.stringify(converted);
				const serialized = changed ? (key === 'payload' ? stableStringify(converted) : JSON.stringify(converted)) : value;
				if (key === 'payload') {
					const originalHash = hashAgentHostCatalogPayload(value);
					const convertedHash = hashAgentHostCatalogPayload(serialized);
					const [runtimeHash, storageHash] = direction === 'storage' ? [originalHash, convertedHash] : [convertedHash, originalHash];
					this.rememberHash(runtimeHash, storageHash);
				}
				return serialized;
			}
			return value;
		}
		if (Array.isArray(value)) {
			return value.map(entry => this._record(entry, direction, key));
		}
		if (value === null || typeof value !== 'object') {
			return value;
		}
		const entries = Object.entries(value);
		// Hash translations must be established before converting the envelope's hash fields.
		const payload = entries.find(([name]) => name === 'payload');
		const convertedPayload = payload ? this._record(payload[1], direction, 'payload') : undefined;
		return Object.fromEntries(entries.map(([name, entry]) => [
			name, name === 'payload' ? convertedPayload : this._record(entry, direction, name),
		]));
	}

	metadata(key: string, value: string | undefined, direction: 'storage' | 'runtime'): string | undefined {
		if (value === undefined || value === '') {
			return value;
		}
		if (key === 'peerChatBacking' || key === SESSION_ROW_OWNER_CHAT_METADATA_KEY) {
			return direction === 'storage' ? this.toStorage(value) : this.toRuntime(value);
		}
		if (['peerChats', 'sessionArtifacts', 'agentHost.createdBySession', 'agentHost.chatOrigin', 'vscode.remoteSession.origin', 'agentHost.turnDelegation'].includes(key)) {
			const original = JSON.parse(value);
			const converted = this.record(original, direction);
			return JSON.stringify(original) === JSON.stringify(converted) ? value : JSON.stringify(converted);
		}
		return value;
	}

	metadataValues(values: Readonly<Record<string, string>>, direction: 'storage' | 'runtime'): Record<string, string> {
		return Object.fromEntries(Object.entries(values).map(([key, value]) => [
			this.metadataKey(key, direction), this.metadata(key, value, direction)!,
		]));
	}

	message(value: Message | undefined, direction: 'storage' | 'runtime'): Message | undefined {
		if (!value) {
			return value;
		}
		const map = this._mapper(direction);
		const delegation = readAgentMessageDelegationMeta(value);
		return {
			...value,
			...(value.attachments ? { attachments: value.attachments.map(attachment => attachment.type === MessageAttachmentKind.Chat ? { ...attachment, resource: map(attachment.resource) } : attachment) } : {}),
			...(delegation ? { _meta: { ...value._meta, ...toAgentMessageDelegationMeta(this.record(delegation, direction)) } } : {}),
		};
	}

	/**
	 * Translates the chats a persisted protocol turn owns: chat attachments and
	 * delegation of its message, and the subagent chats its tool calls spawned
	 * (their result content and `subagentChatUri` stamp). Returns the payload
	 * unchanged when it is not a turn or references nothing to translate.
	 */
	turnPayload(payload: string, direction: 'storage' | 'runtime'): string {
		if (!payload.includes(`${AHP_CHAT_SCHEME}:`)) {
			return payload;
		}
		let value: unknown;
		try {
			value = JSON.parse(payload);
		} catch {
			return payload;
		}
		if (!isTurnLike(value)) {
			return payload;
		}
		const map = this._mapper(direction);
		const converted: Turn = {
			...value,
			message: this.message(value.message, direction)!,
			responseParts: value.responseParts.map(part => part.kind === ResponsePartKind.ToolCall ? { ...part, toolCall: translateToolCall(part.toolCall, map) } : part),
		};
		const serialized = JSON.stringify(converted);
		return serialized === JSON.stringify(value) ? payload : serialized;
	}

	private _mapper(direction: 'storage' | 'runtime'): (resource: string) => string {
		return direction === 'storage' ? resource => this.toStorage(resource) : resource => this.toRuntime(resource);
	}
}

function isTurnLike(value: unknown): value is Turn {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		&& 'message' in value && typeof value.message === 'object' && value.message !== null
		&& 'responseParts' in value && Array.isArray(value.responseParts);
}

function translateToolCall(call: ToolCallState, map: (resource: string) => string): ToolCallState {
	let translated = call;
	const subagentChatUri = readToolCallMeta(call).subagentChatUri;
	if (subagentChatUri !== undefined) {
		translated = { ...translated, _meta: { ...translated._meta, subagentChatUri: map(subagentChatUri) } };
	}
	if ((translated.status === ToolCallStatus.Running || translated.status === ToolCallStatus.AuthRequired || translated.status === ToolCallStatus.PendingResultConfirmation || translated.status === ToolCallStatus.Completed) && translated.content) {
		translated = { ...translated, content: translated.content.map(entry => entry.type === ToolResultContentType.Subagent ? { ...entry, resource: map(entry.resource) } : entry) };
	}
	return translated;
}
