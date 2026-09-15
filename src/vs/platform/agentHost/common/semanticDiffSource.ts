/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { posix } from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ISemanticDiffFile } from './semanticDiff.js';

export const SEMANTIC_DIFF_SOURCE_SCHEME = 'semantic-diff-source';
export const SEMANTIC_DIFF_FILE_BYTE_LIMIT = 1024 * 1024;
export const SEMANTIC_DIFF_GROUP_BYTE_LIMIT = 16 * 1024 * 1024;

export type SemanticDiffSourceRequest =
	| { readonly kind: 'repositories'; readonly sessionUri: string }
	| {
		readonly kind: 'file';
		readonly sessionUri: string;
		readonly repositoryUri: string;
		readonly baseRevision: string;
		readonly targetRevision: string;
		readonly file: ISemanticDiffFile;
	};

export interface ISemanticDiffRepositoryResult {
	readonly kind: 'repositories';
	readonly repositories: readonly string[];
}

export interface ISemanticDiffFileSourceResult {
	readonly kind: 'file';
	readonly original: string | undefined;
	readonly modified: string | undefined;
	readonly patch: string;
}

export function semanticDiffSourceUri(request: SemanticDiffSourceRequest): URI {
	return URI.from({ scheme: SEMANTIC_DIFF_SOURCE_SCHEME, path: `/${request.kind}`, query: JSON.stringify(request) });
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBoundedString(value: unknown, maximum: number): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function isPath(value: unknown): value is string {
	return isBoundedString(value, 4096) && !/[\0\\\r\n]/.test(value) && !value.startsWith('/')
		&& !/^[a-zA-Z]:/.test(value) && value !== '.' && value === posix.normalize(value)
		&& !value.split('/').some(segment => segment === '..' || segment === '.' || segment.length === 0);
}

function isRevision(value: unknown): value is string {
	return typeof value === 'string' && (value.length === 40 || value.length === 64) && /^[0-9a-f]+$/.test(value);
}

function isTextFile(value: unknown): value is ISemanticDiffFile {
	return isRecord(value) && isBoundedString(value.id, 80) && isPath(value.path) && value.contentKind === 'text'
		&& (value.status === 'added' || value.status === 'modified' || value.status === 'deleted' || value.status === 'renamed')
		&& (value.status === 'renamed' ? isPath(value.oldPath) && value.oldPath !== value.path : value.oldPath === null);
}

export function parseSemanticDiffSourceRequest(uri: URI): SemanticDiffSourceRequest {
	if (uri.scheme !== SEMANTIC_DIFF_SOURCE_SCHEME || uri.query.length > 64 * 1024) {
		throw new Error(localize('semanticDiff.invalidSourceRequest', "Invalid semantic diff source request."));
	}
	let value: unknown;
	try {
		value = JSON.parse(uri.query);
	} catch {
		throw new Error(localize('semanticDiff.invalidSourceRequest', "Invalid semantic diff source request."));
	}
	if (!isRecord(value) || !isBoundedString(value.sessionUri, 4096)) {
		throw new Error(localize('semanticDiff.invalidSourceRequest', "Invalid semantic diff source request."));
	}
	if (value.kind === 'repositories' && uri.path === '/repositories') {
		return { kind: 'repositories', sessionUri: value.sessionUri };
	}
	if (value.kind === 'file' && uri.path === '/file' && isBoundedString(value.repositoryUri, 4096)
		&& isRevision(value.baseRevision) && isRevision(value.targetRevision) && isTextFile(value.file)) {
		return {
			kind: 'file', sessionUri: value.sessionUri, repositoryUri: value.repositoryUri,
			baseRevision: value.baseRevision, targetRevision: value.targetRevision, file: value.file,
		};
	}
	throw new Error(localize('semanticDiff.invalidSourceRequest', "Invalid semantic diff source request."));
}

export function parseSemanticDiffRepositoryResult(value: unknown): ISemanticDiffRepositoryResult {
	if (!isRecord(value) || value.kind !== 'repositories' || !Array.isArray(value.repositories)
		|| !value.repositories.every((repository): repository is string => isBoundedString(repository, 4096))) {
		throw new Error(localize('semanticDiff.invalidRepositories', "The agent host returned an invalid semantic diff repository list."));
	}
	return { kind: 'repositories', repositories: value.repositories };
}

export function parseSemanticDiffFileSourceResult(value: unknown): ISemanticDiffFileSourceResult {
	if (!isRecord(value) || value.kind !== 'file' || typeof value.patch !== 'string'
		|| (value.original !== undefined && typeof value.original !== 'string')
		|| (value.modified !== undefined && typeof value.modified !== 'string')) {
		throw new Error(localize('semanticDiff.invalidFileSource', "The agent host returned invalid semantic diff file content."));
	}
	return { kind: 'file', original: value.original, modified: value.modified, patch: value.patch };
}
