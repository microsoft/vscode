/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { AgentMergeActions, isAgentMergeMergePullRequest } from '../agentMerge.js';
import type { InvokeChangesetOperationResult } from '../state/protocol/channels-changeset/commands.js';
import { JsonRpcErrorCodes, ProtocolError } from '../state/sessionProtocol.js';

export const PREPARE_PULL_REQUEST_OPERATION_ID = 'prepare-pull-request';

const PULL_REQUEST_META_KEY = 'vscode.pullRequest';
const DETAILS_DATA_URI_PREFIX = 'data:application/json,';

export interface IPullRequestContext {
	readonly workingDirectory: string;
	readonly repository: string;
	readonly branchName: string;
	readonly baseBranchName: string;
	readonly headOwner?: string;
	readonly upstreamBranchName?: string;
}

export interface IPullRequestCreateOptions {
	readonly title: string;
	readonly description: string;
	readonly draft: boolean;
	readonly agentMerge: boolean;
	readonly agentMergeOptions?: AgentMergeActions;
	readonly autoMergeMethod?: 'MERGE' | 'SQUASH' | 'REBASE';
	readonly expectedContext?: IPullRequestContext;
}

export interface IPullRequestDetails {
	readonly title: string;
	readonly description: string;
	readonly branchName: string;
	readonly baseBranchName: string;
	readonly repository: string;
	readonly autoMergeAllowed: boolean;
	readonly mergeMethods: readonly ('MERGE' | 'SQUASH' | 'REBASE')[];
	readonly agentMergeAvailable: boolean;
	readonly agentMergeOptions?: AgentMergeActions;
	readonly generationError?: string;
	readonly context?: IPullRequestContext;
}

interface IHasPullRequestOperationMeta {
	readonly _meta?: Record<string, unknown>;
}

function isMergeMethod(value: unknown): value is NonNullable<IPullRequestCreateOptions['autoMergeMethod']> {
	return value === 'MERGE' || value === 'SQUASH' || value === 'REBASE';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return isObject(value);
}

function parseContext(value: unknown): IPullRequestContext {
	if (!isRecord(value)
		|| typeof value.workingDirectory !== 'string' || !value.workingDirectory.trim()
		|| typeof value.repository !== 'string' || !value.repository.trim()
		|| typeof value.branchName !== 'string' || !value.branchName.trim()
		|| typeof value.baseBranchName !== 'string' || !value.baseBranchName.trim()
		|| (value.headOwner !== undefined && (typeof value.headOwner !== 'string' || !value.headOwner.trim()))
		|| (value.upstreamBranchName !== undefined && (typeof value.upstreamBranchName !== 'string' || !value.upstreamBranchName.trim()))) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.pr.invalidContext', "Invalid pull request preparation context."));
	}
	return {
		workingDirectory: value.workingDirectory,
		repository: value.repository,
		branchName: value.branchName,
		baseBranchName: value.baseBranchName,
		...(value.headOwner !== undefined ? { headOwner: value.headOwner } : {}),
		...(value.upstreamBranchName !== undefined ? { upstreamBranchName: value.upstreamBranchName } : {}),
	};
}

function parseAgentMergeOptions(value: unknown): AgentMergeActions {
	if (!isRecord(value) || typeof value.addressReviews !== 'boolean' || typeof value.fixCI !== 'boolean'
		|| typeof value.resolveConflicts !== 'boolean' || !isAgentMergeMergePullRequest(value.mergePullRequest)) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.pr.invalidAgentMergeOptions', "Invalid Agent Merge configuration."));
	}
	return {
		addressReviews: value.addressReviews,
		fixCI: value.fixCI,
		resolveConflicts: value.resolveConflicts,
		mergePullRequest: value.mergePullRequest,
	};
}

function parseCreateOptions(value: unknown): IPullRequestCreateOptions {
	if (!isRecord(value)
		|| typeof value.title !== 'string' || typeof value.description !== 'string'
		|| typeof value.draft !== 'boolean' || typeof value.agentMerge !== 'boolean') {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.pr.invalidOptions', "Invalid pull request creation options."));
	}
	const autoMergeMethod = value.autoMergeMethod;
	if (autoMergeMethod !== undefined && !isMergeMethod(autoMergeMethod)) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.pr.invalidMergeMethod', "Invalid pull request auto-merge method."));
	}
	if (!value.title.trim()) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.pr.titleRequired', "A pull request title is required."));
	}
	if (value.draft && autoMergeMethod) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.pr.draftAutoMerge', "Draft pull requests cannot use GitHub auto-merge."));
	}
	if (value.agentMerge && autoMergeMethod) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.pr.conflictingMergeOptions', "Agent Merge and GitHub auto-merge cannot be enabled together."));
	}
	if (value.agentMergeOptions !== undefined && !value.agentMerge) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.pr.agentMergeOptionsWithoutEnablement', "Enable Agent Merge to configure it for this pull request."));
	}
	return {
		title: value.title,
		description: value.description,
		draft: value.draft,
		agentMerge: value.agentMerge,
		...(value.agentMergeOptions !== undefined ? { agentMergeOptions: parseAgentMergeOptions(value.agentMergeOptions) } : {}),
		...(autoMergeMethod ? { autoMergeMethod } : {}),
		...(value.expectedContext !== undefined ? { expectedContext: parseContext(value.expectedContext) } : {}),
	};
}

