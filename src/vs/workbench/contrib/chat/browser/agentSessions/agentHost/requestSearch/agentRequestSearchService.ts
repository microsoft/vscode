/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation, raceTimeout } from '../../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../../../base/common/errorMessage.js';
import { CancellationError } from '../../../../../../../base/common/errors.js';
import { localize } from '../../../../../../../nls.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { IAgentHostConnectionsService } from '../../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AGENT_HOST_REQUEST_SEARCH_DEFAULT_LIMIT, AGENT_HOST_REQUEST_SEARCH_MAX_LIMIT, AGENT_HOST_REQUEST_SEARCH_MAX_QUERY_LENGTH, AGENT_HOST_REQUEST_SEARCH_MAX_TERMS, parseAgentHostRequestSearchTerms, type IAgentHostRequestSearchHit } from '../../../../../../../platform/agentHost/common/agentHostRequestSearch.js';
import { agentHostAuthority } from '../../../../../../../platform/agentHost/common/agentHostUri.js';
import type { IAgentConnection } from '../../../../../../../platform/agentHost/common/agentService.js';
import { supportsAgentHostRequestSearch } from '../../../../../../../platform/agentHost/common/meta/agentHostRequestSearchMeta.js';
import { buildOpenSessionLinkUri } from '../../../../../../../platform/agentHost/common/openSessionLink.js';
import { getEntryAddress, IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId, type RemoteAgentHostConnectionStatus } from '../../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { getAgentHostChatId } from '../../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../../platform/log/common/log.js';

/** How long one host may take to answer a search before it is reported as failed. */
export const AGENT_REQUEST_SEARCH_HOST_TIMEOUT = 10_000;

export const IAgentRequestSearchService = createDecorator<IAgentRequestSearchService>('agentRequestSearchService');

/**
 * - `searched`: the host answered.
 * - `notSearched`: the host is not connected; searching never connects or wakes it.
 * - `unsupported`: the host runs a version that cannot search requests.
 * - `disabled`: request search is turned off for the host, or remote hosts are excluded from this search.
 * - `failed`: the host was asked and did not answer.
 */
export type AgentRequestSearchHostStatus = 'searched' | 'notSearched' | 'unsupported' | 'disabled' | 'failed';

export interface IAgentRequestSearchHost {
	/** The host's connection authority, as `agent-host-session` links name it. */
	readonly id: string;
	readonly label: string;
	readonly status: AgentRequestSearchHostStatus;
	readonly reason?: string;
	/** The oldest request the host's index holds; older requests cannot be found. */
	readonly indexedSince?: string;
	/** The host had more matches than it returned. */
	readonly truncated?: boolean;
}

/** A request whose text matched the query. Titles and the snippet are host-supplied, untrusted content. */
export interface IAgentRequestSearchMatch {
	/** ISO 8601 time the request was sent. */
	readonly time: string;
	readonly host: { readonly id: string; readonly label: string };
	readonly sessionTitle?: string;
	readonly chatTitle?: string;
	readonly snippet: string;
	/** An `agent-host-session` link that opens the chat scrolled to the request. */
	readonly link: string;
}

export interface IAgentRequestSearchResult {
	/** Newest first, across hosts. */
	readonly matches: readonly IAgentRequestSearchMatch[];
	readonly hosts: readonly IAgentRequestSearchHost[];
}

export interface IAgentRequestSearchOptions {
	/** Most matches to return; defaults to {@link AGENT_HOST_REQUEST_SEARCH_DEFAULT_LIMIT}. */
	readonly limit?: number;
	/** Whether connected remote hosts are searched; otherwise they are reported as `disabled` with this reason. */
	readonly remoteHosts: true | { readonly excludedReason: string };
}

export interface IAgentRequestSearchService {
	readonly _serviceBrand: undefined;
	/** Searches the requests sent to every connected Agent Host's chats. Rejects an empty or over-long query. */
	search(query: string, options: IAgentRequestSearchOptions, token: CancellationToken): Promise<IAgentRequestSearchResult>;
}

interface ISearchTarget {
	readonly host: Pick<IAgentRequestSearchHost, 'id' | 'label'>;
	readonly connection?: IAgentConnection;
	readonly skipped?: Pick<IAgentRequestSearchHost, 'status' | 'reason'>;
}

