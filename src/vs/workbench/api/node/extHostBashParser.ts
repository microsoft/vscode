/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../platform/log/common/log.js';
import { IExtHostBashParserService } from '../common/extHostBashParser.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Extension host service for bash parsing using the npm bash-parser
 * This runs in Node.js environment where bash-parser can be used
 */
export class ExtHostBashParser implements IExtHostBashParserService {
	readonly _serviceBrand: undefined;
	private bashParser: any = null;

	constructor(
		@ILogService private readonly logService: ILogService
	) {}

	private async getBashParser(): Promise<any> {
		if (this.bashParser) {
			return this.bashParser;
		}

		try {
			// In Node.js extension host environment, we can use require like other VSCode services
			// @ts-ignore: bash-parser is a JavaScript module without type definitions  
			this.bashParser = require('bash-parser');
			this.logService.info('[ExtHostBashParser] Successfully loaded bash-parser');
			return this.bashParser;
		} catch (error) {
			this.logService.error('[ExtHostBashParser] Failed to load bash-parser:', error);
			throw new Error(`Failed to load bash-parser: ${error.message}`);
		}
	}

	async $parseBashCommands(script: string): Promise<string[]> {
		this.logService.info(`[ExtHostBashParser] Parsing script: ${script}`);
		
		if (!script || script.trim().length === 0) {
			return [];
		}

		try {
			const parser = await this.getBashParser();
			const ast = parser(script);
			const commands: string[] = [];
			
			function traverse(node: any): void {
				if (!node || typeof node !== 'object') return;
				
				if (node.type === 'Command' && node.name && node.name.text) {
					commands.push(node.name.text);
				}
				
				// Recursively check all properties
				for (const value of Object.values(node)) {
					if (Array.isArray(value)) {
						value.forEach(traverse);
					} else if (typeof value === 'object') {
						traverse(value);
					}
				}
			}
			
			traverse(ast);
			const uniqueCommands = [...new Set(commands)];
			this.logService.info(`[ExtHostBashParser] Found commands: [${uniqueCommands.join(', ')}]`);
			
			return uniqueCommands;
		} catch (error) {
			this.logService.error('[ExtHostBashParser] Parse error:', error);
			return [];
		}
	}
}
