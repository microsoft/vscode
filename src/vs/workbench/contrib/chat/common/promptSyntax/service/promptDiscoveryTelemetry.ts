/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService, IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG } from '../../../../../../platform/policy/common/copilotManagedSettings.js';
import { IStorageService, StorageScope } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { PromptsConfig } from '../config/config.js';
import { PromptFileFormat, PromptFileSource, PromptRootKind, PromptsType } from '../promptTypes.js';
import { AgentInstructionFileSource, AgentInstructionFileType, IAgentInstructionFile, IPromptDiscoveryInfo } from './promptsService.js';

export type PromptDiscoveryTelemetryEventName = 'promptFilesFound' | 'customAgentsFound' | 'agentSkillsFound' | 'instructionsFound';
export type PromptConfigurationTelemetryEventName = 'promptFileLocationsConfigured' | 'customAgentLocationsConfigured' | 'legacyModeLocationsConfigured' | 'agentSkillLocationsConfigured' | 'instructionLocationsConfigured' | 'instructionEntryPointsConfigured';
export type InstructionConsumer = 'agent' | 'voice' | 'dictation';
export type PromptDiscoveryKind = 'reusable' | 'automatic' | 'nestedAutomatic' | 'speech';
export type PromptDiscoveryOrigin = 'githubWorkspace' | 'copilotPersonal' | 'claudePersonal' | 'claudeWorkspace' | 'claudeWorkspaceLocal' | 'agentsWorkspace' | 'agentsPersonal' | 'configWorkspace' | 'configPersonal' | 'userData' | 'extensionContribution' | 'extensionAPI' | 'plugin' | 'builtIn' | 'workspaceRoot' | 'parentRepository' | 'all';
export type PromptDiscoveryFormat = PromptFileFormat | AgentInstructionFileType | 'voiceMarkdown' | 'dictationMarkdown' | 'all';
type PromptConfigurationScope = 'application' | 'user' | 'workspace' | 'profile' | 'policy' | 'all';
type PromptConfigurationEntryPoint = 'locations' | 'profileDisablement' | 'standaloneLockdown' | 'useAgentSkills' | 'useAgentsMdFile' | 'useNestedAgentsMdFiles' | 'useClaudeMdFile' | 'useInstructionFiles' | 'useParentRepositories' | 'all';

export interface IPromptDiscoveryTelemetryRow {
	readonly origin: PromptDiscoveryOrigin;
	readonly format: PromptDiscoveryFormat;
	readonly rootKind: PromptRootKind | 'all';
	readonly consumer: InstructionConsumer | 'notApplicable';
	readonly discoveryKind: PromptDiscoveryKind;
	readonly candidateCount: number;
	readonly loadedCount: number;
	readonly disabledCount: number;
	readonly parseErrorCount: number;
	readonly otherRejectedCount: number;
}

interface IPromptDiscoveryTelemetryEvent extends IPromptDiscoveryTelemetryRow { }

type PromptDiscoveryTelemetryClassification = {
	origin: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed origin of the discovered customization.' };
	format: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed format of the discovered customization.' };
	rootKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed placement category assigned by the discovery provider.' };
	consumer: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed consumer category for instruction customizations.' };
	discoveryKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed discovery boundary that produced this snapshot.' };
	candidateCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of candidates represented by this discovery row.' };
	loadedCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of candidates that loaded successfully.' };
	disabledCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of candidates disabled by explicit state.' };
	parseErrorCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of candidates rejected because parsing failed.' };
	otherRejectedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of candidates rejected for another fixed reason.' };
	owner: 'digitarald';
	comment: 'Reports privacy-safe aggregate local AI customization discovery outcomes.';
};

export interface IPromptConfigurationTelemetryRow {
	readonly scope: PromptConfigurationScope;
	readonly entryPoint: PromptConfigurationEntryPoint;
	readonly configurationPresent: number;
	readonly configuredEntryCount: number;
	readonly enabledEntryCount: number;
	readonly disabledEntryCount: number;
}

interface IPromptConfigurationTelemetryEvent extends IPromptConfigurationTelemetryRow { }

type PromptConfigurationTelemetryClassification = {
	scope: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed explicit configuration scope.' };
	entryPoint: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed customization configuration entry point.' };
	configurationPresent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether an explicit value is present at this scope.' };
	configuredEntryCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of explicitly configured entries without reporting keys or values.' };
	enabledEntryCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of explicitly enabled entries.' };
	disabledEntryCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of explicitly disabled entries.' };
	owner: 'digitarald';
	comment: 'Reports privacy-safe explicit AI customization configuration presence.';
};

