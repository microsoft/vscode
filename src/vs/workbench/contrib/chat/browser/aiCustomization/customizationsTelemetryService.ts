/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename, dirname, isEqualOrParent } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { isAgentBuiltinCustomizationUri } from '../../../../../platform/agentHost/common/agentHostCustomizationUri.js';
import { CustomizationType, type ChildCustomization, type PluginCustomization } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IAgentHostActiveClientService } from '../agentSessions/agentHost/agentHostActiveClientService.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import { isAgentHostSessionResource } from '../../common/chatSessionsService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { AICustomizationSource, AICustomizationSources } from '../../common/aiCustomizationWorkspaceService.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../../../services/agentHost/common/agentHostFileSystemService.js';

export const ICustomizationsTelemetryService = createDecorator<ICustomizationsTelemetryService>('customizationsTelemetryService');

export interface ICustomizationsTelemetryService {
	readonly _serviceBrand: undefined;
	reportNewSession(sessionResource: URI): void;
}

type CustomizationTelemetryType = 'agent' | 'instructions' | 'prompt' | 'skill' | 'hook' | 'mcpServer' | 'plugin';

type CustomizationsDefinedEvent = {
	customizationType: CustomizationTelemetryType;
	userCount: number;
	workspaceCount: number;
	extensionCount: number;
	pluginCount: number;
	builtinCount: number;
};

type CustomizationsDefinedClassification = {
	owner: 'aeschli';
	comment: 'Tracks how many customizations of each type and source are defined when a new Agent Host chat session is first used.';
	customizationType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The bounded customization type being counted.' };
	userCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of user-level customizations of this type.' };
	workspaceCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of workspace-level customizations of this type.' };
	extensionCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of extension-contributed customizations of this type.' };
	pluginCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of plugin-contributed customizations of this type.' };
	builtinCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of built-in customizations of this type.' };
};

const customizationTypes: readonly CustomizationTelemetryType[] = [
	'agent',
	'instructions',
	'prompt',
	'skill',
	'hook',
	'mcpServer',
	'plugin',
];

type CustomizationSourceCounts = Omit<CustomizationsDefinedEvent, 'customizationType'>;

export class CustomizationsTelemetryService implements ICustomizationsTelemetryService {
	declare readonly _serviceBrand: undefined;

	private readonly reportedSessions = new Set<string>();

	constructor(
		@IAgentHostCustomizationService private readonly agentHostCustomizationService: IAgentHostCustomizationService,
		@IAgentHostActiveClientService private readonly agentHostActiveClientService: IAgentHostActiveClientService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
	) { }

	reportNewSession(sessionResource: URI): void {
		if (!isAgentHostSessionResource(sessionResource)) {
			return;
		}
		const key = sessionResource.toString();
		if (this.reportedSessions.has(key)) {
			return;
		}
		this.reportedSessions.add(key);
		void this.report(sessionResource).catch(error => {
			this.reportedSessions.delete(key);
			this.logService.error('Failed to collect customizations telemetry for a new session', error);
		});
	}

	private async report(sessionResource: URI): Promise<void> {
		const counts = createEmptyCounts();
		const workingDirectories = this.agentHostCustomizationService.getWorkingDirectories(sessionResource);
		for (const customization of this.agentHostCustomizationService.getCustomizations(sessionResource)) {
			if (customization.type === CustomizationType.Plugin) {
				const syntheticBundle = URI.parse(customization.uri).scheme === SYNCED_CUSTOMIZATION_SCHEME;
				if (!syntheticBundle) {
					incrementSource(counts.plugin, AICustomizationSources.plugin);
				}
				for (const child of customization.children ?? []) {
					const type = toTelemetryType(child.type);
					if (type && type !== 'mcpServer') {
						const source = syntheticBundle
							? this.getSyncedChildSource(customization, child)
							: AICustomizationSources.plugin;
						incrementSource(counts[type], source);
					}
				}
			} else if (customization.type === CustomizationType.Directory) {
				for (const child of customization.children ?? []) {
					const type = toTelemetryType(child.type);
					if (type && type !== 'mcpServer') {
						incrementSource(counts[type], getDirectoryChildSource(child, workingDirectories));
					}
				}
			}
		}

		const workspaceRoots = this.agentHostCustomizationService.getClientWorkingDirectoryUris(sessionResource);
		for (const server of this.agentHostCustomizationService.getMcpServers(sessionResource)) {
			switch (server.source) {
				case 'workspace':
					counts.mcpServer.workspaceCount++;
					break;
				case 'plugin':
					counts.mcpServer.pluginCount++;
					break;
				case 'builtin':
				case 'managed':
					counts.mcpServer.builtinCount++;
					break;
				case 'user':
					counts.mcpServer.userCount++;
					break;
				case undefined: {
					const sourceUri = server.sourceUri;
					if (server.isPluginProvided) {
						counts.mcpServer.pluginCount++;
					} else if (sourceUri && workspaceRoots.some(root => isEqualOrParent(sourceUri, root))) {
						counts.mcpServer.workspaceCount++;
					} else {
						counts.mcpServer.userCount++;
					}
					break;
				}
			}
		}

		for (const customizationType of customizationTypes) {
			this.telemetryService.publicLog2<CustomizationsDefinedEvent, CustomizationsDefinedClassification>('agents/customizationsDefined', {
				customizationType,
				...counts[customizationType],
			});
		}
	}

