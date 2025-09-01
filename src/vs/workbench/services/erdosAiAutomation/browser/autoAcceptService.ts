/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAutoAcceptService, AutoAcceptSettings, AutoAcceptCheckResult } from '../common/autoAcceptService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

export class AutoAcceptService extends Disposable implements IAutoAcceptService {
	readonly _serviceBrand: undefined;

	private readonly _onDidChangeSettings = this._register(new Emitter<AutoAcceptSettings>());
	readonly onDidChangeSettings: Event<AutoAcceptSettings> = this._onDidChangeSettings.event;

	private _settings: AutoAcceptSettings;

	private static readonly STORAGE_KEY = 'erdosAi.autoAcceptSettings';

	constructor(
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();
		this._settings = this.loadSettings();
	}

	private getDefaultSettings(): AutoAcceptSettings {
		return {
			autoAcceptConsole: false,
			autoAcceptTerminal: false,
			autoAcceptFileOperations: false,
			consoleAllowList: ['head', 'tail', 'summary', 'str', 'names', 'dim', 'length', 'class', 'typeof', 'ls', 'print', 'cat', 'paste'],
			terminalAllowList: [],
			fileOperationsAllowList: [],
			consoleDenyList: ['system', 'unlink', 'install.packages', 'remove.packages', 'quit', 'q'],
			terminalDenyList: [],
			fileOperationsDenyList: []
		};
	}

	private loadSettings(): AutoAcceptSettings {
		try {
			const stored = this.storageService.get(AutoAcceptService.STORAGE_KEY, StorageScope.PROFILE);
			if (stored) {
				const parsed = JSON.parse(stored);
				// Merge with defaults to ensure all properties exist
				return { ...this.getDefaultSettings(), ...parsed };
			}
		} catch (error) {
			this.logService.warn('Failed to load auto-accept settings, using defaults:', error);
		}
		return this.getDefaultSettings();
	}

	private saveSettings(): void {
		try {
			this.storageService.store(
				AutoAcceptService.STORAGE_KEY,
				JSON.stringify(this._settings),
				StorageScope.PROFILE,
				StorageTarget.MACHINE
			);
		} catch (error) {
			this.logService.error('Failed to save auto-accept settings:', error);
		}
	}

	getSettings(): AutoAcceptSettings {
		return { ...this._settings };
	}

	updateSettings(settings: Partial<AutoAcceptSettings>): void {
		this._settings = { ...this._settings, ...settings };
		this.saveSettings();
		this._onDidChangeSettings.fire(this._settings);
	}

	checkConsoleCommand(command: string): AutoAcceptCheckResult {
		const functionsFound = this.extractRFunctions(command);
		
		if (!this._settings.autoAcceptConsole) {
			return {
				shouldAutoAccept: false,
				reason: 'Console auto-accept is disabled',
				functionsFound,
				allowedFunctions: [],
				deniedFunctions: []
			};
		}

		const allowedFunctions = functionsFound.filter(func => 
			this._settings.consoleAllowList.includes(func)
		);
		const deniedFunctions = functionsFound.filter(func => 
			this._settings.consoleDenyList.includes(func)
		);

		if (deniedFunctions.length > 0) {
			return {
				shouldAutoAccept: false,
				reason: `Contains denied functions: ${deniedFunctions.join(', ')}`,
				functionsFound,
				allowedFunctions,
				deniedFunctions
			};
		}

		const unknownFunctions = functionsFound.filter(func => 
			!this._settings.consoleAllowList.includes(func)
		);

		if (unknownFunctions.length > 0) {
			return {
				shouldAutoAccept: false,
				reason: `Contains unknown functions: ${unknownFunctions.join(', ')}`,
				functionsFound,
				allowedFunctions,
				deniedFunctions
			};
		}

		if (functionsFound.length === 0) {
			return {
				shouldAutoAccept: true,
				reason: 'No function calls detected',
				functionsFound,
				allowedFunctions,
				deniedFunctions
			};
		}

		return {
			shouldAutoAccept: true,
			reason: `All functions are allowed: ${allowedFunctions.join(', ')}`,
			functionsFound,
			allowedFunctions,
			deniedFunctions
		};
	}

	checkTerminalCommand(command: string): AutoAcceptCheckResult {
		// Terminal auto-accept not implemented yet
		return {
			shouldAutoAccept: false,
			reason: 'Terminal auto-accept not implemented',
			functionsFound: [],
			allowedFunctions: [],
			deniedFunctions: []
		};
	}

	checkFileOperation(operation: string, filename?: string): AutoAcceptCheckResult {
		// File operations auto-accept not implemented yet
		return {
			shouldAutoAccept: false,
			reason: 'File operations auto-accept not implemented',
			functionsFound: [],
			allowedFunctions: [],
			deniedFunctions: []
		};
	}

	addToConsoleAllowList(functionName: string): void {
		if (!this._settings.consoleAllowList.includes(functionName)) {
			this._settings.consoleAllowList.push(functionName);
			this.saveSettings();
			this._onDidChangeSettings.fire(this._settings);
		}
	}

	removeFromConsoleAllowList(functionName: string): void {
		const index = this._settings.consoleAllowList.indexOf(functionName);
		if (index >= 0) {
			this._settings.consoleAllowList.splice(index, 1);
			this.saveSettings();
			this._onDidChangeSettings.fire(this._settings);
		}
	}

	addToConsoleDenyList(functionName: string): void {
		if (!this._settings.consoleDenyList.includes(functionName)) {
			this._settings.consoleDenyList.push(functionName);
			this.saveSettings();
			this._onDidChangeSettings.fire(this._settings);
		}
	}

	removeFromConsoleDenyList(functionName: string): void {
		const index = this._settings.consoleDenyList.indexOf(functionName);
		if (index >= 0) {
			this._settings.consoleDenyList.splice(index, 1);
			this.saveSettings();
			this._onDidChangeSettings.fire(this._settings);
		}
	}

	extractRFunctions(code: string): string[] {
		const functions: string[] = [];
		
		// Simple regex to match R function calls
		// Matches: functionName( or functionName::functionName(
		const functionRegex = /(?:^|[^a-zA-Z0-9_.])([a-zA-Z][a-zA-Z0-9_.]*(?:::[a-zA-Z][a-zA-Z0-9_.]*)?)\s*\(/g;
		
		let match;
		while ((match = functionRegex.exec(code)) !== null) {
			const funcName = match[1];
			if (!functions.includes(funcName)) {
				functions.push(funcName);
			}
		}
		
		return functions;
	}
}
