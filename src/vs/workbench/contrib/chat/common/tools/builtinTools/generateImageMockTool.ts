/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { FileAccess } from '../../../../../../base/common/network.js';
import { localize } from '../../../../../../nls.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ChatContextKeys } from '../../actions/chatContextKeys.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../languageModelToolsService.js';

export const GenerateImageMockToolId = 'generate_image_mock';

export const GenerateImageMockToolData: IToolData = {
	id: GenerateImageMockToolId,
	toolReferenceName: GenerateImageMockToolId,
	displayName: localize('generateImageMock.displayName', "Generate Image (Mock)"),
	userDescription: localize('generateImageMock.description', "Preview image generation using a fixed sample image. Available only in development builds; no image-generation access is required."),
	modelDescription: 'Simulate image generation for UI development by returning a fixed sample image. Use only when explicitly asked to mock or test image-generation rendering, not to create or edit an image. Waits five seconds and returns the bundled image regardless of the prompt, without contacting an image-generation service or writing files.',
	source: ToolDataSource.Internal,
	icon: Codicon.fileMedia,
	when: ChatContextKeys.enabled,
	canBeReferencedInPrompt: true,
	alwaysDisplayInputOutput: true,
	runsInWorkspace: false,
	inputSchema: {
		type: 'object',
		properties: {
			prompt: {
				type: 'string',
				minLength: 1,
				description: 'The simulated image prompt, displayed in the tool input. The returned sample image is always the same.',
			},
		},
		required: ['prompt'],
		additionalProperties: false,
	},
};

export class GenerateImageMockTool implements IToolImpl {
	constructor(
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation> {
		this.validateInvocation(context.parameters, token);
		return {
			invocationMessage: localize('generateImageMock.generating', "Generating image"),
			pastTenseMessage: localize('generateImageMock.generated', "Generated image"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		this.validateInvocation(invocation.parameters, token);
		await timeout(5000, token);
		const image = await this.fileService.readFile(FileAccess.asFileUri('vs/workbench/contrib/chat/common/tools/builtinTools/media/generatedImageMock.png'), undefined, token);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		return {
			content: [
				{ kind: 'text', value: localize('generateImageMock.result', "Development mock: returned the bundled sample image. No image was generated.") },
				{ kind: 'data', value: { data: image.value, mimeType: 'image/png' } },
			],
			toolSpecificData: { kind: 'generatedImage' },
		};
	}

	private validateInvocation(parameters: { prompt?: unknown }, token: CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (this.environmentService.isBuilt) {
			throw new Error(localize('generateImageMock.developmentOnly', "Mock image generation is only available in development builds."));
		}
		if (typeof parameters.prompt !== 'string' || !parameters.prompt.trim()) {
			throw new Error(localize('generateImageMock.promptRequired', "Provide a prompt for the mock image generation."));
		}
	}
}
