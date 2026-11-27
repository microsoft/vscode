/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { OpenAIEndpoint } from './openAIEndpoint';
import * as assert from 'assert';

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
		if (!this._apiKey) {
			throw new Error('AzureOpenAIEndpoint: API key or Entra ID token is missing.');
		}

		const headers = super.getExtraHeaders();
		headers['Authorization'] = `Bearer ${this._apiKey}`;
		// Defensive: Ensure 'api-key' header is never sent for Azure endpoints, even if parent class changes.
		delete headers['api-key'];
		return headers;
	}
}

suite('AzureOpenAIEndpoint', () => {
    test('throws an error when API key or Entra ID token is missing', () => {
        const endpoint = new AzureOpenAIEndpoint({} as any);
        assert.throws(() => {
            endpoint.getExtraHeaders();
        }, /AzureOpenAIEndpoint: API key or Entra ID token is missing/);
    });
});
