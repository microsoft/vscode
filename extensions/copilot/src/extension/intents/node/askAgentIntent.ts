/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IAutomodeService } from '../../../platform/endpoint/node/automodeService';
import { IEnvService } from '../../../platform/env/common/envService';
import { ILogService } from '../../../platform/log/common/logService';
import { IEditLogService } from '../../../platform/multiFileEdit/common/editLogService';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { INotebookService } from '../../../platform/notebook/common/notebookService';
import { IOTelService } from '../../../platform/otel/common/otelService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ICommandService } from '../../commands/node/commandService';
import { Intent } from '../../common/constants';
import { Conversation } from '../../prompt/common/conversation';
import { getRequestedToolCallIterationLimit } from '../../prompt/common/specialRequestTypes';
import { ChatTelemetryBuilder } from '../../prompt/node/chatParticipantTelemetry';
import { DefaultIntentRequestHandler, IDefaultIntentRequestHandlerOptions } from '../../prompt/node/defaultIntentRequestHandler';
import { IDocumentContext } from '../../prompt/node/documentContext';
import { IIntent, IIntentInvocationContext, IntentLinkificationOptions } from '../../prompt/node/intents';
import { AgentPrompt } from '../../prompts/node/agent/agentPrompt';
import { ICodeMapperService } from '../../prompts/node/codeMapper/codeMapperService';
import { IToolsService } from '../../tools/common/toolsService';
import { getAgentMaxRequests } from '../common/agentConfig';
import { AgentIntentInvocation } from './agentIntent';


const getTools = (instaService: IInstantiationService, request: vscode.ChatRequest): Promise<vscode.LanguageModelToolInformation[]> =>
	instaService.invokeFunction(async accessor => {
		const toolsService = accessor.get<IToolsService>(IToolsService);
		const lookForTags = new Set<string>(['vscode_codesearch']);
		const endpointProvider = accessor.get<IEndpointProvider>(IEndpointProvider);
		const model = await endpointProvider.getChatEndpoint(request);

		// Special case...
		// Since AskAgent currently has no tool picker, have to duplicate the toolReference logic here.
		// When it's no longer experimental, it should be a custom mode, have a tool picker, etc.
		// And must return boolean to avoid falling back on other logic that we don't want, like the `extension_installed_by_tool` check.
		return toolsService.getEnabledTools(request, model, tool => tool.tags.some(tag => lookForTags.has(tag)) || request.toolReferences.some(ref => ref.name === tool.name));
	});

export class AskAgentIntent implements IIntent {

	static readonly ID = Intent.AskAgent;

	readonly id = AskAgentIntent.ID;

	readonly description = 'unused';
	readonly locations = [ChatLocation.Panel];

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) { }

	private getIntentHandlerOptions(request: vscode.ChatRequest): IDefaultIntentRequestHandlerOptions | undefined {
		return {
			maxToolCallIterations: getRequestedToolCallIterationLimit(request) ?? this.instantiationService.invokeFunction(getAgentMaxRequests),
			temperature: this.configurationService.getConfig(ConfigKey.Advanced.AgentTemperature) ?? 0,
			overrideRequestLocation: ChatLocation.EditingSession,
		};
	}

	async handleRequest(conversation: Conversation, request: vscode.ChatRequest, stream: vscode.ChatResponseStream, token: CancellationToken, documentContext: IDocumentContext | undefined, agentName: string, location: ChatLocation, chatTelemetry: ChatTelemetryBuilder): Promise<vscode.ChatResult> {
		const actual = this.instantiationService.createInstance(
			DefaultIntentRequestHandler,
			this,
			conversation,
			request,
			stream,
			token,
			documentContext,
			location,
			chatTelemetry,
			this.getIntentHandlerOptions(request),
			undefined,
		);
		return await actual.getResult();
	}

	async invoke(invocationContext: IIntentInvocationContext) {
		const { location, request } = invocationContext;
		const endpoint = await this.endpointProvider.getChatEndpoint(request);

		return this.instantiationService.createInstance(AskAgentIntentInvocation, this, location, endpoint, request);
	}
}

export class AskAgentIntentInvocation extends AgentIntentInvocation {

	public override get linkification(): IntentLinkificationOptions {
		return { disable: false };
	}

	protected override prompt = AgentPrompt;

	protected override extraPromptProps = { codesearchMode: true };

	constructor(
		intent: IIntent,
		location: ChatLocation,
		endpoint: IChatEndpoint,
		request: vscode.ChatRequest,
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
		super(intent, location, endpoint, request, { processCodeblocks: true }, instantiationService, codeMapperService, envService, promptPathRepresentationService, endpointProvider, workspaceService, toolsService, configurationService, editLogService, commandService, telemetryService, notebookService, logService, expService, automodeService, otelService);
	}

	public override async getAvailableTools(): Promise<vscode.LanguageModelToolInformation[]> {
		return getTools(this.instantiationService, this.request);
	}
}
