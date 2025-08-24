/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { Event, Emitter } from '../../../../../base/common/event.js';


export const IAutoAcceptService = createDecorator<IAutoAcceptService>('autoAcceptService');

export interface AutoAcceptSettings {
	// Enable/disable auto-accept for different command types
	autoAcceptConsole: boolean;
	autoAcceptTerminal: boolean;
	autoAcceptFileOperations: boolean;
	
	// Allow lists for each command type
	consoleAllowList: string[];
	terminalAllowList: string[];
	fileOperationsAllowList: string[];
	
	// Deny lists for each command type
	consoleDenyList: string[];
	terminalDenyList: string[];
	fileOperationsDenyList: string[];
}

export interface AutoAcceptCheckResult {
	shouldAutoAccept: boolean;
	reason: string;
	functionsFound: string[];
	allowedFunctions: string[];
	deniedFunctions: string[];
}

export interface IAutoAcceptService {
	readonly _serviceBrand: undefined;
	
	/**
	 * Event fired when auto-accept settings change
	 */
	readonly onDidChangeSettings: Event<AutoAcceptSettings>;
	
	/**
	 * Get current auto-accept settings
	 */
	getSettings(): AutoAcceptSettings;
	
	/**
	 * Update auto-accept settings
	 */
	updateSettings(settings: Partial<AutoAcceptSettings>): void;
	
	/**
	 * Check if R console command should be auto-accepted
	 */
	shouldAutoAcceptRConsoleCommand(rCode: string): Promise<AutoAcceptCheckResult>;
	
	/**
	 * Check if terminal command should be auto-accepted
	 */
	shouldAutoAcceptTerminalCommand(command: string): Promise<AutoAcceptCheckResult>;
	
	/**
	 * Check if file operation should be auto-accepted
	 */
	shouldAutoAcceptFileOperation(operation: string, filePath: string): Promise<AutoAcceptCheckResult>;
	
	/**
	 * Add function to console allow list
	 */
	addToConsoleAllowList(functionName: string): void;
	
	/**
	 * Remove function from console allow list
	 */
	removeFromConsoleAllowList(functionName: string): void;
	
	/**
	 * Add function to console deny list
	 */
	addToConsoleDenyList(functionName: string): void;
	
	/**
	 * Remove function from console deny list
	 */
	removeFromConsoleDenyList(functionName: string): void;
}

