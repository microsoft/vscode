/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../../base/common/observable.js';
import { PluginFormat } from '../../../../../platform/agentPlugins/common/pluginParsers.js';
import { IConfigurationService, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { countConfigurationValue, getKeyedChanges, IConfigurationPresenceCounts } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ChatConfiguration } from '../constants.js';
import { isContributionEnabled } from '../enablement.js';
import { AgentPluginDiscoveryOrigin, AgentPluginDiscoveryOutcome, IAgentPlugin, IAgentPluginDiscoverySnapshot } from './agentPluginService.js';

type AgentPluginTelemetryFormat = 'copilot' | 'claude' | 'openPlugin' | 'agentPlugin' | 'unknown' | 'all';
export type AgentPluginConfigurationScope = 'application' | 'user' | 'userLocal' | 'userRemote' | 'policy' | 'profile' | 'workspace' | 'all';
export type AgentPluginConfigurationEntryPoint = 'pluginsEnabled' | 'pluginLocations' | 'marketplaces' | 'extraMarketplaces' | 'strictMarketplaces' | 'enabledPlugins' | 'storedEnablement' | 'workspaceMarketplaces' | 'workspaceEnabledPlugins' | 'all';
export type AgentPluginSettingsFileKind = 'notApplicable' | 'claudeShared' | 'claudeLocal' | 'copilotShared' | 'copilotLocal';

interface IAgentPluginDiscoveryTelemetryEvent {
	origin: AgentPluginDiscoveryOrigin | 'all';
	format: AgentPluginTelemetryFormat;
	candidateCount: number;
	loadedCount: number;
	disabledCount: number;
	policyBlockedCount: number;
	parseErrorCount: number;
	unreadableCount: number;
	collisionCount: number;
	pluginParseErrorCount: number;
	pluginUnreadableCount: number;
	commandCount: number;
	skillCount: number;
	agentCount: number;
	instructionCount: number;
	hookCount: number;
	mcpServerCount: number;
}

type AgentPluginDiscoveryTelemetryClassification = {
	origin: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed plugin discovery origin.' };
	format: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed plugin manifest format.' };
	candidateCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of plugin candidates represented by this row.' };
	loadedCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of usable plugin candidates.' };
	disabledCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of explicitly disabled plugin candidates.' };
	policyBlockedCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of plugin candidates blocked by policy.' };
	parseErrorCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of plugin candidates rejected by parsing.' };
	unreadableCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of unreadable plugin candidates.' };
	collisionCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of plugin candidates rejected by source precedence.' };
	pluginParseErrorCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of loaded plugins whose optional manifest could not be parsed.' };
	pluginUnreadableCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of loaded plugins whose optional manifest could not be read.' };
	commandCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of discovered plugin command components.' };
	skillCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of discovered plugin skill components.' };
	agentCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of discovered plugin agent components.' };
	instructionCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of discovered plugin instruction components.' };
	hookCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of discovered plugin hook components.' };
	mcpServerCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of discovered plugin MCP server components.' };
	owner: 'digitarald';
	comment: 'Reports privacy-safe aggregate local agent plugin discovery outcomes.';
};

export interface IAgentPluginConfigurationTelemetryEvent extends IConfigurationPresenceCounts {
	scope: AgentPluginConfigurationScope;
	entryPoint: AgentPluginConfigurationEntryPoint;
	settingsFileKind: AgentPluginSettingsFileKind;
	parseErrorCount: number;
	unreadableCount: number;
}

export type AgentPluginConfigurationTelemetryClassification = {
	scope: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed explicit configuration scope.' };
	entryPoint: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed plugin configuration entry point.' };
	settingsFileKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed workspace plugin settings file kind, or notApplicable.' };
	configurationPresent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether an explicit value is present at this scope.' };
	configuredEntryCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of explicitly configured entries without keys or values.' };
	enabledEntryCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of explicitly enabled entries.' };
	disabledEntryCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of explicitly disabled entries.' };
	parseErrorCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of configuration files with parse errors.' };
	unreadableCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of unreadable configuration files.' };
	owner: 'digitarald';
	comment: 'Reports privacy-safe explicit agent plugin configuration presence.';
};

type PluginConfigurationEventName = 'agentPluginLocationsConfigured' | 'agentPluginMarketplacesConfigured' | 'agentPluginEnablementConfigured';

function pluginFormatName(format: PluginFormat | undefined): Exclude<AgentPluginTelemetryFormat, 'all'> {
	switch (format) {
		case PluginFormat.Copilot: return 'copilot';
		case PluginFormat.Claude: return 'claude';
		case PluginFormat.OpenPlugin: return 'openPlugin';
		case PluginFormat.AgentPlugin: return 'agentPlugin';
		default: return 'unknown';
	}
}

function configurationValueRow(scope: AgentPluginConfigurationScope, entryPoint: AgentPluginConfigurationEntryPoint, value: unknown): IAgentPluginConfigurationTelemetryEvent {
	return {
		scope,
		entryPoint,
		settingsFileKind: 'notApplicable',
		...countConfigurationValue(value, (entry, configuration) => Array.isArray(configuration)
			? true
			: typeof entry === 'boolean' ? entry : undefined),
		parseErrorCount: 0,
		unreadableCount: 0,
	};
}

