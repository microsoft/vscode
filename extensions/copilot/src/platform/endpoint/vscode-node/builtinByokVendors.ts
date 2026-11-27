/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Vendor ids registered by Copilot Chat's built-in BYOK contribution
 * (`byokContribution.ts`). Those providers emit their own OTel chat spans
 * (via CopilotLanguageModelWrapper / Anthropic / Gemini). Third-party
 * `languageModelChatProviders` do not, so ExtChatEndpoint must fall back.
 *
 * Keep in sync with `lm.registerLanguageModelChatProvider(...)` calls in
 * `extensions/copilot/src/extension/byok/vscode-node/byokContribution.ts`.
 */
const COPILOT_BUILTIN_BYOK_VENDORS = new Set([
	'ollama',
	'anthropic',
	'gemini',
	'xai',
	'openai',
	'openrouter',
	'azure',
	'customoai',
	'customendpoint',
]);

export function isCopilotBuiltinByokVendor(vendor: string | undefined): boolean {
	if (!vendor) {
		return false;
	}
	return COPILOT_BUILTIN_BYOK_VENDORS.has(vendor.toLowerCase());
}
