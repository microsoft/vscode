/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { ChatOrigin } from '../common/state/protocol/state.js';
import { isDefaultChatUri, parseRequiredSessionUriFromChatUri } from '../common/state/sessionState.js';
import { fromCatalogChatOrigin, toCatalogJsonValue } from './agentHostCatalogSourceResolver.js';
import { IAgentHostDatabase } from './agentHostDatabase.js';

export const PEER_CHATS_METADATA_KEY = 'peerChats';
export const CHAT_PROVIDER_DATA_METADATA_KEY = 'agentHost.chatProviderData';
export const CHAT_ORIGIN_METADATA_KEY = 'agentHost.chatOrigin';
export const CHAT_INHERITED_TURN_METADATA_KEY = 'agentHost.chatInheritedTurnId';

export interface IPersistedPeerChat {
	readonly uri: string;
	readonly providerData?: string;
	readonly origin?: ChatOrigin;
	readonly inheritedTurnId?: string;
}

export class AgentHostPeerChatStore {

	private readonly _writes = new Map<string, Promise<void>>();

	constructor(
		private readonly _database: IAgentHostDatabase,
		private readonly _sessionDataService: ISessionDataService,
		private readonly _logService: ILogService,
	) { }

	async tryRead(session: URI): Promise<IPersistedPeerChat[] | undefined> {
		return this._readCentral(session, true);
	}

	/** Imports membership changed by an older build, then returns central authority. */
	async reconcileLegacy(session: URI): Promise<IPersistedPeerChat[] | undefined> {
		let result: IPersistedPeerChat[] | undefined;
		await this._enqueue(session, async () => {
			while (true) {
				const catalog = await this._database.getSessionChatCatalog(session.toString());
				const legacy = await this.tryReadLegacy(session);
				if (!catalog) {
					if (legacy === undefined) {
						return;
					}
					if (!await this._replaceCentral(session, legacy, undefined)) {
						continue;
					}
					result = legacy;
					return;
				}
				const central = this._entriesFromCatalog(catalog.chats);
				if (catalog.legacyMirroredRevision !== catalog.revision) {
					try {
						await this._publishCompatibilityState(session, central, catalog.revision);
					} catch (error) {
						this._logService.error(error, `[AgentHostPeerChatStore] Failed to publish peer-chat compatibility state for ${session.toString()}`);
					}
					result = central;
					return;
				}
				if (legacy !== undefined && JSON.stringify(legacy) !== JSON.stringify(central)) {
					if (!await this._replaceCentral(session, legacy, catalog.revision)) {
						continue;
					}
					result = legacy;
					return;
				}
				const local = await Promise.all(central.map(entry => this._readChatMetadata(entry)));
				if (JSON.stringify(local) !== JSON.stringify(central) && !await this._replaceCentral(session, local, catalog.revision)) {
					continue;
				}
				result = local;
				return;
			}
		});
		return result;
	}

	private async _readCentral(session: URI, repairLegacyMirror: boolean): Promise<IPersistedPeerChat[] | undefined> {
		const catalog = await this._database.getSessionChatCatalog(session.toString());
		if (!catalog) {
			return undefined;
		}
		if (repairLegacyMirror && catalog.legacyMirroredRevision !== catalog.revision) {
			void this._enqueueLegacyMirror(session).catch(error => {
				this._logService.error(error, `[AgentHostPeerChatStore] Failed to repair legacy peer-chat membership for ${session.toString()}`);
			});
		}
		return this._entriesFromCatalog(catalog.chats);
	}

