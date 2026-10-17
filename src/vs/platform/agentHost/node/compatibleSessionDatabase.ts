/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import type { ISessionDatabase } from '../common/sessionDataService.js';
import { SessionStorageIdentity } from './sessionStorageIdentity.js';

const catalogRuntimeHashKey = 'sessionStorageCatalogHash';

/** Translates owned session metadata and chat keys while delegating conversation content unchanged. */
export class CompatibleSessionDatabase implements ISessionDatabase {
	constructor(private readonly raw: ISessionDatabase, private readonly identity: SessionStorageIdentity) { }
	dispose(): void { this.raw.dispose(); }

	async getMetadataObject<T extends Record<string, unknown>>(obj: T): Promise<{ [K in keyof T]: string | undefined }> {
		const keys = Object.keys(obj);
		const storageKeys = keys.map(key => this.identity.metadataKey(key, 'storage'));
		// One read of the underlying database for all keys.
		const values: Record<string, string | undefined> = await this.raw.getMetadataObject(Object.fromEntries(storageKeys.map(key => [key, true])));
		return Object.fromEntries(keys.map((key, index) => [key, this.identity.metadata(key, values[storageKeys[index]], 'runtime')])) as { [K in keyof T]: string | undefined };
	}

	async createTurn(...[turnId]: Parameters<ISessionDatabase['createTurn']>): ReturnType<ISessionDatabase['createTurn']> {
		const result = await this.raw.createTurn(turnId);
		return result;
	}

	async deleteTurn(...[turnId]: Parameters<ISessionDatabase['deleteTurn']>): ReturnType<ISessionDatabase['deleteTurn']> {
		const result = await this.raw.deleteTurn(turnId);
		return result;
	}

	async setTurnEventId(...[turnId, eventId]: Parameters<ISessionDatabase['setTurnEventId']>): ReturnType<ISessionDatabase['setTurnEventId']> {
		const result = await this.raw.setTurnEventId(turnId, eventId);
		return result;
	}

	async getTurnEventId(...[turnId]: Parameters<ISessionDatabase['getTurnEventId']>): ReturnType<ISessionDatabase['getTurnEventId']> {
		const result = await this.raw.getTurnEventId(turnId);
		return result;
	}

	async getNextTurnEventId(...[turnId]: Parameters<ISessionDatabase['getNextTurnEventId']>): ReturnType<ISessionDatabase['getNextTurnEventId']> {
		const result = await this.raw.getNextTurnEventId(turnId);
		return result;
	}

	async getFirstTurnEventId(...[]: Parameters<ISessionDatabase['getFirstTurnEventId']>): ReturnType<ISessionDatabase['getFirstTurnEventId']> {
		const result = await this.raw.getFirstTurnEventId();
		return result;
	}

	async hasConversationTurns(...[]: Parameters<ISessionDatabase['hasConversationTurns']>): ReturnType<ISessionDatabase['hasConversationTurns']> {
		const result = await this.raw.hasConversationTurns();
		return result;
	}

	async setTurnUsage(...[turnId, usage]: Parameters<ISessionDatabase['setTurnUsage']>): ReturnType<ISessionDatabase['setTurnUsage']> {
		const result = await this.raw.setTurnUsage(turnId, usage);
		return result;
	}

	async getTurnUsages(...[]: Parameters<ISessionDatabase['getTurnUsages']>): ReturnType<ISessionDatabase['getTurnUsages']> {
		const result = await this.raw.getTurnUsages();
		return result;
	}

	async setTurnDelegation(...[turnId, delegation]: Parameters<ISessionDatabase['setTurnDelegation']>): ReturnType<ISessionDatabase['setTurnDelegation']> {
		const result = await this.raw.setTurnDelegation(turnId, this.identity.metadata('agentHost.turnDelegation', delegation, 'storage')!);
		return result;
	}

	async getTurnDelegations(...[]: Parameters<ISessionDatabase['getTurnDelegations']>): ReturnType<ISessionDatabase['getTurnDelegations']> {
		const result = await this.raw.getTurnDelegations();
		return new Map([...result].map(([key, value]) => [key, this.identity.metadata('agentHost.turnDelegation', value, 'runtime')!]));
	}

	async setTurnWorkspaceTransition(...[turnId, transition]: Parameters<ISessionDatabase['setTurnWorkspaceTransition']>): ReturnType<ISessionDatabase['setTurnWorkspaceTransition']> {
		const result = await this.raw.setTurnWorkspaceTransition(turnId, transition);
		return result;
	}

