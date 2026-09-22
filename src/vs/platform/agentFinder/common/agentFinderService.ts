/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const enum AgentFinderConfiguration {
	Enabled = 'chat.agentFinder.enabled',
}

export const AgentFinderMediaType = {
	Skill: 'application/ai-skill',
	McpServer: 'application/mcp-server+json',
	ClaudePlugin: 'application/vnd.anthropic.claude-plugin+json',
	CopilotPlugin: 'application/vnd.github.copilot-plugin',
	CursorPlugin: 'application/vnd.cursor.cursor-plugin+json',
} as const;

export type AgentFinderMediaType = typeof AgentFinderMediaType[keyof typeof AgentFinderMediaType];

/** Validated installation provenance; GitHub paths name the resource directory, not its manifest. */
export type AgentFinderInstallation =
	| { readonly kind: 'skill' | 'plugin'; readonly repository: string; readonly ref: string; readonly path: string }
	| { readonly kind: 'mcp'; readonly name: string };

export interface IAgentFinderResource {
	readonly identifier: string;
	readonly displayName: string;
	readonly description: string;
	readonly mediaType: string;
	readonly tags: readonly string[];
	readonly capabilities: readonly string[];
	readonly representativeQueries: readonly string[];
	readonly url?: URI;
	/** Validated original URL for external opening, preserving escaped path separators. */
	readonly externalUrl?: string;
	readonly repository?: URI;
	/** The repository owner's GitHub avatar, not a verified product logo. */
	readonly icon?: URI;
	readonly publisher?: string;
	readonly version?: string;
	readonly stars?: number;
	readonly installation?: AgentFinderInstallation;
}

export type IAgentFinderCursor =
	| { readonly kind: 'browse'; readonly offset: number }
	| { readonly kind: 'search'; readonly pageToken: string };

export interface IAgentFinderQuery {
	readonly query?: string;
	readonly mediaType?: AgentFinderMediaType;
	readonly pageSize?: number;
	/** Continue with the same query, media type, and page size that produced this cursor. */
	readonly cursor?: IAgentFinderCursor;
}

export interface IAgentFinderPage {
	readonly items: readonly IAgentFinderResource[];
	readonly total?: number;
	readonly nextCursor?: IAgentFinderCursor;
}

/** Owns transport, response validation, and normalization into catalog pages. */
export interface IAgentFinderProvider {
	query(options: IAgentFinderQuery, token: CancellationToken): Promise<IAgentFinderPage>;
}

export const IAgentFinderService = createDecorator<IAgentFinderService>('agentFinderService');

export interface IAgentFinderService extends IAgentFinderProvider {
	readonly _serviceBrand: undefined;
}

export class AgentFinderService implements IAgentFinderService {
	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly browseProvider: IAgentFinderProvider,
		private readonly searchProvider: IAgentFinderProvider,
	) { }

	async query(options: IAgentFinderQuery, token: CancellationToken): Promise<IAgentFinderPage> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const query = options.query?.trim() ?? '';
		const provider = query ? this.searchProvider : this.browseProvider;
		return provider.query({ ...options, query }, token);
	}
}
