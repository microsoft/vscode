/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../base/common/event.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { IConfigurationResolverService } from '../../../../../services/configurationResolver/common/configurationResolver.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IMcpService } from '../../../../mcp/common/mcpTypes.js';
import { AgentHostClientCustomizationsService } from '../../../browser/agentSessions/agentHost/agentHostClientCustomizationsService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { type IAgenticSkillsService } from '../../../common/promptSyntax/service/agenticSkillsService.js';
import { type IChatExtensionCustomizationsService } from '../../../common/promptSyntax/service/chatExtensionCustomizationsService.js';
import { type IBuiltinPromptPath, type IExtensionPromptPath, type IPromptPath, type IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';

/** The services that discover the client's customization files. */
export interface ILocalCustomizationSources {
	readonly promptsService: IPromptsService;
	readonly extensionCustomizations: IChatExtensionCustomizationsService;
	readonly agenticSkills: IAgenticSkillsService;
}

/**
 * Creates customization sources that serve the given files, keyed by `${type}/${storage}`, from the service that owns
 * each storage: extension files from the extension service, built-in skills from the agentic skills service, and the
 * rest from the prompts service.
 */
export function makeLocalCustomizationSources(
	files: ReadonlyMap<string, readonly IPromptPath[]>,
	disabledPromptFiles: ReadonlyMap<PromptsType, ResourceSet> = new Map(),
): ILocalCustomizationSources {
	return {
		promptsService: upcastPartial<IPromptsService>({
			onDidChangeCustomAgents: Event.None,
			onDidChangeSlashCommands: Event.None,
			onDidChangeSkills: Event.None,
			onDidChangeInstructions: Event.None,
			async listPromptFilesForStorage(type: PromptsType, storage: PromptsStorage): Promise<readonly IPromptPath[]> {
				return files.get(`${type}/${storage}`) ?? [];
			},
		}),
		extensionCustomizations: upcastPartial<IChatExtensionCustomizationsService>({
			onDidChange: Event.None,
			async getExtensionPromptFiles(type: PromptsType) {
				return (files.get(`${type}/${PromptsStorage.extension}`) ?? []) as IExtensionPromptPath[];
			},
		}),
		agenticSkills: upcastPartial<IAgenticSkillsService>({
			onDidChange: Event.None,
			async getSkills() {
				return (files.get(`${PromptsType.skill}/${PromptsStorage.builtIn}`) ?? []) as IBuiltinPromptPath[];
			},
			getDisabledSkills: () => disabledPromptFiles.get(PromptsType.skill) ?? new ResourceSet(),
		}),
	};
}

/** Creates the client customizations service over the given sources; omitted services contribute nothing. */
export function createClientCustomizationsService(sources: ILocalCustomizationSources, services: {
	readonly agentPluginService?: IAgentPluginService;
	readonly mcpService?: IMcpService;
	readonly configurationResolverService?: IConfigurationResolverService;
	readonly remoteAuthority?: string | null;
} = {}): AgentHostClientCustomizationsService {
	return new AgentHostClientCustomizationsService(
		sources.promptsService,
		sources.extensionCustomizations,
		sources.agenticSkills,
		services.agentPluginService ?? upcastPartial<IAgentPluginService>({ plugins: constObservable([]) }),
		services.mcpService ?? upcastPartial<IMcpService>({ servers: constObservable([]) }),
		services.configurationResolverService ?? upcastPartial<IConfigurationResolverService>({}),
		upcastPartial<IWorkbenchEnvironmentService>({ remoteAuthority: services.remoteAuthority ?? undefined }),
	);
}
