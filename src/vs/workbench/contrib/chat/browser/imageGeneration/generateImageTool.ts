/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64 } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationError, getErrorMessage, isCancellationError } from '../../../../../base/common/errors.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename, dirname, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { GenerateImageToolId, GenerateImageToolReferenceName } from '../../../../../platform/agentHost/common/imageGenerationConstants.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { localize } from '../../../../../nls.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { localChatSessionType } from '../../common/chatSessionsService.js';
import { assertImageGenerationEnabled, IGeneratedImage, IImageGenerationCredentialsService, IImageGenerationRequest, IImageGenerationService, ImageGenerationMaxPromptLength, ImageGenerationMinDimension, validateImageGenerationRequest } from '../../common/imageGeneration.js';
import { LanguageModelPartAudience } from '../../common/languageModels.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../common/tools/languageModelToolsService.js';
import { AGENT_HOST_COPILOT_CLI_SESSION_TYPE } from '../agentSessions/agentHost/agentHostToolSetEnablementService.js';

export const GenerateImageToolData: IToolData = {
	id: GenerateImageToolId,
	toolReferenceName: GenerateImageToolReferenceName,
	displayName: localize('imageGeneration.tool.name', "Generate Image"),
	userDescription: localize('imageGeneration.tool.description', "Generate a PNG image using your configured Microsoft MAI endpoint"),
	modelDescription: 'Generate a new PNG image from a text prompt using the configured Microsoft MAI image model. Use when the user requests a new image or a visual asset for their project. Not for finding or viewing existing images, screenshots, diagrams that should be Mermaid, or editing existing images. Sends the prompt to the configured endpoint and incurs Azure usage charges. Returns a chat preview and can create a new project file; existing files are never overwritten. Defaults to one 1024 by 1024 image. Supply width and height together: each at least 768 and at most 1,048,576 total pixels. Requires image generation setup and an active local chat. Follow the existing tool approval flow. Do not retry automatically after an error or cancellation: a generation may already have been billed. If only saving fails, save the existing image instead of generating it again.',
	icon: Codicon.fileMedia,
	source: ToolDataSource.Internal,
	when: ChatContextKeys.enabled,
	canBeReferencedInPrompt: true,
	canRequestPreApproval: true,
	runsInWorkspace: false,
	inputSchema: {
		type: 'object',
		properties: {
			prompt: { type: 'string', minLength: 1, maxLength: ImageGenerationMaxPromptLength, description: 'A self-contained description of the image to create. Include only information needed for the image, not the chat transcript or source files.' },
			width: { type: 'integer', minimum: ImageGenerationMinDimension, description: 'Output width in pixels; provide height too. Defaults to 1024.' },
			height: { type: 'integer', minimum: ImageGenerationMinDimension, description: 'Output height in pixels; provide width too. Defaults to 1024.' },
			outputPath: { type: 'string', minLength: 1, maxLength: 1024, description: 'Optional new .png path relative to the current project or session worktree, using forward slashes. In a multi-root workspace, prefix it with the workspace folder name. Omit to keep the image in chat only. Existing files are never overwritten.' },
		},
		required: ['prompt'],
		additionalProperties: false,
	},
};

interface IGenerateImageInput extends IImageGenerationRequest {
	readonly outputPath?: string;
}