export class AutoAcceptService implements IAutoAcceptService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSettings = new Emitter<AutoAcceptSettings>();
	public readonly onDidChangeSettings: Event<AutoAcceptSettings> = this._onDidChangeSettings.event;

	private static readonly STORAGE_KEY = 'erdosAi.autoAcceptSettings';
	
	// Default safe R functions that are generally safe to auto-accept
	private static readonly DEFAULT_SAFE_R_FUNCTIONS = [
		// Data inspection
		'head', 'tail', 'str', 'summary', 'names', 'colnames', 'rownames', 'dim', 'nrow', 'ncol',
		'length', 'class', 'typeof', 'mode', 'is.null', 'is.na', 'is.numeric', 'is.character',
		'is.logical', 'is.factor', 'is.data.frame', 'is.matrix', 'is.list', 'is.vector',
		
		// Basic math and statistics
		'mean', 'median', 'sd', 'var', 'min', 'max', 'range', 'sum', 'prod', 'abs', 'sqrt',
		'log', 'log10', 'exp', 'round', 'ceiling', 'floor', 'trunc', 'cor', 'cov',
		
		// Data manipulation (read-only)
		'subset', 'filter', 'select', 'arrange', 'distinct', 'slice', 'sample_n', 'sample_frac',
		'group_by', 'ungroup', 'summarise', 'summarize', 'mutate', 'transmute',
		
		// Visualization (generally safe)
		'plot', 'hist', 'boxplot', 'barplot', 'pie', 'pairs', 'ggplot', 'aes', 'geom_point',
		'geom_line', 'geom_bar', 'geom_histogram', 'geom_boxplot', 'geom_density',
		
		// String operations (read-only)
		'paste', 'paste0', 'substr', 'nchar', 'toupper', 'tolower', 'grep', 'grepl',
		'gsub', 'sub', 'strsplit', 'trimws',
		
		// Date/time (read-only)
		'Sys.Date', 'Sys.time', 'as.Date', 'as.POSIXct', 'format', 'strptime',
		
		// Package management (information only)
		'sessionInfo', 'search', 'ls', 'objects', 'exists', 'get', 'find',
		
		// Assignment operators (generally safe for variables)
		'<-', '=', '->',
		
		// Control flow (generally safe)
		'if', 'else', 'for', 'while', 'repeat', 'next', 'break', 'function',
		
		// Printing and output
		'print', 'cat', 'sprintf', 'format'
	];

	constructor(
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,

	) {}

	getSettings(): AutoAcceptSettings {
		const storedSettings = this.storageService.get(AutoAcceptService.STORAGE_KEY, StorageScope.PROFILE);
		
		if (storedSettings) {
			try {
				const parsed = JSON.parse(storedSettings);
				return {
					autoAcceptConsole: parsed.autoAcceptConsole ?? false,
					autoAcceptTerminal: parsed.autoAcceptTerminal ?? false,
					autoAcceptFileOperations: parsed.autoAcceptFileOperations ?? false,
					consoleAllowList: parsed.consoleAllowList ?? [...AutoAcceptService.DEFAULT_SAFE_R_FUNCTIONS],
					terminalAllowList: parsed.terminalAllowList ?? [],
					fileOperationsAllowList: parsed.fileOperationsAllowList ?? [],
					consoleDenyList: parsed.consoleDenyList ?? [],
					terminalDenyList: parsed.terminalDenyList ?? [],
					fileOperationsDenyList: parsed.fileOperationsDenyList ?? []
				};
			} catch (error) {
				this.logService.warn(`[AUTO ACCEPT] Failed to parse stored settings: ${error}`);
			}
		}
		
		// Return default settings
		return {
			autoAcceptConsole: false,
			autoAcceptTerminal: false,
			autoAcceptFileOperations: false,
			consoleAllowList: [...AutoAcceptService.DEFAULT_SAFE_R_FUNCTIONS],
			terminalAllowList: [],
			fileOperationsAllowList: [],
			consoleDenyList: [],
			terminalDenyList: [],
			fileOperationsDenyList: []
		};
	}

	updateSettings(settings: Partial<AutoAcceptSettings>): void {
		const currentSettings = this.getSettings();
		const newSettings = { ...currentSettings, ...settings };
		
		// Store settings
		this.storageService.store(
			AutoAcceptService.STORAGE_KEY,
			JSON.stringify(newSettings),
			StorageScope.PROFILE,
			StorageTarget.USER
		);
		
		// Fire change event
		this._onDidChangeSettings.fire(newSettings);
		
		this.logService.info(`[AUTO ACCEPT] Settings updated: ${JSON.stringify(settings)}`);
	}

	async shouldAutoAcceptRConsoleCommand(rCode: string): Promise<AutoAcceptCheckResult> {
		const settings = this.getSettings();
		
		// Check if auto-accept is enabled
		if (!settings.autoAcceptConsole) {
			return {
				shouldAutoAccept: false,
				reason: 'Auto-accept for R console commands is disabled',
				functionsFound: [],
				allowedFunctions: [],
				deniedFunctions: []
			};
		}
		
		try {
			// TODO: R function parsing was removed with help service
			// Return failed parse for now
			return {
				shouldAutoAccept: false,
				reason: 'R function parsing is not available',
				functionsFound: [],
				allowedFunctions: [],
				deniedFunctions: []
			};

		} catch (error) {
			this.logService.error(`[AUTO ACCEPT] Error checking R console command: ${error}`);
			return {
				shouldAutoAccept: false,
				reason: `Error during analysis: ${error}`,
				functionsFound: [],
				allowedFunctions: [],
				deniedFunctions: []
			};
		}
	}

	async shouldAutoAcceptTerminalCommand(command: string): Promise<AutoAcceptCheckResult> {
		const settings = this.getSettings();
		
		if (!settings.autoAcceptTerminal) {
			return {
				shouldAutoAccept: false,
				reason: 'Auto-accept for terminal commands is disabled',
				functionsFound: [],
				allowedFunctions: [],
				deniedFunctions: []
			};
		}
		
		// For now, terminal auto-accept is conservative - implement basic logic
		// TODO: Implement terminal command parsing similar to Rao's bash parsing
		return {
			shouldAutoAccept: false,
			reason: 'Terminal auto-accept not implemented yet',
			functionsFound: [],
			allowedFunctions: [],
			deniedFunctions: []
		};
	}

	async shouldAutoAcceptFileOperation(operation: string, filePath: string): Promise<AutoAcceptCheckResult> {
		const settings = this.getSettings();
		
		if (!settings.autoAcceptFileOperations) {
			return {
				shouldAutoAccept: false,
				reason: 'Auto-accept for file operations is disabled',
				functionsFound: [],
				allowedFunctions: [],
				deniedFunctions: []
			};
		}
		
		// For now, file operations auto-accept is conservative
		// TODO: Implement file operation checking similar to Rao's file auto-accept
		return {
			shouldAutoAccept: false,
			reason: 'File operation auto-accept not implemented yet',
			functionsFound: [],
			allowedFunctions: [],
			deniedFunctions: []
		};
	}

	addToConsoleAllowList(functionName: string): void {
		const settings = this.getSettings();
		if (!settings.consoleAllowList.includes(functionName)) {
			settings.consoleAllowList.push(functionName);
			this.updateSettings({ consoleAllowList: settings.consoleAllowList });
		}
	}

	removeFromConsoleAllowList(functionName: string): void {
		const settings = this.getSettings();
		const index = settings.consoleAllowList.indexOf(functionName);
		if (index !== -1) {
			settings.consoleAllowList.splice(index, 1);
			this.updateSettings({ consoleAllowList: settings.consoleAllowList });
		}
	}

	addToConsoleDenyList(functionName: string): void {
		const settings = this.getSettings();
		if (!settings.consoleDenyList.includes(functionName)) {
			settings.consoleDenyList.push(functionName);
			this.updateSettings({ consoleDenyList: settings.consoleDenyList });
		}
	}

	removeFromConsoleDenyList(functionName: string): void {
		const settings = this.getSettings();
		const index = settings.consoleDenyList.indexOf(functionName);
		if (index !== -1) {
			settings.consoleDenyList.splice(index, 1);
			this.updateSettings({ consoleDenyList: settings.consoleDenyList });
		}
	}
}

