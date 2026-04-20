/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import type { CancellationToken, ChatRequest, LanguageModelToolInformation, Progress } from 'vscode';
import { IAuthenticationChatUpgradeService } from '../../../platform/authentication/common/authenticationUpgrade';
import { IChatHookService } from '../../../platform/chat/common/chatHookService';
import { ChatLocation, ChatResponse } from '../../../platform/chat/common/commonTypes';
import { ISessionTranscriptService } from '../../../platform/chat/common/sessionTranscriptService';
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { IGitService } from '../../../platform/git/common/gitService';
import { ILogService } from '../../../platform/log/common/logService';
import { IOTelService } from '../../../platform/otel/common/otelService';
import { IRequestLogger } from '../../../platform/requestLogger/common/requestLogger';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseProgressPart, ChatResponseReferencePart } from '../../../vscodeTypes';
import { IToolCallingLoopOptions, ToolCallingLoop, ToolCallingLoopFetchOptions } from '../../intents/node/toolCallingLoop';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { CodebaseAgentPrompt } from '../../prompts/node/panel/codebaseAgentPrompt';
import { IToolsService } from '../../tools/common/toolsService';
import { IBuildPromptContext } from '../common/intents';
import { IBuildPromptResult } from './intents';

export interface ICodebaseToolCallingLoopOptions extends IToolCallingLoopOptions {
	request: ChatRequest;
	location: ChatLocation;
}

export class CodebaseToolCallingLoop extends ToolCallingLoop<ICodebaseToolCallingLoopOptions> {

	public static readonly ID = 'codebaseTool';

	constructor(
		options: ICodebaseToolCallingLoopOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService logService: ILogService,
		@IRequestLogger requestLogger: IRequestLogger,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IToolsService private readonly toolsService: IToolsService,
		@IAuthenticationChatUpgradeService authenticationChatUpgradeService: IAuthenticationChatUpgradeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService experimentationService: IExperimentationService,
		@IChatHookService chatHookService: IChatHookService,
		@ISessionTranscriptService sessionTranscriptService: ISessionTranscriptService,
		@IFileSystemService fileSystemService: IFileSystemService,
		@IOTelService otelService: IOTelService,
		@IGitService gitService: IGitService,
	) {
		super(options, instantiationService, endpointProvider, logService, requestLogger, authenticationChatUpgradeService, telemetryService, configurationService, experimentationService, chatHookService, sessionTranscriptService, fileSystemService, otelService, gitService);
	}

	private async getEndpoint(request: ChatRequest) {
		let endpoint = await this.endpointProvider.getChatEndpoint(this.options.request);
		if (!endpoint.supportsToolCalls) {
			endpoint = await this.endpointProvider.getChatEndpoint('copilot-base');
		}
		return endpoint;
	}

	protected async buildPrompt(buildPromptContext: IBuildPromptContext, progress: Progress<ChatResponseReferencePart | ChatResponseProgressPart>, token: CancellationToken): Promise<IBuildPromptResult> {
		const endpoint = await this.getEndpoint(this.options.request);
		const renderer = PromptRenderer.create(
			this.instantiationService,
			endpoint,
			CodebaseAgentPrompt,
			{
				promptContext: buildPromptContext
			}
		);
		return await renderer.render(progress, token);
	}

	protected async getAvailableTools(): Promise<LanguageModelToolInformation[]> {
		const endpoint = await this.getEndpoint(this.options.request);
		return this.toolsService.getEnabledTools(this.options.request, endpoint, tool => tool.tags.includes('vscode_codesearch'));
	}

	protected async fetch({ messages, finishedCb, requestOptions }: ToolCallingLoopFetchOptions, token: CancellationToken): Promise<ChatResponse> {
		const endpoint = await this.getEndpoint(this.options.request);
		return endpoint.makeChatRequest(
			CodebaseToolCallingLoop.ID,
			messages,
			finishedCb,
			token,
			this.options.location,
			undefined,
			{
				...requestOptions,
				temperature: 0
			},
			// This loop is inside a tool called from another request, so never user initiated
			false,
			{
				messageId: randomUUID(), // @TODO@joyceerhl
				messageSource: CodebaseToolCallingLoop.ID
			},
		);
	}
}
