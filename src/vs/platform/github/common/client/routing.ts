/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GitHubRequestError } from '../githubTypes.js';
import { MAX_PER_PAGE } from './types.js';

/** Encodes one opaque API identifier, rejecting empty identifiers and URL dot segments. */
export function pathSegment(value: string): string {
	if (typeof value !== 'string' || !value.trim() || value === '.' || value === '..') {
		throw new GitHubRequestError('Invalid or empty API path identifier.', 'validation');
	}
	return encodeURIComponent(value);
}

/** Encodes a number as a path segment, rejecting non-positive integers. */
export function numberSegment(value: number): string {
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new GitHubRequestError('Invalid or non-positive numeric path segment.', 'validation');
	}
	return String(value);
}

/** Encodes a repository path while preserving directory separators. */
export function encodePathSegments(path: string): string {
	return path.split('/').map(encodeURIComponent).join('/');
}

/** Appends query parameters, repeating array values and omitting undefined entries. */
export function withQuery(path: string, parameters: Readonly<Record<string, string | number | boolean | readonly string[] | readonly number[] | undefined>>): string {
	const query = new URLSearchParams();
	for (const key of Object.keys(parameters)) {
		const value = parameters[key];
		if (value === undefined) {
			continue;
		}
		if (key === 'page') {
			if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
				throw new GitHubRequestError('Invalid REST pagination value.', 'validation');
			}
			query.append(key, String(value));
			continue;
		}
		if (key === 'per_page') {
			if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > MAX_PER_PAGE) {
				throw new GitHubRequestError('Invalid REST pagination value.', 'validation');
			}
			query.append(key, String(value));
			continue;
		}
		for (const item of Array.isArray(value) ? value : [value]) {
			if (typeof item === 'number' && !Number.isFinite(item)) {
				throw new GitHubRequestError('Invalid numeric API query parameter', 'validation');
			}
			query.append(key, String(item));
		}
	}
	return query.size ? `${path}?${query}` : path;
}

/** Constructs the API path for a repository. */
export function repositoryPath(ref: { owner: string; name: string }): string;
export function repositoryPath(owner: string, repo: string): string;
export function repositoryPath(arg1: string | { owner: string; name: string }, arg2?: string): string {
	if (typeof arg1 === 'string') {
		return `/repos/${pathSegment(arg1)}/${pathSegment(arg2 as string)}`;
	} else {
		return `/repos/${pathSegment(arg1.owner)}/${pathSegment(arg1.name)}`;
	}
}
