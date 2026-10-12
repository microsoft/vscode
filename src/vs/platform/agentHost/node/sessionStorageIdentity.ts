/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { isEqual } from '../../../base/common/resources.js';
import { AgentSession } from '../common/agent.js';
import { buildChatUri, buildSubagentChatUri, buildSubagentSessionUri, parseChatUri, parseSubagentSessionUri } from '../common/state/sessionState.js';
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

/** Maps local identities at persistence boundaries; unregistered and opaque host resources remain unchanged. */
export class SessionStorageIdentity {
	private readonly _runtime = new Map<string, ISessionStorageIdentityRecord>();
	private readonly _storage = new Map<string, ISessionStorageIdentityRecord>();
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

	toStorage(resource: string): string {
		return this._map(resource, this._runtime, 'storage');
	}

	toRuntime(resource: string): string {
		return this._map(resource, this._storage, 'runtime');
	}

	private _map(value: string, records: ReadonlyMap<string, ISessionStorageIdentityRecord>, direction: 'storage' | 'runtime'): string {
		const known = records.get(value);
		if (known) {
			return known[direction];
		}
		const chat = parseChatUri(value);
		if (chat) {
			const owner = records.get(chat.session);
			if (owner) {
				const converted = chat.chatId.startsWith('subagent/')
					? buildSubagentChatUri(owner[direction], chat.chatId.slice('subagent/'.length))
					: buildChatUri(owner[direction], chat.chatId);
				const suffix = value.search(/[?#]/);
				return converted + (suffix === -1 ? '' : value.slice(suffix));
			}
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
		if (key === 'peerChatBacking') {
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
		const map = (resource: string) => direction === 'storage' ? this.toStorage(resource) : this.toRuntime(resource);
		const delegation = readAgentMessageDelegationMeta(value);
		return {
			...value,
			...(value.attachments ? { attachments: value.attachments.map(attachment => attachment.type === MessageAttachmentKind.Chat ? { ...attachment, resource: map(attachment.resource) } : attachment) } : {}),
			...(delegation ? { _meta: { ...value._meta, ...toAgentMessageDelegationMeta(this.record(delegation, direction)) } } : {}),
		};
	}
}
