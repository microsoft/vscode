/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken, LanguageModelToolInformation, Progress } from 'vscode';
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
import { IRequestLogger } from '../../../platform/requestLogger/node/requestLogger';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseProgressPart, ChatResponseReferencePart } from '../../../vscodeTypes';
import { IToolCallingLoopOptions, ToolCallingLoop, ToolCallingLoopFetchOptions } from '../../intents/node/toolCallingLoop';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { IBuildPromptResult } from '../../prompt/node/intents';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { IMcpToolCallingLoopPromptContext, McpToolCallingLoopPrompt } from './mcpToolCallingLoopPrompt';
import { QuickInputTool, QuickPickTool } from './mcpToolCallingTools';

export interface IMcpToolCallingLoopOptions extends IToolCallingLoopOptions {
	props: IMcpToolCallingLoopPromptContext;
}

export class McpToolCallingLoop extends ToolCallingLoop<IMcpToolCallingLoopOptions> {
	public static readonly ID = 'mcpToolSetupLoop';

	constructor(
		options: IMcpToolCallingLoopOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService logService: ILogService,
		@IRequestLogger requestLogger: IRequestLogger,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
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

	private async getEndpoint() {
		return await this.endpointProvider.getChatEndpoint('copilot-fast');
	}

	protected async buildPrompt(buildPromptContext: IBuildPromptContext, progress: Progress<ChatResponseReferencePart | ChatResponseProgressPart>, token: CancellationToken): Promise<IBuildPromptResult> {
		const endpoint = await this.getEndpoint();
		const renderer = PromptRenderer.create(
			this.instantiationService,
			endpoint,
			McpToolCallingLoopPrompt,
			{
				promptContext: buildPromptContext,
				...this.options.props
			}
		);
		return await renderer.render(progress, token);
	}

	protected async getAvailableTools(): Promise<LanguageModelToolInformation[]> {
		if (this.options.conversation.turns.length > 5) {
			return []; // force a response
		}

		return [{
			description: QuickInputTool.description,
			name: QuickInputTool.ID,
			inputSchema: QuickInputTool.schema,
			source: undefined,
			tags: [],
		}, {
			description: QuickPickTool.description,
			name: QuickPickTool.ID,
			inputSchema: QuickPickTool.schema,
			source: undefined,
			tags: [],
		}];
	}

	protected async fetch(opts: ToolCallingLoopFetchOptions, token: CancellationToken): Promise<ChatResponse> {
		const endpoint = await this.getEndpoint();
		return endpoint.makeChatRequest2({
			...opts,
			debugName: McpToolCallingLoop.ID,
			location: ChatLocation.Agent,
			requestOptions: {
				...opts.requestOptions,
				temperature: 0
			},
		}, token);
	}
}
