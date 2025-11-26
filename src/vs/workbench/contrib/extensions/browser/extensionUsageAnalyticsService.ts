/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { IExtensionService, IWillActivateEvent } from '../../../services/extensions/common/extensions.js';
import {
	IExtensionUsageAnalyticsService,
	IExtensionUsageAnalyticsData,
	IExtensionUsageRecord,
	IDailyUsageStat,
	UsageFrequency
} from '../common/extensionUsageAnalytics.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ThrottledDelayer } from '../../../../base/common/async.js';
import { IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';

const STORAGE_FILE_NAME = 'extensionUsageAnalytics.json';
const DATA_VERSION = 1;
const SAVE_DELAY_MS = 5000; // 5 second debounce for persistence

export class ExtensionUsageAnalyticsService extends Disposable implements IExtensionUsageAnalyticsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeUsageData = this._register(new Emitter<void>());
	readonly onDidChangeUsageData: Event<void> = this._onDidChangeUsageData.event;

	private _data: IExtensionUsageAnalyticsData = { version: DATA_VERSION, records: {} };
	private _commandToExtensionMap: Map<string, string> = new Map();
	private readonly _saveDelayer: ThrottledDelayer<void>;

	constructor(
		@IExtensionService private readonly extensionService: IExtensionService,
		@ICommandService private readonly commandService: ICommandService,
		@IFileService private readonly fileService: IFileService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this._saveDelayer = this._register(new ThrottledDelayer(SAVE_DELAY_MS));

		// Initialize and set up tracking
		this._initialize();
	}

	private async _initialize(): Promise<void> {
		try {
			// Load existing data
			await this._loadData();

			// Build command-to-extension map
			await this._buildCommandExtensionMap();

			// Set up event listeners for tracking
			this._setupTracking();

			// Prune old data
			this._pruneOldData();

			this.logService.debug('[ExtensionUsageAnalytics] Initialized successfully');
		} catch (error) {
			this.logService.error('[ExtensionUsageAnalytics] Failed to initialize:', error);
		}
	}

	private _getStorageUri(): URI {
		return URI.joinPath(this.userDataProfileService.currentProfile.globalStorageHome, STORAGE_FILE_NAME);
	}

	private async _loadData(): Promise<void> {
		const storageUri = this._getStorageUri();

		try {
			const exists = await this.fileService.exists(storageUri);
			if (exists) {
				const content = await this.fileService.readFile(storageUri);
				const parsed = JSON.parse(content.value.toString());
				if (parsed && parsed.version === DATA_VERSION) {
					this._data = parsed;
				} else {
					// Data version mismatch, start fresh but preserve what we can
					this._data = { version: DATA_VERSION, records: {} };
				}
			}
		} catch (error) {
			this.logService.warn('[ExtensionUsageAnalytics] Failed to load data, starting fresh:', error);
			this._data = { version: DATA_VERSION, records: {} };
		}
	}

	private async _saveData(): Promise<void> {
		if (!this.isEnabled()) {
			return;
		}

		const storageUri = this._getStorageUri();
		try {
			const content = JSON.stringify(this._data, null, 2);
			await this.fileService.writeFile(storageUri, VSBuffer.fromString(content));
		} catch (error) {
			this.logService.error('[ExtensionUsageAnalytics] Failed to save data:', error);
		}
	}

	private _scheduleSave(): void {
		this._saveDelayer.trigger(() => this._saveData());
	}

	private async _buildCommandExtensionMap(): Promise<void> {
		// Wait for extensions to be registered
		await this.extensionService.whenInstalledExtensionsRegistered();

		const extensions = this.extensionService.extensions;
		this._commandToExtensionMap.clear();

		for (const ext of extensions) {
			this._mapCommandsForExtension(ext);
		}

		// Listen for extension changes to update the map
		this._register(this.extensionService.onDidChangeExtensions(({ added, removed }) => {
			for (const ext of removed) {
				// Remove commands for removed extensions
				for (const [cmd, extId] of this._commandToExtensionMap) {
					if (extId === ext.identifier.value) {
						this._commandToExtensionMap.delete(cmd);
					}
				}
			}
			for (const ext of added) {
				this._mapCommandsForExtension(ext);
			}
		}));
	}

	private _mapCommandsForExtension(ext: IExtensionDescription): void {
		const commands = ext.contributes?.commands;
		if (commands) {
			const commandList = Array.isArray(commands) ? commands : [commands];
			for (const cmd of commandList) {
				if (cmd && typeof cmd === 'object') {
					const commandObj = cmd as { command?: string };
					if (commandObj.command) {
						this._commandToExtensionMap.set(commandObj.command, ext.identifier.value);
					}
				}
			}
		}
	}

	private _setupTracking(): void {
		// Track extension activations
		this._register(this.extensionService.onWillActivateByEvent((e: IWillActivateEvent) => {
			if (this.isEnabled()) {
				// Extract extension ID from activation event
				// The event format is like "onCommand:extension.command" or "*"
				const activationEvent = e.event;

				// For "onCommand" activations, we track when the activation promise resolves
				// and identify which extension(s) were activated
				e.activation.then(() => {
					// We need to find which extension was activated
					// This is a bit tricky, but we can check extensions status
					const statuses = this.extensionService.getExtensionsStatus();
					for (const [id, status] of Object.entries(statuses)) {
						if (status.activationStarted && status.activationTimes) {
							// This extension was activated, track it if it matches the event
							const ext = this.extensionService.extensions.find(
								e => e.identifier.value === id
							);
							if (ext?.activationEvents?.includes(activationEvent)) {
								this.trackActivation(id);
							}
						}
					}
				});
			}
		}));

		// Track command executions
		this._register(this.commandService.onDidExecuteCommand(e => {
			if (this.isEnabled()) {
				const extensionId = this._commandToExtensionMap.get(e.commandId);
				if (extensionId) {
					this.trackCommand(extensionId, e.commandId);
				}
			}
		}));
	}

	private _pruneOldData(): void {
		const retentionDays = this._getRetentionDays();
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
		const cutoffStr = this._formatDate(cutoffDate);

		let changed = false;
		for (const record of Object.values(this._data.records)) {
			const originalLength = record.dailyStats.length;
			record.dailyStats = record.dailyStats.filter(stat => stat.date >= cutoffStr);
			if (record.dailyStats.length !== originalLength) {
				changed = true;
			}
		}

		if (changed) {
			this._scheduleSave();
		}
	}

	private _getRetentionDays(): number {
		return this.configurationService.getValue<number>('extensions.usageAnalytics.retentionDays') ?? 90;
	}

	private _formatDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	private _getTodayString(): string {
		return this._formatDate(new Date());
	}

	private _getOrCreateRecord(extensionId: string): IExtensionUsageRecord {
		let record = this._data.records[extensionId];
		if (!record) {
			record = {
				extensionId,
				activationCount: 0,
				commandExecutions: 0,
				lastActivated: 0,
				lastCommandExecuted: 0,
				firstSeen: Date.now(),
				dailyStats: []
			};
			this._data.records[extensionId] = record;
		}
		return record;
	}

	private _getOrCreateDailyStat(record: IExtensionUsageRecord): IDailyUsageStat {
		const today = this._getTodayString();
		let stat = record.dailyStats.find(s => s.date === today);
		if (!stat) {
			stat = { date: today, activations: 0, commands: 0 };
			record.dailyStats.push(stat);
			// Keep sorted by date
			record.dailyStats.sort((a, b) => a.date.localeCompare(b.date));
		}
		return stat;
	}

	trackActivation(extensionId: string): void {
		if (!this.isEnabled()) {
			return;
		}

		const record = this._getOrCreateRecord(extensionId);
		const dailyStat = this._getOrCreateDailyStat(record);

		record.activationCount++;
		record.lastActivated = Date.now();
		dailyStat.activations++;

		this._scheduleSave();
		this._onDidChangeUsageData.fire();
	}

	trackCommand(extensionId: string, _commandId: string): void {
		if (!this.isEnabled()) {
			return;
		}

		const record = this._getOrCreateRecord(extensionId);
		const dailyStat = this._getOrCreateDailyStat(record);

		record.commandExecutions++;
		record.lastCommandExecuted = Date.now();
		dailyStat.commands++;

		this._scheduleSave();
		this._onDidChangeUsageData.fire();
	}

	getUsageRecords(): IExtensionUsageRecord[] {
		return Object.values(this._data.records);
	}

	getUsageRecord(extensionId: string): IExtensionUsageRecord | undefined {
		return this._data.records[extensionId];
	}

	getUsageFrequency(extensionId: string): UsageFrequency {
		const last7Days = this.getUsageCountForDays(extensionId, 7);
		const last30Days = this.getUsageCountForDays(extensionId, 30);

		if (last7Days >= 10) {
			return UsageFrequency.Frequent;
		} else if (last7Days >= 1) {
			return UsageFrequency.Occasional;
		} else if (last30Days === 0) {
			return UsageFrequency.Rare;
		}
		return UsageFrequency.Occasional;
	}

	getUsageCountForDays(extensionId: string, days: number): number {
		const record = this._data.records[extensionId];
		if (!record) {
			return 0;
		}

		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - days);
		const cutoffStr = this._formatDate(cutoffDate);

		let count = 0;
		for (const stat of record.dailyStats) {
			if (stat.date >= cutoffStr) {
				count += stat.activations + stat.commands;
			}
		}
		return count;
	}

	async clearAllData(): Promise<void> {
		this._data = { version: DATA_VERSION, records: {} };

		const storageUri = this._getStorageUri();
		try {
			const exists = await this.fileService.exists(storageUri);
			if (exists) {
				await this.fileService.del(storageUri);
			}
		} catch (error) {
			this.logService.error('[ExtensionUsageAnalytics] Failed to delete data file:', error);
		}

		this._onDidChangeUsageData.fire();
	}

	isEnabled(): boolean {
		return this.configurationService.getValue<boolean>('extensions.usageAnalytics.enabled') ?? true;
	}
}

registerSingleton(IExtensionUsageAnalyticsService, ExtensionUsageAnalyticsService, InstantiationType.Delayed);

