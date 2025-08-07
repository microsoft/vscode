/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import type { ILanguageModelToolsService } from '../../../../chat/common/languageModelToolsService.js';

export interface ICommandRoute {
	/** Regular expressions that match commands that should be routed */
	commands: RegExp[];
	/** Tool ID to route to */
	toolId: string;
	/** Function to extract parameters from the command for the target tool */
	extractParameters: (commandLine: string, match: RegExpMatchArray) => any;
	/** Priority - higher numbers take precedence */
	priority?: number;
}

/**
 * Registry of command routes that can redirect terminal commands to more appropriate tools
 */
export class CommandRoutingRegistry {
	private static readonly routes: ICommandRoute[] = [];

	/**
	 * Register a new command route
	 */
	static registerRoute(route: ICommandRoute): void {
		this.routes.push(route);
		// Sort by priority (higher first)
		this.routes.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
	}

	/**
	 * Find a route for the given command line
	 */
	static findRoute(commandLine: string, languageModelToolsService: ILanguageModelToolsService): { toolId: string; parameters: any } | undefined {
		const tools = languageModelToolsService.getTools();
		if (!tools) {
			return undefined;
		}

		const availableToolIds = new Set(Array.from(tools).map(t => t.id));

		for (const route of this.routes) {
			// Check if the target tool is available
			if (!availableToolIds.has(route.toolId)) {
				continue;
			}

			// Check if any command pattern matches
			for (const commandPattern of route.commands) {
				const match = commandLine.match(commandPattern);
				if (match) {
					try {
						const parameters = route.extractParameters(commandLine, match);
						return { toolId: route.toolId, parameters };
					} catch (error) {
						// If parameter extraction fails, continue to next route
						continue;
					}
				}
			}
		}

		return undefined;
	}

	/**
	 * Get all registered routes (for testing)
	 */
	static getRoutes(): readonly ICommandRoute[] {
		return this.routes;
	}

	/**
	 * Clear all routes (for testing)
	 */
	static clearRoutes(): void {
		this.routes.length = 0;
	}
}

// Register built-in routes
CommandRoutingRegistry.registerRoute({
	commands: [
		/^cat\s+(.+)$/,
		/^type\s+(.+)$/,  // Windows equivalent
	],
	toolId: 'vscode_readFile_internal',
	extractParameters: (commandLine: string, match: RegExpMatchArray) => {
		const filePath = match[1].trim();
		// Remove quotes if present
		const cleanPath = filePath.replace(/^["']|["']$/g, '');
		
		// Convert to URI - handle both absolute and relative paths
		let uri: URI;
		if (cleanPath.startsWith('/') || cleanPath.includes(':')) {
			// Absolute path
			uri = URI.file(cleanPath);
		} else {
			// Relative path - we'll need workspace context for this
			// For now, assume it's relative to current working directory
			uri = URI.file(cleanPath);
		}
		
		return { uri: uri.toJSON() };
	},
	priority: 100
});

CommandRoutingRegistry.registerRoute({
	commands: [
		/^mkdir\s+(.+)$/,
		/^md\s+(.+)$/,  // Windows equivalent
	],
	toolId: 'vscode_createDirectory_internal',
	extractParameters: (commandLine: string, match: RegExpMatchArray) => {
		const dirPath = match[1].trim();
		// Remove quotes if present
		const cleanPath = dirPath.replace(/^["']|["']$/g, '');
		
		// Convert to URI
		let uri: URI;
		if (cleanPath.startsWith('/') || cleanPath.includes(':')) {
			// Absolute path
			uri = URI.file(cleanPath);
		} else {
			// Relative path
			uri = URI.file(cleanPath);
		}
		
		return { uri: uri.toJSON() };
	},
	priority: 100
});

/**
 * Get tool recommendation message for a command that can be routed
 */
export function getToolRecommendationForCommand(commandLine: string, languageModelToolsService: ILanguageModelToolsService): string | undefined {
	const route = CommandRoutingRegistry.findRoute(commandLine, languageModelToolsService);
	
	if (!route) {
		return undefined;
	}

	const tool = languageModelToolsService.getTool(route.toolId);
	if (!tool) {
		return undefined;
	}

	return `The terminal command '${commandLine}' could be better handled by the ${tool.displayName || tool.id} tool. This provides a more integrated experience and better error handling.`;
}