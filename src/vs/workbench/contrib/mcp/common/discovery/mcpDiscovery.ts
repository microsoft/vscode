/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { SyncDescriptor0 } from '../../../../../platform/instantiation/common/descriptors.js';
import { McpDiscoveryFormat, McpDiscoveryHost, McpDiscoveryScope, McpDiscoverySource, McpInstallProvenance } from '../../../../../platform/mcp/common/mcpDiscoveryMetadata.js';

export type McpDiscoveryCandidateOutcome = 'loaded' | 'disabled' | 'blocked' | 'parseError' | 'unreadable' | 'unresolved' | 'rejected';

export interface IMcpDiscoveryCandidate {
	readonly source: McpDiscoverySource;
	readonly format: McpDiscoveryFormat;
	readonly scope: McpDiscoveryScope;
	readonly host: McpDiscoveryHost;
	readonly installProvenance: McpInstallProvenance;
	readonly outcome: McpDiscoveryCandidateOutcome;
}

export interface IMcpConfigurationOutcome {
	readonly source: McpDiscoverySource;
	readonly format: McpDiscoveryFormat;
	readonly scope: McpDiscoveryScope;
	readonly host: McpDiscoveryHost;
	readonly configurationPresent: number;
	readonly configuredEntryCount: number;
	readonly parseErrorCount: number;
	readonly unreadableCount: number;
}

export interface IMcpDiscoverySnapshot {
	readonly candidates: readonly IMcpDiscoveryCandidate[];
	readonly configurationOutcomes: readonly IMcpConfigurationOutcome[];
}

export interface IMcpDiscovery extends IDisposable {
	readonly fromGallery: boolean;
	readonly discoverySnapshot: IObservable<IMcpDiscoverySnapshot | undefined>;
	start(): void;
}

export const emptyMcpDiscoverySnapshot: IMcpDiscoverySnapshot = { candidates: [], configurationOutcomes: [] };

export function mcpHost(remoteAuthority: string | null | undefined): McpDiscoveryHost {
	return remoteAuthority ? McpDiscoveryHost.Remote : McpDiscoveryHost.Local;
}

export function mcpCandidate(
	source: McpDiscoverySource,
	format: McpDiscoveryFormat,
	scope: McpDiscoveryScope,
	host: McpDiscoveryHost,
	outcome: McpDiscoveryCandidateOutcome,
	installProvenance = McpInstallProvenance.NotApplicable,
): IMcpDiscoveryCandidate {
	return { source, format, scope, host, outcome, installProvenance };
}

class McpDiscoveryRegistry {
	private readonly _discovery: SyncDescriptor0<IMcpDiscovery>[] = [];

	register(discovery: SyncDescriptor0<IMcpDiscovery>): void {
		this._discovery.push(discovery);
	}

	getAll(): readonly SyncDescriptor0<IMcpDiscovery>[] {
		return this._discovery;
	}
}

export const mcpDiscoveryRegistry = new McpDiscoveryRegistry();