	async setWorkspaceConversion(...[turnId, transition, metadata]: Parameters<ISessionDatabase['setWorkspaceConversion']>): ReturnType<ISessionDatabase['setWorkspaceConversion']> {
		const result = await this.raw.setWorkspaceConversion(turnId, transition, this.identity.metadataValues(metadata, 'storage'));
		return result;
	}

	async deleteTurnWorkspaceTransition(...[turnId]: Parameters<ISessionDatabase['deleteTurnWorkspaceTransition']>): ReturnType<ISessionDatabase['deleteTurnWorkspaceTransition']> {
		const result = await this.raw.deleteTurnWorkspaceTransition(turnId);
		return result;
	}

	async getTurnWorkspaceTransitions(...[]: Parameters<ISessionDatabase['getTurnWorkspaceTransitions']>): ReturnType<ISessionDatabase['getTurnWorkspaceTransitions']> {
		const result = await this.raw.getTurnWorkspaceTransitions();
		return result;
	}

	async setTurnCheckpointRef(...[turnId, ref]: Parameters<ISessionDatabase['setTurnCheckpointRef']>): ReturnType<ISessionDatabase['setTurnCheckpointRef']> {
		const result = await this.raw.setTurnCheckpointRef(turnId, ref);
		return result;
	}

	async getTurnCheckpointRef(...[turnId]: Parameters<ISessionDatabase['getTurnCheckpointRef']>): ReturnType<ISessionDatabase['getTurnCheckpointRef']> {
		const result = await this.raw.getTurnCheckpointRef(turnId);
		return result;
	}

	async getPreviousCheckpointRef(...[turnId]: Parameters<ISessionDatabase['getPreviousCheckpointRef']>): ReturnType<ISessionDatabase['getPreviousCheckpointRef']> {
		const result = await this.raw.getPreviousCheckpointRef(turnId);
		return result;
	}

	async getAllCheckpointRefs(...[]: Parameters<ISessionDatabase['getAllCheckpointRefs']>): ReturnType<ISessionDatabase['getAllCheckpointRefs']> {
		const result = await this.raw.getAllCheckpointRefs();
		return result;
	}

	async truncateFromTurn(...[turnId]: Parameters<ISessionDatabase['truncateFromTurn']>): ReturnType<ISessionDatabase['truncateFromTurn']> {
		const result = await this.raw.truncateFromTurn(turnId);
		return result;
	}

	async deleteTurnsAfter(...[turnId]: Parameters<ISessionDatabase['deleteTurnsAfter']>): ReturnType<ISessionDatabase['deleteTurnsAfter']> {
		const result = await this.raw.deleteTurnsAfter(turnId);
		return result;
	}

	async deleteAllTurns(...[]: Parameters<ISessionDatabase['deleteAllTurns']>): ReturnType<ISessionDatabase['deleteAllTurns']> {
		const result = await this.raw.deleteAllTurns();
		return result;
	}

	async insertPersistedTurn(...[record]: Parameters<ISessionDatabase['insertPersistedTurn']>): ReturnType<ISessionDatabase['insertPersistedTurn']> {
		const result = await this.raw.insertPersistedTurn({ ...record, chatUri: this.identity.toStorage(record.chatUri), payload: this.identity.turnPayload(record.payload, 'storage') });
		return result;
	}

	async getPersistedTurns(...[]: Parameters<ISessionDatabase['getPersistedTurns']>): ReturnType<ISessionDatabase['getPersistedTurns']> {
		const result = await this.raw.getPersistedTurns();
		return result.map(record => ({ ...record, chatUri: this.identity.toRuntime(record.chatUri), payload: this.identity.turnPayload(record.payload, 'runtime') }));
	}

	async getPersistedTurnsForChat(...[chatUri]: Parameters<ISessionDatabase['getPersistedTurnsForChat']>): ReturnType<ISessionDatabase['getPersistedTurnsForChat']> {
		const result = await this.raw.getPersistedTurnsForChat(this.identity.toStorage(chatUri));
		return result.map(record => ({ ...record, chatUri: this.identity.toRuntime(record.chatUri), payload: this.identity.turnPayload(record.payload, 'runtime') }));
	}

	async getTurnsWithCheckpointRefs(...[]: Parameters<ISessionDatabase['getTurnsWithCheckpointRefs']>): ReturnType<ISessionDatabase['getTurnsWithCheckpointRefs']> {
		return this.raw.getTurnsWithCheckpointRefs();
	}

	async getMaxTurnRowid(...[]: Parameters<ISessionDatabase['getMaxTurnRowid']>): ReturnType<ISessionDatabase['getMaxTurnRowid']> {
		return this.raw.getMaxTurnRowid();
	}