interface IMutableDiscoveryRow {
	origin: PromptDiscoveryOrigin;
	format: PromptDiscoveryFormat;
	rootKind: PromptRootKind | 'all';
	consumer: InstructionConsumer | 'notApplicable';
	discoveryKind: PromptDiscoveryKind;
	candidateCount: number;
	loadedCount: number;
	disabledCount: number;
	parseErrorCount: number;
	otherRejectedCount: number;
}

export type SpeechInstructionOutcome = {
	readonly origin: 'githubWorkspace' | 'copilotPersonal';
	readonly rootKind: PromptRootKind.Workspace | PromptRootKind.UserHome;
	readonly status: 'loaded' | 'rejected';
};

const sourceNames: Record<PromptFileSource, Exclude<PromptDiscoveryOrigin, 'workspaceRoot' | 'parentRepository' | 'all'>> = {
	[PromptFileSource.GitHubWorkspace]: 'githubWorkspace',
	[PromptFileSource.CopilotPersonal]: 'copilotPersonal',
	[PromptFileSource.ClaudePersonal]: 'claudePersonal',
	[PromptFileSource.ClaudeWorkspace]: 'claudeWorkspace',
	[PromptFileSource.ClaudeWorkspaceLocal]: 'claudeWorkspaceLocal',
	[PromptFileSource.AgentsWorkspace]: 'agentsWorkspace',
	[PromptFileSource.AgentsPersonal]: 'agentsPersonal',
	[PromptFileSource.ConfigWorkspace]: 'configWorkspace',
	[PromptFileSource.ConfigPersonal]: 'configPersonal',
	[PromptFileSource.UserData]: 'userData',
	[PromptFileSource.ExtensionContribution]: 'extensionContribution',
	[PromptFileSource.ExtensionAPI]: 'extensionAPI',
	[PromptFileSource.Plugin]: 'plugin',
	[PromptFileSource.BuiltIn]: 'builtIn',
};

function sortDiscoveryRows(rows: readonly IPromptDiscoveryTelemetryRow[]): IPromptDiscoveryTelemetryRow[] {
	return [...rows].sort((a, b) =>
		a.origin.localeCompare(b.origin)
		|| a.format.localeCompare(b.format)
		|| a.rootKind.localeCompare(b.rootKind)
		|| a.consumer.localeCompare(b.consumer)
		|| a.discoveryKind.localeCompare(b.discoveryKind)
	);
}

export function aggregatePromptDiscovery(info: IPromptDiscoveryInfo, type: PromptsType, consumer: InstructionConsumer | 'notApplicable'): IPromptDiscoveryTelemetryRow[] {
	const rows = new Map<string, IMutableDiscoveryRow>();
	for (const file of info.files) {
		if (file.promptPath.type !== type) {
			continue;
		}
		const { source, format, rootKind } = file.promptPath;
		if (source === undefined || format === undefined || rootKind === undefined) {
			continue;
		}
		const origin = sourceNames[source];
		const key = `${origin}\0${format}\0${rootKind}\0${consumer}`;
		let row = rows.get(key);
		if (!row) {
			row = {
				origin,
				format,
				rootKind,
				consumer,
				discoveryKind: 'reusable',
				candidateCount: 0,
				loadedCount: 0,
				disabledCount: 0,
				parseErrorCount: 0,
				otherRejectedCount: 0,
			};
			rows.set(key, row);
		}
		row.candidateCount++;
		if (file.status === 'loaded') {
			row.loadedCount++;
		} else if (file.skipReason === 'disabled') {
			row.disabledCount++;
		} else if (file.skipReason === 'parse-error') {
			row.parseErrorCount++;
		} else {
			row.otherRejectedCount++;
		}
	}

	if (rows.size === 0) {
		return [{
			origin: 'all',
			format: 'all',
			rootKind: 'all',
			consumer,
			discoveryKind: 'reusable',
			candidateCount: 0,
			loadedCount: 0,
			disabledCount: 0,
			parseErrorCount: 0,
			otherRejectedCount: 0,
		}];
	}
	return sortDiscoveryRows([...rows.values()]);
}

