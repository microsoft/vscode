/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IPlotHistoryGroup, IErdosPlotClient } from '../../common/erdosPlotsService.js';
import { generateUuid } from '../../../../../base/common/uuid.js';

/**
 * Manages plot history grouping by batch and source attribution.
 */
export class HistoryGroupManager extends Disposable {

	private readonly _groupCatalog = new Map<string, IPlotHistoryGroup>();

	private readonly _onGroupModifiedEmitter = this._register(new Emitter<void>());
	readonly onGroupModified: Event<void> = this._onGroupModifiedEmitter.event;

	getAllGroups(): IPlotHistoryGroup[] {
		return Array.from(this._groupCatalog.values())
			.sort((a, b) => b.timestamp - a.timestamp);
	}

	retrieveMembersOfGroup(groupIdentifier: string, clientLookup: (id: string) => IErdosPlotClient | undefined): IErdosPlotClient[] {
		const groupData = this._groupCatalog.get(groupIdentifier);
		if (!groupData) {
			return [];
		}

		return groupData.plotIds
			.map(id => clientLookup(id))
			.filter(client => client !== undefined) as IErdosPlotClient[];
	}

	incorporateClient(client: IErdosPlotClient): void {
		const sourceLabel = this._extractSourceLabel(client);
		const sourceCategory = client.metadata.source_type || 'interactive';
		const creationTimestamp = client.metadata.created;
		const sessionIdentifier = client.metadata.session_id;
		const batchIdentifier = client.metadata.batch_id;

		if (!batchIdentifier) {
			this._establishStandaloneGroup(client.id, sourceLabel, sourceCategory, creationTimestamp, sessionIdentifier, client.metadata.language);
			return;
		}

		const matchingGroup = Array.from(this._groupCatalog.values()).find(g => g.batchId === batchIdentifier);

		if (matchingGroup) {
			matchingGroup.plotIds.push(client.id);
			this._onGroupModifiedEmitter.fire();
		} else {
			this._establishBatchGroup(client.id, sourceLabel, sourceCategory, creationTimestamp, sessionIdentifier, client.metadata.language, batchIdentifier);
		}
	}

	removeClient(clientIdentifier: string): void {
		const abandonedGroups: string[] = [];
		
		for (const [groupId, groupData] of this._groupCatalog.entries()) {
			const memberIndex = groupData.plotIds.indexOf(clientIdentifier);
			if (memberIndex !== -1) {
				groupData.plotIds.splice(memberIndex, 1);
				if (groupData.plotIds.length === 0) {
					abandonedGroups.push(groupId);
				}
			}
		}

		abandonedGroups.forEach(groupId => {
			this._groupCatalog.delete(groupId);
		});

		if (abandonedGroups.length > 0) {
			this._onGroupModifiedEmitter.fire();
		}
	}

	removeMultipleClients(identifiers: string[]): void {
		const abandonedGroups: string[] = [];
		
		for (const [groupId, groupData] of this._groupCatalog.entries()) {
			const filteredMembers = groupData.plotIds.filter(id => !identifiers.includes(id));

			if (filteredMembers.length === 0) {
				abandonedGroups.push(groupId);
			} else if (filteredMembers.length !== groupData.plotIds.length) {
				(groupData.plotIds as string[]).length = 0;
				(groupData.plotIds as string[]).push(...filteredMembers);
			}
		}

		abandonedGroups.forEach(groupId => {
			this._groupCatalog.delete(groupId);
		});

		this._onGroupModifiedEmitter.fire();
	}

	purgeAllGroups(): void {
		this._groupCatalog.clear();
		this._onGroupModifiedEmitter.fire();
	}

	private _extractSourceLabel(client: IErdosPlotClient): string {
		if (client.metadata.source_file) {
			const pathSegments = client.metadata.source_file.split('/');
			return pathSegments[pathSegments.length - 1];
		}

		if (client.metadata.source_type === 'notebook' && !client.metadata.source_file) {
			return client.metadata.language ? `${client.metadata.language} Notebook` : 'Notebook';
		}

		return 'Console';
	}

	private _establishStandaloneGroup(clientId: string, sourceLabel: string, sourceCategory: string, timestamp: number, sessionId: string, language?: string): void {
		const groupId = `group-${generateUuid()}`;
		const groupData: IPlotHistoryGroup = {
			id: groupId,
			source: sourceLabel,
			sourceType: sourceCategory,
			timestamp,
			plotIds: [clientId],
			sessionId,
			language,
			batchId: undefined
		};

		this._groupCatalog.set(groupId, groupData);
		this._onGroupModifiedEmitter.fire();
	}

	private _establishBatchGroup(clientId: string, sourceLabel: string, sourceCategory: string, timestamp: number, sessionId: string, language: string | undefined, batchId: string): void {
		const groupId = `group-${generateUuid()}`;
		const groupData: IPlotHistoryGroup = {
			id: groupId,
			source: sourceLabel,
			sourceType: sourceCategory,
			timestamp,
			plotIds: [clientId],
			sessionId,
			language,
			batchId
		};

		this._groupCatalog.set(groupId, groupData);
		this._onGroupModifiedEmitter.fire();
	}
}


