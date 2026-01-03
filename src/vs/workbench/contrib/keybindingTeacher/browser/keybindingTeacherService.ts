/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Mutable } from '../../../../base/common/types.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ICommandStats, IKeybindingTeacherConfiguration, IKeybindingTeacherService, DEFAULT_CONFIG } from '../common/keybindingTeacher.js';
import { KeybindingTeacherStorage } from '../common/keybindingTeacherStorage.js';
import { localize } from '../../../../nls.js';

const HIGH_FREQ_COMMANDS = /^(cursor|delete|undo|redo|tab|type|editor\.action\.clipboard)/;

const IGNORED_COMMANDS = new Set([
	'_extensionHost.command',
	'vscode.executeCommand',
	'extension.command',
]);

export class KeybindingTeacherService extends Disposable implements IKeybindingTeacherService {

	declare readonly _serviceBrand: undefined;

	private stats: Map<string, Mutable<ICommandStats>>;
	private storage: KeybindingTeacherStorage;
	private config: IKeybindingTeacherConfiguration;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@INotificationService private readonly notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this.storage = new KeybindingTeacherStorage(storageService);
		this.stats = this.storage.loadStats();
		this.config = this.loadConfiguration();

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.keybindingTeacher')) {
				this.config = this.loadConfiguration();
			}
		}));

		// Distinguish keybinding vs UI command execution using currentlyDispatchingCommandId
		this._register(commandService.onDidExecuteCommand(e => {
			if (this.keybindingService.currentlyDispatchingCommandId === e.commandId) {
				this.recordKeybindingExecution(e.commandId);
			} else {
				this.recordUICommandExecution(e.commandId);
			}
		}));
	}

	private loadConfiguration(): IKeybindingTeacherConfiguration {
		const config = this.configurationService.getValue<Partial<IKeybindingTeacherConfiguration>>('workbench.keybindingTeacher') || {};
		return {
			enabled: config.enabled !== undefined ? config.enabled : DEFAULT_CONFIG.enabled,
			threshold: config.threshold !== undefined ? config.threshold : DEFAULT_CONFIG.threshold,
			cooldownMinutes: config.cooldownMinutes !== undefined ? config.cooldownMinutes : DEFAULT_CONFIG.cooldownMinutes
		};
	}

	recordUICommandExecution(commandId: string): void {
		if (!this.config.enabled) {
			return;
		}

		if (this.shouldIgnoreCommand(commandId)) {
			return;
		}

		const stats = this.getOrCreateStats(commandId);
		stats.uiExecutions++;

		this.stats.set(commandId, stats);
		this.storage.saveStats(this.stats);

		if (this.shouldShowSuggestion(stats)) {
			this.showKeybindingSuggestion(commandId, stats);
		}
	}

	recordKeybindingExecution(commandId: string): void {
		if (!this.config.enabled) {
			return;
		}

		if (this.shouldIgnoreCommand(commandId)) {
			return;
		}

		const stats = this.getOrCreateStats(commandId);
		stats.keyboardExecutions++;

		this.stats.set(commandId, stats);
		this.storage.saveStats(this.stats);
	}

	private shouldIgnoreCommand(commandId: string): boolean {
		if (HIGH_FREQ_COMMANDS.test(commandId)) {
			return true;
		}

		if (IGNORED_COMMANDS.has(commandId)) {
			return true;
		}

		const keybinding = this.keybindingService.lookupKeybinding(commandId);
		if (!keybinding) {
			return true;
		}

		return false;
	}

	private getOrCreateStats(commandId: string): Mutable<ICommandStats> {
		let stats = this.stats.get(commandId);
		if (!stats) {
			stats = {
				commandId,
				uiExecutions: 0,
				keyboardExecutions: 0,
				totalExecutions: 0,
				lastNotified: undefined,
				dismissed: false,
				firstUIExecution: Date.now()
			};
			this.stats.set(commandId, stats);
		}
		stats.totalExecutions = stats.uiExecutions + stats.keyboardExecutions;
		return stats;
	}

	private shouldShowSuggestion(stats: Mutable<ICommandStats>): boolean {
		if (stats.dismissed) {
			return false;
		}

		// Use modulo to trigger every N times while preserving historical count
		if (stats.uiExecutions < this.config.threshold || stats.uiExecutions % this.config.threshold !== 0) {
			return false;
		}

		if (stats.lastNotified && this.config.cooldownMinutes > 0) {
			const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
			const timeSinceLastNotified = Date.now() - stats.lastNotified;
			if (timeSinceLastNotified < cooldownMs) {
				return false;
			}
		}

		return true;
	}

	private showKeybindingSuggestion(commandId: string, stats: Mutable<ICommandStats>): void {
		const keybinding = this.keybindingService.lookupKeybinding(commandId);
		if (!keybinding) {
			return;
		}

		const keybindingLabel = keybinding.getLabel();
		if (!keybindingLabel) {
			return;
		}

		stats.lastNotified = Date.now();
		this.stats.set(commandId, stats);
		this.storage.saveStats(this.stats);

		const commandLabel = this.getCommandLabel(commandId);

		const message = localize(
			'keybindingTeacher.suggestion',
			"You can use {0} for \"{1}\"",
			keybindingLabel,
			commandLabel
		);

		const actions = [];

		actions.push({
			label: localize('keybindingTeacher.showKeybindings', "Show All Keybindings"),
			run: () => {
				this.commandService.executeCommand('workbench.action.openGlobalKeybindings');
			}
		});

		actions.push({
			label: localize('keybindingTeacher.dismiss', "Don't Show Again for This Command"),
			run: () => {
				this.dismissCommand(commandId);
			}
		});

		this.notificationService.prompt(
			Severity.Info,
			message,
			actions,
			{
				sticky: false
			}
		);
	}

	private getCommandLabel(commandId: string): string {
		return commandId
			.replace(/^workbench\.action\./, '')
			.replace(/^editor\.action\./, '')
			.replace(/\./g, ' ')
			.replace(/([A-Z])/g, ' $1')
			.trim()
			.toLowerCase();
	}

	getCommandStats(commandId: string): ICommandStats | undefined {
		return this.stats.get(commandId);
	}

	dismissCommand(commandId: string): void {
		const stats = this.getOrCreateStats(commandId);
		stats.dismissed = true;
		this.stats.set(commandId, stats);
		this.storage.saveStats(this.stats);
	}

	undismissCommand(commandId: string): void {
		const stats = this.stats.get(commandId);
		if (stats) {
			stats.dismissed = false;
			stats.uiExecutions = 0;
			stats.lastNotified = undefined;
			this.stats.set(commandId, stats);
			this.storage.saveStats(this.stats);
		}
	}

	getDismissedCommands(): string[] {
		const dismissed: string[] = [];
		for (const [commandId, stats] of this.stats.entries()) {
			if (stats.dismissed) {
				dismissed.push(commandId);
			}
		}
		return dismissed.sort();
	}

	resetAllStats(): void {
		this.stats.clear();
		this.storage.clearStats();
	}

	override dispose(): void {
		this.storage.saveStats(this.stats);
		super.dispose();
	}
}
