/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { getKeyedChanges } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IMcpConfigurationFoundEvent, McpConfigurationFoundClassification, McpDiscoveryFormat, McpDiscoveryHost, McpDiscoveryScope, McpDiscoverySource, McpInstallProvenance, mcpConfigurationFoundEventName } from '../../../../../platform/mcp/common/mcpDiscoveryMetadata.js';
import { IMcpConfigurationOutcome, IMcpDiscoverySnapshot } from './mcpDiscovery.js';

interface IMcpServersFoundEvent {
	source: McpDiscoverySource | 'all';
	format: McpDiscoveryFormat | 'all';
	scope: McpDiscoveryScope | 'all';
	host: McpDiscoveryHost | 'all';
	installProvenance: McpInstallProvenance | 'all';
	candidateCount: number;
	loadedCount: number;
	disabledCount: number;
	blockedCount: number;
	parseErrorCount: number;
	unreadableCount: number;
	unresolvedCount: number;
	otherRejectedCount: number;
}

type McpServersFoundClassification = {
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed MCP discovery adapter source.' };
	format: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed MCP configuration format.' };
	scope: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed MCP configuration scope.' };
	host: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the source belongs to the local or remote host.' };
	installProvenance: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed gallery, local, or not-applicable installation provenance.' };
	candidateCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of MCP candidates represented by this row.' };
	loadedCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of usable MCP candidates.' };
	disabledCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of disabled MCP candidates.' };
	blockedCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of policy-blocked MCP candidates.' };
	parseErrorCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of MCP candidates rejected by parsing.' };
	unreadableCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of unreadable MCP candidates.' };
	unresolvedCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of unresolved extension MCP provider candidates.' };
	otherRejectedCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of MCP candidates rejected by precedence or validation.' };
	owner: 'digitarald';
	comment: 'Reports privacy-safe aggregate local MCP discovery outcomes.';
};

export class McpDiscoveryTelemetry {
	private readonly lastServerRows = new Map<string, IMcpServersFoundEvent>();
	private hasServerSnapshot = false;
	private readonly lastConfigurationRows = new Map<string, IMcpConfigurationFoundEvent>();
	private hasConfigurationSnapshot = false;

	constructor(private readonly telemetryService: ITelemetryService) { }

	logDiscovery(snapshots: readonly IMcpDiscoverySnapshot[]): void {
		const rows = new Map<string, IMcpServersFoundEvent>();
		for (const candidate of snapshots.flatMap(snapshot => snapshot.candidates)) {
			const key = `${candidate.source}\0${candidate.format}\0${candidate.scope}\0${candidate.host}\0${candidate.installProvenance}`;
			let row = rows.get(key);
			if (!row) {
				row = {
					source: candidate.source,
					format: candidate.format,
					scope: candidate.scope,
					host: candidate.host,
					installProvenance: candidate.installProvenance,
					candidateCount: 0,
					loadedCount: 0,
					disabledCount: 0,
					blockedCount: 0,
					parseErrorCount: 0,
					unreadableCount: 0,
					unresolvedCount: 0,
					otherRejectedCount: 0,
				};
				rows.set(key, row);
			}
			row.candidateCount++;
			switch (candidate.outcome) {
				case 'loaded': row.loadedCount++; break;
				case 'disabled': row.disabledCount++; break;
				case 'blocked': row.blockedCount++; break;
				case 'parseError': row.parseErrorCount++; break;
				case 'unreadable': row.unreadableCount++; break;
				case 'unresolved': row.unresolvedCount++; break;
				case 'rejected': row.otherRejectedCount++; break;
			}
		}
		const changes = getKeyedChanges(this.lastServerRows, rows);
		const changed = [
			...changes.changed,
			...changes.removed.map(row => ({ ...row, candidateCount: 0, loadedCount: 0, disabledCount: 0, blockedCount: 0, parseErrorCount: 0, unreadableCount: 0, unresolvedCount: 0, otherRejectedCount: 0 })),
		];
		if (rows.size === 0 && (!this.hasServerSnapshot || this.lastServerRows.size > 0)) {
			changed.push({
				source: 'all',
				format: 'all',
				scope: 'all',
				host: 'all',
				installProvenance: 'all',
				candidateCount: 0,
				loadedCount: 0,
				disabledCount: 0,
				blockedCount: 0,
				parseErrorCount: 0,
				unreadableCount: 0,
				unresolvedCount: 0,
				otherRejectedCount: 0,
			});
		}
		this.hasServerSnapshot = true;
		this.lastServerRows.clear();
		for (const [key, row] of rows) {
			this.lastServerRows.set(key, row);
		}
		for (const row of changed.sort((a, b) => a.source.localeCompare(b.source) || a.format.localeCompare(b.format) || a.scope.localeCompare(b.scope) || a.host.localeCompare(b.host) || a.installProvenance.localeCompare(b.installProvenance))) {
			this.telemetryService.publicLog2<IMcpServersFoundEvent, McpServersFoundClassification>('mcp/serversFound', row);
		}

		this.logConfigurations(snapshots.flatMap(snapshot => snapshot.configurationOutcomes));
	}

