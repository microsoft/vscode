/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { isEqual } from '../../../base/common/resources.js';
import { Sequencer } from '../../../base/common/async.js';
import { AgentSession } from '../common/agent.js';
import { AgentHostDatabase, type IAgentHostDatabase } from './agentHostDatabase.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { isShapedChatUri } from '../common/agentHostChatIdentity.js';
import { SessionStorageIdentity, storedChatUri, type ChatStorageRole, type IChatStorageIdentityRecord } from './sessionStorageIdentity.js';

const sessionStorageIdentityPrefix = 'sessionStorageIdentity:';
const chatStorageIdentityPrefix = 'chatStorageIdentity:';

function isChatStorageIdentityRecord(value: unknown): value is IChatStorageIdentityRecord {
	return typeof value === 'object' && value !== null && 'runtime' in value && 'storage' in value
		&& typeof value.runtime === 'string' && typeof value.storage === 'string';
}

/** A native-identity reader with an old-readable writer for newly allocated local sessions. */
export class CompatibleAgentHostDatabase extends Disposable implements IAgentHostDatabase {
	declare readonly _serviceBrand: undefined;
	readonly raw: AgentHostDatabase;
	readonly identity: SessionStorageIdentity;
	private readonly _allocations = new Sequencer();
	private readonly _pendingChatRecords = new Set<Promise<void>>();

	constructor(path: string, private readonly _writeCompatibility = true) {
		super();
		this.raw = this._register(new AgentHostDatabase(path));
		this.identity = new SessionStorageIdentity();
	}

	async initialize(): Promise<void> {
		const [sessions, chats] = await Promise.all([
			this.raw.readStorageIdentityMetadata(sessionStorageIdentityPrefix),
			this.raw.readStorageIdentityValues(chatStorageIdentityPrefix),
		]);
		for (const entry of sessions) {
			const value: unknown = JSON.parse(entry.value);
			if (value === null || typeof value !== 'object' || Array.isArray(value)) {
				throw new Error('Invalid persisted session storage identity');
			}
			const fields = new Map<string, unknown>(Object.entries(value));
			const runtime = fields.get('runtime');
			const storage = fields.get('storage');
			const provider = fields.get('provider');
			if (typeof runtime !== 'string' || typeof storage !== 'string' || typeof provider !== 'string'
				|| entry.key !== sessionStorageIdentityPrefix + runtime) {
				throw new Error('Invalid persisted session storage identity');
			}
			this.identity.add({ runtime, storage, provider });
		}
		const records: unknown = JSON.parse(chats);
		if (!Array.isArray(records) || !records.every(isChatStorageIdentityRecord)) {
			throw new Error('Invalid persisted chat storage identity');
		}
		this.identity.addPersistedChats(records);
	}

	recordChatStorageIdentity(session: string, chat: string, role: ChatStorageRole): void {
		const storageSession = this.identity.getSessionStorage(session);
		if (storageSession === undefined || isShapedChatUri(chat) || this.identity.hasChat(chat)) {
			return;
		}
		const record = { runtime: chat, storage: storedChatUri(storageSession, chat, role) };
		this.identity.addChat(record);
		const write = this.raw.setStorageIdentityMetadata(chatStorageIdentityPrefix + chat, JSON.stringify(record)).catch(onUnexpectedError);
		this._pendingChatRecords.add(write);
		write.finally(() => this._pendingChatRecords.delete(write));
	}

	async prepareSessionStorage(session: string, provider: string): Promise<void> {
		return this._allocations.queue(() => this._prepareSessionStorage(session, provider));
	}

	private async _prepareSessionStorage(session: string, provider: string): Promise<void> {
		const resource = URI.parse(session);
		const storage = AgentSession.uri(provider, AgentSession.id(resource)).toString();
		const previous = this.identity.toStorage(session);
		if (previous !== session) {
			if (previous !== storage) {
				throw new Error('Conflicting provider for session storage identity: ' + session);
			}
			return;
		}
		if (!this._writeCompatibility || !['copilotcli', 'claude', 'codex'].includes(provider)) {
			return;
		}
		if (!isEqual(resource, AgentSession.uri('ahp-session', AgentSession.id(resource))) || await this.raw.getSessionV2Registration(session) || await this.raw.getSession(session)) {
			return;
		}
		if (await this.raw.isSessionTombstoned(session) || await this.raw.isSessionTombstoned(storage)) {
			return;
		}
		if (await this.raw.getSessionV2Registration(storage) || await this.raw.getSession(storage)) {
			throw new Error('Cannot allocate a native session over an existing legacy identity: ' + session);
		}
		const record = { runtime: session, storage, provider };
		await this.raw.setStorageIdentityMetadata(sessionStorageIdentityPrefix + session, JSON.stringify(record));
		this.identity.add(record);
	}

