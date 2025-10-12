/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Main interfaces and types
export interface IAiBrowserViewOptions {
	container: HTMLElement;
}

export interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
}

// Note: Browser-specific classes are not re-exported from common module
// to maintain proper layering. Import them directly from their respective modules.

// Re-export constants
export const AI_BROWSER_EDITOR_ID = 'workbench.editor.aiBrowser';
export const AI_BROWSER_INPUT_ID = 'workbench.input.aiBrowser';
