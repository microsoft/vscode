/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';

export const IToolResultContentRenderer = createServiceIdentifier<IToolResultContentRenderer>('IToolResultContentRenderer');

/**
 * Renders tool result content parts into human-readable strings.
 * Injected from the vscode-node layer to avoid layering violations
 * (the rendering depends on @vscode/prompt-tsx which lives in vscode-node).
 */
export interface IToolResultContentRenderer {
	readonly _serviceBrand: undefined;

	/**
	 * Extracts a text representation from the content parts of a tool result.
	 * Handles LanguageModelTextPart, LanguageModelPromptTsxPart, and LanguageModelDataPart.
	 * Uses lightweight string conversion to avoid expensive rendering on the hot path.
	 */
	renderToolResultContent(content: Iterable<unknown>): string[];
}
