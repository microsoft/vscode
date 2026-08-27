/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { mcpAccessConfig, mcpAllowedServersConfig, mcpDeniedServersConfig, mcpGalleryServiceEnablementConfig } from '../../../../../platform/mcp/common/mcpManagement.js';
import { COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG, COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { countConfigurationValue, getKeyedChanges, IConfigurationPresenceCounts } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IMcpConfigurationFoundEvent, McpConfigurationFoundClassification, McpDiscoveryFormat, McpDiscoveryHost, McpDiscoveryScope, McpDiscoverySource, McpInstallProvenance, mcpConfigurationFoundEventName } from '../../../../../platform/mcp/common/mcpDiscoveryMetadata.js';
import { allDiscoverySources, DiscoverySource, mcpDiscoverySection } from '../mcpConfiguration.js';
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

interface IMcpDiscoveryConfiguredEvent extends IConfigurationPresenceCounts {
	scope: 'application' | 'user' | 'workspace' | 'policy' | 'profile' | 'all';
	entryPoint: 'access' | 'nativeDiscovery' | 'allowedServers' | 'deniedServers' | 'managedServersOnly' | 'strictPluginOnly' | 'galleryEnabled' | 'storedEnablement' | 'all';
	adapter: DiscoverySource | 'notApplicable' | 'all';
}

type McpDiscoveryConfiguredClassification = {
	scope: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed explicit configuration scope.' };
	entryPoint: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed MCP configuration or gate entry point.' };
	adapter: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed native discovery adapter, or notApplicable.' };
	configurationPresent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether an explicit value is present at this scope.' };
	configuredEntryCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of explicit entries without reporting keys or values.' };
	enabledEntryCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of explicitly enabled entries.' };
	disabledEntryCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of explicitly disabled entries.' };
	owner: 'digitarald';
	comment: 'Reports privacy-safe explicit MCP gate and discovery configuration presence.';
};

function configuredValueRow(scope: IMcpDiscoveryConfiguredEvent['scope'], entryPoint: IMcpDiscoveryConfiguredEvent['entryPoint'], value: unknown, adapter: IMcpDiscoveryConfiguredEvent['adapter'] = 'notApplicable'): IMcpDiscoveryConfiguredEvent {
	return {
		scope,
		entryPoint,
		adapter,
		...countConfigurationValue(value, (entry, configuration) => Array.isArray(configuration)
			? true
			: typeof entry === 'boolean' ? entry : undefined),
	};
}

function configurationRow<T>(inspection: IConfigurationValue<T>, property: keyof IConfigurationValue<T>, scope: IMcpDiscoveryConfiguredEvent['scope'], entryPoint: IMcpDiscoveryConfiguredEvent['entryPoint']): IMcpDiscoveryConfiguredEvent {
	return configuredValueRow(scope, entryPoint, inspection[property]);
}

function storageRow(storageService: IStorageService, scope: StorageScope, scopeName: 'profile' | 'workspace'): IMcpDiscoveryConfiguredEvent {
	const raw = storageService.get('mcp.enablement', scope);
	if (raw !== undefined) {
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				const values = parsed.map(entry => Array.isArray(entry) ? entry[1] : entry);
				return {
					scope: scopeName,
					entryPoint: 'storedEnablement',
					adapter: 'notApplicable',
					configurationPresent: 1,
					configuredEntryCount: values.length,
					enabledEntryCount: values.filter(value => value === true).length,
					disabledEntryCount: values.filter(value => value === false).length,
				};
			}
		} catch {
			// Malformed storage is still explicit configuration presence.
		}
	}
	return configuredValueRow(scopeName, 'storedEnablement', raw);
}

export class McpDiscoveryTelemetry {
	private readonly lastServerRows = new Map<string, IMcpServersFoundEvent>();
	private hasServerSnapshot = false;
	private readonly lastConfigurationRows = new Map<string, IMcpConfigurationFoundEvent>();
	private hasConfigurationSnapshot = false;
	private readonly lastConfiguredRows = new Map<string, IMcpDiscoveryConfiguredEvent>();
	private hasConfiguredSnapshot = false;