export class GenerateImageTool implements IToolImpl {
	constructor(
		@IImageGenerationCredentialsService private readonly credentialsService: IImageGenerationCredentialsService,
		@IImageGenerationService private readonly imageGenerationService: IImageGenerationService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation> {
		this.validateContext(context.chatSessionResource, token);
		const input = this.parseInput(context.parameters);
		await this.credentialsService.whenReady;
		const configuration = this.credentialsService.configuration;
		if (!configuration) {
			throw new Error(localize('imageGeneration.tool.setup', "Run Chat: Set Up Image Generation before using this tool."));
		}
		const outputUri = await this.resolveOutput(input.outputPath, context.workingDirectory, context.chatSessionResource);
		this.validateContext(context.chatSessionResource, token);
		return {
			invocationMessage: localize('imageGeneration.tool.progress', "Generating an image"),
			toolSpecificData: { kind: 'generatedImage', configuration: { ...configuration }, outputUri: outputUri?.toString() },
			confirmationMessages: {
				title: localize('imageGeneration.tool.confirm', "Generate an Image"),
				message: localize('imageGeneration.tool.confirm.detail', "Send this prompt to {0} using deployment {1} to generate a {2} x {3} PNG. Azure usage is billed to the configured resource, not your Copilot subscription.\n\n{4}\n\n{5}",
					configuration.endpoint, configuration.deployment, input.width, input.height, input.prompt,
					outputUri
						? localize('imageGeneration.tool.confirm.file', "Create a new file: {0}. Existing files will not be overwritten.", outputUri.fsPath)
						: localize('imageGeneration.tool.confirm.preview', "Keep the generated image in chat. You can save it later.")),
			},
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		this.validateContext(invocation.context?.sessionResource, token);
		const input = this.parseInput(invocation.parameters);
		const prepared = invocation.toolSpecificData;
		if (prepared?.kind !== 'generatedImage' || !prepared.configuration) {
			throw new Error(localize('imageGeneration.tool.notPrepared', "Image generation requires a prepared tool invocation with a confirmed connection."));
		}
		const outputUri = await this.resolveOutput(input.outputPath, invocation.context?.workingDirectory, invocation.context?.sessionResource);
		if (!this.uriIdentityService.extUri.isEqual(outputUri, prepared.outputUri ? URI.parse(prepared.outputUri) : undefined)) {
			throw new Error(localize('imageGeneration.tool.destinationChanged', "The image destination changed. Run the tool again to confirm the new destination."));
		}
		this.validateContext(invocation.context?.sessionResource, token);
		const { prompt, width, height } = input;
		const image = await this.imageGenerationService.generate({ prompt, width, height }, prepared.configuration, token);
		this.validateContext(invocation.context?.sessionResource, token);

		let saveError: string | undefined;
		if (outputUri) {
			progress.report({ message: localize('imageGeneration.tool.saving', "Saving the generated image") });
			try {
				const checkedOutput = await this.resolveOutput(input.outputPath, invocation.context?.workingDirectory, invocation.context?.sessionResource);
				if (!this.uriIdentityService.extUri.isEqual(checkedOutput, outputUri)) {
					throw new Error(localize('imageGeneration.tool.destinationChanged', "The image destination changed. Run the tool again to confirm the new destination."));
				}
				this.validateContext(invocation.context?.sessionResource, token);
				await this.fileService.createFile(outputUri, image.data, { overwrite: false });
			} catch (error) {
				if (isCancellationError(error)) {
					throw error;
				}
				saveError = localize('imageGeneration.tool.saveFailed', "The image was generated, but could not be saved to {0}: {1}. Use the chat image's Save action; do not generate another image just to retry saving.", outputUri.fsPath, getErrorMessage(error));
			}
		}
		return this.createResult(image, input, outputUri, saveError);
	}

	private validateContext(sessionResource: URI | undefined, token: CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		assertImageGenerationEnabled(this.chatEntitlementService.sentiment.hidden);
		const sessionType = sessionResource ? getChatSessionType(sessionResource) : undefined;
		if (sessionType !== localChatSessionType && sessionType !== AGENT_HOST_COPILOT_CLI_SESSION_TYPE) {
			throw new Error(localize('imageGeneration.tool.localOnly', "Image generation requires an active local Copilot chat. Remote and headless sessions are not supported."));
		}
	}

	private parseInput(parameters: Record<string, unknown>): IGenerateImageInput {
		if (Object.keys(parameters).some(key => !['prompt', 'width', 'height', 'outputPath'].includes(key))
			|| typeof parameters.prompt !== 'string'
			|| (parameters.width === undefined) !== (parameters.height === undefined)
			|| (parameters.width !== undefined && typeof parameters.width !== 'number')
			|| (parameters.height !== undefined && typeof parameters.height !== 'number')
			|| (parameters.outputPath !== undefined && typeof parameters.outputPath !== 'string')) {
			throw new Error(localize('imageGeneration.tool.input', "Provide an image prompt, optionally both width and height, and an optional new PNG output path."));
		}
		const input = {
			prompt: parameters.prompt,
			width: parameters.width ?? 1024,
			height: parameters.height ?? 1024,
			outputPath: parameters.outputPath,
		};
		validateImageGenerationRequest(input);
		return input;
	}

	private async resolveOutput(outputPath: string | undefined, workingDirectory: URI | undefined, sessionResource: URI | undefined): Promise<URI | undefined> {
		if (outputPath === undefined) {
			return undefined;
		}
		if (!workingDirectory && sessionResource && getChatSessionType(sessionResource) !== localChatSessionType) {
			throw new Error(localize('imageGeneration.tool.missingDirectory', "The session's working directory is unavailable. Omit the output path to keep the image in chat."));
		}
		if (!outputPath || outputPath.length > 1024 || !outputPath.toLowerCase().endsWith('.png')
			|| /[\\<>:"|?*\u0000-\u001f\u007f]/.test(outputPath)
			|| outputPath.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
			throw new Error(localize('imageGeneration.tool.path', "Use a relative .png path with forward slashes and without parent-directory segments."));
		}
		let root = workingDirectory;
		let relativePath = outputPath;
		if (!root) {
			const folders = this.workspaceContextService.getWorkspace().folders;
			if (folders.length === 1) {
				root = folders[0].uri;
			} else {
				const separator = outputPath.indexOf('/');
				const matches = folders.filter(folder => folder.name === outputPath.slice(0, separator));
				if (separator < 0 || matches.length !== 1) {
					throw new Error(localize('imageGeneration.tool.workspace', "Choose a project folder for the image. In a multi-root workspace, prefix the output path with its folder name, or omit the path to keep the image in chat."));
				}
				root = matches[0].uri;
				relativePath = outputPath.slice(separator + 1);
			}
		}
		if (root.scheme !== Schemas.file) {
			throw new Error(localize('imageGeneration.tool.localFile', "Saving generated images currently requires a local project folder."));
		}
		const output = joinPath(root, relativePath);
		const realRoot = await this.fileService.realpath(root);
		let parent = dirname(output);
		while (!await this.fileService.exists(parent) && !this.uriIdentityService.extUri.isEqual(parent, root)) {
			parent = dirname(parent);
		}
		const realParent = await this.fileService.realpath(parent);
		if (!realRoot || !realParent || !this.uriIdentityService.extUri.isEqualOrParent(realParent, realRoot)) {
			throw new Error(localize('imageGeneration.tool.outsideProject', "The image destination must resolve inside the selected project, including through symbolic links."));
		}
		const relativeOutput = this.uriIdentityService.extUri.relativePath(parent, output);
		if (!relativeOutput) {
			throw new Error(localize('imageGeneration.tool.unresolvedPath', "The image destination could not be resolved inside the selected project."));
		}
		const canonicalOutput = joinPath(realParent, relativeOutput);
		const canCreate = await this.fileService.canCreateFile(canonicalOutput, { overwrite: false });
		if (canCreate !== true) {
			throw canCreate;
		}
		return canonicalOutput;
	}

	private createResult(image: IGeneratedImage, input: IGenerateImageInput, outputUri: URI | undefined, saveError: string | undefined): IToolResult {
		const message = saveError ?? (outputUri
			? localize('imageGeneration.tool.saved', "Generated {0}", basename(outputUri))
			: localize('imageGeneration.tool.generated', "Generated an image"));
		const summary = [
			localize('imageGeneration.tool.result', "Generated a {0} x {1} PNG image for: {2}", image.width, image.height, input.prompt),
			saveError ?? (outputUri
				? localize('imageGeneration.tool.result.path', "Saved to: {0}", outputUri.fsPath)
				: localize('imageGeneration.tool.result.preview', "The image is available in the chat preview and can be saved using its Save action.")),
		].join('\n');
		return {
			content: [
				{ kind: 'text', value: summary },
				{ kind: 'data', value: { mimeType: image.mimeType, data: image.data }, audience: [LanguageModelPartAudience.User] },
			],
			toolSpecificData: { kind: 'generatedImage' },
			toolResultMessage: message,
			toolResultError: saveError,
			toolResultDetails: {
				input: JSON.stringify(input),
				isError: !!saveError,
				output: [
					{ type: 'embed', isText: true, value: summary },
					{ type: 'embed', mimeType: image.mimeType, value: encodeBase64(image.data), audience: [LanguageModelPartAudience.User] },
				],
			},
		};
	}
}