export function createPullRequestValidationMeta(context: IPullRequestContext): Record<string, unknown> {
	return { [PULL_REQUEST_META_KEY]: { validateOnly: true, expectedContext: parseContext(context) } };
}

export function readPullRequestValidationMeta(source: IHasPullRequestOperationMeta): IPullRequestContext | undefined {
	if (source._meta === undefined) {
		return undefined;
	}
	if (!isObject(source._meta)) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.pr.invalidMeta', "Invalid pull request operation metadata."));
	}
	if (!Object.hasOwn(source._meta, PULL_REQUEST_META_KEY)) {
		return undefined;
	}
	const value = source._meta[PULL_REQUEST_META_KEY];
	if (!isRecord(value) || value.validateOnly !== true) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.pr.invalidValidation', "Invalid pull request context validation request."));
	}
	return parseContext(value.expectedContext);
}

export function createPullRequestOperationMeta(options: IPullRequestCreateOptions): Record<string, unknown> {
	return { [PULL_REQUEST_META_KEY]: parseCreateOptions(options) };
}

/** Missing options preserve legacy creation behavior; malformed options are rejected. */
export function readPullRequestOperationMeta(source: IHasPullRequestOperationMeta): IPullRequestCreateOptions | undefined {
	const meta = source._meta;
	if (meta === undefined) {
		return undefined;
	}
	if (!isObject(meta)) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.pr.invalidMeta', "Invalid pull request operation metadata."));
	}
	return Object.hasOwn(meta, PULL_REQUEST_META_KEY) ? parseCreateOptions(meta[PULL_REQUEST_META_KEY]) : undefined;
}

function invalidDetails(): Error {
	return new Error(localize('agentHost.pr.invalidDetails', "Invalid pull request preparation result."));
}

function parseDetails(value: unknown): IPullRequestDetails {
	if (!isRecord(value) || typeof value.title !== 'string' || typeof value.description !== 'string'
		|| typeof value.branchName !== 'string' || !value.branchName.trim()
		|| typeof value.baseBranchName !== 'string' || !value.baseBranchName.trim()
		|| typeof value.repository !== 'string' || !value.repository.trim()
		|| typeof value.autoMergeAllowed !== 'boolean' || typeof value.agentMergeAvailable !== 'boolean'
		|| !Array.isArray(value.mergeMethods) || !value.mergeMethods.every(isMergeMethod)) {
		throw invalidDetails();
	}
	const generationError = value.generationError;
	if (generationError !== undefined && typeof generationError !== 'string') {
		throw invalidDetails();
	}
	return {
		title: value.title,
		description: value.description,
		branchName: value.branchName,
		baseBranchName: value.baseBranchName,
		repository: value.repository,
		autoMergeAllowed: value.autoMergeAllowed,
		mergeMethods: [...value.mergeMethods],
		agentMergeAvailable: value.agentMergeAvailable,
		...(value.agentMergeOptions !== undefined ? { agentMergeOptions: parseAgentMergeOptions(value.agentMergeOptions) } : {}),
		...(generationError !== undefined ? { generationError } : {}),
		...(value.context !== undefined ? { context: parseContext(value.context) } : {}),
	};
}

/** Serializes an immutable preparation snapshot using the protocol's content reference. */
export function createPullRequestDetailsResult(details: IPullRequestDetails): InvokeChangesetOperationResult {
	return {
		followUp: {
			content: {
				uri: `${DETAILS_DATA_URI_PREFIX}${encodeURIComponent(JSON.stringify(parseDetails(details)))}`,
				contentType: 'application/json',
			},
		},
	};
}

export function readPullRequestDetailsResult(result: InvokeChangesetOperationResult): IPullRequestDetails {
	const followUp = result.followUp;
	const content = followUp?.content;
	if ((followUp?.external !== undefined && followUp.external !== false)
		|| content?.contentType !== 'application/json' || typeof content.uri !== 'string'
		|| !content.uri.startsWith(DETAILS_DATA_URI_PREFIX)) {
		throw invalidDetails();
	}
	const encoded = content.uri.slice(DETAILS_DATA_URI_PREFIX.length);
	if (!/^(?:[a-zA-Z0-9_.!~*'()-]|%[a-fA-F0-9]{2})+$/.test(encoded)) {
		throw invalidDetails();
	}
	let details: unknown;
	try {
		details = JSON.parse(decodeURIComponent(encoded));
	} catch {
		throw invalidDetails();
	}
	return parseDetails(details);
}