function configurationRow<T>(inspection: IConfigurationValue<T>, property: keyof IConfigurationValue<T>, scope: AgentPluginConfigurationScope, entryPoint: AgentPluginConfigurationEntryPoint): IAgentPluginConfigurationTelemetryEvent {
	return configurationValueRow(scope, entryPoint, inspection[property]);
}

function storageRow(storageService: IStorageService, scope: StorageScope, scopeName: 'profile' | 'workspace'): IAgentPluginConfigurationTelemetryEvent {
	const raw = storageService.get('agentPlugins.enablement', scope);
	if (raw !== undefined) {
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				const values = parsed.map(entry => Array.isArray(entry) ? entry[1] : entry);
				return {
					scope: scopeName,
					entryPoint: 'storedEnablement',
					settingsFileKind: 'notApplicable',
					configurationPresent: 1,
					configuredEntryCount: values.length,
					enabledEntryCount: values.filter(value => value === true).length,
					disabledEntryCount: values.filter(value => value === false).length,
					parseErrorCount: 0,
					unreadableCount: 0,
				};
			}
		} catch {
			// Malformed storage is still explicit configuration presence.
		}
	}
	return configurationValueRow(scopeName, 'storedEnablement', raw);
}

function emptyDiscoveryRow(): IAgentPluginDiscoveryTelemetryEvent {
	return {
		origin: 'all',
		format: 'all',
		candidateCount: 0,
		loadedCount: 0,
		disabledCount: 0,
		policyBlockedCount: 0,
		parseErrorCount: 0,
		unreadableCount: 0,
		collisionCount: 0,
		pluginParseErrorCount: 0,
		pluginUnreadableCount: 0,
		commandCount: 0,
		skillCount: 0,
		agentCount: 0,
		instructionCount: 0,
		hookCount: 0,
		mcpServerCount: 0,
	};
}

export class AgentPluginTelemetry {
	private readonly lastDiscoveryRows = new Map<string, IAgentPluginDiscoveryTelemetryEvent>();
	private hasDiscoverySnapshot = false;
	private readonly lastConfigurationRows = new Map<PluginConfigurationEventName, ReadonlyMap<string, IAgentPluginConfigurationTelemetryEvent>>();

	constructor(
		private readonly telemetryService: ITelemetryService,
		private readonly configurationService: IConfigurationService,
		private readonly storageService: IStorageService,
	) { }

	logDiscovery(snapshots: readonly IAgentPluginDiscoverySnapshot[], finalPlugins: readonly IAgentPlugin[], collisionGroups: ReadonlyMap<string, readonly string[]>, pluginsEnabled: boolean, reader: IReader): void {
		const finalPluginSet = new Set(finalPlugins);
		const rows = new Map<string, IAgentPluginDiscoveryTelemetryEvent>();
		for (const snapshot of snapshots) {
			for (const candidate of snapshot.candidates) {
				const key = `${candidate.origin}\0${pluginFormatName(candidate.format)}`;
				let row = rows.get(key);
				if (!row) {
					row = { ...emptyDiscoveryRow(), origin: candidate.origin, format: pluginFormatName(candidate.format) };
					rows.set(key, row);
				}
				row.candidateCount++;
				if (candidate.components?.manifestParseError) {
					row.pluginParseErrorCount++;
				}
				if (candidate.components?.manifestUnreadable) {
					row.pluginUnreadableCount++;
				}
				if (candidate.outcome === AgentPluginDiscoveryOutcome.ParseError) {
					row.parseErrorCount++;
					continue;
				}
				if (candidate.outcome === AgentPluginDiscoveryOutcome.Unreadable) {
					row.unreadableCount++;
					continue;
				}
				const collisionGroup = candidate.plugin && collisionGroups.get(candidate.plugin.uri.toString());
				if (candidate.outcome === AgentPluginDiscoveryOutcome.Collision
					|| (collisionGroup && collisionGroup[0] !== candidate.plugin?.uri.toString())
					|| (pluginsEnabled && candidate.plugin && !finalPluginSet.has(candidate.plugin))) {
					row.collisionCount++;
					continue;
				}
				if (candidate.components) {
					row.commandCount += candidate.components.commandCount;
					row.skillCount += candidate.components.skillCount;
					row.agentCount += candidate.components.agentCount;
					row.instructionCount += candidate.components.instructionCount;
					row.hookCount += candidate.components.hookCount;
					row.mcpServerCount += candidate.components.mcpServerCount;
				}
				if (candidate.outcome === AgentPluginDiscoveryOutcome.Disabled || !candidate.plugin || !pluginsEnabled) {
					row.disabledCount++;
					continue;
				}
				if (candidate.plugin.policyBlocked?.read(reader)) {
					row.policyBlockedCount++;
					continue;
				}
				if (!isContributionEnabled(candidate.plugin.enablement.read(reader))) {
					row.disabledCount++;
					continue;
				}
				row.loadedCount++;
			}
		}
		const changes = getKeyedChanges(this.lastDiscoveryRows, rows);
		const changed = [
			...changes.changed,
			...changes.removed.map(row => ({ ...row, candidateCount: 0, loadedCount: 0, disabledCount: 0, policyBlockedCount: 0, parseErrorCount: 0, unreadableCount: 0, collisionCount: 0, pluginParseErrorCount: 0, pluginUnreadableCount: 0, commandCount: 0, skillCount: 0, agentCount: 0, instructionCount: 0, hookCount: 0, mcpServerCount: 0 })),
		];
		if (rows.size === 0 && (!this.hasDiscoverySnapshot || this.lastDiscoveryRows.size > 0)) {
			changed.push(emptyDiscoveryRow());
		}
		this.hasDiscoverySnapshot = true;
		this.lastDiscoveryRows.clear();
		for (const [key, row] of rows) {
			this.lastDiscoveryRows.set(key, row);
		}
		for (const row of changed.sort((a, b) => a.origin.localeCompare(b.origin) || a.format.localeCompare(b.format))) {
			this.telemetryService.publicLog2<IAgentPluginDiscoveryTelemetryEvent, AgentPluginDiscoveryTelemetryClassification>('agentPluginsFound', row);
		}
	}

