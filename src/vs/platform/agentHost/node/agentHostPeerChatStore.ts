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

export const PEER_CHATS_METADATA_KEY = 'peerChats';

export interface IPersistedPeerChat {
	readonly uri: string;
	readonly providerData?: string;
	readonly origin?: ChatOrigin;
	readonly inheritedTurnId?: string;
}

export class AgentHostPeerChatStore {

	private readonly _writes = new Map<string, Promise<void>>();

	constructor(
		private readonly _sessionDataService: ISessionDataService,
		private readonly _logService: ILogService,
	) { }

	/**
	 * Missing or malformed data returns `undefined`; `[]` is an explicit empty sentinel.
	 */
	async tryRead(session: URI, batched = false): Promise<IPersistedPeerChat[] | undefined> {
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
		const key = session.toString();
		const previous = this._writes.get(key) ?? Promise.resolve();
		const next = previous
			.catch(() => { /* a failed prior write must not block later ones */ })
			.then(() => this._applyWrite(session, mutate));
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
		const ref = this._sessionDataService.openDatabase(session);
		try {
			let current: IPersistedPeerChat[] = [];
			try {
				const raw = await ref.object.getMetadata(PEER_CHATS_METADATA_KEY);
				if (raw !== undefined) {
					current = this._parse(session, raw);
				}
			} catch (error) {
				this._logService.warn(`[AgentService] Replacing malformed peer-chat catalog for ${session.toString()}: ${toErrorMessage(error)}`);
			}
			const updated = this._parse(session, JSON.stringify(mutate(current)));
			await ref.object.setMetadata(PEER_CHATS_METADATA_KEY, JSON.stringify(updated));
		} finally {
			ref.dispose();
		}
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
