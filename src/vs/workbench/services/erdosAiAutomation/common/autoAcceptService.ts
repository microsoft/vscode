/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';

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
	 * Check if a console command should be auto-accepted
	 */
	checkConsoleCommand(command: string): AutoAcceptCheckResult;
	
	/**
	 * Check if a terminal command should be auto-accepted
	 */
	checkTerminalCommand(command: string): AutoAcceptCheckResult;
	
	/**
	 * Check if a file operation should be auto-accepted
	 */
	checkFileOperation(operation: string, filename?: string): AutoAcceptCheckResult;
	
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
	
	/**
	 * Extract function calls from R code
	 */
	extractRFunctions(code: string): string[];
}
