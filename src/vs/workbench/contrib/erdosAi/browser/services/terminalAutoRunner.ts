/*
 * Copyright (C) 2025 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { BashCommandParser } from '../functions/bashCommandParser.js';

export interface IAutoRunResult {
	shouldAutoRun: boolean;
	reason: string;
	extractedCommands: string[];
	matchedRules?: string[];
}

export interface IAutoRunSettings {
	autoAcceptTerminal: boolean;
	autoAcceptTerminalAllowAnything: boolean;
	autoAcceptTerminalAllowList: string[];
	autoAcceptTerminalDenyList: string[];
}

/**
 * Handles auto-run functionality for terminal commands in Erdos AI.
 * This integrates bash command parsing with configurable allow/deny lists
 * to provide seamless auto-execution similar to RAO's implementation.
 */
export class TerminalAutoRunner extends Disposable {

	private _settings: IAutoRunSettings;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._settings = this._loadSettings();
		
		// Listen for configuration changes
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('erdosAi.autoAccept')) {
				this._settings = this._loadSettings();
				this._logService.debug('TerminalAutoRunner: Settings updated');
			}
		}));
	}

	/**
	 * Load auto-run settings from configuration
	 */
	private _loadSettings(): IAutoRunSettings {
		const config = this._configurationService.getValue('erdosAi.autoAccept');
		
		// Validate configuration structure
		if (!config || typeof config !== 'object') {
			this._logService.warn('TerminalAutoRunner: Invalid or missing erdosAi.autoAccept configuration, using defaults');
			return {
				autoAcceptTerminal: false,
				autoAcceptTerminalAllowAnything: false,
				autoAcceptTerminalAllowList: [],
				autoAcceptTerminalDenyList: []
			};
		}
		
		const typedConfig = config as { 
			terminal?: boolean; 
			terminalAllowAnything?: boolean; 
			terminalAllowList?: string[]; 
			terminalDenyList?: string[]; 
		};
		
		return {
			autoAcceptTerminal: Boolean(typedConfig.terminal),
			autoAcceptTerminalAllowAnything: Boolean(typedConfig.terminalAllowAnything),
			autoAcceptTerminalAllowList: Array.isArray(typedConfig.terminalAllowList) ? typedConfig.terminalAllowList : [],
			autoAcceptTerminalDenyList: Array.isArray(typedConfig.terminalDenyList) ? typedConfig.terminalDenyList : []
		};
	}

	/**
	 * Determine if a terminal command should be auto-run based on extracted bash commands
	 * and the configured auto-approval rules.
	 */
	public shouldAutoRunTerminalCommand(terminalCommand: string): IAutoRunResult {
		try {
			this._logService.debug(`TerminalAutoRunner: Evaluating command for auto-run: ${terminalCommand}`);
			this._logService.debug(`TerminalAutoRunner: Current settings:`, JSON.stringify(this._settings, null, 2));

			// Check if auto-accept is enabled
			if (!this._settings.autoAcceptTerminal) {
				this._logService.debug('TerminalAutoRunner: Auto-accept is disabled');
				return {
					shouldAutoRun: false,
					reason: 'Terminal auto-accept is disabled',
					extractedCommands: []
				};
			}

			// Extract bash commands from the terminal command
			const extractedCommands = BashCommandParser.extractBashCommands(terminalCommand);
			this._logService.debug(`TerminalAutoRunner: Extracted commands: ${extractedCommands.join(', ')}`);

			// If no commands were extracted, don't auto-run
			if (extractedCommands.length === 0) {
				return {
					shouldAutoRun: false,
					reason: 'No commands extracted from terminal command',
					extractedCommands: []
				};
			}

			// Trim whitespace from extracted commands
			const trimmedCommands = extractedCommands.map(cmd => cmd.trim()).filter(cmd => cmd.length > 0);

			if (trimmedCommands.length === 0) {
				return {
					shouldAutoRun: false,
					reason: 'No valid commands after trimming',
					extractedCommands
				};
			}

			// Check allow_anything setting
			const allowAnything = this._settings.autoAcceptTerminalAllowAnything;

			if (allowAnything) {
				// If allow_anything is TRUE, check that none of the commands are in the deny list
				const denyList = this._settings.autoAcceptTerminalDenyList
					.map(cmd => cmd.trim())
					.filter(cmd => cmd.length > 0);

				const deniedCommands: string[] = [];
				const matchedDenyRules: string[] = [];

				for (const cmd of trimmedCommands) {
					const matchResult = this._matchesAnyPattern(cmd, denyList);
					if (matchResult.matches) {
						deniedCommands.push(cmd);
						if (matchResult.matchedPattern && !matchedDenyRules.includes(matchResult.matchedPattern)) {
							matchedDenyRules.push(matchResult.matchedPattern);
						}
					}
				}

				if (deniedCommands.length > 0) {
					return {
						shouldAutoRun: false,
						reason: `Commands denied by rules: ${matchedDenyRules.join(', ')} (matched: ${deniedCommands.join(', ')})`,
						extractedCommands,
						matchedRules: matchedDenyRules
					};
				}

				return {
					shouldAutoRun: true,
					reason: 'All commands allowed (allow_anything enabled, none in deny list)',
					extractedCommands,
					matchedRules: []
				};
			} else {
				// If allow_anything is FALSE, check that ALL commands are in the allow list
				const allowList = this._settings.autoAcceptTerminalAllowList
					.map(cmd => cmd.trim())
					.filter(cmd => cmd.length > 0);

				const notAllowedCommands: string[] = [];
				const allowedCommands: string[] = [];
				const matchedRules: string[] = [];

				for (const cmd of trimmedCommands) {
					const matchResult = this._matchesAnyPattern(cmd, allowList);
					if (matchResult.matches) {
						allowedCommands.push(cmd);
						if (matchResult.matchedPattern && !matchedRules.includes(matchResult.matchedPattern)) {
							matchedRules.push(matchResult.matchedPattern);
						}
					} else {
						notAllowedCommands.push(cmd);
					}
				}

				if (notAllowedCommands.length > 0) {
					return {
						shouldAutoRun: false,
						reason: `Commands not in allow list: ${notAllowedCommands.join(', ')}`,
						extractedCommands,
						matchedRules
					};
				}

				return {
					shouldAutoRun: true,
					reason: 'All commands are in allow list',
					extractedCommands,
					matchedRules
				};
			}

		} catch (e) {
			this._logService.error(`TerminalAutoRunner: Error evaluating command for auto-run: ${e}`);
			return {
				shouldAutoRun: false,
				reason: 'Error evaluating command for auto-run',
				extractedCommands: []
			};
		}
	}

	/**
	 * Get a user-friendly explanation of why a command was or wasn't auto-run
	 */
	public getAutoRunExplanation(result: IAutoRunResult): string {
		if (result.shouldAutoRun) {
			if (result.matchedRules && result.matchedRules.length > 0) {
				return `Auto-run approved - matched commands: ${result.matchedRules.join(', ')}`;
			}
			return 'Auto-run approved by configuration rules';
		} else {
			return result.reason;
		}
	}

	/**
	 * Check if auto-run is enabled in the configuration
	 */
	public isAutoRunEnabled(): boolean {
		return this._settings.autoAcceptTerminal;
	}

	/**
	 * Get current settings (for debugging/testing)
	 */
	public getSettings(): IAutoRunSettings {
		return { ...this._settings };
	}

	/**
	 * Add a command to the allow list
	 */
	public async addToAllowList(command: string): Promise<void> {
		const currentConfig = this._configurationService.getValue('erdosAi.autoAccept');
		const typedConfig = currentConfig as { terminalAllowList?: string[] } || {};
		const allowList = [...(Array.isArray(typedConfig.terminalAllowList) ? typedConfig.terminalAllowList : [])];
		
		if (!allowList.includes(command)) {
			allowList.push(command);
			await this._configurationService.updateValue('erdosAi.autoAccept.terminalAllowList', allowList);
			this._logService.info(`TerminalAutoRunner: Added '${command}' to allow list`);
		}
	}

	/**
	 * Add a command to the deny list
	 */
	public async addToDenyList(command: string): Promise<void> {
		const currentConfig = this._configurationService.getValue('erdosAi.autoAccept');
		const typedConfig = currentConfig as { terminalDenyList?: string[] } || {};
		const denyList = [...(Array.isArray(typedConfig.terminalDenyList) ? typedConfig.terminalDenyList : [])];
		
		if (!denyList.includes(command)) {
			denyList.push(command);
			await this._configurationService.updateValue('erdosAi.autoAccept.terminalDenyList', denyList);
			this._logService.info(`TerminalAutoRunner: Added '${command}' to deny list`);
		}
	}

	/**
	 * Remove a command from the allow list
	 */
	public async removeFromAllowList(command: string): Promise<void> {
		const currentConfig = this._configurationService.getValue('erdosAi.autoAccept');
		const typedConfig = currentConfig as { terminalAllowList?: string[] } || {};
		const currentList = Array.isArray(typedConfig.terminalAllowList) ? typedConfig.terminalAllowList : [];
		const allowList = currentList.filter((cmd: string) => cmd !== command);
		
		await this._configurationService.updateValue('erdosAi.autoAccept.terminalAllowList', allowList);
		this._logService.info(`TerminalAutoRunner: Removed '${command}' from allow list`);
	}

	/**
	 * Remove a command from the deny list
	 */
	public async removeFromDenyList(command: string): Promise<void> {
		const currentConfig = this._configurationService.getValue('erdosAi.autoAccept');
		const typedConfig = currentConfig as { terminalDenyList?: string[] } || {};
		const currentList = Array.isArray(typedConfig.terminalDenyList) ? typedConfig.terminalDenyList : [];
		const denyList = currentList.filter((cmd: string) => cmd !== command);
		
		await this._configurationService.updateValue('erdosAi.autoAccept.terminalDenyList', denyList);
		this._logService.info(`TerminalAutoRunner: Removed '${command}' from deny list`);
	}

	/**
	 * Check if a command matches any pattern in the list (supports regex patterns)
	 */
	private _matchesAnyPattern(command: string, patterns: string[]): { matches: boolean; matchedPattern?: string } {
		for (const pattern of patterns) {
			if (this._matchesPattern(command, pattern)) {
				return { matches: true, matchedPattern: pattern };
			}
		}
		return { matches: false };
	}

	/**
	 * Check if a command matches a specific pattern (exact string match only)
	 */
	private _matchesPattern(command: string, pattern: string): boolean {
		// Exact string match only
		return command === pattern;
	}
}
