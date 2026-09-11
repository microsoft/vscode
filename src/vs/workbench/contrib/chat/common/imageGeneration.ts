/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
import { ConfigurationScope, IConfigurationNode } from '../../../../platform/configuration/common/configurationRegistry.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ImageGenerationConnectionSetting = 'chat.imageGeneration.connection';
export const ImageGenerationCredentialsSecret = 'chat.imageGeneration.credentials';
export const SetUpImageGenerationActionId = 'workbench.action.chat.setUpImageGeneration';
export const RemoveImageGenerationCredentialsActionId = 'workbench.action.chat.removeImageGenerationCredentials';
export const ImageGenerationMaxPromptLength = 32_000;
export const ImageGenerationMaxPixels = 1_048_576;
export const ImageGenerationMinDimension = 768;

export const imageGenerationConfiguration: IConfigurationNode = {
	id: 'chat',
	title: localize('chatConfigurationTitle', "Chat"),
	properties: {
		[ImageGenerationConnectionSetting]: {
			type: 'object',
			description: localize('imageGeneration.connection.description', "The resource endpoint and deployment used by the Generate Image tool. Configure it with Chat: Set Up Image Generation. API keys are kept separately in secret storage."),
			scope: ConfigurationScope.APPLICATION,
			ignoreSync: true,
			tags: ['experimental'],
			properties: {
				endpoint: { type: 'string' },
				deployment: { type: 'string' },
			},
			required: ['endpoint', 'deployment'],
			additionalProperties: false,
		},
	},
};

export interface IImageGenerationConfiguration {
	readonly endpoint: string;
	readonly deployment: string;
}

export interface IImageGenerationConnection extends IImageGenerationConfiguration {
	readonly headers: Readonly<Record<string, string>>;
}

export interface IImageGenerationRequest {
	readonly prompt: string;
	readonly width: number;
	readonly height: number;
}

export interface IGeneratedImage {
	readonly data: VSBuffer;
	readonly mimeType: 'image/png';
	readonly width: number;
	readonly height: number;
}

export const IImageGenerationCredentialsService = createDecorator<IImageGenerationCredentialsService>('imageGenerationCredentialsService');

export interface IImageGenerationCredentialsService {
	readonly _serviceBrand: undefined;
	readonly configuration: IImageGenerationConfiguration | undefined;
	readonly onDidChangeConfiguration: Event<void>;
	readonly whenReady: Promise<void>;
	configure(configuration: IImageGenerationConfiguration, key: string): Promise<void>;
	clear(): Promise<void>;
	resolve(configuration: IImageGenerationConfiguration): Promise<IImageGenerationConnection>;
}

export const IImageGenerationService = createDecorator<IImageGenerationService>('imageGenerationService');

export interface IImageGenerationService {
	readonly _serviceBrand: undefined;
	generate(request: IImageGenerationRequest, configuration: IImageGenerationConfiguration, token: CancellationToken): Promise<IGeneratedImage>;
}

export function assertImageGenerationEnabled(hidden: boolean | undefined): void {
	if (hidden) {
		throw new Error(localize('imageGeneration.disabled', "Image generation is unavailable while AI features are disabled."));
	}
}

export function parseImageGenerationConfiguration(value: unknown): IImageGenerationConfiguration {
	const configuration: { endpoint?: unknown; deployment?: unknown } = typeof value === 'object' && value !== null ? value : {};
	if (typeof configuration.endpoint !== 'string' || typeof configuration.deployment !== 'string') {
		throw new Error(localize('imageGeneration.configuration.invalid', "Set up an image generation endpoint and deployment first."));
	}
	let endpoint: URL;
	try {
		endpoint = new URL(configuration.endpoint.trim());
	} catch {
		throw new Error(localize('imageGeneration.endpoint.invalid', "Enter a complete HTTPS resource endpoint."));
	}
	if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
		throw new Error(localize('imageGeneration.endpoint.https', "Use an HTTPS resource base URL without credentials, a path, a query, or a fragment."));
	}
	const deployment = configuration.deployment.trim();
	if (!deployment || deployment.length > 128 || /[\u0000-\u001f\u007f]/.test(deployment)) {
		throw new Error(localize('imageGeneration.deployment.invalid', "Enter the image model's deployment name, using at most 128 characters."));
	}
	return { endpoint: endpoint.origin, deployment };
}

export function validateImageGenerationRequest(request: IImageGenerationRequest): void {
	if (typeof request.prompt !== 'string' || !request.prompt.trim() || request.prompt.length > ImageGenerationMaxPromptLength) {
		throw new Error(localize('imageGeneration.prompt.invalid', "Provide a non-empty image prompt of at most {0} characters.", ImageGenerationMaxPromptLength));
	}
	if (!Number.isInteger(request.width) || !Number.isInteger(request.height)
		|| request.width < ImageGenerationMinDimension || request.height < ImageGenerationMinDimension
		|| request.width * request.height > ImageGenerationMaxPixels) {
		throw new Error(localize('imageGeneration.dimensions.invalid', "Image width and height must each be at least {0} pixels, with at most {1} pixels in total.", ImageGenerationMinDimension, ImageGenerationMaxPixels));
	}
}