	private logConfigurations(configurations: readonly IMcpConfigurationOutcome[]): void {
		const rows = new Map<string, IMcpConfigurationFoundEvent>();
		for (const configuration of configurations) {
			if (configuration.configurationPresent === 0 && configuration.configuredEntryCount === 0 && configuration.parseErrorCount === 0 && configuration.unreadableCount === 0) {
				continue;
			}
			const key = `${configuration.source}\0${configuration.format}\0${configuration.scope}\0${configuration.host}`;
			let row = rows.get(key);
			if (!row) {
				row = { ...configuration };
				rows.set(key, row);
			} else {
				row.configurationPresent += configuration.configurationPresent;
				row.configuredEntryCount += configuration.configuredEntryCount;
				row.parseErrorCount += configuration.parseErrorCount;
				row.unreadableCount += configuration.unreadableCount;
			}
		}
		const changes = getKeyedChanges(this.lastConfigurationRows, rows);
		const changed = [
			...changes.changed,
			...changes.removed.map(row => ({ ...row, configurationPresent: 0, configuredEntryCount: 0, parseErrorCount: 0, unreadableCount: 0 })),
		];
		if (rows.size === 0 && (!this.hasConfigurationSnapshot || this.lastConfigurationRows.size > 0)) {
			changed.push({ source: 'all', format: 'all', scope: 'all', host: 'all', configurationPresent: 0, configuredEntryCount: 0, parseErrorCount: 0, unreadableCount: 0 });
		}
		this.hasConfigurationSnapshot = true;
		this.lastConfigurationRows.clear();
		for (const [key, row] of rows) {
			this.lastConfigurationRows.set(key, row);
		}
		for (const row of changed.sort((a, b) => a.source.localeCompare(b.source) || a.format.localeCompare(b.format) || a.scope.localeCompare(b.scope) || a.host.localeCompare(b.host))) {
			this.telemetryService.publicLog2<IMcpConfigurationFoundEvent, McpConfigurationFoundClassification>(mcpConfigurationFoundEventName, row);
		}
	}

}

export function reconcileMcpStrictPluginOnly(snapshots: readonly IMcpDiscoverySnapshot[], strictPluginOnly: boolean): readonly IMcpDiscoverySnapshot[] {
	if (!strictPluginOnly) {
		return snapshots;
	}
	return snapshots.map(snapshot => ({
		...snapshot,
		candidates: snapshot.candidates.map(candidate => candidate.source !== McpDiscoverySource.Plugin
			&& candidate.outcome !== 'parseError'
			&& candidate.outcome !== 'unreadable'
			? { ...candidate, outcome: 'blocked' }
			: candidate),
	}));
}
