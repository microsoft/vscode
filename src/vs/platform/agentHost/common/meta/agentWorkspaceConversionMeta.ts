/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { isDefaultChatUri, type AgentCapabilities, type AgentInfo, type SessionMeta } from '../state/sessionState.js';

export const AGENT_WORKSPACE_CONVERSION_CAPABILITY = 'vscode.workspaceConversion';
export const AGENT_WORKSPACE_SETUP_META_KEY = 'vscode.workspaceSetup';

/** Latest conversion outcome, persisted in the session database and published in the session's metadata slot. */
export interface IAgentWorkspaceSetup {
	readonly version: 1;
	readonly operationId: string;
	readonly chat: string;
	readonly turnId: string;
	readonly requestedWorkspace: string;
	readonly isolation: 'folder' | 'worktree';
	readonly phase: 'requested' | 'preparing' | 'attached' | 'failed' | 'cancelled' | 'unknown';
	readonly actualWorkspace?: string;
	readonly attachmentError?: string;
	readonly continuation: 'not-started' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';
	readonly continuationTurnId?: string;
	readonly continuationError?: string;
}

/** Namespaced, opt-in extension of the host's advertised agent capabilities. */
export function withAgentWorkspaceConversionCapability(capabilities: AgentCapabilities | undefined, supported: boolean): AgentCapabilities | undefined {
	if (!capabilities && !supported) {
		return undefined;
	}
	const result: AgentCapabilities & { [AGENT_WORKSPACE_CONVERSION_CAPABILITY]?: { version: 1; supported: true } } = { ...capabilities };
	if (supported) {
		result[AGENT_WORKSPACE_CONVERSION_CAPABILITY] = { version: 1, supported: true };
	} else {
		delete result[AGENT_WORKSPACE_CONVERSION_CAPABILITY];
	}
	return result;
}

export function readAgentWorkspaceConversionCapability(source: Pick<AgentInfo, 'capabilities'>): boolean {
	const capabilities = source.capabilities;
	if (!isRecord(capabilities)) {
		return false;
	}
	const value = capabilities[AGENT_WORKSPACE_CONVERSION_CAPABILITY];
	return isRecord(value) && value.version === 1 && value.supported === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

function isLocalFolder(value: unknown): value is string {
	if (!isNonEmptyString(value)) {
		return false;
	}
	try {
		const uri = URI.parse(value, true);
		return uri.scheme === Schemas.file && uri.path.startsWith('/') && !uri.query && !uri.fragment;
	} catch {
		return false;
	}
}

function validateWorkspaceSetup(value: unknown): IAgentWorkspaceSetup | undefined {
	if (!isRecord(value)
		|| value.version !== 1
		|| !isNonEmptyString(value.operationId)
		|| !isNonEmptyString(value.chat)
		|| !isDefaultChatUri(value.chat)
		|| !isNonEmptyString(value.turnId)
		|| !isLocalFolder(value.requestedWorkspace)
		|| (value.isolation !== 'folder' && value.isolation !== 'worktree')
		|| (value.phase !== 'requested' && value.phase !== 'preparing' && value.phase !== 'attached' && value.phase !== 'failed' && value.phase !== 'cancelled' && value.phase !== 'unknown')
		|| (value.continuation !== 'not-started' && value.continuation !== 'pending' && value.continuation !== 'running' && value.continuation !== 'completed' && value.continuation !== 'failed' && value.continuation !== 'cancelled' && value.continuation !== 'unknown')
		|| (value.actualWorkspace !== undefined && !isLocalFolder(value.actualWorkspace))
		|| (value.attachmentError !== undefined && !isNonEmptyString(value.attachmentError))
		|| (value.continuationError !== undefined && !isNonEmptyString(value.continuationError))
		|| (value.continuationTurnId !== undefined && !isNonEmptyString(value.continuationTurnId))
		|| (value.phase === 'attached' && !value.actualWorkspace)
	) {
		return undefined;
	}
	if (value.phase === 'attached' && value.isolation === 'worktree' && value.actualWorkspace
		&& isEqual(URI.parse(value.requestedWorkspace), URI.parse(value.actualWorkspace))) {
		return undefined;
	}
	return {
		version: 1,
		operationId: value.operationId,
		chat: value.chat,
		turnId: value.turnId,
		requestedWorkspace: value.requestedWorkspace,
		isolation: value.isolation,
		phase: value.phase,
		actualWorkspace: value.actualWorkspace,
		attachmentError: value.attachmentError,
		continuation: value.continuation,
		continuationTurnId: value.continuationTurnId,
		continuationError: value.continuationError,
	};
}

export function readAgentWorkspaceSetup(source: { readonly _meta?: SessionMeta }): IAgentWorkspaceSetup | undefined {
	return validateWorkspaceSetup(source._meta?.[AGENT_WORKSPACE_SETUP_META_KEY]);
}

export function withAgentWorkspaceSetup(meta: SessionMeta | undefined, setup: IAgentWorkspaceSetup): SessionMeta {
	return { ...meta, [AGENT_WORKSPACE_SETUP_META_KEY]: setup };
}

/** A persisted in-flight marker is evidence of an interrupted operation, never authority to replay it. */
export function restoreAgentWorkspaceSetup(value: string | undefined): IAgentWorkspaceSetup | undefined {
	if (value === undefined) {
		return undefined;
	}
	const setup = validateWorkspaceSetup(JSON.parse(value));
	if (!setup) {
		throw new Error('Invalid workspace setup metadata');
	}
	return {
		...setup,
		phase: setup.phase === 'requested' || setup.phase === 'preparing' ? 'unknown' : setup.phase,
		continuation: setup.continuation === 'pending' || setup.continuation === 'running' ? 'unknown' : setup.continuation,
	};
}
