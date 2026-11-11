/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../../base/common/objects.js';
import { isObject } from '../../../../../base/common/types.js';
import { getPullRequestUrlKey } from '../../../../github/common/githubUrls.js';
import type { IAgentMetadataSource } from '../metadata.js';

const githubReferencesKey = 'copilot.githubReferences';

export interface IAgentHeadBranchPullRequest {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
	readonly title: string;
	readonly url: string;
	readonly state?: 'open' | 'closed' | 'merged' | 'draft';
}

/** Validates a canonical GitHub PR URL, including GitHub Enterprise origins. */
export function parseHeadBranchPullRequestUrl(value: string): Omit<IAgentHeadBranchPullRequest, 'title' | 'state'> | undefined {
	const match = /^https?:\/\/[^/?#@\s]+\/(?<owner>[A-Za-z0-9._-]{1,100})\/(?<repo>[A-Za-z0-9._-]{1,100})\/pull\/(?<number>[1-9][0-9]*)$/.exec(value);
	if (!match) {
		return undefined;
	}
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return undefined;
	}
	const owner = match?.groups?.owner;
	const repo = match?.groups?.repo;
	const number = Number(match?.groups?.number);
	if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password || url.search || url.hash
		|| !owner || !repo || owner === '.' || owner === '..' || repo === '.' || repo === '..'
		|| !Number.isSafeInteger(number) || number <= 0) {
		return undefined;
	}
	return { owner, repo, number, url: value };
}

/** Reads the host-owned head-branch PR, without promoting attached or created-only references. */
export function readCopilotHeadBranchPullRequest(source: IAgentMetadataSource): IAgentHeadBranchPullRequest | undefined {
	const entries = source._meta?.[githubReferencesKey];
	if (!Array.isArray(entries)) {
		return undefined;
	}
	for (const entry of entries) {
		if (!isObject(entry) || entry.referenceType !== 'pr' || typeof entry.url !== 'string'
			|| typeof entry.title !== 'string' || !Array.isArray(entry.relations) || !entry.relations.includes('headBranch')) {
			continue;
		}
		const parsed = parseHeadBranchPullRequestUrl(entry.url);
		if (!parsed || entry.repository !== `${parsed.owner}/${parsed.repo}` || entry.number !== parsed.number) {
			continue;
		}
		const state = entry.state === 'open' || entry.state === 'closed' || entry.state === 'merged' || entry.state === 'draft' ? entry.state : undefined;
		return { ...parsed, title: entry.title, ...(state ? { state } : {}) };
	}
	return undefined;
}

/** Publishes the head-branch convention while preserving unrelated metadata. */
export function withCopilotHeadBranchPullRequest(meta: IAgentMetadataSource['_meta'], pullRequest: IAgentHeadBranchPullRequest | undefined): IAgentMetadataSource['_meta'] {
	const previous = meta?.[githubReferencesKey];
	const retained: unknown[] = [];
	let matching: Record<string, unknown> | undefined;
	for (const entry of Array.isArray(previous) ? previous : []) {
		if (isObject(entry) && Array.isArray(entry.relations)) {
			const relations = entry.relations.filter((relation: unknown) => relation !== 'headBranch');
			if (pullRequest && typeof entry.url === 'string' && getPullRequestUrlKey(entry.url) === getPullRequestUrlKey(pullRequest.url)) {
				matching = { ...entry, relations };
				continue;
			}
			if (relations.length !== entry.relations.length) {
				if (relations.length) {
					retained.push({ ...entry, relations });
				}
				continue;
			}
		}
		retained.push(entry);
	}
	const entries = pullRequest ? [{
		...matching,
		referenceType: 'pr',
		repository: `${pullRequest.owner}/${pullRequest.repo}`,
		number: pullRequest.number,
		title: pullRequest.title,
		...(pullRequest.state ? { state: pullRequest.state } : {}),
		url: pullRequest.url,
		relations: ['headBranch', ...(Array.isArray(matching?.relations) ? matching.relations : [])],
	}, ...retained].slice(0, 10) : retained;
	const references = entries.length ? entries : undefined;
	if (equals(meta?.[githubReferencesKey], references)) {
		return meta;
	}
	const next = { ...meta };
	if (references) {
		next[githubReferencesKey] = references;
	} else {
		delete next[githubReferencesKey];
	}
	return Object.keys(next).length ? next : undefined;
}
