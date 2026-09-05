/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const AGENT_WORKSPACE_CONTINUATION_META_KEY = 'vscode.chat.workspaceContinuation';

interface IHasAgentWorkspaceContinuationMeta {
	readonly _meta?: Record<string, unknown>;
}

/** Whether the message is the internal request that resumes a turn after workspace conversion. */
export function isAgentWorkspaceContinuationMessage(source: IHasAgentWorkspaceContinuationMeta): boolean {
	// eslint-disable-next-line local/code-no-untyped-meta-access -- sanctioned first hop into the namespaced workspace-continuation slot; validated here.
	return source._meta?.[AGENT_WORKSPACE_CONTINUATION_META_KEY] === true;
}

/** Serializes the workspace-continuation marker for the open protocol bag. */
export function toAgentWorkspaceContinuationMessageMeta(): Record<string, unknown> {
	return { [AGENT_WORKSPACE_CONTINUATION_META_KEY]: true };
}