export class AgentRequestSearchService implements IAgentRequestSearchService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async search(query: string, options: IAgentRequestSearchOptions, token: CancellationToken): Promise<IAgentRequestSearchResult> {
		if (!parseAgentHostRequestSearchTerms(query)) {
			throw new Error(localize('agentRequestSearch.invalidQuery', "Enter between 1 and {0} words and at most {1} characters.", AGENT_HOST_REQUEST_SEARCH_MAX_TERMS, AGENT_HOST_REQUEST_SEARCH_MAX_QUERY_LENGTH));
		}
		const limit = Math.min(Math.max(Math.floor(options.limit ?? AGENT_HOST_REQUEST_SEARCH_DEFAULT_LIMIT), 1), AGENT_HOST_REQUEST_SEARCH_MAX_LIMIT);
		const results = await Promise.all(this._targets(options).map(target => this._searchHost(target, query, limit, token)));
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const matches = results.flatMap(result => result.matches)
			.sort((a, b) => (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0))
			.slice(0, limit);
		return { matches, hosts: results.map(result => result.host) };
	}

	private _targets(options: IAgentRequestSearchOptions): ISearchTarget[] {
		const targets: ISearchTarget[] = [];
		const ambient = this._connectionsService.connections.find(info => info.isAmbient);
		if (ambient) {
			const host = { id: ambient.authority, label: ambient.name };
			targets.push(ambient.connection?.initializeResult.get()
				? { host, connection: ambient.connection }
				: { host, skipped: { status: 'notSearched', reason: localize('agentRequestSearch.ambientNotRunning', "The agent host is not running. Search does not start it.") } });
		}
		if (this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId) !== true) {
			return targets;
		}
		const excluded = options.remoteHosts === true ? undefined : { status: 'disabled' as const, reason: options.remoteHosts.excludedReason };
		const listed = new Set<string>();
		for (const info of this._remoteAgentHostService.connections) {
			listed.add(info.address);
			const host = { id: agentHostAuthority(info.address), label: info.name };
			const connection = this._remoteAgentHostService.getConnection(info.address);
			if (excluded) {
				targets.push({ host, skipped: excluded });
			} else if (info.status.kind === 'connected' && connection) {
				targets.push({ host, connection });
			} else {
				targets.push({ host, skipped: { status: 'notSearched', reason: describeOfflineStatus(info.status) } });
			}
		}
		for (const entry of this._remoteAgentHostService.configuredEntries) {
			const address = getEntryAddress(entry);
			if (!listed.has(address)) {
				listed.add(address);
				targets.push({
					host: { id: agentHostAuthority(address), label: entry.name },
					skipped: excluded ?? { status: 'notSearched', reason: describeOfflineStatus(undefined) },
				});
			}
		}
		return targets;
	}

	private async _searchHost(target: ISearchTarget, query: string, limit: number, token: CancellationToken): Promise<{ readonly host: IAgentRequestSearchHost; readonly matches: readonly IAgentRequestSearchMatch[] }> {
		const { connection } = target;
		if (!connection || target.skipped) {
			return { host: { ...target.host, ...target.skipped ?? { status: 'notSearched' } }, matches: [] };
		}
		if (!connection.searchRequests || !supportsAgentHostRequestSearch(connection.initializeResult.get())) {
			return { host: { ...target.host, status: 'unsupported', reason: localize('agentRequestSearch.unsupported', "The agent host runs a version that cannot search requests. Update it to include it in searches.") }, matches: [] };
		}
		try {
			let timedOut = false;
			const result = await raceCancellation(raceTimeout(connection.searchRequests(query, limit), AGENT_REQUEST_SEARCH_HOST_TIMEOUT, () => timedOut = true), token);
			if (!result) {
				return {
					host: { ...target.host, status: 'failed', reason: timedOut ? localize('agentRequestSearch.timeout', "The agent host did not answer in time.") : localize('agentRequestSearch.cancelled', "The search was cancelled.") },
					matches: [],
				};
			}
			if (!result.indexEnabled) {
				return { host: { ...target.host, status: 'disabled', reason: localize('agentRequestSearch.indexDisabled', "Request search is turned off on this agent host.") }, matches: [] };
			}
			const matches: IAgentRequestSearchMatch[] = [];
			for (const hit of result.hits) {
				const link = toLink(hit, target.host.id);
				if (link) {
					matches.push({
						time: hit.startedAt,
						host: target.host,
						...(hit.sessionTitle ? { sessionTitle: hit.sessionTitle } : {}),
						...(hit.chatTitle ? { chatTitle: hit.chatTitle } : {}),
						snippet: hit.snippet,
						link,
					});
				}
			}
			return {
				host: { ...target.host, status: 'searched', ...(result.indexedSince ? { indexedSince: result.indexedSince } : {}), ...(result.truncated ? { truncated: true } : {}) },
				matches,
			};
		} catch (error) {
			this._logService.warn(`[AgentRequestSearch] Could not search ${target.host.label}`, error);
			return { host: { ...target.host, status: 'failed', reason: toErrorMessage(error) }, matches: [] };
		}
	}
}

function describeOfflineStatus(status: RemoteAgentHostConnectionStatus | undefined): string {
	switch (status?.kind) {
		case 'connecting': return localize('agentRequestSearch.connecting', "The agent host is still connecting.");
		case 'reconnecting': return localize('agentRequestSearch.reconnecting', "The agent host is reconnecting.");
		case 'incompatible': return localize('agentRequestSearch.incompatible', "The agent host is incompatible with this version of VS Code.");
		default: return localize('agentRequestSearch.disconnected', "The agent host is not connected. Search does not connect it.");
	}
}

/** The link that opens a hit's chat at its request, or `undefined` for a hit whose session URI is unusable. */
function toLink(hit: IAgentHostRequestSearchHit, connectionAuthority: string): string | undefined {
	try {
		return buildOpenSessionLinkUri(URI.parse(hit.session, true), hit.chat !== undefined ? getAgentHostChatId(hit.chat) : undefined, hit.turnId, connectionAuthority);
	} catch {
		return undefined;
	}
}