	async getRowsWatermark(...[]: Parameters<ISessionDatabase['getRowsWatermark']>): ReturnType<ISessionDatabase['getRowsWatermark']> {
		const result = await this.raw.getRowsWatermark();
		return { maxTurnRowid: result.maxTurnRowid, drafts: new Map([...result.drafts].map(([chat, draft]) => [this.identity.toRuntime(chat), this.identity.message(draft, 'runtime')!])) };
	}

	async setForeignRows(...[ownerChat, turnIds]: Parameters<ISessionDatabase['setForeignRows']>): ReturnType<ISessionDatabase['setForeignRows']> {
		return this.raw.setForeignRows(this.identity.toStorage(ownerChat), turnIds);
	}

	async getMetadataByPrefix(...[prefix]: Parameters<ISessionDatabase['getMetadataByPrefix']>): ReturnType<ISessionDatabase['getMetadataByPrefix']> {
		const result = await this.raw.getMetadataByPrefix(this.identity.metadataKey(prefix, 'storage'));
		return Object.fromEntries(Object.entries(result).map(([key, value]) => {
			const runtimeKey = this.identity.metadataKey(key, 'runtime');
			return [runtimeKey, this.identity.metadata(runtimeKey, value, 'runtime')!];
		}));
	}

	async applyMetadataChanges(...[set, remove]: Parameters<ISessionDatabase['applyMetadataChanges']>): ReturnType<ISessionDatabase['applyMetadataChanges']> {
		return this.raw.applyMetadataChanges(this.identity.metadataValues(set, 'storage'), remove.map(key => this.identity.metadataKey(key, 'storage')));
	}

	async deletePersistedTurns(...[turnIds]: Parameters<ISessionDatabase['deletePersistedTurns']>): ReturnType<ISessionDatabase['deletePersistedTurns']> {
		const result = await this.raw.deletePersistedTurns(turnIds);
		return result;
	}

	async storeFileEdit(...[edit]: Parameters<ISessionDatabase['storeFileEdit']>): ReturnType<ISessionDatabase['storeFileEdit']> {
		const result = await this.raw.storeFileEdit(edit);
		return result;
	}

	async storeFileEdits(...[edits, beforeCommit]: Parameters<ISessionDatabase['storeFileEdits']>): ReturnType<ISessionDatabase['storeFileEdits']> {
		const result = await this.raw.storeFileEdits(edits, beforeCommit);
		return result;
	}

	async getFileEdits(...[toolCallIds]: Parameters<ISessionDatabase['getFileEdits']>): ReturnType<ISessionDatabase['getFileEdits']> {
		const result = await this.raw.getFileEdits(toolCallIds);
		return result;
	}

	async getAllFileEdits(...[]: Parameters<ISessionDatabase['getAllFileEdits']>): ReturnType<ISessionDatabase['getAllFileEdits']> {
		const result = await this.raw.getAllFileEdits();
		return result;
	}

	async getFileEditsByTurn(...[turnId]: Parameters<ISessionDatabase['getFileEditsByTurn']>): ReturnType<ISessionDatabase['getFileEditsByTurn']> {
		const result = await this.raw.getFileEditsByTurn(turnId);
		return result;
	}

	async readFileEditContent(...[toolCallId, filePath]: Parameters<ISessionDatabase['readFileEditContent']>): ReturnType<ISessionDatabase['readFileEditContent']> {
		const result = await this.raw.readFileEditContent(toolCallId, filePath);
		return result;
	}

	async storeTerminalOutput(...[turnId, toolCallId, content]: Parameters<ISessionDatabase['storeTerminalOutput']>): ReturnType<ISessionDatabase['storeTerminalOutput']> {
		const result = await this.raw.storeTerminalOutput(turnId, toolCallId, content);
		return result;
	}

	async deleteTerminalOutput(...[toolCallId]: Parameters<ISessionDatabase['deleteTerminalOutput']>): ReturnType<ISessionDatabase['deleteTerminalOutput']> {
		const result = await this.raw.deleteTerminalOutput(toolCallId);
		return result;
	}

	async getTerminalOutputSize(...[toolCallId]: Parameters<ISessionDatabase['getTerminalOutputSize']>): ReturnType<ISessionDatabase['getTerminalOutputSize']> {
		const result = await this.raw.getTerminalOutputSize(toolCallId);
		return result;
	}

	async getTerminalOutputSizes(...[toolCallIds]: Parameters<ISessionDatabase['getTerminalOutputSizes']>): ReturnType<ISessionDatabase['getTerminalOutputSizes']> {
		const result = await this.raw.getTerminalOutputSizes(toolCallIds);
		return result;
	}

