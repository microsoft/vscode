/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IRoutableSession, isHighConfidenceSessionRoute, ISessionRouteResult } from '../../common/sessionRouter.js';

/** Number of top-ranked candidates whose conversation content should be resolved. */
export const ROUTE_ENRICH_MAX_CANDIDATES = 12;
const RELATED_SESSION_FOLDER_CONFIDENCE = 0.35;

export interface IChatSessionRoutingFolder {
	readonly uri: URI;
	readonly name: string;
	readonly aliases?: readonly string[];
}

/**
 * Extracts the task from an explicit request to start a new session.
 * Requests that merely mention creating another resource are deliberately ignored.
 */
export function parseExplicitNewSessionRequest(utterance: string): string | undefined {
	const match = /^(?:please\s+)?(?:create|start|open)\s+(?:a\s+)?new\s+(?:chat\s+)?session(?:\s+(?:to|for|and)\s+|\s*[:,-]\s*)(.+)$/i.exec(utterance.trim());
	const task = match?.[1]?.trim();
	return task || undefined;
}

/**
 * Chooses the workspace folder for a newly routed session. Explicit folder
 * mentions win, followed by a sufficiently related session's folder and then
 * the caller's default.
 */
export function resolveNewSessionWorkspaceFolder(
	utterance: string,
	folders: readonly IChatSessionRoutingFolder[],
	results: readonly ISessionRouteResult[],
	candidates: readonly IRoutableSession[],
	defaultFolder: URI | undefined,
): URI | undefined {
	return resolveMentionedWorkspaceFolder(utterance, folders)?.uri
		?? folderFromRelatedSession(results, candidates, folders)
		?? defaultFolder
		?? folders[0]?.uri;
}

/** Resolves an explicitly mentioned workspace folder name or path basename. */
export function resolveMentionedWorkspaceFolder<T extends IChatSessionRoutingFolder>(utterance: string, folders: readonly T[]): T | undefined {
	const normalizedUtterance = normalizeFolderMentionText(utterance);
	let best: { folder: T; length: number } | undefined;
	for (const folder of folders) {
		const names = new Set([
			folder.name,
			folder.uri.path.split('/').filter(Boolean).at(-1),
			folder.uri.path,
			folder.uri.fsPath,
			...folder.aliases ?? [],
		]);
		for (const name of names) {
			if (!name || name.length < 3) {
				continue;
			}
			const normalizedName = normalizeFolderMentionText(name).trim();
			let start = normalizedUtterance.indexOf(normalizedName);
			while (start >= 0) {
				if (isWordBoundary(normalizedUtterance[start - 1])
					&& isWordBoundary(normalizedUtterance[start + normalizedName.length])) {
					if (!best || normalizedName.length > best.length) {
						best = { folder, length: normalizedName.length };
					}
					break;
				}
				start = normalizedUtterance.indexOf(normalizedName, start + normalizedName.length);
			}
		}
	}
	return best?.folder;
}

function normalizeFolderMentionText(value: string): string {
	return value
		.toLowerCase()
		.replace(/\bvs\s+code\b/gu, 'vscode')
		.replace(/[\s._-]+/gu, ' ');
}

/** Returns the workspace folder represented by a routed session's working-directory metadata. */
export function resolveSessionWorkspaceFolder<T extends IChatSessionRoutingFolder>(candidate: IRoutableSession, folders: readonly T[]): T | undefined {
	return folderForSessionMetadata(candidate, folders);
}

/**
 * Bounds transcript enrichment while preserving the model's preliminary order.
 * Any remaining slots favor active and recently updated sessions.
 */
export function selectRouterShortlist(
	candidates: readonly IRoutableSession[],
	preliminaryResults: readonly ISessionRouteResult[],
	limit: number = ROUTE_ENRICH_MAX_CANDIDATES,
): IRoutableSession[] {
	if (candidates.length <= limit) {
		return [...candidates];
	}

	const candidatesById = new Map(candidates.map(candidate => [candidate.sessionId, candidate]));
	const selectedIds = new Set<string>();
	const shortlist: IRoutableSession[] = [];
	for (const result of preliminaryResults) {
		const candidate = candidatesById.get(result.sessionId);
		if (candidate && !selectedIds.has(candidate.sessionId)) {
			selectedIds.add(candidate.sessionId);
			shortlist.push(candidate);
			if (shortlist.length === limit) {
				return shortlist;
			}
		}
	}

	const fallback = candidates
		.filter(candidate => !selectedIds.has(candidate.sessionId))
		.sort((a, b) =>
			sessionStatusPriority(b.status) - sessionStatusPriority(a.status)
			|| (b.lastActivity ?? 0) - (a.lastActivity ?? 0)
			|| a.label.localeCompare(b.label)
			|| a.sessionId.localeCompare(b.sessionId));
	shortlist.push(...fallback.slice(0, limit - shortlist.length));
	return shortlist;
}

/** Selects the top result only when it clears the shared confidence threshold. */
export function selectBestSessionRoute(results: readonly ISessionRouteResult[]): ISessionRouteResult | undefined {
	const top = results[0];
	return top && isHighConfidenceSessionRoute(top) ? top : undefined;
}

function sessionStatusPriority(status: string | undefined): number {
	return status === 'working' ? 2 : status === 'idle' ? 1 : 0;
}

function folderFromRelatedSession(
	results: readonly ISessionRouteResult[],
	candidates: readonly IRoutableSession[],
	folders: readonly IChatSessionRoutingFolder[],
): URI | undefined {
	const candidateById = new Map(candidates.map(candidate => [candidate.sessionId, candidate]));
	for (const result of results) {
		if (result.confidence < RELATED_SESSION_FOLDER_CONFIDENCE) {
			continue;
		}
		const candidate = candidateById.get(result.sessionId);
		const folder = candidate && folderForSessionMetadata(candidate, folders);
		if (folder) {
			return folder.uri;
		}
	}
	return undefined;
}

function folderForSessionMetadata<T extends IChatSessionRoutingFolder>(candidate: IRoutableSession, folders: readonly T[]): T | undefined {
	for (const path of [candidate.cwd, candidate.repo]) {
		if (!path) {
			continue;
		}
		const normalizedPath = path.replaceAll('\\', '/').replace(/\/+$/, '').replace(/^([a-zA-Z]:\/)/, '/$1').toLowerCase();
		const match = folders
			.filter(folder => {
				const folderPath = folder.uri.path.replace(/\/+$/, '').toLowerCase();
				return normalizedPath === folderPath
					|| normalizedPath.startsWith(`${folderPath}/`)
					|| normalizedPath.endsWith(`/${folder.name.toLowerCase()}`)
					|| normalizedPath.endsWith(`/${folder.name.toLowerCase()}.git`);
			})
			.sort((a, b) => b.uri.path.length - a.uri.path.length)[0];
		if (match) {
			return match;
		}
	}
	return undefined;
}

function isWordBoundary(value: string | undefined): boolean {
	return value === undefined || !/[\p{L}\p{N}_-]/u.test(value);
}
