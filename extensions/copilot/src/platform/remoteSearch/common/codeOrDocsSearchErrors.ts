/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum SearchRepoErrorType {
	missingInaccessibleRepoOrg = 'ERROR_TYPE_MISSING_INACCESSIBLE_REPO_ORG',
	docsEmbeddingsUnavailable = 'ERROR_TYPE_DOCS_EMBEDDINGS_UNAVAILABLE',
	notIndexed = 'ERROR_TYPE_NOT_INDEXED',
}

export const enum SearchErrorType {
	maxRetriesExceeded = 'ERROR_TYPE_MAX_RETRIES_EXCEEDED',
	noAccessToEndpoint = 'ERROR_TYPE_NO_ACCESS_TO_ENDPOINT',
}

export class CodeOrDocsSearchRepoError extends Error {
	constructor(readonly repo: string, message?: string) {
		super(message);
	}
}

/**
 * This error is thrown when the repository is not accessible to the user. This might be because the user
 * does not have access to the repository or the token does not have the OAuth scope (repo) to access the repository.
 */
export class InaccessibleRepoOrgError extends CodeOrDocsSearchRepoError {
	override name = SearchRepoErrorType.missingInaccessibleRepoOrg;
}

/**
 * This error is thrown when the docs embeddings are not available for the given repository.
 * NOTE: For our usecases, this is basically the same thing as NotIndexedError.
 */
export class EmbeddingsUnavailableError extends CodeOrDocsSearchRepoError {
	override name = SearchRepoErrorType.docsEmbeddingsUnavailable;
}

/**
 * This error is thrown when the repository is not indexed entirely including when the embeddings are not available.
 * NOTE: For our usecases, this is basically the same thing as EmbeddingsUnavailableError.
 */
export class NotIndexedError extends CodeOrDocsSearchRepoError {
	override name = SearchRepoErrorType.notIndexed;
}

/**
 * This error is not thrown by the endpoint but is thrown by the client when the max retries are exceeded.
 */
export class MaxRetriesExceededError extends Error {
	override name = SearchErrorType.maxRetriesExceeded;
}

/**
 * This error is not thrown by the endpoint but is thrown by the client when the code or docs search endpoint is not accessible.
 * This is usually because of a feature flag that is not enabled for this user.
 */
export class NoAccessToEndpointError extends Error {
	override name = SearchErrorType.noAccessToEndpoint;
}

export function constructSearchRepoError({ error, message, repo }: { error: string; message: string; repo: string }): CodeOrDocsSearchRepoError {
	switch (error) {
		case SearchRepoErrorType.missingInaccessibleRepoOrg:
			return new InaccessibleRepoOrgError(repo, message);
		case SearchRepoErrorType.docsEmbeddingsUnavailable:
			return new EmbeddingsUnavailableError(repo, message);
		case SearchRepoErrorType.notIndexed:
			return new NotIndexedError(repo, message);
		default:
			return new CodeOrDocsSearchRepoError(repo, message);
	}
}

export function constructSearchError({ error, message }: { error: string; message: string }): Error {
	switch (error) {
		case SearchErrorType.maxRetriesExceeded:
			return new MaxRetriesExceededError(message);
		case SearchErrorType.noAccessToEndpoint:
			return new NoAccessToEndpointError(message);
		default:
			return new Error(message);
	}
}