	logConfiguration(): void {
		const pluginsEnabled = this.configurationService.inspect(ChatConfiguration.PluginsEnabled);
		this.logConfigurationRows('agentPluginLocationsConfigured', [
			configurationRow(pluginsEnabled, 'userValue', 'user', 'pluginsEnabled'),
			configurationRow(pluginsEnabled, 'workspaceValue', 'workspace', 'pluginsEnabled'),
			configurationRow(pluginsEnabled, 'policyValue', 'policy', 'pluginsEnabled'),
			configurationRow(this.configurationService.inspect(ChatConfiguration.PluginLocations), 'userLocalValue', 'userLocal', 'pluginLocations'),
			configurationRow(this.configurationService.inspect(ChatConfiguration.PluginLocations), 'userRemoteValue', 'userRemote', 'pluginLocations'),
		]);

		const marketplaces = this.configurationService.inspect(ChatConfiguration.PluginMarketplaces);
		const extraMarketplaces = this.configurationService.inspect(ChatConfiguration.ExtraMarketplaces);
		const strictMarketplaces = this.configurationService.inspect(ChatConfiguration.StrictMarketplaces);
		this.logConfigurationRows('agentPluginMarketplacesConfigured', [
			configurationRow(marketplaces, 'applicationValue', 'application', 'marketplaces'),
			configurationRow(marketplaces, 'userValue', 'user', 'marketplaces'),
			configurationRow(extraMarketplaces, 'policyValue', 'policy', 'extraMarketplaces'),
			configurationRow(strictMarketplaces, 'applicationValue', 'application', 'strictMarketplaces'),
			configurationRow(strictMarketplaces, 'policyValue', 'policy', 'strictMarketplaces'),
		]);

		const enabledPlugins = this.configurationService.inspect(ChatConfiguration.EnabledPlugins);
		this.logConfigurationRows('agentPluginEnablementConfigured', [
			configurationRow(enabledPlugins, 'applicationValue', 'application', 'enabledPlugins'),
			configurationRow(enabledPlugins, 'policyValue', 'policy', 'enabledPlugins'),
			storageRow(this.storageService, StorageScope.PROFILE, 'profile'),
			storageRow(this.storageService, StorageScope.WORKSPACE, 'workspace'),
		]);
	}

	private logConfigurationRows(eventName: PluginConfigurationEventName, rows: readonly IAgentPluginConfigurationTelemetryEvent[]): void {
		const previous = this.lastConfigurationRows.get(eventName);
		const current = new Map<string, IAgentPluginConfigurationTelemetryEvent>(rows
			.filter(row => row.configurationPresent > 0)
			.map(row => [`${row.entryPoint}\0${row.scope}\0${row.settingsFileKind}`, row] as const));
		const changes = getKeyedChanges(previous, current);
		const changed = [
			...changes.changed,
			...changes.removed.map(row => ({ ...row, configurationPresent: 0, configuredEntryCount: 0, enabledEntryCount: 0, disabledEntryCount: 0, parseErrorCount: 0, unreadableCount: 0 })),
		];
		if (current.size === 0 && (previous === undefined || previous.size > 0)) {
			changed.push({
				scope: 'all',
				entryPoint: 'all',
				settingsFileKind: 'notApplicable',
				configurationPresent: 0,
				configuredEntryCount: 0,
				enabledEntryCount: 0,
				disabledEntryCount: 0,
				parseErrorCount: 0,
				unreadableCount: 0,
			});
		}
		this.lastConfigurationRows.set(eventName, current);
		for (const row of changed.sort((a, b) => a.entryPoint.localeCompare(b.entryPoint) || a.scope.localeCompare(b.scope))) {
			this.telemetryService.publicLog2<IAgentPluginConfigurationTelemetryEvent, AgentPluginConfigurationTelemetryClassification>(eventName, row);
		}
	}

}