	async readTerminalOutput(...[toolCallId]: Parameters<ISessionDatabase['readTerminalOutput']>): ReturnType<ISessionDatabase['readTerminalOutput']> {
		const result = await this.raw.readTerminalOutput(toolCallId);
		return result;
	}

	async storeToolResultResources(...[turnId, toolCallId, rows]: Parameters<ISessionDatabase['storeToolResultResources']>): ReturnType<ISessionDatabase['storeToolResultResources']> {
		const result = await this.raw.storeToolResultResources(turnId, toolCallId, rows);
		return result;
	}

	async getToolResultResources(...[toolCallIds]: Parameters<ISessionDatabase['getToolResultResources']>): ReturnType<ISessionDatabase['getToolResultResources']> {
		const result = await this.raw.getToolResultResources(toolCallIds);
		return result;
	}

	async readToolResultResourceContent(...[toolCallId, ordinal]: Parameters<ISessionDatabase['readToolResultResourceContent']>): ReturnType<ISessionDatabase['readToolResultResourceContent']> {
		const result = await this.raw.readToolResultResourceContent(toolCallId, ordinal);
		return result;
	}

	async getMetadata(...[key]: Parameters<ISessionDatabase['getMetadata']>): ReturnType<ISessionDatabase['getMetadata']> {
		const result = await this.raw.getMetadata(this.identity.metadataKey(key, 'storage'));
		return this.identity.metadata(key, result, 'runtime');
	}

	async setMetadata(...[key, value]: Parameters<ISessionDatabase['setMetadata']>): ReturnType<ISessionDatabase['setMetadata']> {
		const result = await this.raw.setMetadata(this.identity.metadataKey(key, 'storage'), this.identity.metadata(key, value, 'storage')!);
		return result;
	}

	async updateMetadata(...[key, update]: Parameters<ISessionDatabase['updateMetadata']>): ReturnType<ISessionDatabase['updateMetadata']> {
		const result = await this.raw.updateMetadata(this.identity.metadataKey(key, 'storage'), value => this.identity.metadata(key, update(this.identity.metadata(key, value, 'runtime')), 'storage')!);
		return result;
	}

	async setMetadataValues(...[values]: Parameters<ISessionDatabase['setMetadataValues']>): ReturnType<ISessionDatabase['setMetadataValues']> {
		const result = await this.raw.setMetadataValues(this.identity.metadataValues(values, 'storage'));
		return result;
	}

	async deleteMetadata(...[keys]: Parameters<ISessionDatabase['deleteMetadata']>): ReturnType<ISessionDatabase['deleteMetadata']> {
		const result = await this.raw.deleteMetadata(keys.map(key => this.identity.metadataKey(key, 'storage')));
		return result;
	}

	async setMetadataValuesIfAbsent(...[key, values, copies]: Parameters<ISessionDatabase['setMetadataValuesIfAbsent']>): ReturnType<ISessionDatabase['setMetadataValuesIfAbsent']> {
		const result = await this.raw.setMetadataValuesIfAbsent(this.identity.metadataKey(key, 'storage'), this.identity.metadataValues(values, 'storage'), copies && Object.fromEntries(Object.entries(copies).map(([key, value]) => [this.identity.metadataKey(key, 'storage'), this.identity.metadataKey(value, 'storage')])));
		return result;
	}

	async setMetadataValuesAndCatalogSyncSnapshot(...[values, snapshot, validate]: Parameters<ISessionDatabase['setMetadataValuesAndCatalogSyncSnapshot']>): ReturnType<ISessionDatabase['setMetadataValuesAndCatalogSyncSnapshot']> {
		const storedSnapshot = this.identity.record(snapshot, 'storage');
		const storedValues = this.identity.metadataValues(values, 'storage');
		storedValues[catalogRuntimeHashKey] = JSON.stringify([snapshot.payloadHash, storedSnapshot.payloadHash]);
		const result = await this.raw.setMetadataValuesAndCatalogSyncSnapshot(storedValues, storedSnapshot, validate);
		return result;
	}

	async transitionMetadataValuesAndCatalogSyncSnapshot(...[values, expectedSessionGeneration, snapshot, validate]: Parameters<ISessionDatabase['transitionMetadataValuesAndCatalogSyncSnapshot']>): ReturnType<ISessionDatabase['transitionMetadataValuesAndCatalogSyncSnapshot']> {
		const storedSnapshot = this.identity.record(snapshot, 'storage');
		const storedValues = this.identity.metadataValues(values, 'storage');
		storedValues[catalogRuntimeHashKey] = JSON.stringify([snapshot.payloadHash, storedSnapshot.payloadHash]);
		const result = await this.raw.transitionMetadataValuesAndCatalogSyncSnapshot(storedValues, expectedSessionGeneration, storedSnapshot, validate);
		return result;
	}