	constructor(
		private readonly telemetryService: ITelemetryService,
		private readonly configurationService: IConfigurationService,
		private readonly storageService: IStorageService,
	) { }

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

	logConfiguration(): void {
		const rows: IMcpDiscoveryConfiguredEvent[] = [];
		const access = this.configurationService.inspect(mcpAccessConfig);
		rows.push(
			configurationRow(access, 'userValue', 'user', 'access'),
			configurationRow(access, 'workspaceValue', 'workspace', 'access'),
			configurationRow(access, 'policyValue', 'policy', 'access'),
		);

		const discovery = this.configurationService.inspect<Record<string, boolean> | boolean>(mcpDiscoverySection);
		for (const [scope, value] of [['user', discovery.userValue], ['workspace', discovery.workspaceValue], ['policy', discovery.policyValue]] as const) {
			let hasExplicitAdapter = false;
			for (const adapter of allDiscoverySources) {
				const explicitValue = typeof value === 'boolean'
					? value
					: value && Object.prototype.hasOwnProperty.call(value, adapter) ? value[adapter] : undefined;
				hasExplicitAdapter ||= explicitValue !== undefined;
				rows.push(configuredValueRow(scope, 'nativeDiscovery', explicitValue, adapter));
			}
			if (value !== undefined && !hasExplicitAdapter) {
				rows.push(configuredValueRow(scope, 'nativeDiscovery', value, 'all'));
			}
		}

		for (const [entryPoint, key] of [['allowedServers', mcpAllowedServersConfig], ['deniedServers', mcpDeniedServersConfig]] as const) {
			const inspection = this.configurationService.inspect(key);
			rows.push(configurationRow(inspection, 'applicationValue', 'application', entryPoint), configurationRow(inspection, 'policyValue', 'policy', entryPoint));
		}
		for (const [entryPoint, key] of [
			['managedServersOnly', COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG],
			['strictPluginOnly', COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG],
		] as const) {
			const inspection = this.configurationService.inspect(key);
			rows.push(
				configurationRow(inspection, 'applicationValue', 'application', entryPoint),
				configurationRow(inspection, 'policyValue', 'policy', entryPoint),
			);
		}
		const galleryEnabled = this.configurationService.inspect(mcpGalleryServiceEnablementConfig);
		rows.push(
			configurationRow(galleryEnabled, 'userValue', 'user', 'galleryEnabled'),
			configurationRow(galleryEnabled, 'workspaceValue', 'workspace', 'galleryEnabled'),
			configurationRow(galleryEnabled, 'policyValue', 'policy', 'galleryEnabled'),
		);
		rows.push(storageRow(this.storageService, StorageScope.PROFILE, 'profile'), storageRow(this.storageService, StorageScope.WORKSPACE, 'workspace'));

		const current = new Map<string, IMcpDiscoveryConfiguredEvent>(rows
			.filter(row => row.configurationPresent > 0)
			.map(row => [`${row.entryPoint}\0${row.adapter}\0${row.scope}`, row] as const));
		const changes = getKeyedChanges(this.lastConfiguredRows, current);
		const changed = [
			...changes.changed,
			...changes.removed.map(row => ({ ...row, configurationPresent: 0, configuredEntryCount: 0, enabledEntryCount: 0, disabledEntryCount: 0 })),
		];
		if (current.size === 0 && (!this.hasConfiguredSnapshot || this.lastConfiguredRows.size > 0)) {
			changed.push({ scope: 'all', entryPoint: 'all', adapter: 'all', configurationPresent: 0, configuredEntryCount: 0, enabledEntryCount: 0, disabledEntryCount: 0 });
		}
		this.hasConfiguredSnapshot = true;
		this.lastConfiguredRows.clear();
		for (const [key, row] of current) {
			this.lastConfiguredRows.set(key, row);
		}
		for (const row of changed.sort((a, b) => a.entryPoint.localeCompare(b.entryPoint) || a.adapter.localeCompare(b.adapter) || a.scope.localeCompare(b.scope))) {
			this.telemetryService.publicLog2<IMcpDiscoveryConfiguredEvent, McpDiscoveryConfiguredClassification>('mcp/discoveryConfigured', row);
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
