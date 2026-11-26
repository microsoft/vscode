/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import type { InvokeChangesetOperationResult } from '../../state/protocol/channels-changeset/commands.js';
import { JsonRpcErrorCodes, ProtocolError } from '../../state/sessionProtocol.js';

/** Lists the branches a Branch changeset can compare against, without changing anything. */
export const LIST_BASE_BRANCHES_OPERATION_ID = 'list-base-branches';
/** Compares a Branch changeset against the branch ref named by {@link createSetBaseBranchMeta}. */
export const SET_BASE_BRANCH_OPERATION_ID = 'set-base-branch';

const BASE_BRANCH_REF_META_KEY = 'vscode.baseBranchRef';
const CANDIDATES_DATA_URI_PREFIX = 'data:application/json,';

/** The branches a Branch changeset can compare against. */
export interface IBaseBranchCandidates {
	/** Full refs of the local and remote branches (for example `refs/remotes/origin/main`), as the base is recorded, most recently committed first. */
	readonly refs: readonly string[];
	/** The ref a new session of the repository records as its base, when the repository has a default branch. */
	readonly defaultRef?: string;
}

interface IHasBaseBranchOperationMeta {
	readonly _meta?: Record<string, unknown>;
}

/** Creates request metadata for a {@link SET_BASE_BRANCH_OPERATION_ID} operation that records `ref`, a full branch ref. */
export function createSetBaseBranchMeta(ref: string): Record<string, unknown> {
	return { [BASE_BRANCH_REF_META_KEY]: ref };
}

/**
 * Reads the branch ref requested by a {@link SET_BASE_BRANCH_OPERATION_ID} operation.
 * The value is client-supplied: callers must still check it is a candidate.
 */
export function readSetBaseBranchMeta(source: IHasBaseBranchOperationMeta): string | undefined {
	const meta = source._meta;
	if (meta === undefined) {
		return undefined;
	}
	if (!isRecord(meta)) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.baseBranch.invalidMeta', "Invalid base branch operation metadata."));
	}
	const ref = Object.hasOwn(meta, BASE_BRANCH_REF_META_KEY) ? meta[BASE_BRANCH_REF_META_KEY] : undefined;
	return isRef(ref) ? ref : undefined;
}

/** Serializes the candidates of a {@link LIST_BASE_BRANCHES_OPERATION_ID} operation using the protocol's content reference. */
export function createBaseBranchCandidatesResult(candidates: IBaseBranchCandidates): InvokeChangesetOperationResult {
	return {
		followUp: {
			content: {
				uri: `${CANDIDATES_DATA_URI_PREFIX}${encodeURIComponent(JSON.stringify(parseCandidates(candidates)))}`,
				contentType: 'application/json',
			},
		},
	};
}

export function readBaseBranchCandidatesResult(result: InvokeChangesetOperationResult): IBaseBranchCandidates {
	const followUp = result.followUp;
	const content = followUp?.content;
	if ((followUp?.external !== undefined && followUp.external !== false)
		|| content?.contentType !== 'application/json' || typeof content.uri !== 'string'
		|| !content.uri.startsWith(CANDIDATES_DATA_URI_PREFIX)) {
		throw invalidCandidates();
	}
	let candidates: unknown;
	try {
		candidates = JSON.parse(decodeURIComponent(content.uri.slice(CANDIDATES_DATA_URI_PREFIX.length)));
	} catch {
		throw invalidCandidates();
	}
	return parseCandidates(candidates);
}

function invalidCandidates(): Error {
	return new Error(localize('agentHost.baseBranch.invalidCandidates', "Invalid base branch list."));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return isObject(value);
}

function isRef(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

function parseCandidates(value: unknown): IBaseBranchCandidates {
	if (!isRecord(value) || !Array.isArray(value.refs) || !value.refs.every(isRef)
		|| (value.defaultRef !== undefined && !isRef(value.defaultRef))) {
		throw invalidCandidates();
	}
	return {
		refs: [...value.refs],
		...(value.defaultRef !== undefined ? { defaultRef: value.defaultRef } : {}),
	};
}