	async getCatalogSyncSnapshot(...[]: Parameters<ISessionDatabase['getCatalogSyncSnapshot']>): ReturnType<ISessionDatabase['getCatalogSyncSnapshot']> {
		const result = await this.raw.getCatalogSyncSnapshot();
		if (result?.state === 'acknowledged') {
			const persisted = await this.raw.getMetadata(catalogRuntimeHashKey);
			if (persisted) {
				const hashes: unknown = JSON.parse(persisted);
				if (!Array.isArray(hashes) || hashes.length !== 2 || !hashes.every(value => typeof value === 'string')) {
					throw new Error('Invalid persisted session catalog storage hashes');
				}
				if (hashes[1] === result.payloadHash) {
					this.identity.rememberHash(hashes[0], hashes[1]);
				}
			}
		}
		return this.identity.record(result, 'runtime');
	}

	async acknowledgeCatalogSyncSnapshot(...[acknowledgement]: Parameters<ISessionDatabase['acknowledgeCatalogSyncSnapshot']>): ReturnType<ISessionDatabase['acknowledgeCatalogSyncSnapshot']> {
		await this.getCatalogSyncSnapshot();
		const result = await this.raw.acknowledgeCatalogSyncSnapshot(this.identity.record(acknowledgement, 'storage'));
		return result;
	}

	async setChatDraft(...[chat, draft]: Parameters<ISessionDatabase['setChatDraft']>): ReturnType<ISessionDatabase['setChatDraft']> {
		const result = await this.raw.setChatDraft(URI.parse(this.identity.toStorage(chat.toString())), this.identity.message(draft, 'storage'));
		return result;
	}

	async getChatDraft(...[chat]: Parameters<ISessionDatabase['getChatDraft']>): ReturnType<ISessionDatabase['getChatDraft']> {
		const result = await this.raw.getChatDraft(URI.parse(this.identity.toStorage(chat.toString())));
		return this.identity.message(result, 'runtime');
	}

	async remapTurnIds(...[mapping, eventIds]: Parameters<ISessionDatabase['remapTurnIds']>): ReturnType<ISessionDatabase['remapTurnIds']> {
		const result = await this.raw.remapTurnIds(mapping, eventIds);
		return result;
	}

	async markFileReviewed(...[uri, nonce]: Parameters<ISessionDatabase['markFileReviewed']>): ReturnType<ISessionDatabase['markFileReviewed']> {
		const result = await this.raw.markFileReviewed(uri, nonce);
		return result;
	}

	async unmarkFileReviewed(...[uri, nonce]: Parameters<ISessionDatabase['unmarkFileReviewed']>): ReturnType<ISessionDatabase['unmarkFileReviewed']> {
		const result = await this.raw.unmarkFileReviewed(uri, nonce);
		return result;
	}

	async getReviewedFiles(...[]: Parameters<ISessionDatabase['getReviewedFiles']>): ReturnType<ISessionDatabase['getReviewedFiles']> {
		const result = await this.raw.getReviewedFiles();
		return result;
	}

	async getReviewedFilesForUri(...[uri]: Parameters<ISessionDatabase['getReviewedFilesForUri']>): ReturnType<ISessionDatabase['getReviewedFilesForUri']> {
		const result = await this.raw.getReviewedFilesForUri(uri);
		return result;
	}

	async isFileReviewed(...[uri, nonce]: Parameters<ISessionDatabase['isFileReviewed']>): ReturnType<ISessionDatabase['isFileReviewed']> {
		const result = await this.raw.isFileReviewed(uri, nonce);
		return result;
	}

	async vacuumInto(...[targetPath]: Parameters<ISessionDatabase['vacuumInto']>): ReturnType<ISessionDatabase['vacuumInto']> {
		const result = await this.raw.vacuumInto(targetPath);
		return result;
	}

	async whenIdle(...[]: Parameters<ISessionDatabase['whenIdle']>): ReturnType<ISessionDatabase['whenIdle']> {
		const result = await this.raw.whenIdle();
		return result;
	}

	async close(...[]: Parameters<ISessionDatabase['close']>): ReturnType<ISessionDatabase['close']> {
		const result = await this.raw.close();
		return result;
	}
}
