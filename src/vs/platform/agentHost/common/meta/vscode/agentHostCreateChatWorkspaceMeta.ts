/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { vLiteral, vObj, vOptionalProp, vString, vUnion, type ValidatorType } from '../../../../../base/common/validation.js';
import type { IAgentCreateChatWorkspace } from '../../agent.js';

/** Initialize capability: the host honors a requested workspace on `createChat` (see {@link AgentHostCreateChatWorkspaceMetaKey}). */
export const AgentHostCreateChatWorkspaceCapabilityMetaKey = 'vscode.createChatWorkspace';

/** `createChat` request `_meta` key carrying the workspace a client asks for the new peer chat. */
export const AgentHostCreateChatWorkspaceMetaKey = 'vscode.chatWorkspace';

/** Validates the serialized shape of a requested chat workspace (see {@link readChatWorkspaceValue} for the semantic checks). */
export const chatWorkspaceValueValidator = vUnion(
	vObj({ kind: vLiteral('scratch') }),
	vObj({ kind: vLiteral('folder'), folder: vString(), isolation: vLiteral('folder') }),
	vObj({ kind: vLiteral('folder'), folder: vString(), isolation: vLiteral('worktree'), baseBranch: vOptionalProp(vString()), prompt: vString() }),
);

/**
 * Reads the workspace requested for a new chat: `undefined` when the request carries none, `'invalid'` when the
 * value is present but malformed (see {@link readChatWorkspaceValue}).
 */
export function readCreateChatWorkspaceMeta(meta: Readonly<Record<string, unknown>> | undefined): IAgentCreateChatWorkspace | undefined | 'invalid' {
	const value = meta?.[AgentHostCreateChatWorkspaceMetaKey];
	if (value === undefined) {
		return undefined;
	}
	return readChatWorkspaceValue(value);
}

/**
 * Reads a serialized chat workspace, `'invalid'` when it is malformed: a folder that is not an absolute host-side
 * `file` URI, an empty or option-like base branch, …
 */
export function readChatWorkspaceValue(value: unknown): IAgentCreateChatWorkspace | 'invalid' {
	const { content, error } = chatWorkspaceValueValidator.validate(value);
	if (error) {
		return 'invalid';
	}
	if (content.kind === 'scratch') {
		return { kind: 'scratch' };
	}
	let folder: URI;
	try {
		folder = URI.parse(content.folder, true);
	} catch {
		return 'invalid';
	}
	// Clients map their folders to the host's own file system (`fromAgentHostUri`) before sending them.
	if (folder.scheme !== Schemas.file || !folder.path.startsWith('/')) {
		return 'invalid';
	}
	if (content.isolation === 'folder') {
		return { kind: 'folder', folder, isolation: 'folder' };
	}
	const baseBranch = content.baseBranch;
	if (baseBranch !== undefined && (!baseBranch.trim() || baseBranch.startsWith('-'))) {
		return 'invalid';
	}
	return { kind: 'folder', folder, isolation: 'worktree', baseBranch, prompt: content.prompt };
}

/** Serializes a chat workspace into the shape read by {@link readChatWorkspaceValue}. */
export function serializeChatWorkspace(workspace: IAgentCreateChatWorkspace): ValidatorType<typeof chatWorkspaceValueValidator> {
	if (workspace.kind === 'scratch') {
		return { kind: 'scratch' };
	}
	if (workspace.isolation === 'folder') {
		return { kind: 'folder', folder: workspace.folder.toString(), isolation: 'folder' };
	}
	return {
		kind: 'folder',
		folder: workspace.folder.toString(),
		isolation: 'worktree',
		...(workspace.baseBranch !== undefined ? { baseBranch: workspace.baseBranch } : {}),
		prompt: workspace.prompt,
	};
}

/** Returns request metadata carrying the workspace requested for a new chat, preserving unrelated keys. */
export function withCreateChatWorkspaceMeta(meta: Readonly<Record<string, unknown>> | undefined, workspace: IAgentCreateChatWorkspace): Record<string, unknown> {
	return { ...meta, [AgentHostCreateChatWorkspaceMetaKey]: serializeChatWorkspace(workspace) };
}
