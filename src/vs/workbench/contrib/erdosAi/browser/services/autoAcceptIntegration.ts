/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../../platform/log/common/log.js';
import { IAutoAcceptService, AutoAcceptCheckResult } from './autoAcceptService.js';


/**
 * Integration service that handles auto-accept logic for console commands
 * This service is called when widgets are created to determine if auto-accept should be triggered
 */
export class AutoAcceptIntegration {
	
	constructor(
		private readonly logService: ILogService,
		private readonly autoAcceptService: IAutoAcceptService,

	) {}

	/**
	 * Check if a widget command should be auto-accepted
	 * This is called when creating widgets and determines if auto-accept should be triggered
	 */
	async checkAutoAccept(
		functionName: string, 
		command: string, 
		messageId: number
	): Promise<{ shouldAutoAccept: boolean; checkResult: AutoAcceptCheckResult; showDialog: boolean }> {
		
		try {
			this.logService.info(`[AUTO ACCEPT] Checking auto-accept for ${functionName}, messageId: ${messageId}`);
			
			let checkResult: AutoAcceptCheckResult;
			let showDialog = false;
			
			switch (functionName) {
				case 'run_console_cmd':
					checkResult = await this.autoAcceptService.shouldAutoAcceptRConsoleCommand(command);
					
					// Show dialog if there are functions to review (either for auto-accept or manual review)
					showDialog = checkResult.functionsFound.length > 0;
					
					this.logService.info(`[AUTO ACCEPT] R console check result: shouldAutoAccept=${checkResult.shouldAutoAccept}, functionsFound=${checkResult.functionsFound.length}, reason="${checkResult.reason}"`);
					break;
					
				case 'run_terminal_cmd':
					checkResult = await this.autoAcceptService.shouldAutoAcceptTerminalCommand(command);
					showDialog = checkResult.functionsFound.length > 0;
					this.logService.info(`[AUTO ACCEPT] Terminal check result: shouldAutoAccept=${checkResult.shouldAutoAccept}`);
					break;
					
				case 'delete_file':
				case 'run_file':
					// Extract filename from command for file operations
					const filename = this.extractFilenameFromCommand(command, functionName);
					checkResult = await this.autoAcceptService.shouldAutoAcceptFileOperation(functionName, filename);
					showDialog = false; // File operations don't show function review dialog currently
					this.logService.info(`[AUTO ACCEPT] File operation check result: shouldAutoAccept=${checkResult.shouldAutoAccept}`);
					break;
					
				default:
					// Other function types not supported for auto-accept
					checkResult = {
						shouldAutoAccept: false,
						reason: `Auto-accept not supported for ${functionName}`,
						functionsFound: [],
						allowedFunctions: [],
						deniedFunctions: []
					};
					showDialog = false;
					break;
			}
			
			return {
				shouldAutoAccept: checkResult.shouldAutoAccept,
				checkResult,
				showDialog
			};
			
		} catch (error) {
			this.logService.error(`[AUTO ACCEPT] Error checking auto-accept: ${error}`);
			
			// Return safe defaults on error
			return {
				shouldAutoAccept: false,
				checkResult: {
					shouldAutoAccept: false,
					reason: `Error during auto-accept check: ${error}`,
					functionsFound: [],
					allowedFunctions: [],
					deniedFunctions: []
				},
				showDialog: false
			};
		}
	}

	/**
	 * Get auto-accept information for display in UI
	 * This provides information about why a command would or wouldn't be auto-accepted
	 */
	async getAutoAcceptInfo(functionName: string, command: string): Promise<{
		isSupported: boolean;
		settings: any;
		functionsInCommand?: string[];
		allowedFunctions?: string[];
		deniedFunctions?: string[];
	}> {
		
		const settings = this.autoAcceptService.getSettings();
		
		// Check if auto-accept is supported for this function type
		const isSupported = this.isFunctionSupported(functionName);
		
		if (!isSupported) {
			return {
				isSupported: false,
				settings
			};
		}
		
		// For R console commands, function information is no longer available (help service removed)
		if (functionName === 'run_console_cmd') {
			this.logService.info(`[AUTO ACCEPT] R function parsing not available for command: ${command}`);
		}
		
		return {
			isSupported: true,
			settings
		};
	}

	/**
	 * Check if auto-accept is supported for a function type
	 */
	private isFunctionSupported(functionName: string): boolean {
		return ['run_console_cmd', 'run_terminal_cmd', 'delete_file', 'run_file'].includes(functionName);
	}

	/**
	 * Extract filename from command for file operations
	 */
	private extractFilenameFromCommand(command: string, functionName: string): string {
		// This is a simplified extraction - in a full implementation,
		// you might parse the actual function call arguments
		
		if (functionName === 'delete_file') {
			// Look for patterns like "Delete filename" or extract from unlink commands
			const deleteMatch = command.match(/Delete\s+(.+?)(?::|$)/);
			if (deleteMatch) {
				return deleteMatch[1].trim();
			}
			
			// Look for unlink patterns
			const unlinkMatch = command.match(/unlink\(['"](.+?)['"]\)/);
			if (unlinkMatch) {
				return unlinkMatch[1];
			}
		}
		
		if (functionName === 'run_file') {
			// Look for file execution patterns
			const sourceMatch = command.match(/source\(['"](.+?)['"]\)/);
			if (sourceMatch) {
				return sourceMatch[1];
			}
		}
		
		return command; // Fallback to entire command
	}
}