	private getSyncedChildSource(plugin: PluginCustomization, child: ChildCustomization): AICustomizationSource {
		const pluginUri = URI.parse(plugin.uri);
		const childUri = URI.parse(child.uri);
		const syncedUri = child.type === CustomizationType.Skill
			? URI.joinPath(pluginUri, 'skills', basename(dirname(childUri)), basename(childUri))
			: URI.joinPath(pluginUri, getPluginDirectory(child.type), basename(childUri));
		return this.agentHostActiveClientService.getOrigin(syncedUri)?.source ?? AICustomizationSources.plugin;
	}
}

export class CustomizationsTelemetryContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.customizationsTelemetry';

	constructor(
		@IChatService chatService: IChatService,
		@ICustomizationsTelemetryService customizationsTelemetryService: ICustomizationsTelemetryService,
	) {
		super();
		this._register(chatService.onDidAcceptRequest(event => {
			if (!event.isNewSession) {
				return;
			}

			const model = chatService.getSession(event.chatSessionResource);
			if (!model) {
				return;
			}
			const requestId = model.lastRequest?.id;
			this._register(Event.once(Event.filter(model.onDidChange, change =>
				change.kind === 'completedRequest' && (!requestId || change.request.id === requestId)
			))(() => customizationsTelemetryService.reportNewSession(event.chatSessionResource)));
		}));
	}
}

function createEmptyCounts(): Record<CustomizationTelemetryType, CustomizationSourceCounts> {
	return Object.fromEntries(customizationTypes.map(type => [type, {
		userCount: 0,
		workspaceCount: 0,
		extensionCount: 0,
		pluginCount: 0,
		builtinCount: 0,
	}])) as Record<CustomizationTelemetryType, CustomizationSourceCounts>;
}

function toTelemetryType(type: ChildCustomization['type']): CustomizationTelemetryType | undefined {
	switch (type) {
		case CustomizationType.Agent:
			return 'agent';
		case CustomizationType.Rule:
			return 'instructions';
		case CustomizationType.Prompt:
			return 'prompt';
		case CustomizationType.Skill:
			return 'skill';
		case CustomizationType.Hook:
			return 'hook';
		case CustomizationType.McpServer:
			return 'mcpServer';
		default:
			return undefined;
	}
}

function getPluginDirectory(type: Exclude<ChildCustomization['type'], CustomizationType.Skill>): string {
	switch (type) {
		case CustomizationType.Agent:
			return 'agents';
		case CustomizationType.Rule:
			return 'rules';
		case CustomizationType.Prompt:
			return 'commands';
		case CustomizationType.Hook:
			return 'hooks';
		case CustomizationType.McpServer:
			return '';
	}
}

function getDirectoryChildSource(child: ChildCustomization, workingDirectories: readonly string[]): AICustomizationSource {
	const childUri = URI.parse(child.uri);
	if (isAgentBuiltinCustomizationUri(childUri)) {
		return AICustomizationSources.builtin;
	}
	if (childUri.scheme === Schemas.file && workingDirectories.some(root => isEqualOrParent(childUri, URI.parse(root)))) {
		return AICustomizationSources.local;
	}
	return AICustomizationSources.user;
}

function incrementSource(counts: CustomizationSourceCounts, source: AICustomizationSource): void {
	switch (source) {
		case AICustomizationSources.local:
			counts.workspaceCount++;
			break;
		case AICustomizationSources.user:
			counts.userCount++;
			break;
		case AICustomizationSources.extension:
			counts.extensionCount++;
			break;
		case AICustomizationSources.plugin:
			counts.pluginCount++;
			break;
		case AICustomizationSources.builtin:
			counts.builtinCount++;
			break;
	}
}
