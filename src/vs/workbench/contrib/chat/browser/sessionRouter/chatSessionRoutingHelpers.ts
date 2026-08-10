/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IRoutableSession, isHighConfidenceSessionRoute, ISessionRouteResult } from '../../common/sessionRouter.js';

/** Number of top-ranked candidates whose conversation content should be resolved. */
export const ROUTE_ENRICH_MAX_CANDIDATES = 12;
/** Maximum length of the completed response preview shown in the omni bar. */
export const ROUTE_RESPONSE_PREVIEW_LENGTH = 140;
const RELATED_SESSION_FOLDER_CONFIDENCE = 0.35;

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
	folders: readonly IWorkspaceFolder[],
	results: readonly ISessionRouteResult[],
	candidates: readonly IRoutableSession[],
	defaultFolder: URI | undefined,
): URI | undefined {
	return folderMentionedInUtterance(utterance, folders)
		?? folderFromRelatedSession(results, candidates, folders)
		?? defaultFolder
		?? folders[0]?.uri;
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

/** Normalizes and clips response text for the completed-route badge. */
export function getResponsePreview(text: string): string | undefined {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized) {
		return undefined;
	}
	return normalized.length > ROUTE_RESPONSE_PREVIEW_LENGTH
		? `${normalized.slice(0, ROUTE_RESPONSE_PREVIEW_LENGTH - 1).trimEnd()}…`
		: normalized;
}

function sessionStatusPriority(status: string | undefined): number {
	return status === 'working' ? 2 : status === 'idle' ? 1 : 0;
}

function folderMentionedInUtterance(utterance: string, folders: readonly IWorkspaceFolder[]): URI | undefined {
	const normalizedUtterance = utterance.toLocaleLowerCase();
	let best: { folder: IWorkspaceFolder; length: number } | undefined;
	for (const folder of folders) {
		const names = new Set([folder.name, folder.uri.path.split('/').filter(Boolean).at(-1)]);
		for (const name of names) {
			if (!name || name.length < 3) {
				continue;
			}
			const normalizedName = name.toLocaleLowerCase();
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
	return best?.folder.uri;
}

function folderFromRelatedSession(
	results: readonly ISessionRouteResult[],
	candidates: readonly IRoutableSession[],
	folders: readonly IWorkspaceFolder[],
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

function folderForSessionMetadata(candidate: IRoutableSession, folders: readonly IWorkspaceFolder[]): IWorkspaceFolder | undefined {
	for (const path of [candidate.cwd, candidate.repo]) {
		if (!path) {
			continue;
		}
		const normalizedPath = path.replaceAll('\\', '/').replace(/\/+$/, '').replace(/^([a-zA-Z]:\/)/, '/$1').toLocaleLowerCase();
		const match = folders
			.filter(folder => {
				const folderPath = folder.uri.path.replace(/\/+$/, '').toLocaleLowerCase();
				return normalizedPath === folderPath
					|| normalizedPath.startsWith(`${folderPath}/`)
					|| normalizedPath.endsWith(`/${folder.name.toLocaleLowerCase()}`)
					|| normalizedPath.endsWith(`/${folder.name.toLocaleLowerCase()}.git`);
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
