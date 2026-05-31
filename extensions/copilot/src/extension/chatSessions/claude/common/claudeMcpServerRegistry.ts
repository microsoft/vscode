/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';

/**
 * Interface for contributing MCP server configurations to the Claude SDK Options.
 *
 * Implement this interface to register MCP servers that should be available
 * during Claude Code sessions. Contributors are instantiated via dependency
 * injection and can use any registered service.
 */
export interface IClaudeMcpServerContributor {
	/**
	 * Returns MCP server configurations to include in the Claude SDK Options.
	 *
	 * @returns A record mapping server names to their configurations
	 */
	getMcpServers(): Promise<Record<string, McpServerConfig>>;
}

/**
 * Constructor type for MCP server contributors.
 * The instantiation service will handle dependency injection.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IClaudeMcpServerContributorCtor = new (...args: any[]) => IClaudeMcpServerContributor;

/**
 * Global registry of MCP server contributor constructors.
 */
const contributorRegistry: IClaudeMcpServerContributorCtor[] = [];

/**
 * Registers an MCP server contributor.
 * Call this at module load time after defining a contributor class.
 *
 * @param ctor The constructor for the contributor class
 *
 * @example
 * ```typescript
 * export class MyMcpServers implements IClaudeMcpServerContributor {
 *     constructor(@IMyService private readonly myService: IMyService) { }
 *
 *     async getMcpServers(): Promise<Record<string, McpServerConfig>> {
 *         return {
 *             'my-server': { command: 'node', args: ['./server.js'] }
 *         };
 *     }
 * }
 *
 * registerClaudeMcpServerContributor(MyMcpServers);
 * ```
 */
export function registerClaudeMcpServerContributor(ctor: IClaudeMcpServerContributorCtor): void {
	contributorRegistry.push(ctor);
}

/**
 * Get all registered MCP server contributor constructors.
 */
export function getClaudeMcpServerContributorRegistry(): readonly IClaudeMcpServerContributorCtor[] {
	return contributorRegistry;
}

/**
 * Builds the mcpServers configuration from the registry using dependency injection.
 * Instantiates each registered contributor and merges their server configurations.
 *
 * If multiple contributors provide a server with the same name, later registrations
 * will overwrite earlier ones.
 *
 * @param instantiationService The instantiation service for creating contributor instances with DI
 * @returns Merged MCP server configurations ready to pass to Claude SDK Options, or undefined if none
 */
export async function buildMcpServersFromRegistry(
	instantiationService: IInstantiationService
): Promise<Record<string, McpServerConfig> | undefined> {
	if (contributorRegistry.length === 0) {
		return undefined;
	}

	const result: Record<string, McpServerConfig> = {};

	for (const ctor of contributorRegistry) {
		const contributor = instantiationService.createInstance(ctor);
		const servers = await contributor.getMcpServers();
		Object.assign(result, servers);
	}

	return Object.keys(result).length > 0 ? result : undefined;
}
