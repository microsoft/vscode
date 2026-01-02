/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ICommandStats, IKeybindingTeacherConfiguration, IKeybindingTeacherService, DEFAULT_CONFIG } from '../common/keybindingTeacher.js';
import { KeybindingTeacherStorage } from '../common/keybindingTeacherStorage.js';
import { localize } from '../../../../nls.js';

// Internal mutable version of ICommandStats
interface MutableCommandStats {
	commandId: string;
	uiExecutions: number;
	keyboardExecutions: number;
	totalExecutions: number;
	lastNotified: number | undefined;
	dismissed: boolean;
	firstUIExecution: number;
}

// High-frequency commands that should not trigger suggestions
const HIGH_FREQ_COMMANDS = /^(cursor|delete|undo|redo|tab|type|editor\.action\.clipboard)/;

// Commands that don't have useful keybindings to teach
const IGNORED_COMMANDS = new Set([
	'_extensionHost.command',
	'vscode.executeCommand',
	'extension.command',
]);

export class KeybindingTeacherService extends Disposable implements IKeybindingTeacherService {

	declare readonly _serviceBrand: undefined;

	private stats: Map<string, MutableCommandStats>;
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

		console.log('[KeybindingTeacher] Service initialized, enabled:', this.config.enabled);

		// Listen for configuration changes
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('keybindingTeacher')) {
				this.config = this.loadConfiguration();
				console.log('[KeybindingTeacher] Configuration changed, enabled:', this.config.enabled);
			}
		}));

		// Hook into command execution to record the source
		// We use the keybindingService.currentlyDispatchingCommandId to determine
		// if a command is being executed from a keybinding or from UI
		this._register(commandService.onDidExecuteCommand(e => {
			// Check if this command is currently being dispatched by the keybinding service
			const isFromKeybinding = this.keybindingService.currentlyDispatchingCommandId === e.commandId;
			console.log('[KeybindingTeacher] Command executed:', e.commandId, 'from keybinding:', isFromKeybinding);

			if (isFromKeybinding) {
				this.recordKeybindingExecution(e.commandId);
			} else {
				this.recordUICommandExecution(e.commandId);
			}
		}));
	}

	private loadConfiguration(): IKeybindingTeacherConfiguration {
		const config = this.configurationService.getValue<Partial<IKeybindingTeacherConfiguration>>('keybindingTeacher') || {};
		return {
			enabled: config.enabled !== undefined ? config.enabled : DEFAULT_CONFIG.enabled,
			threshold: config.threshold !== undefined ? config.threshold : DEFAULT_CONFIG.threshold,
			cooldownMinutes: config.cooldownMinutes !== undefined ? config.cooldownMinutes : DEFAULT_CONFIG.cooldownMinutes,
			showDismissOption: config.showDismissOption !== undefined ? config.showDismissOption : DEFAULT_CONFIG.showDismissOption
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

		// Check if we should show a suggestion
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
		// Ignore high-frequency commands
		if (HIGH_FREQ_COMMANDS.test(commandId)) {
			return true;
		}

		// Ignore specific commands
		if (IGNORED_COMMANDS.has(commandId)) {
			return true;
		}

		// Ignore if no keybinding exists
		const keybinding = this.keybindingService.lookupKeybinding(commandId);
		if (!keybinding) {
			return true;
		}

		return false;
	}

	private getOrCreateStats(commandId: string): MutableCommandStats {
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

	private shouldShowSuggestion(stats: MutableCommandStats): boolean {
		// Don't show if dismissed
		if (stats.dismissed) {
			return false;
		}

		// Check threshold
		if (stats.uiExecutions < this.config.threshold) {
			return false;
		}

		// Check cooldown (if cooldown is 0, always show)
		if (stats.lastNotified && this.config.cooldownMinutes > 0) {
			const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
			const timeSinceLastNotified = Date.now() - stats.lastNotified;
			if (timeSinceLastNotified < cooldownMs) {
				return false;
			}
		}

		return true;
	}

	private showKeybindingSuggestion(commandId: string, stats: MutableCommandStats): void {
		const keybinding = this.keybindingService.lookupKeybinding(commandId);
		if (!keybinding) {
			return;
		}

		const keybindingLabel = keybinding.getLabel();
		if (!keybindingLabel) {
			return;
		}

		// Update last notified time and reset UI execution count
		stats.lastNotified = Date.now();
		stats.uiExecutions = 0; // Reset counter so user starts fresh after learning the shortcut
		this.stats.set(commandId, stats);
		this.storage.saveStats(this.stats);

		// Get a friendly command name
		const commandLabel = this.getCommandLabel(commandId);

		const message = localize(
			'keybindingTeacher.suggestion',
			'You can use {0} for "{1}"',
			keybindingLabel,
			commandLabel
		);

		const actions = [];

		// Show keybindings action
		actions.push({
			label: localize('keybindingTeacher.showKeybindings', 'Show All Keybindings'),
			run: () => {
				this.commandService.executeCommand('workbench.action.openGlobalKeybindings');
			}
		});

		// Dismiss option
		if (this.config.showDismissOption) {
			actions.push({
				label: localize('keybindingTeacher.dismiss', "Don't Show Again for This Command"),
				run: () => {
					this.dismissCommand(commandId);
				}
			});
		}

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
		// Try to get a friendly label from the command palette
		// For now, just clean up the command ID
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

	setEnabled(enabled: boolean): void {
		const currentConfig = this.configurationService.getValue<Partial<IKeybindingTeacherConfiguration>>('keybindingTeacher') || {};
		this.configurationService.updateValue('keybindingTeacher', { ...currentConfig, enabled });
	}

	override dispose(): void {
		// Save stats one last time
		this.storage.saveStats(this.stats);
		super.dispose();
	}
}
