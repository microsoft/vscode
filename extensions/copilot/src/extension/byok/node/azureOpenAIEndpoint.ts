/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IChatModelInformation } from '../../../platform/endpoint/common/endpointProvider';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
 import { OpenAIEndpoint } from './openAIEndpoint';

/**
 * Azure-specific OpenAI endpoint that supports Entra ID authentication.
 * Extends OpenAIEndpoint to override header generation for Azure-specific auth methods.
 * Note: Authentication token refresh is handled at the provider level (azureProvider.ts).
 */
export class AzureOpenAIEndpoint extends OpenAIEndpoint {
	/**
	 * Override to use Entra ID authentication headers instead of API key.
	 */
	public override getExtraHeaders(): Record<string, string> {
		const headers = super.getExtraHeaders();
		headers['Authorization'] = `Bearer ${this._apiKey}`;
		// Defensive: Ensure 'api-key' header is never sent for Azure endpoints, even if parent class changes.
		delete headers['api-key'];
		return headers;
	}

	/**
	 * Clones with a temporary prompt-token budget override while keeping the
	 * concrete Azure endpoint (and its Entra ID auth) intact instead of
	 * degrading to the base OpenAIEndpoint factory.
	 */
	override cloneWithTokenOverride(modelMaxPromptTokens: number): IChatEndpoint {
		const newModelInfo: IChatModelInformation = {
			...this.modelMetadata,
			capabilities: {
				...this.modelMetadata.capabilities,
				limits: { ...this.modelMetadata.capabilities.limits, max_prompt_tokens: modelMaxPromptTokens },
			},
		};
		return this.instantiationService.createInstance(AzureOpenAIEndpoint, newModelInfo, this._apiKey, this._modelUrl);
	}

}
