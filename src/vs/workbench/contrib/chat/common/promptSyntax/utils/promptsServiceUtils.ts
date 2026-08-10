/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IAgentSource, PromptsStorage } from '../service/promptsService.js';

/**
 * Checks if a prompt file is organization-provided.
 * Organization-provided prompt files come from the built-in chat extension
 * and are located under a `/github/` path.
 *
 * @param uri The URI of the prompt file
 * @param extensionId The extension identifier that provides the prompt file
 * @param productService The product service to get the built-in chat extension ID
 * @returns `true` if the prompt file is organization-provided, `false` otherwise
 */
export function isOrganizationPromptFile(uri: URI, extensionId: ExtensionIdentifier, productService: IProductService): boolean {
	const chatExtensionId = productService.defaultChatAgent?.chatExtensionId;
	if (!chatExtensionId) {
		return false;
	}
	const isFromBuiltinChatExtension = ExtensionIdentifier.equals(extensionId, chatExtensionId);
	const pathContainsGithub = uri.path.includes('/github/');
	return isFromBuiltinChatExtension && pathContainsGithub;
}

/**
 * Checks if a custom agent is considered "builtin" - i.e. shipped by the
 * built-in chat extension and not organization-provided. Used for telemetry
 * to decide whether the agent name is safe to send as-is.
 */
export function isBuiltinAgent(source: IAgentSource, uri: URI, productService: IProductService): boolean {
	if (source.storage !== PromptsStorage.extension) {
		return false;
	}
	const chatExtensionId = productService.defaultChatAgent?.chatExtensionId;
	if (!chatExtensionId || !ExtensionIdentifier.equals(source.extensionId, chatExtensionId)) {
		return false;
	}
	return !isOrganizationPromptFile(uri, source.extensionId, productService);
}