	/**
	 * Compatibility-only read used to import membership written by older builds.
	 * Missing or malformed data returns `undefined`; `[]` is an explicit empty sentinel.
	 */
	async tryReadLegacy(session: URI, batched = false): Promise<IPersistedPeerChat[] | undefined> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return undefined;
		}
		try {
			const raw = batched
				? (await ref.object.getMetadataObject({ [PEER_CHATS_METADATA_KEY]: true }))[PEER_CHATS_METADATA_KEY]
				: await ref.object.getMetadata(PEER_CHATS_METADATA_KEY);
			if (raw === undefined) {
				return undefined;
			}
			return this._parse(session, raw);
		} catch (error) {
			this._logService.warn(`[AgentService] Ignoring malformed peer-chat catalog for ${session.toString()}: ${toErrorMessage(error)}`);
			return undefined;
		} finally {
			ref.dispose();
		}
	}

	async find(session: URI, chat: URI): Promise<IPersistedPeerChat | undefined> {
		const entries = await this.tryRead(session);
		return entries?.find(entry => entry.uri === chat.toString());
	}

	replace(session: URI, entries: readonly IPersistedPeerChat[]): Promise<void> {
		return this._enqueueWrite(session, () => [...entries]);
	}

	upsert(session: URI, chat: URI, providerData: string | undefined, origin?: ChatOrigin, inheritedTurnId?: string): Promise<void> {
		const chatUri = chat.toString();
		return this._enqueueWrite(session, entries => {
			const existing = entries.find(entry => entry.uri === chatUri);
			const effectiveOrigin = origin ?? existing?.origin;
			const effectiveInheritedTurnId = inheritedTurnId ?? existing?.inheritedTurnId;
			const next = entries.filter(entry => entry.uri !== chatUri);
			next.push({
				uri: chatUri,
				...(providerData !== undefined ? { providerData } : {}),
				...(effectiveOrigin !== undefined ? { origin: effectiveOrigin } : {}),
				...(effectiveInheritedTurnId !== undefined ? { inheritedTurnId: effectiveInheritedTurnId } : {}),
			});
			return next;
		});
	}

	remove(session: URI, chat: URI): Promise<void> {
		const chatUri = chat.toString();
		return this._enqueueWrite(session, entries => entries.filter(entry => entry.uri !== chatUri));
	}

	private _enqueueWrite(session: URI, mutate: (entries: IPersistedPeerChat[]) => IPersistedPeerChat[]): Promise<void> {
		return this._enqueue(session, () => this._applyWrite(session, mutate));
	}

	private _enqueue(session: URI, operation: () => Promise<void>): Promise<void> {
		const key = session.toString();
		const previous = this._writes.get(key) ?? Promise.resolve();
		const next = previous
			.catch(() => { /* a failed prior write must not block later ones */ })
			.then(operation);
		const clear = () => {
			if (this._writes.get(key) === tracked) {
				this._writes.delete(key);
			}
		};
		const tracked = next.then(clear, error => {
			clear();
			throw error;
		});
		this._writes.set(key, tracked);
		return tracked;
	}

	private async _applyWrite(session: URI, mutate: (entries: IPersistedPeerChat[]) => IPersistedPeerChat[]): Promise<void> {
		while (true) {
			const catalog = await this._database.getSessionChatCatalog(session.toString());
			const central = catalog ? this._entriesFromCatalog(catalog.chats) : undefined;
			const legacy = !catalog || catalog.legacyMirroredRevision === catalog.revision
				? await this.tryReadLegacy(session)
				: undefined;
			const current = legacy ?? central ?? [];
			const updated = this._parse(session, JSON.stringify(mutate(current)));
			if (await this._replaceCentral(session, updated, catalog?.revision)) {
				return;
			}
		}
	}

	private async _replaceCentral(session: URI, updated: readonly IPersistedPeerChat[], expectedRevision: number | undefined): Promise<boolean> {
		const revision = await this._database.replaceSessionChatCatalog(session.toString(), updated.map((entry, order) => ({
			chat: entry.uri,
			order,
			...(entry.providerData !== undefined ? { providerData: entry.providerData } : {}),
			...(entry.origin !== undefined ? { origin: this._stringifyOrigin(entry.origin) } : {}),
			...(entry.inheritedTurnId !== undefined ? { inheritedTurnId: entry.inheritedTurnId } : {}),
		})), expectedRevision);
		if (revision === undefined) {
			return false;
		}
		try {
			await this._publishCompatibilityState(session, updated, revision);
		} catch (error) {
			this._logService.error(error, `[AgentHostPeerChatStore] Failed to publish peer-chat compatibility state for ${session.toString()}`);
		}
		return true;
	}

	private async _publishCompatibilityState(session: URI, initialEntries: readonly IPersistedPeerChat[], initialRevision: number): Promise<void> {
		let entries = initialEntries;
		let revision = initialRevision;
		while (true) {
			await Promise.all(entries.map(entry => this._writeChatMetadata(entry)));
			const current = await this._database.getSessionChatCatalog(session.toString());
			if (!current) {
				return;
			}
			if (current.revision !== revision) {
				entries = this._entriesFromCatalog(current.chats);
				revision = current.revision;
				continue;
			}
			if (await this._writeLegacyMirror(session, entries, revision)) {
				return;
			}
			const superseding = await this._database.getSessionChatCatalog(session.toString());
			if (!superseding) {
				return;
			}
			entries = this._entriesFromCatalog(superseding.chats);
			revision = superseding.revision;
		}
	}

	private _enqueueLegacyMirror(session: URI): Promise<void> {
		return this._enqueue(session, async () => {
			const catalog = await this._database.getSessionChatCatalog(session.toString());
			if (!catalog || catalog.legacyMirroredRevision === catalog.revision) {
				return;
			}
			const entries = this._entriesFromCatalog(catalog.chats);
			await this._publishCompatibilityState(session, entries, catalog.revision);
		});
	}

	private async _writeLegacyMirror(session: URI, entries: readonly IPersistedPeerChat[], revision: number): Promise<boolean> {
		const ref = this._sessionDataService.openDatabase(session);
		try {
			await ref.object.setMetadata(PEER_CHATS_METADATA_KEY, JSON.stringify(entries));
		} finally {
			ref.dispose();
		}
		return this._database.markSessionChatCatalogLegacyMirrored(session.toString(), revision);
	}

	private async _readChatMetadata(entry: IPersistedPeerChat): Promise<IPersistedPeerChat> {
		const ref = await this._sessionDataService.tryOpenDatabase(URI.parse(entry.uri));
		if (!ref) {
			return entry;
		}
		try {
			const metadata = await ref.object.getMetadataObject({
				[CHAT_PROVIDER_DATA_METADATA_KEY]: true,
				[CHAT_ORIGIN_METADATA_KEY]: true,
				[CHAT_INHERITED_TURN_METADATA_KEY]: true,
			});
			const origin = metadata[CHAT_ORIGIN_METADATA_KEY]
				? this._parseOrigin(metadata[CHAT_ORIGIN_METADATA_KEY])
				: metadata[CHAT_ORIGIN_METADATA_KEY] === '' ? undefined : entry.origin;
			return {
				uri: entry.uri,
				...(metadata[CHAT_PROVIDER_DATA_METADATA_KEY] !== undefined
					? metadata[CHAT_PROVIDER_DATA_METADATA_KEY] ? { providerData: metadata[CHAT_PROVIDER_DATA_METADATA_KEY] } : {}
					: entry.providerData !== undefined ? { providerData: entry.providerData } : {}),
				...(origin !== undefined ? { origin } : {}),
				...(metadata[CHAT_INHERITED_TURN_METADATA_KEY] !== undefined
					? metadata[CHAT_INHERITED_TURN_METADATA_KEY] ? { inheritedTurnId: metadata[CHAT_INHERITED_TURN_METADATA_KEY] } : {}
					: entry.inheritedTurnId !== undefined ? { inheritedTurnId: entry.inheritedTurnId } : {}),
			};
		} finally {
			ref.dispose();
		}
	}

	private async _writeChatMetadata(entry: IPersistedPeerChat): Promise<void> {
		const ref = this._sessionDataService.openDatabase(URI.parse(entry.uri));
		try {
			await ref.object.setMetadataValues({
				[CHAT_PROVIDER_DATA_METADATA_KEY]: entry.providerData ?? '',
				[CHAT_ORIGIN_METADATA_KEY]: entry.origin === undefined ? '' : this._stringifyOrigin(entry.origin),
				[CHAT_INHERITED_TURN_METADATA_KEY]: entry.inheritedTurnId ?? '',
			});
		} finally {
			ref.dispose();
		}
	}

	private _parseOrigin(raw: string): ChatOrigin | undefined {
		const parsed: unknown = JSON.parse(raw);
		return fromCatalogChatOrigin(toCatalogJsonValue(parsed));
	}

	private _stringifyOrigin(origin: ChatOrigin): string {
		const value = toCatalogJsonValue(origin);
		if (value === undefined) {
			throw new Error('Chat origin is not JSON-serializable');
		}
		return JSON.stringify(value);
	}

	private _entriesFromCatalog(chats: readonly {
		readonly chat: string;
		readonly providerData?: string;
		readonly origin?: string;
		readonly inheritedTurnId?: string;
	}[]): IPersistedPeerChat[] {
		return chats.map(chat => ({
			uri: chat.chat,
			...(chat.providerData !== undefined ? { providerData: chat.providerData } : {}),
			...(chat.origin !== undefined ? { origin: this._parseOrigin(chat.origin) } : {}),
			...(chat.inheritedTurnId !== undefined ? { inheritedTurnId: chat.inheritedTurnId } : {}),
		}));
	}

	private _parse(session: URI, raw: string): IPersistedPeerChat[] {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			throw new Error('expected an array');
		}
		const sessionKey = session.toString();
		const seen = new Set<string>();
		const result: IPersistedPeerChat[] = [];
		for (let index = 0; index < parsed.length; index++) {
			const value = parsed[index];
			if (!isRecord(value) || typeof value.uri !== 'string') {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${index} with no chat URI`);
				continue;
			}
			if (seen.has(value.uri)) {
				this._logService.warn(`[AgentService] Skipping duplicate peer-chat catalog entry ${index}`);
				continue;
			}
			let owner: string;
			try {
				owner = parseRequiredSessionUriFromChatUri(value.uri);
			} catch (error) {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${index} with invalid chat URI: ${toErrorMessage(error)}`);
				continue;
			}
			if (owner !== sessionKey || isDefaultChatUri(value.uri)) {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${index} that is not owned by ${sessionKey}`);
				continue;
			}
			if (value.providerData !== undefined && typeof value.providerData !== 'string') {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${index} with invalid provider data`);
				continue;
			}
			if (value.inheritedTurnId !== undefined && typeof value.inheritedTurnId !== 'string') {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${index} with invalid inherited turn id`);
				continue;
			}
			const originValue = toCatalogJsonValue(value.origin);
			const origin = fromCatalogChatOrigin(originValue);
			if (value.origin !== undefined && !origin) {
				this._logService.warn(`[AgentService] Dropping invalid origin from peer-chat catalog entry ${index}`);
			}
			seen.add(value.uri);
			result.push({
				uri: value.uri,
				...(typeof value.providerData === 'string' ? { providerData: value.providerData } : {}),
				...(origin ? { origin } : {}),
				...(typeof value.inheritedTurnId === 'string' ? { inheritedTurnId: value.inheritedTurnId } : {}),
			});
		}
		return result;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