function automaticInstructionOrigin(file: IAgentInstructionFile): PromptDiscoveryOrigin | undefined {
	if (file.rootKind === PromptRootKind.ParentRepository) {
		return 'parentRepository';
	}
	switch (file.source) {
		case AgentInstructionFileSource.WorkspaceRoot: return 'workspaceRoot';
		case AgentInstructionFileSource.ParentRepository: return 'parentRepository';
		case AgentInstructionFileSource.ClaudeWorkspace: return 'claudeWorkspace';
		case AgentInstructionFileSource.ClaudePersonal: return 'claudePersonal';
		case AgentInstructionFileSource.GitHubWorkspace: return 'githubWorkspace';
		case AgentInstructionFileSource.CopilotPersonal: return 'copilotPersonal';
		default: return undefined;
	}
}

export function aggregateAutomaticInstructions(files: readonly IAgentInstructionFile[]): IPromptDiscoveryTelemetryRow[] {
	const rows = new Map<string, IMutableDiscoveryRow>();
	for (const file of files) {
		const origin = automaticInstructionOrigin(file);
		if (!origin || !file.rootKind) {
			continue;
		}
		const format = file.type;
		const key = `${origin}\0${format}\0${file.rootKind}`;
		let row = rows.get(key);
		if (!row) {
			row = {
				origin,
				format,
				rootKind: file.rootKind,
				consumer: 'agent',
				discoveryKind: 'automatic',
				candidateCount: 0,
				loadedCount: 0,
				disabledCount: 0,
				parseErrorCount: 0,
				otherRejectedCount: 0,
			};
			rows.set(key, row);
		}
		row.candidateCount++;
		row.loadedCount++;
	}
	if (rows.size === 0) {
		return [{
			origin: 'all',
			format: 'all',
			rootKind: 'all',
			consumer: 'agent',
			discoveryKind: 'automatic',
			candidateCount: 0,
			loadedCount: 0,
			disabledCount: 0,
			parseErrorCount: 0,
			otherRejectedCount: 0,
		}];
	}
	return sortDiscoveryRows([...rows.values()]);
}

export function aggregateSpeechInstructions(consumer: Exclude<InstructionConsumer, 'agent'>, outcomes: readonly SpeechInstructionOutcome[]): IPromptDiscoveryTelemetryRow[] {
	const rows = new Map<string, IMutableDiscoveryRow>();
	for (const outcome of outcomes) {
		const format: PromptDiscoveryFormat = consumer === 'voice' ? 'voiceMarkdown' : 'dictationMarkdown';
		const key = `${outcome.origin}\0${format}\0${outcome.rootKind}`;
		let row = rows.get(key);
		if (!row) {
			row = {
				origin: outcome.origin,
				format,
				rootKind: outcome.rootKind,
				consumer,
				discoveryKind: 'speech',
				candidateCount: 0,
				loadedCount: 0,
				disabledCount: 0,
				parseErrorCount: 0,
				otherRejectedCount: 0,
			};
			rows.set(key, row);
		}
		row.candidateCount++;
		if (outcome.status === 'loaded') {
			row.loadedCount++;
		} else {
			row.otherRejectedCount++;
		}
	}
	if (rows.size === 0) {
		return [{
			origin: 'all',
			format: 'all',
			rootKind: 'all',
			consumer,
			discoveryKind: 'speech',
			candidateCount: 0,
			loadedCount: 0,
			disabledCount: 0,
			parseErrorCount: 0,
			otherRejectedCount: 0,
		}];
	}
	return sortDiscoveryRows([...rows.values()]);
}

function countConfigurationValue(scope: PromptConfigurationScope, entryPoint: PromptConfigurationEntryPoint, value: unknown): IPromptConfigurationTelemetryRow {
	let configuredEntryCount = 0;
	let enabledEntryCount = 0;
	let disabledEntryCount = 0;
	if (Array.isArray(value)) {
		configuredEntryCount = value.length;
		enabledEntryCount = value.length;
	} else if (value !== null && typeof value === 'object') {
		const values = Object.values(value);
		configuredEntryCount = values.length;
		enabledEntryCount = values.filter(entry => entry === true).length;
		disabledEntryCount = values.filter(entry => entry === false).length;
	} else if (typeof value === 'boolean') {
		configuredEntryCount = 1;
		enabledEntryCount = value ? 1 : 0;
		disabledEntryCount = value ? 0 : 1;
	} else if (value !== undefined) {
		configuredEntryCount = 1;
	}
	return {
		scope,
		entryPoint,
		configurationPresent: value === undefined ? 0 : 1,
		configuredEntryCount,
		enabledEntryCount,
		disabledEntryCount,
	};
}

function userWorkspaceRows<T>(inspection: IConfigurationValue<T>, entryPoint: PromptConfigurationEntryPoint): IPromptConfigurationTelemetryRow[] {
	return [
		countConfigurationValue('user', entryPoint, inspection.userValue),
		countConfigurationValue('workspace', entryPoint, inspection.workspaceValue),
	];
}

