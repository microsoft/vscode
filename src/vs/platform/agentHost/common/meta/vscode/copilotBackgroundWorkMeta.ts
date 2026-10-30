/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Copilot's own identifier for a background shell, as used by its shell tools. */
const COPILOT_SHELL_ID_META_KEY = 'vscode.copilot.shellId';
/** Whether a Copilot background shell is tied to its agent's lifetime. */
const COPILOT_SHELL_ATTACHMENT_META_KEY = 'vscode.copilot.shellAttachment';

/** Builds the `_meta` for a Copilot background shell entry. */
export function toCopilotBackgroundShellMeta(shellId: string, attachment: 'attached' | 'detached'): Record<string, unknown> {
	return { [COPILOT_SHELL_ID_META_KEY]: shellId, [COPILOT_SHELL_ATTACHMENT_META_KEY]: attachment };
}

/** Reads Copilot's shell identifier, when the host provided one. */
export function readCopilotShellId(work: { readonly _meta?: Record<string, unknown> }): string | undefined {
	const shellId = work._meta?.[COPILOT_SHELL_ID_META_KEY];
	return typeof shellId === 'string' ? shellId : undefined;
}

/** Reads whether a Copilot shell is attached to its agent's lifetime, when the host provided it. */
export function readCopilotShellAttachment(work: { readonly _meta?: Record<string, unknown> }): 'attached' | 'detached' | undefined {
	const attachment = work._meta?.[COPILOT_SHELL_ATTACHMENT_META_KEY];
	return attachment === 'attached' || attachment === 'detached' ? attachment : undefined;
}
