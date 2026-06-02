/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { AICustomizationSource } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';

// Re-export from common for backward compatibility
export type { AICustomizationSource as AICustomizationPromptsStorage } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
export { BUILTIN_STORAGE } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';

/**
 * Prompt path for built-in prompts bundled with the Agents app.
 */
export interface IBuiltinPromptPath {
	readonly uri: URI;
	readonly storage: AICustomizationSource;
	readonly type: PromptsType;
	readonly name?: string;
	readonly description?: string;
}
