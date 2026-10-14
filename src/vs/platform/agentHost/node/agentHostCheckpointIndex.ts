/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import type { IAgentHostCheckpointEntry, IAgentHostCheckpointIndex, ISessionStateExclusive } from '../common/agentHostSessionStateStore.js';
import type { IAgentHostDatabase } from './agentHostDatabase.js';
import { creationTimeChatStorageResource } from './agentHostStateManager.js';

/** The session-wide checkpoint index, kept in agent-host.db next to the central session state. */
export class AgentHostCheckpointIndex implements IAgentHostCheckpointIndex {

	constructor(
		private readonly _runExclusive: <T>(session: URI, task: (exclusive: ISessionStateExclusive) => Promise<T>) => Promise<T>,
		private readonly _database: IAgentHostDatabase,
	) { }

	allocate(session: URI, observedMax: number): Promise<number> {
		return this._runExclusive(session, () => this._database.nextSessionCheckpointSequence(session.toString(), observedMax));
	}

	async record(session: URI, chat: URI, turnId: string, storage: URI, ref: string, repositoryRoot: URI | undefined): Promise<void> {
		await this._runExclusive(session, async () => {
			const key = session.toString();
			await this._database.upsertTurnCheckpoints(key, [{ chat: chat.toString(), turnId, storageResource: storage.toString(), checkpointRef: ref }]);
			if (repositoryRoot) {
				await this._database.addCheckpointRepositories(key, [repositoryRoot.toString()]);
			}
		});
	}

	async resolve(session: URI, turnId: string, chat: URI | undefined): Promise<IAgentHostCheckpointEntry | undefined> {
		return this._runExclusive(session, async exclusive => {
			const rows = (await this._database.readTurnCheckpoints(session.toString(), turnId)).filter(row => row.checkpointRef !== undefined);
			const chosen = (chat && rows.find(row => row.chat === chat.toString())) ?? this._pick(exclusive, rows);
			return chosen?.checkpointRef === undefined ? undefined : { chat: URI.parse(chosen.chat), turnId, storage: URI.parse(chosen.storageResource), ref: chosen.checkpointRef };
		});
	}

	private _pick<T extends { readonly chat: string; readonly checkpointRef: string | undefined }>(exclusive: ISessionStateExclusive, rows: readonly T[]): T | undefined {
		if (rows.length === 0) {
			return undefined;
		}
		if (rows.every(row => row.checkpointRef === rows[0].checkpointRef)) {
			return rows[0];
		}
		let defaultChat: string | undefined;
		for (const [uri, entry] of exclusive.snapshot.chats) {
			if (entry.isDefault) {
				defaultChat = uri;
			}
		}
		return rows.find(row => row.chat === defaultChat) ?? rows[0];
	}

	async forget(session: URI, chat: URI, turnIds: readonly string[]): Promise<void> {
		await this._runExclusive(session, () => this._database.deleteTurnCheckpoints(session.toString(), chat.toString(), turnIds));
	}

	async repositories(session: URI): Promise<readonly URI[]> {
		return this._runExclusive(session, async () => (await this._database.readCheckpointRepositories(session.toString())).map(root => URI.parse(root)));
	}

	defaultChat(session: URI): Promise<URI | undefined> {
		return this._runExclusive(session, async exclusive => {
			for (const [uri, entry] of exclusive.snapshot.chats) {
				if (entry.isDefault) {
					return URI.parse(uri);
				}
			}
			return undefined;
		});
	}

	storageOf(session: URI, chat: URI): Promise<{ readonly storage: URI; readonly isDefault: boolean }> {
		return this._runExclusive(session, async exclusive => {
			const sessionKey = session.toString();
			const entry = exclusive.snapshot.chats.get(chat.toString());
			if (!entry) {
				return { storage: session, isDefault: true };
			}
			let defaultChat: string | undefined;
			for (const [uri, candidate] of exclusive.snapshot.chats) {
				if (candidate.isDefault) {
					defaultChat = uri;
				}
			}
			return { storage: URI.parse(entry.storage ?? creationTimeChatStorageResource(sessionKey, chat.toString(), defaultChat)), isDefault: entry.isDefault };
		});
	}
}