export class PromptDiscoveryTelemetry {
	private readonly lastDiscoveryRows = new Map<string, ReadonlyMap<string, IPromptDiscoveryTelemetryRow>>();
	private readonly discoverySnapshotsSeen = new Set<string>();
	private readonly lastConfigurationRows = new Map<PromptConfigurationTelemetryEventName, ReadonlyMap<string, IPromptConfigurationTelemetryRow>>();

	constructor(
		private readonly telemetryService: ITelemetryService,
		private readonly configurationService: IConfigurationService,
		private readonly storageService: IStorageService,
	) { }

	logDiscovery(eventName: PromptDiscoveryTelemetryEventName, channel: string, info: IPromptDiscoveryInfo, type: PromptsType, consumer: InstructionConsumer | 'notApplicable' = 'notApplicable'): void {
		this.logDiscoveryRows(eventName, channel, aggregatePromptDiscovery(info, type, consumer));
	}

	logEmptyDiscovery(eventName: PromptDiscoveryTelemetryEventName, channel: string, consumer: InstructionConsumer | 'notApplicable' = 'notApplicable'): void {
		this.logDiscoveryRows(eventName, channel, [{
			origin: 'all',
			format: 'all',
			rootKind: 'all',
			consumer,
			discoveryKind: channel === 'reusable' ? 'reusable' : channel === 'automatic' ? 'automatic' : channel === 'nestedAutomatic' ? 'nestedAutomatic' : 'speech',
			candidateCount: 0,
			loadedCount: 0,
			disabledCount: 0,
			parseErrorCount: 0,
			otherRejectedCount: 0,
		}]);
	}

	logAutomaticInstructions(files: readonly IAgentInstructionFile[], channel: 'automatic' | 'nestedAutomatic' = 'automatic'): void {
		const rows = aggregateAutomaticInstructions(files).map(row => ({ ...row, discoveryKind: channel }));
		this.logDiscoveryRows('instructionsFound', channel, rows);
	}

	logSpeechInstructions(consumer: Exclude<InstructionConsumer, 'agent'>, outcomes: readonly SpeechInstructionOutcome[]): void {
		this.logDiscoveryRows('instructionsFound', consumer, aggregateSpeechInstructions(consumer, outcomes));
	}

	private logDiscoveryRows(eventName: PromptDiscoveryTelemetryEventName, channel: string, rows: readonly IPromptDiscoveryTelemetryRow[]): void {
		const snapshotKey = `${eventName}:${channel}`;
		const previous = this.lastDiscoveryRows.get(snapshotKey);
		const current = new Map<string, IPromptDiscoveryTelemetryRow>(rows
			.filter(row => row.origin !== 'all')
			.map(row => [`${row.origin}\0${row.format}\0${row.rootKind}\0${row.consumer}\0${row.discoveryKind}`, row] as const));
		const changed: IPromptDiscoveryTelemetryRow[] = [];
		for (const [key, row] of current) {
			if (JSON.stringify(previous?.get(key)) !== JSON.stringify(row)) {
				changed.push(row);
			}
		}
		for (const [key, row] of previous ?? []) {
			if (!current.has(key)) {
				changed.push({ ...row, candidateCount: 0, loadedCount: 0, disabledCount: 0, parseErrorCount: 0, otherRejectedCount: 0 });
			}
		}
		if (current.size === 0 && (!this.discoverySnapshotsSeen.has(snapshotKey) || (previous?.size ?? 0) > 0)) {
			changed.push(rows.find(row => row.origin === 'all') ?? {
				origin: 'all',
				format: 'all',
				rootKind: 'all',
				consumer: 'notApplicable',
				discoveryKind: 'reusable',
				candidateCount: 0,
				loadedCount: 0,
				disabledCount: 0,
				parseErrorCount: 0,
				otherRejectedCount: 0,
			});
		}
		this.discoverySnapshotsSeen.add(snapshotKey);
		this.lastDiscoveryRows.set(snapshotKey, current);
		for (const row of sortDiscoveryRows(changed)) {
			this.telemetryService.publicLog2<IPromptDiscoveryTelemetryEvent, PromptDiscoveryTelemetryClassification>(eventName, row);
		}
	}

