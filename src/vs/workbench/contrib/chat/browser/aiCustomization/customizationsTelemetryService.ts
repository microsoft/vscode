/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { isEqualOrParent } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import { isAgentHostSessionResource } from '../../common/chatSessionsService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { AICustomizationSource, AICustomizationSources } from '../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, ICustomizationItem } from '../../common/customizationHarnessService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';

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
	comment: 'Tracks how many customizations of each type and source are defined when a new Agents window session initializes.';
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
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@IAgentHostCustomizationService private readonly agentHostCustomizationService: IAgentHostCustomizationService,
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
		await this.agentHostCustomizationService.whenCustomizationsReady(sessionResource);
		const harness = this.customizationHarnessService.findHarnessById(getChatSessionType(sessionResource));
		if (!harness?.itemProvider) {
			throw new Error(`No customization provider found for session type ${getChatSessionType(sessionResource)}`);
		}

		const items = await harness.itemProvider.provideChatSessionCustomizations(sessionResource, CancellationToken.None);
		const counts = createEmptyCounts();
		for (const item of items ?? []) {
			const type = toTelemetryType(item);
			if (type && type !== 'mcpServer') {
				incrementSource(counts[type], item.source);
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
}

export class CustomizationsTelemetryContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.customizationsTelemetry';

	constructor(
		@IChatService chatService: IChatService,
		@ICustomizationsTelemetryService customizationsTelemetryService: ICustomizationsTelemetryService,
	) {
		super();
		this._register(chatService.onDidAcceptRequest(event => {
			if (event.isNewSession) {
				customizationsTelemetryService.reportNewSession(event.chatSessionResource);
			}
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

function toTelemetryType(item: ICustomizationItem): CustomizationTelemetryType | undefined {
	switch (item.type) {
		case PromptsType.agent:
			return 'agent';
		case PromptsType.instructions:
			return 'instructions';
		case PromptsType.prompt:
			return 'prompt';
		case PromptsType.skill:
			return 'skill';
		case PromptsType.hook:
			return 'hook';
		case 'mcpServer':
			return 'mcpServer';
		case 'plugin':
			return 'plugin';
		default:
			return undefined;
	}
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
