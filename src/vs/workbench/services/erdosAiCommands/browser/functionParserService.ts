/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IErdosAiSettingsService } from '../../erdosAiSettings/common/settingsService.js';
import { IRuntimeSessionService } from '../../runtimeSession/common/runtimeSessionService.js';
import { RuntimeClientType } from '../../languageRuntime/common/languageRuntimeClientInstance.js';
import { HelpClientInstance } from '../../languageRuntime/common/languageRuntimeHelpClient.js';
import { IFunctionParserService, ParseFunctionsResult } from '../common/functionParserService.js';

export class FunctionParserService extends Disposable implements IFunctionParserService {
	readonly _serviceBrand: undefined;

	constructor(
		@IErdosAiSettingsService private readonly settingsService: IErdosAiSettingsService,
		@IRuntimeSessionService private readonly sessionService: IRuntimeSessionService
	) {
		super();
	}

	/**
	 * Parse code to extract function calls using the help comm system
	 */
	public async parseFunctions(code: string, language: string): Promise<ParseFunctionsResult> {
		
		try {
			// Find a session for the specified language
			const sessions = this.sessionService.activeSessions;
			let targetSession = null;
			
			for (const session of sessions) {
				if (session.runtimeMetadata.languageId === language) {
					targetSession = session;
					break;
				}
			}

			if (!targetSession) {
				return {
					functions: [],
					success: false,
					error: `No active ${language} session found`
				};
			}

			// Create a help client following the proper pattern from erdosHelpService.ts
			const existingClients = await targetSession.listClients(RuntimeClientType.Help);
			const client = existingClients.length > 0 ?
				existingClients[0] :
				await targetSession.createClient(RuntimeClientType.Help, {});

			if (!client) {
				return {
					functions: [],
					success: false,
					error: `Could not create help client for ${language} session`
				};
			}

			// Create help client instance with the session's actual language ID
			const helpClient = new HelpClientInstance(client, targetSession.runtimeMetadata.languageId);

			try {
				// Call the parseFunctions method via the help comm
				const result = await helpClient.parseFunctions(code, language);
				return result;
			} finally {
				// Always dispose the help client to prevent leaks
				helpClient.dispose();
			}

		} catch (error) {
			return {
				functions: [],
				success: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}

	/**
	 * Check if code should be auto-accepted based on function calls and settings
	 */
	public async checkAutoAccept(code: string, language: 'python' | 'r'): Promise<boolean> {
		const autoAcceptConsole = await this.settingsService.getAutoAcceptConsole();
		if (!autoAcceptConsole) {
			return false;
		}

		// Check language filter
		const languageFilter = await this.settingsService.getConsoleLanguageFilter();
		if (languageFilter !== 'both' && languageFilter !== language) {
			return false;
		}

		const mode = await this.settingsService.getConsoleAutoAcceptMode();
		const allowList = await this.settingsService.getConsoleAllowList();
		const denyList = await this.settingsService.getConsoleDenyList();
		
		// Filter lists by language
		const languageAllowList = allowList.filter(item => item.language === language).map(item => item.function);
		const languageDenyList = denyList.filter(item => item.language === language).map(item => item.function);
		
		// Parse the code to get function calls
		const parseResult = await this.parseFunctions(code, language);
		if (!parseResult.success) {
			return false;
		}

		const functions = parseResult.functions;
		if (functions.length === 0) {
			return false;
		}

		let shouldAutoAccept: boolean;
		if (mode === 'allow-list') {
			// All functions must be in allow list
			shouldAutoAccept = functions.every(func => languageAllowList.includes(func));
		} else {
			// No functions should be in deny list
			shouldAutoAccept = !functions.some(func => languageDenyList.includes(func));
		}

		return shouldAutoAccept;
	}

	/**
	 * Extract function calls for display purposes (e.g., for allow-list buttons)
	 */
	public async extractFunctionCallsForDisplay(code: string, language: 'python' | 'r'): Promise<string> {
		const parseResult = await this.parseFunctions(code, language);
		if (!parseResult.success || parseResult.functions.length === 0) {
			return '';
		}

		return parseResult.functions.join(', ');
	}
}