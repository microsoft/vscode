/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const AH_META_DEV_CONTAINER_WORKTREE_DB_KEY = 'vscode.devContainerWorktree';
export const DEV_CONTAINER_WORKTREE_DATA_ID_PREFIX = 'devcontainer-worktree-';

export interface IAgentDevContainerWorktreeMetadata {
	readonly version: 1;
	readonly handle: string;
}

export function isAgentDevContainerWorktreeHandle(value: unknown): value is string {
	return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function withAgentDevContainerWorktreeMetadata(metadata: Record<string, unknown> | undefined, handle: string): Record<string, unknown> {
	return {
		...metadata,
		[AH_META_DEV_CONTAINER_WORKTREE_DB_KEY]: { version: 1, handle } satisfies IAgentDevContainerWorktreeMetadata,
	};
}

export function readAgentDevContainerWorktreeMetadata(metadata: Record<string, unknown> | undefined): IAgentDevContainerWorktreeMetadata | undefined {
	const value = metadata?.[AH_META_DEV_CONTAINER_WORKTREE_DB_KEY];
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const candidate = value as Partial<IAgentDevContainerWorktreeMetadata>;
	return candidate.version === 1 && isAgentDevContainerWorktreeHandle(candidate.handle)
		? { version: 1, handle: candidate.handle }
		: undefined;
}