	logConfiguration(): void {
		this.logConfigurationRows('promptFileLocationsConfigured', userWorkspaceRows(this.configurationService.inspect(PromptsConfig.PROMPT_LOCATIONS_KEY), 'locations'));
		this.logConfigurationRows('customAgentLocationsConfigured', [
			...userWorkspaceRows(this.configurationService.inspect(PromptsConfig.AGENTS_LOCATION_KEY), 'locations'),
			this.storageRow(PromptsType.agent),
			...this.lockdownRows(),
		]);
		this.logConfigurationRows('legacyModeLocationsConfigured', userWorkspaceRows(this.configurationService.inspect(PromptsConfig.MODE_LOCATION_KEY), 'locations'));
		this.logConfigurationRows('agentSkillLocationsConfigured', [
			...userWorkspaceRows(this.configurationService.inspect(PromptsConfig.SKILLS_LOCATION_KEY), 'locations'),
			...userWorkspaceRows(this.configurationService.inspect(PromptsConfig.USE_AGENT_SKILLS), 'useAgentSkills'),
			this.storageRow(PromptsType.skill),
			...this.lockdownRows(),
		]);
		this.logConfigurationRows('instructionLocationsConfigured', userWorkspaceRows(this.configurationService.inspect(PromptsConfig.INSTRUCTIONS_LOCATION_KEY), 'locations'));
		this.logConfigurationRows('instructionEntryPointsConfigured', [
			...userWorkspaceRows(this.configurationService.inspect(PromptsConfig.USE_AGENT_MD), 'useAgentsMdFile'),
			...userWorkspaceRows(this.configurationService.inspect(PromptsConfig.USE_NESTED_AGENT_MD), 'useNestedAgentsMdFiles'),
			...userWorkspaceRows(this.configurationService.inspect(PromptsConfig.USE_CLAUDE_MD), 'useClaudeMdFile'),
			...userWorkspaceRows(this.configurationService.inspect(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES), 'useInstructionFiles'),
			...userWorkspaceRows(this.configurationService.inspect(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS), 'useParentRepositories'),
			...this.lockdownRows(),
		]);
	}

	private storageRow(type: PromptsType.agent | PromptsType.skill): IPromptConfigurationTelemetryRow {
		const raw = this.storageService.get(`chat.disabledPromptFiles.${type}`, StorageScope.PROFILE);
		if (raw === undefined) {
			return countConfigurationValue('profile', 'profileDisablement', undefined);
		}
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				return {
					scope: 'profile',
					entryPoint: 'profileDisablement',
					configurationPresent: 1,
					configuredEntryCount: parsed.length,
					enabledEntryCount: 0,
					disabledEntryCount: parsed.length,
				};
			}
		} catch {
			// Malformed storage is still explicit configuration presence.
		}
		return countConfigurationValue('profile', 'profileDisablement', raw);
	}

	private lockdownRows(): IPromptConfigurationTelemetryRow[] {
		const inspection = this.configurationService.inspect(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG);
		return [
			countConfigurationValue('application', 'standaloneLockdown', inspection.applicationValue),
			countConfigurationValue('policy', 'standaloneLockdown', inspection.policyValue),
		];
	}

	private logConfigurationRows(eventName: PromptConfigurationTelemetryEventName, rows: readonly IPromptConfigurationTelemetryRow[]): void {
		const previous = this.lastConfigurationRows.get(eventName);
		const current = new Map<string, IPromptConfigurationTelemetryRow>(rows
			.filter(row => row.configurationPresent > 0)
			.map(row => [`${row.entryPoint}\0${row.scope}`, row] as const));
		const changed: IPromptConfigurationTelemetryRow[] = [];
		for (const [key, row] of current) {
			if (JSON.stringify(previous?.get(key)) !== JSON.stringify(row)) {
				changed.push(row);
			}
		}
		for (const [key, row] of previous ?? []) {
			if (!current.has(key)) {
				changed.push({ ...row, configurationPresent: 0, configuredEntryCount: 0, enabledEntryCount: 0, disabledEntryCount: 0 });
			}
		}
		if (current.size === 0 && (previous === undefined || previous.size > 0)) {
			changed.push({ scope: 'all', entryPoint: 'all', configurationPresent: 0, configuredEntryCount: 0, enabledEntryCount: 0, disabledEntryCount: 0 });
		}
		this.lastConfigurationRows.set(eventName, current);
		for (const row of changed.sort((a, b) => a.entryPoint.localeCompare(b.entryPoint) || a.scope.localeCompare(b.scope))) {
			this.telemetryService.publicLog2<IPromptConfigurationTelemetryEvent, PromptConfigurationTelemetryClassification>(eventName, row);
		}
	}

}
