/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ICommandStats } from './keybindingTeacher.js';

const STORAGE_KEY = 'keybindingTeacher.commandStats';

interface StoredStats {
	uiExecutions: number;
	lastNotified?: number;
	dismissed: boolean;
}

export class KeybindingTeacherStorage {

	constructor(
		private readonly storageService: IStorageService
	) { }

	loadStats(): Map<string, ICommandStats> {
		const stored = this.storageService.get(STORAGE_KEY, StorageScope.APPLICATION, '{}');
		const statsMap = new Map<string, ICommandStats>();

		try {
			const parsed: Record<string, StoredStats> = JSON.parse(stored);
			for (const [commandId, stats] of Object.entries(parsed)) {
				statsMap.set(commandId, {
					commandId,
					uiExecutions: stats.uiExecutions,
					lastNotified: stats.lastNotified,
					dismissed: stats.dismissed
				});
			}
		} catch (error) {
			// Invalid JSON, start fresh
			console.error('Failed to load keybinding teacher stats:', error);
		}

		return statsMap;
	}

	saveStats(stats: Map<string, ICommandStats>): void {
		const toStore: Record<string, StoredStats> = {};

		for (const [commandId, stat] of stats.entries()) {
			toStore[commandId] = {
				uiExecutions: stat.uiExecutions,
				lastNotified: stat.lastNotified,
				dismissed: stat.dismissed
			};
		}

		this.storageService.store(STORAGE_KEY, JSON.stringify(toStore), StorageScope.APPLICATION, StorageTarget.USER);
	}

	clearStats(): void {
		this.storageService.remove(STORAGE_KEY, StorageScope.APPLICATION);
	}
}
