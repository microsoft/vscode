/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../../base/common/observable.js';
import { PluginFormat } from '../../../../../platform/agentPlugins/common/pluginParsers.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { getKeyedChanges } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { isContributionEnabled } from '../enablement.js';
import { AgentPluginDiscoveryOrigin, AgentPluginDiscoveryOutcome, IAgentPlugin, IAgentPluginDiscoverySnapshot } from './agentPluginService.js';

type AgentPluginTelemetryFormat = 'copilot' | 'claude' | 'openPlugin' | 'agentPlugin' | 'unknown' | 'all';

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

function pluginFormatName(format: PluginFormat | undefined): Exclude<AgentPluginTelemetryFormat, 'all'> {
	switch (format) {
		case PluginFormat.Copilot: return 'copilot';
		case PluginFormat.Claude: return 'claude';
		case PluginFormat.OpenPlugin: return 'openPlugin';
		case PluginFormat.AgentPlugin: return 'agentPlugin';
		default: return 'unknown';
	}
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

	constructor(
		private readonly telemetryService: ITelemetryService,
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

}
