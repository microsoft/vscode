/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';

/**
 * Extended storage type for AI Customization that includes built-in prompts
 * shipped with the application, alongside the core `PromptsStorage` values.
 */
export type AICustomizationPromptsStorage = PromptsStorage | 'builtin';

/**
 * Storage type discriminator for built-in prompts shipped with the application.
 */
export const BUILTIN_STORAGE: AICustomizationPromptsStorage = 'builtin';