	requiresLegacyChatCatalog(session: string): boolean {
		if (this.identity.toStorage(session) !== session || this.identity.toRuntime(session) !== session) {
			return true;
		}
		const resource = URI.parse(session);
		return this._writeCompatibility && ['copilotcli', 'claude', 'codex'].includes(resource.scheme)
			&& isEqual(resource, AgentSession.uri(resource.scheme, AgentSession.id(resource)));
	}

	async registerSession(...[session, sessionOptions, registerOptions]: Parameters<IAgentHostDatabase['registerSession']>): ReturnType<IAgentHostDatabase['registerSession']> {
		const result = await this.raw.registerSession(this.identity.toStorage(session), this.identity.record(sessionOptions, 'storage'), this.identity.record(registerOptions, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async unregisterSession(...[session]: Parameters<IAgentHostDatabase['unregisterSession']>): ReturnType<IAgentHostDatabase['unregisterSession']> {
		const result = await this.raw.unregisterSession(this.identity.toStorage(session));
		return this.identity.record(result, 'runtime');
	}

	async tombstoneAndUnregisterSession(...[session]: Parameters<IAgentHostDatabase['tombstoneAndUnregisterSession']>): ReturnType<IAgentHostDatabase['tombstoneAndUnregisterSession']> {
		const result = await this._allocations.queue(() => this.raw.tombstoneAndUnregisterSession(this.identity.toStorage(session)));
		return this.identity.record(result, 'runtime');
	}

	async updateSessionExternal(...[updates]: Parameters<IAgentHostDatabase['updateSessionExternal']>): ReturnType<IAgentHostDatabase['updateSessionExternal']> {
		const result = await this.raw.updateSessionExternal(this.identity.record(updates, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async updateSessionModifiedTime(...[session, modifiedTime]: Parameters<IAgentHostDatabase['updateSessionModifiedTime']>): ReturnType<IAgentHostDatabase['updateSessionModifiedTime']> {
		const result = await this.raw.updateSessionModifiedTime(this.identity.toStorage(session), this.identity.record(modifiedTime, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async updateSessionModifiedTimes(...[updates]: Parameters<IAgentHostDatabase['updateSessionModifiedTimes']>): ReturnType<IAgentHostDatabase['updateSessionModifiedTimes']> {
		const result = await this.raw.updateSessionModifiedTimes(this.identity.record(updates, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async getSession(...[session]: Parameters<IAgentHostDatabase['getSession']>): ReturnType<IAgentHostDatabase['getSession']> {
		const result = await this.raw.getSession(this.identity.toStorage(session));
		return this.identity.record(result, 'runtime');
	}

	async listSessions(...[]: Parameters<IAgentHostDatabase['listSessions']>): ReturnType<IAgentHostDatabase['listSessions']> {
		const result = await this.raw.listSessions();
		return this.identity.record(result, 'runtime');
	}

	async isSessionRegistryEmpty(...[]: Parameters<IAgentHostDatabase['isSessionRegistryEmpty']>): ReturnType<IAgentHostDatabase['isSessionRegistryEmpty']> {
		const result = await this.raw.isSessionRegistryEmpty();
		return this.identity.record(result, 'runtime');
	}

	async isSessionRegistryBackfilled(...[]: Parameters<IAgentHostDatabase['isSessionRegistryBackfilled']>): ReturnType<IAgentHostDatabase['isSessionRegistryBackfilled']> {
		const result = await this.raw.isSessionRegistryBackfilled();
		return this.identity.record(result, 'runtime');
	}

	async markSessionRegistryBackfilled(...[]: Parameters<IAgentHostDatabase['markSessionRegistryBackfilled']>): ReturnType<IAgentHostDatabase['markSessionRegistryBackfilled']> {
		const result = await this.raw.markSessionRegistryBackfilled();
		return this.identity.record(result, 'runtime');
	}

	async isProviderBackfilled(...[provider]: Parameters<IAgentHostDatabase['isProviderBackfilled']>): ReturnType<IAgentHostDatabase['isProviderBackfilled']> {
		const result = await this.raw.isProviderBackfilled(this.identity.record(provider, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async markProviderBackfilled(...[provider]: Parameters<IAgentHostDatabase['markProviderBackfilled']>): ReturnType<IAgentHostDatabase['markProviderBackfilled']> {
		const result = await this.raw.markProviderBackfilled(this.identity.record(provider, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async isSessionsV2Backfilled(...[provider, payloadVersion]: Parameters<IAgentHostDatabase['isSessionsV2Backfilled']>): ReturnType<IAgentHostDatabase['isSessionsV2Backfilled']> {
		const result = await this.raw.isSessionsV2Backfilled(this.identity.record(provider, 'storage'), this.identity.record(payloadVersion, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async markSessionsV2Backfilled(...[provider, payloadVersion]: Parameters<IAgentHostDatabase['markSessionsV2Backfilled']>): ReturnType<IAgentHostDatabase['markSessionsV2Backfilled']> {
		const result = await this.raw.markSessionsV2Backfilled(this.identity.record(provider, 'storage'), this.identity.record(payloadVersion, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async markSessionsV2Excluded(...[exclusion]: Parameters<IAgentHostDatabase['markSessionsV2Excluded']>): ReturnType<IAgentHostDatabase['markSessionsV2Excluded']> {
		const result = await this.raw.markSessionsV2Excluded(this.identity.record(exclusion, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async markSessionsV2ExcludedBatch(...[exclusions]: Parameters<NonNullable<IAgentHostDatabase['markSessionsV2ExcludedBatch']>>): ReturnType<NonNullable<IAgentHostDatabase['markSessionsV2ExcludedBatch']>> {
		const result = await this.raw.markSessionsV2ExcludedBatch(this.identity.record(exclusions, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async excludeSessionV2(...[exclusion, expected]: Parameters<IAgentHostDatabase['excludeSessionV2']>): ReturnType<IAgentHostDatabase['excludeSessionV2']> {
		const storedExclusion = this.identity.record(exclusion, 'storage');
		let storedExpected = this.identity.record(expected, 'storage');
		if (expected.catalog) {
			const [current] = await this.raw.listSessionsV2ReceiptsWithStorageHashes([storedExclusion.session]);
			if (current?.hashes?.[0] === expected.catalog.payloadHash && current.hashes[1] === current.receipt.payloadHash) {
				storedExpected = { ...storedExpected, catalog: { ...expected.catalog, payloadHash: current.hashes[1] } };
			}
		}
		const result = await this.raw.excludeSessionV2(storedExclusion, storedExpected);
		return this.identity.record(result, 'runtime');
	}

	async getSessionsV2Exclusion(...[provider, session]: Parameters<IAgentHostDatabase['getSessionsV2Exclusion']>): ReturnType<IAgentHostDatabase['getSessionsV2Exclusion']> {
		const result = await this.raw.getSessionsV2Exclusion(this.identity.record(provider, 'storage'), this.identity.toStorage(session));
		return this.identity.record(result, 'runtime');
	}

	async listSessionsV2Exclusions(...[provider]: Parameters<IAgentHostDatabase['listSessionsV2Exclusions']>): ReturnType<IAgentHostDatabase['listSessionsV2Exclusions']> {
		const result = await this.raw.listSessionsV2Exclusions(this.identity.record(provider, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async listAllSessionsV2Exclusions(...[]: Parameters<IAgentHostDatabase['listAllSessionsV2Exclusions']>): ReturnType<IAgentHostDatabase['listAllSessionsV2Exclusions']> {
		const result = await this.raw.listAllSessionsV2Exclusions();
		return this.identity.record(result, 'runtime');
	}

	async clearSessionsV2Exclusion(...[provider, session]: Parameters<IAgentHostDatabase['clearSessionsV2Exclusion']>): ReturnType<IAgentHostDatabase['clearSessionsV2Exclusion']> {
		const result = await this.raw.clearSessionsV2Exclusion(this.identity.record(provider, 'storage'), this.identity.toStorage(session));
		return this.identity.record(result, 'runtime');
	}

	async isSessionTombstoned(...[session]: Parameters<IAgentHostDatabase['isSessionTombstoned']>): ReturnType<IAgentHostDatabase['isSessionTombstoned']> {
		const result = await this.raw.isSessionTombstoned(this.identity.toStorage(session));
		return this.identity.record(result, 'runtime');
	}

	async markSessionTombstoned(...[session]: Parameters<IAgentHostDatabase['markSessionTombstoned']>): ReturnType<IAgentHostDatabase['markSessionTombstoned']> {
		const result = await this._allocations.queue(() => this.raw.markSessionTombstoned(this.identity.toStorage(session)));
		return this.identity.record(result, 'runtime');
	}

	async clearSessionTombstone(...[session]: Parameters<IAgentHostDatabase['clearSessionTombstone']>): ReturnType<IAgentHostDatabase['clearSessionTombstone']> {
		const result = await this.raw.clearSessionTombstone(this.identity.toStorage(session));
		return this.identity.record(result, 'runtime');
	}

	async registerRuntimeSession(...[session, sessionOptions, registerOptions]: Parameters<IAgentHostDatabase['registerRuntimeSession']>): ReturnType<IAgentHostDatabase['registerRuntimeSession']> {
		const result = await this.raw.registerRuntimeSession(this.identity.toStorage(session), this.identity.record(sessionOptions, 'storage'), this.identity.record(registerOptions, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async unregisterRuntimeSession(...[session]: Parameters<IAgentHostDatabase['unregisterRuntimeSession']>): ReturnType<IAgentHostDatabase['unregisterRuntimeSession']> {
		const result = await this.raw.unregisterRuntimeSession(this.identity.toStorage(session));
		return this.identity.record(result, 'runtime');
	}

	async updateRuntimeSessionExternal(...[updates]: Parameters<IAgentHostDatabase['updateRuntimeSessionExternal']>): ReturnType<IAgentHostDatabase['updateRuntimeSessionExternal']> {
		const result = await this.raw.updateRuntimeSessionExternal(this.identity.record(updates, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async listRuntimeCompatibleSessionKeys(...[]: Parameters<IAgentHostDatabase['listRuntimeCompatibleSessionKeys']>): ReturnType<IAgentHostDatabase['listRuntimeCompatibleSessionKeys']> {
		const result = await this.raw.listRuntimeCompatibleSessionKeys();
		return result.map(value => this.identity.toRuntime(value));
	}

	async setSessionAgentMergeEnabled(...[session, enabled]: Parameters<IAgentHostDatabase['setSessionAgentMergeEnabled']>): ReturnType<IAgentHostDatabase['setSessionAgentMergeEnabled']> {
		const result = await this.raw.setSessionAgentMergeEnabled(this.identity.toStorage(session), this.identity.record(enabled, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async listAgentMergeEnabledSessions(...[]: Parameters<IAgentHostDatabase['listAgentMergeEnabledSessions']>): ReturnType<IAgentHostDatabase['listAgentMergeEnabledSessions']> {
		const result = await this.raw.listAgentMergeEnabledSessions();
		return result.map(value => this.identity.toRuntime(value));
	}

	async setSessionProvisional(...[session, provisional]: Parameters<IAgentHostDatabase['setSessionProvisional']>): ReturnType<IAgentHostDatabase['setSessionProvisional']> {
		const result = await this.raw.setSessionProvisional(this.identity.toStorage(session), this.identity.record(provisional, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async listProvisionalSessions(...[]: Parameters<IAgentHostDatabase['listProvisionalSessions']>): ReturnType<IAgentHostDatabase['listProvisionalSessions']> {
		const result = await this.raw.listProvisionalSessions();
		return result.map(value => this.identity.toRuntime(value));
	}

	async registerSessionV2(...[session, sessionOptions, registerOptions]: Parameters<IAgentHostDatabase['registerSessionV2']>): ReturnType<IAgentHostDatabase['registerSessionV2']> {
		const result = await this.raw.registerSessionV2(this.identity.toStorage(session), this.identity.record(sessionOptions, 'storage'), this.identity.record(registerOptions, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async unregisterSessionV2(...[session]: Parameters<IAgentHostDatabase['unregisterSessionV2']>): ReturnType<IAgentHostDatabase['unregisterSessionV2']> {
		const result = await this.raw.unregisterSessionV2(this.identity.toStorage(session));
		return this.identity.record(result, 'runtime');
	}

	async updateSessionV2External(...[updates]: Parameters<IAgentHostDatabase['updateSessionV2External']>): ReturnType<IAgentHostDatabase['updateSessionV2External']> {
		const result = await this.raw.updateSessionV2External(this.identity.record(updates, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async reconcileSessionV2RegistrationFromLegacy(...[session, legacy]: Parameters<IAgentHostDatabase['reconcileSessionV2RegistrationFromLegacy']>): ReturnType<IAgentHostDatabase['reconcileSessionV2RegistrationFromLegacy']> {
		const result = await this.raw.reconcileSessionV2RegistrationFromLegacy(this.identity.toStorage(session), this.identity.record(legacy, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async getSessionV2Registration(...[session]: Parameters<IAgentHostDatabase['getSessionV2Registration']>): ReturnType<IAgentHostDatabase['getSessionV2Registration']> {
		const result = await this.raw.getSessionV2Registration(this.identity.toStorage(session));
		return this.identity.record(result, 'runtime');
	}

	async listSessionV2Registrations(...[]: Parameters<IAgentHostDatabase['listSessionV2Registrations']>): ReturnType<IAgentHostDatabase['listSessionV2Registrations']> {
		const result = await this.raw.listSessionV2Registrations();
		return this.identity.record(result, 'runtime');
	}

	async listSessionV2RegistrationsForImport(...[]: Parameters<IAgentHostDatabase['listSessionV2RegistrationsForImport']>): ReturnType<IAgentHostDatabase['listSessionV2RegistrationsForImport']> {
		const result = await this.raw.listSessionV2RegistrationsForImport();
		return this.identity.record(result, 'runtime');
	}

	async isSessionV2RegistryEmpty(...[]: Parameters<IAgentHostDatabase['isSessionV2RegistryEmpty']>): ReturnType<IAgentHostDatabase['isSessionV2RegistryEmpty']> {
		const result = await this.raw.isSessionV2RegistryEmpty();
		return this.identity.record(result, 'runtime');
	}

	async getSessionV2(...[session]: Parameters<IAgentHostDatabase['getSessionV2']>): ReturnType<IAgentHostDatabase['getSessionV2']> {
		const result = await this.raw.getSessionV2(this.identity.toStorage(session));
		return this.identity.record(result, 'runtime');
	}

	async listSessionsV2(...[sessions]: Parameters<IAgentHostDatabase['listSessionsV2']>): ReturnType<IAgentHostDatabase['listSessionsV2']> {
		const result = await this.raw.listSessionsV2(sessions?.map(value => this.identity.toStorage(value)));
		return this.identity.record(result, 'runtime');
	}

	async readSessionListCatalogs(...[sessions]: Parameters<IAgentHostDatabase['readSessionListCatalogs']>): ReturnType<IAgentHostDatabase['readSessionListCatalogs']> {
		const result = await this.raw.readSessionListCatalogs(sessions.map(value => this.identity.toStorage(value)));
		return this.identity.record(result, 'runtime');
	}

	async listSessionsV2Receipts(...[]: Parameters<IAgentHostDatabase['listSessionsV2Receipts']>): ReturnType<IAgentHostDatabase['listSessionsV2Receipts']> {
		const result = await this.raw.listSessionsV2ReceiptsWithStorageHashes();
		return result.map(({ receipt, hashes }) => ({
			...this.identity.record(receipt, 'runtime'),
			payloadHash: hashes?.[1] === receipt.payloadHash ? hashes[0] : this.identity.hash(receipt.payloadHash, 'runtime'),
		}));
	}

	async markSessionV2PayloadDirty(...[session]: Parameters<IAgentHostDatabase['markSessionV2PayloadDirty']>): ReturnType<IAgentHostDatabase['markSessionV2PayloadDirty']> {
		const result = await this.raw.markSessionV2PayloadDirty(this.identity.toStorage(session));
		return this.identity.record(result, 'runtime');
	}

	async getSessionV2PayloadDirty(...[session]: Parameters<IAgentHostDatabase['getSessionV2PayloadDirty']>): ReturnType<IAgentHostDatabase['getSessionV2PayloadDirty']> {
		const result = await this.raw.getSessionV2PayloadDirty(this.identity.toStorage(session));
		return this.identity.record(result, 'runtime');
	}

	async markAllSessionsV2PayloadsDirty(...[]: Parameters<IAgentHostDatabase['markAllSessionsV2PayloadsDirty']>): ReturnType<IAgentHostDatabase['markAllSessionsV2PayloadsDirty']> {
		const result = await this.raw.markAllSessionsV2PayloadsDirty();
		return this.identity.record(result, 'runtime');
	}

	async markSessionsV2PayloadsDirty(...[sessions]: Parameters<IAgentHostDatabase['markSessionsV2PayloadsDirty']>): ReturnType<IAgentHostDatabase['markSessionsV2PayloadsDirty']> {
		const result = await this.raw.markSessionsV2PayloadsDirty(sessions.map(value => this.identity.toStorage(value)));
		return this.identity.record(result, 'runtime');
	}

	async markSessionV2PayloadClean(...[session, expectedDirty]: Parameters<IAgentHostDatabase['markSessionV2PayloadClean']>): ReturnType<IAgentHostDatabase['markSessionV2PayloadClean']> {
		const result = await this.raw.markSessionV2PayloadClean(this.identity.toStorage(session), this.identity.record(expectedDirty, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async upsertSessionV2(...[envelope, expectedSessionGeneration, validate]: Parameters<IAgentHostDatabase['upsertSessionV2']>): ReturnType<IAgentHostDatabase['upsertSessionV2']> {
		const storedEnvelope = this.identity.record(envelope, 'storage');
		const result = await this.raw.upsertSessionV2(storedEnvelope, expectedSessionGeneration, validate, envelope.payloadHash);
		return this.identity.record(result, 'runtime');
	}

	async upsertSessionV2FromChatCatalog(...[envelope, expectedSessionGeneration, expectedCatalogRevision, validate]: Parameters<IAgentHostDatabase['upsertSessionV2FromChatCatalog']>): ReturnType<IAgentHostDatabase['upsertSessionV2FromChatCatalog']> {
		const storedEnvelope = this.identity.record(envelope, 'storage');
		const result = await this.raw.upsertSessionV2FromChatCatalog(storedEnvelope, expectedSessionGeneration, expectedCatalogRevision, validate, envelope.payloadHash);
		return this.identity.record(result, 'runtime');
	}

	async readCatalogSnapshot(...[sessions]: Parameters<IAgentHostDatabase['readCatalogSnapshot']>): ReturnType<IAgentHostDatabase['readCatalogSnapshot']> {
		const result = await this.raw.readCatalogSnapshot(sessions?.map(value => this.identity.toStorage(value)));
		return this.identity.record(result, 'runtime');
	}

	async listLegacyChatCatalogSessions(...[sessions]: Parameters<IAgentHostDatabase['listLegacyChatCatalogSessions']>): ReturnType<IAgentHostDatabase['listLegacyChatCatalogSessions']> {
		const result = await this.raw.listLegacyChatCatalogSessions(sessions.map(value => this.identity.toStorage(value)));
		return result.map(value => this.identity.toRuntime(value));
	}

	async readChatV2(...[session, chat]: Parameters<IAgentHostDatabase['readChatV2']>): ReturnType<IAgentHostDatabase['readChatV2']> {
		const result = await this.raw.readChatV2(this.identity.toStorage(session), this.identity.toStorage(chat));
		return this.identity.record(result, 'runtime');
	}

	async getRegistrationGeneration(...[]: Parameters<IAgentHostDatabase['getRegistrationGeneration']>): ReturnType<IAgentHostDatabase['getRegistrationGeneration']> {
		return this.raw.getRegistrationGeneration();
	}

	async readSessionRegistrations(...[]: Parameters<IAgentHostDatabase['readSessionRegistrations']>): ReturnType<IAgentHostDatabase['readSessionRegistrations']> {
		const result = await this.raw.readSessionRegistrations();
		return this.identity.record(result, 'runtime');
	}

	async findCentralChatOwners(...[chats]: Parameters<IAgentHostDatabase['findCentralChatOwners']>): ReturnType<IAgentHostDatabase['findCentralChatOwners']> {
		return this._findChatOwners(chats, storageChats => this.raw.findCentralChatOwners(storageChats));
	}

	async findCatalogPayloadChatOwners(...[chats]: Parameters<IAgentHostDatabase['findCatalogPayloadChatOwners']>): ReturnType<IAgentHostDatabase['findCatalogPayloadChatOwners']> {
		return this._findChatOwners(chats, storageChats => this.raw.findCatalogPayloadChatOwners(storageChats));
	}

	/** Looks up owners by storage chat and returns them keyed by the caller's runtime chat. */
	private async _findChatOwners(chats: readonly string[], find: (storageChats: readonly string[]) => ReturnType<IAgentHostDatabase['findCentralChatOwners']>): ReturnType<IAgentHostDatabase['findCentralChatOwners']> {
		const storageChats = chats.map(chat => this.identity.toStorage(chat));
		const found = await find(storageChats);
		const owners = new Map<string, NonNullable<ReturnType<typeof found.get>>>();
		chats.forEach((chat, index) => {
			const owner = found.get(storageChats[index]);
			if (owner) {
				owners.set(chat, this.identity.record(owner, 'runtime'));
			}
		});
		return owners;
	}

	async getChatV2ProviderDetail(...[chat]: Parameters<IAgentHostDatabase['getChatV2ProviderDetail']>): ReturnType<IAgentHostDatabase['getChatV2ProviderDetail']> {
		const result = await this.raw.getChatV2ProviderDetail(this.identity.toStorage(chat));
		return this.identity.record(result, 'runtime');
	}

	async ensureChatCatalogV2(...[session, expected, candidate, mutation, validate]: Parameters<IAgentHostDatabase['ensureChatCatalogV2']>): ReturnType<IAgentHostDatabase['ensureChatCatalogV2']> {
		// Keep old-build membership writes authoritative until this storage encoding is retired.
		if (this.requiresLegacyChatCatalog(session)) {
			return { status: 'notReady' };
		}
		const result = await this.raw.ensureChatCatalogV2(this.identity.toStorage(session), this.identity.record(expected, 'storage'), this.identity.record(candidate, 'storage'), this.identity.record(mutation, 'storage'), this.identity.record(validate, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async registerChatCatalogV2(...[session, candidate]: Parameters<IAgentHostDatabase['registerChatCatalogV2']>): ReturnType<IAgentHostDatabase['registerChatCatalogV2']> {
		if (this.requiresLegacyChatCatalog(session)) {
			return { status: 'notReady' };
		}
		const result = await this.raw.registerChatCatalogV2(this.identity.toStorage(session), this.identity.record(candidate, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async updateChatV2Metadata(...[chat, expected, patch, validate]: Parameters<IAgentHostDatabase['updateChatV2Metadata']>): ReturnType<IAgentHostDatabase['updateChatV2Metadata']> {
		const result = await this.raw.updateChatV2Metadata(this.identity.toStorage(chat), this.identity.record(expected, 'storage'), this.identity.record(patch, 'storage'), this.identity.record(validate, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async insertPrivateChatV2(...[session, chat, expectedCatalogRevision, validate]: Parameters<IAgentHostDatabase['insertPrivateChatV2']>): ReturnType<IAgentHostDatabase['insertPrivateChatV2']> {
		const result = await this.raw.insertPrivateChatV2(this.identity.toStorage(session), this.identity.record(chat, 'storage'), this.identity.record(expectedCatalogRevision, 'storage'), this.identity.record(validate, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async removePrivateChatV2(...[session, chat, expectedCatalogRevision]: Parameters<IAgentHostDatabase['removePrivateChatV2']>): ReturnType<IAgentHostDatabase['removePrivateChatV2']> {
		const result = await this.raw.removePrivateChatV2(this.identity.toStorage(session), this.identity.toStorage(chat), this.identity.record(expectedCatalogRevision, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async getSessionChatCatalog(...[session]: Parameters<IAgentHostDatabase['getSessionChatCatalog']>): ReturnType<IAgentHostDatabase['getSessionChatCatalog']> {
		const result = await this.raw.getSessionChatCatalog(this.identity.toStorage(session));
		return this.identity.record(result, 'runtime');
	}

	async replaceSessionChatCatalog(...[session, chats, expectedRevision]: Parameters<IAgentHostDatabase['replaceSessionChatCatalog']>): ReturnType<IAgentHostDatabase['replaceSessionChatCatalog']> {
		const result = await this.raw.replaceSessionChatCatalog(this.identity.toStorage(session), this.identity.record(chats, 'storage'), this.identity.record(expectedRevision, 'storage'));
		return this.identity.record(result, 'runtime');
	}

	async markSessionChatCatalogLegacyMirrored(...[session, expectedRevision, payload]: Parameters<IAgentHostDatabase['markSessionChatCatalogLegacyMirrored']>): ReturnType<IAgentHostDatabase['markSessionChatCatalogLegacyMirrored']> {
		const result = await this.raw.markSessionChatCatalogLegacyMirrored(this.identity.toStorage(session), expectedRevision, this.identity.record({ legacyMirroredPayload: payload }, 'storage').legacyMirroredPayload);
		return this.identity.record(result, 'runtime');
	}

	async recordSessionChatCatalogLegacyMirrorPayload(...[session, expectedRevision, payload]: Parameters<IAgentHostDatabase['recordSessionChatCatalogLegacyMirrorPayload']>): ReturnType<IAgentHostDatabase['recordSessionChatCatalogLegacyMirrorPayload']> {
		const result = await this.raw.recordSessionChatCatalogLegacyMirrorPayload(this.identity.toStorage(session), expectedRevision, this.identity.record({ legacyMirroredPayload: payload }, 'storage').legacyMirroredPayload);
		return this.identity.record(result, 'runtime');
	}

	// Session state rows are stored in storage spelling. Values use the session.db metadata translation;
	// the mirror merge bases are opaque to storage because only this build's session state store reads them.

	private _stateValues<T extends { readonly key: string; readonly value: string | undefined }>(values: readonly T[], direction: 'storage' | 'runtime'): T[] {
		return values.map(entry => ({ ...entry, value: this.identity.metadata(entry.key, entry.value, direction) }));
	}

	async readSessionState(...[session]: Parameters<IAgentHostDatabase['readSessionState']>): ReturnType<IAgentHostDatabase['readSessionState']> {
		const result = await this.raw.readSessionState(this.identity.toStorage(session));
		if (!result) {
			return undefined;
		}
		const { values, legacyMirrorBase, rowsMoved, ...rest } = result;
		return { ...this.identity.record(rest, 'runtime'), values: this._stateValues(values, 'runtime'), legacyMirrorBase, rowsMoved };
	}

	async readSessionStateValues(...[sessions, keys]: Parameters<IAgentHostDatabase['readSessionStateValues']>): ReturnType<IAgentHostDatabase['readSessionStateValues']> {
		const result = await this.raw.readSessionStateValues(sessions.map(session => this.identity.toStorage(session)), keys);
		return new Map([...result].map(([session, entry]) => [this.identity.toRuntime(session), {
			imported: entry.imported,
			values: new Map([...entry.values].map(([key, value]) => [key, this.identity.metadata(key, value, 'runtime')!])),
		}]));
	}

	async importSessionState(...[session, data]: Parameters<IAgentHostDatabase['importSessionState']>): ReturnType<IAgentHostDatabase['importSessionState']> {
		const { values, legacyMirrorBase, ...rest } = data;
		return this.raw.importSessionState(this.identity.toStorage(session), {
			...this.identity.record(rest, 'storage'),
			values: this.identity.metadataValues(values, 'storage'),
			legacyMirrorBase,
		});
	}

	async writeSessionState(...[session, expectedRevision, patch]: Parameters<IAgentHostDatabase['writeSessionState']>): ReturnType<IAgentHostDatabase['writeSessionState']> {
		const { values, markPayloadDirty, ...rest } = patch;
		return this.raw.writeSessionState(this.identity.toStorage(session), expectedRevision, {
			...this.identity.record(rest, 'storage'),
			values: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === null ? null : this.identity.metadata(key, value, 'storage')!])),
			markPayloadDirty,
		});
	}

	async markSessionStateLegacyMirrored(...[session, expectedRevision, payload]: Parameters<IAgentHostDatabase['markSessionStateLegacyMirrored']>): ReturnType<IAgentHostDatabase['markSessionStateLegacyMirrored']> {
		return this.raw.markSessionStateLegacyMirrored(this.identity.toStorage(session), expectedRevision, payload);
	}

	async recordSessionStateLegacyMirrorPayload(...[session, expectedRevision, payload]: Parameters<IAgentHostDatabase['recordSessionStateLegacyMirrorPayload']>): ReturnType<IAgentHostDatabase['recordSessionStateLegacyMirrorPayload']> {
		return this.raw.recordSessionStateLegacyMirrorPayload(this.identity.toStorage(session), expectedRevision, payload);
	}

	async bumpSessionStateRowsRevision(...[session]: Parameters<IAgentHostDatabase['bumpSessionStateRowsRevision']>): ReturnType<IAgentHostDatabase['bumpSessionStateRowsRevision']> {
		return this.raw.bumpSessionStateRowsRevision(this.identity.toStorage(session));
	}

	async markSessionStateRowsMirrored(...[session, expectedRowsRevision]: Parameters<IAgentHostDatabase['markSessionStateRowsMirrored']>): ReturnType<IAgentHostDatabase['markSessionStateRowsMirrored']> {
		return this.raw.markSessionStateRowsMirrored(this.identity.toStorage(session), expectedRowsRevision);
	}

	async markSessionStateLaunchDirsBackfilled(...[session]: Parameters<IAgentHostDatabase['markSessionStateLaunchDirsBackfilled']>): ReturnType<IAgentHostDatabase['markSessionStateLaunchDirsBackfilled']> {
		return this.raw.markSessionStateLaunchDirsBackfilled(this.identity.toStorage(session));
	}

	async markSessionStateRowsMoved(...[session, progress]: Parameters<IAgentHostDatabase['markSessionStateRowsMoved']>): ReturnType<IAgentHostDatabase['markSessionStateRowsMoved']> {
		return this.raw.markSessionStateRowsMoved(this.identity.toStorage(session), progress);
	}

	async readChatRowMirror(...[session, chat, kind]: Parameters<IAgentHostDatabase['readChatRowMirror']>): ReturnType<IAgentHostDatabase['readChatRowMirror']> {
		return this.raw.readChatRowMirror(this.identity.toStorage(session), this.identity.toStorage(chat), kind);
	}

	async writeChatRowMirror(...[session, chat, kind, base]: Parameters<IAgentHostDatabase['writeChatRowMirror']>): ReturnType<IAgentHostDatabase['writeChatRowMirror']> {
		return this.raw.writeChatRowMirror(this.identity.toStorage(session), this.identity.toStorage(chat), kind, base);
	}

	async deleteSessionChatState(...[session, chat, expectedRevision]: Parameters<IAgentHostDatabase['deleteSessionChatState']>): ReturnType<IAgentHostDatabase['deleteSessionChatState']> {
		return this.raw.deleteSessionChatState(this.identity.toStorage(session), this.identity.toStorage(chat), expectedRevision);
	}

	async countStorageReferences(...[storage, excludingSession]: Parameters<IAgentHostDatabase['countStorageReferences']>): ReturnType<IAgentHostDatabase['countStorageReferences']> {
		return this.raw.countStorageReferences(this.identity.toStorage(storage), this.identity.toStorage(excludingSession));
	}

	async listSessionStateGarbage(...[limit]: Parameters<IAgentHostDatabase['listSessionStateGarbage']>): ReturnType<IAgentHostDatabase['listSessionStateGarbage']> {
		return (await this.raw.listSessionStateGarbage(limit)).map(session => this.identity.toRuntime(session));
	}

	async deleteSessionStateGarbage(...[session]: Parameters<IAgentHostDatabase['deleteSessionStateGarbage']>): ReturnType<IAgentHostDatabase['deleteSessionStateGarbage']> {
		return this.raw.deleteSessionStateGarbage(this.identity.toStorage(session));
	}

	async close(...[]: Parameters<IAgentHostDatabase['close']>): ReturnType<IAgentHostDatabase['close']> {
		await Promise.all(this._pendingChatRecords);
		const result = await this.raw.close();
		return this.identity.record(result, 'runtime');
	}
}
