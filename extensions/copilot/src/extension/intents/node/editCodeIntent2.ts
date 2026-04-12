/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { modelSupportsMultiReplaceString, modelSupportsReplaceString } from '../../../platform/endpoint/common/chatModelCapabilities';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IAutomodeService } from '../../../platform/endpoint/node/automodeService';
import { IEnvService } from '../../../platform/env/common/envService';
import { ILogService } from '../../../platform/log/common/logService';
import { IEditLogService } from '../../../platform/multiFileEdit/common/editLogService';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { requestHasNotebookRefs } from '../../../platform/notebook/common/helpers';
import { INotebookService } from '../../../platform/notebook/common/notebookService';
import { IOTelService } from '../../../platform/otel/common/otelService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ICommandService } from '../../commands/node/commandService';
import { IIntent, IntentLinkificationOptions } from '../../prompt/node/intents';
import { ICodeMapperService } from '../../prompts/node/codeMapper/codeMapperService';
import { EditCodePrompt2 } from '../../prompts/node/panel/editCodePrompt2';
import { NotebookInlinePrompt } from '../../prompts/node/panel/notebookInlinePrompt';
import { ToolName } from '../../tools/common/toolNames';
import { IToolsService } from '../../tools/common/toolsService';
import { AgentIntentInvocation } from './agentIntent';
import { EditCodeIntentOptions } from './editCodeIntent';

const getTools = (instaService: IInstantiationService, request: vscode.ChatRequest): Promise<vscode.LanguageModelToolInformation[]> =>
	instaService.invokeFunction(async accessor => {
		const toolsService = accessor.get<IToolsService>(IToolsService);
		const endpointProvider = accessor.get<IEndpointProvider>(IEndpointProvider);
		const notebookService = accessor.get<INotebookService>(INotebookService);
		const model = await endpointProvider.getChatEndpoint(request);
		const lookForTools = new Set<string>([ToolName.EditFile]);


		if (requestHasNotebookRefs(request, notebookService, { checkPromptAsWell: true })) {
			lookForTools.add(ToolName.CreateNewJupyterNotebook);
		}

		if (modelSupportsReplaceString(model)) {
			lookForTools.add(ToolName.ReplaceString);
			if (modelSupportsMultiReplaceString(model)) {
				lookForTools.add(ToolName.MultiReplaceString);
			}
		}
		lookForTools.add(ToolName.EditNotebook);
		if (requestHasNotebookRefs(request, notebookService, { checkPromptAsWell: true })) {
			lookForTools.add(ToolName.GetNotebookSummary);
			lookForTools.add(ToolName.RunNotebookCell);
		}

		return toolsService.getEnabledTools(request, model, tool => lookForTools.has(tool.name));
	});

export class EditCode2IntentInvocation extends AgentIntentInvocation {

	public override get linkification(): IntentLinkificationOptions {
		return { disable: false };
	}

	protected override prompt: typeof EditCodePrompt2 | typeof NotebookInlinePrompt = EditCodePrompt2;

	constructor(
		intent: IIntent,
		location: ChatLocation,
		endpoint: IChatEndpoint,
		request: vscode.ChatRequest,
		intentOptions: EditCodeIntentOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeMapperService codeMapperService: ICodeMapperService,
		@IEnvService envService: IEnvService,
		@IPromptPathRepresentationService promptPathRepresentationService: IPromptPathRepresentationService,
		@IEndpointProvider endpointProvider: IEndpointProvider,
		@IWorkspaceService workspaceService: IWorkspaceService,
		@IToolsService toolsService: IToolsService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEditLogService editLogService: IEditLogService,
		@ICommandService commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotebookService notebookService: INotebookService,
		@ILogService logService: ILogService,
		@IExperimentationService expService: IExperimentationService,
		@IAutomodeService automodeService: IAutomodeService,
		@IOTelService otelService: IOTelService,
	) {
		super(intent, location, endpoint, request, intentOptions, instantiationService, codeMapperService, envService, promptPathRepresentationService, endpointProvider, workspaceService, toolsService, configurationService, editLogService, commandService, telemetryService, notebookService, logService, expService, automodeService, otelService);
	}

	public override async getAvailableTools(): Promise<vscode.LanguageModelToolInformation[]> {
		return getTools(this.instantiationService, this.request);
	}
}
