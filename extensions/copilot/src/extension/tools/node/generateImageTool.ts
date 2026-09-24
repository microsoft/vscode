/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { Raw } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IGeneratedImage } from '../../../platform/networking/common/fetch';
import { decodeBase64 } from '../../../util/vs/base/common/buffer';
import { CancellationError } from '../../../util/vs/base/common/errors';
import { LanguageModelDataPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';

export interface IGenerateImageParams {
	prompt: string;
}

export class GenerateImageTool implements ICopilotTool<IGenerateImageParams> {
	public static readonly toolName = ToolName.GenerateImage;

	constructor(
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IGenerateImageParams>, token: vscode.CancellationToken): Promise<LanguageModelToolResult> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (!this.configurationService.getConfig(ConfigKey.GenerateImageToolEnabled)) {
			throw new Error(l10n.t("Enable github.copilot.chat.tools.generateImage.enabled to use image generation."));
		}
		if (!options.input.prompt.trim()) {
			throw new Error(l10n.t("Provide a description of the image to generate."));
		}

		const endpoint = await this.endpointProvider.getChatEndpoint('gpt-5.5');
		if (endpoint.apiType !== 'responses') {
			throw new Error(l10n.t("Image generation requires a model endpoint that supports the Responses API."));
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		const generatedImages: IGeneratedImage[] = [];
		const response = await endpoint.makeChatRequest2({
			debugName: 'generateImageTool',
			messages: [{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: options.input.prompt }],
			}],
			finishedCb: async (_text, _index, delta) => {
				if (delta.generatedImages) {
					generatedImages.push(...delta.generatedImages);
				}
				return undefined;
			},
			location: ChatLocation.Agent,
			userInitiatedRequest: false,
			isConversationRequest: true,
			topLevelTurnId: options.chatRequestId,
			enableRetryOnError: false,
			enableRetryOnFilter: false,
			canRetryOnceWithoutRollback: false,
			modelCapabilities: { enableImageGeneration: true },
		}, token);

		if (token.isCancellationRequested || response.type === ChatFetchResponseType.Canceled) {
			throw new CancellationError();
		}
		if (response.type !== ChatFetchResponseType.Success) {
			throw new Error(l10n.t("Image generation failed: {0}", response.reason));
		}
		if (generatedImages.length === 0) {
			throw new Error(response.value
				? l10n.t("Image generation returned no images: {0}", response.value)
				: l10n.t("Image generation completed without returning an image."));
		}

		return new LanguageModelToolResult(generatedImages.map(image =>
			LanguageModelDataPart.image(decodeBase64(image.data).buffer, image.mimeType)));
	}

	prepareInvocation(): vscode.PreparedToolInvocation {
		return {
			invocationMessage: l10n.t("Generating image"),
			pastTenseMessage: l10n.t("Generated image"),
		};
	}
}

ToolRegistry.registerTool(GenerateImageTool);
