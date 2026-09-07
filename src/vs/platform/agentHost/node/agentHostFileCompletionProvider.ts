/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { compareItemsByFuzzyScore, FuzzyScorerCache, IItemAccessor, prepareQuery, scoreItemFuzzy } from '../../../base/common/fuzzyScorer.js';
import { shorten } from '../../../base/common/labels.js';
import { basename, extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { compare } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { findDeepestContainingWorkingDirectory } from '../common/agentHostWorkingDirectories.js';
import { CompletionItem, CompletionItemKind, CompletionsParams } from '../common/state/protocol/commands.js';
import { MessageAttachmentKind } from '../common/state/protocol/state.js';
import { CompletionTriggerCharacter, IAgentHostCompletionItemProvider } from './agentHostCompletions.js';
import { IAgentHostFileCompletionRoots, resolveAgentHostFileCompletionRoots } from './agentHostFileCompletionUtils.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { AgentHostWorkspaceFiles } from './agentHostWorkspaceFiles.js';

/** Maximum number of completion items returned per call. */
const MAX_RESULTS = 50;

/**
 * Result of {@link extractAtToken}.
 */
interface IAtToken {
	readonly token: string;
	readonly triggerChar: string;
	readonly rangeStart: number;
	readonly rangeEnd: number;
}

/**
 * Walk back from `offset` to find the most recent `@` that is preceded by
 * whitespace (or start-of-string) and not interrupted by whitespace. Returns
 * the substring after `@` together with the range to replace, or `undefined`
 * if no `@`-token is being typed at `offset`.
 *
 * Exported for unit testing.
 */
export function extractAtToken(text: string, offset: number): IAtToken | undefined {
	if (offset < 0 || offset > text.length) {
		return undefined;
	}
	for (let i = offset - 1; i >= 0; i--) {
		const ch = text.charCodeAt(i);
		// whitespace terminates the search
		if (ch === 0x20 /* space */ || ch === 0x09 /* tab */ || ch === 0x0a /* \n */ || ch === 0x0d /* \r */) {
			return undefined;
		}
		if (text[i] === CompletionTriggerCharacter.File || text[i] === CompletionTriggerCharacter.Hash) {
			// The trigger character must be at start-of-input or preceded by whitespace.
			if (i > 0) {
				const prev = text.charCodeAt(i - 1);
				const prevIsWs = prev === 0x20 || prev === 0x09 || prev === 0x0a || prev === 0x0d;
				if (!prevIsWs) {
					return undefined;
				}
			}
			return { token: text.slice(i + 1, offset), triggerChar: text[i], rangeStart: i, rangeEnd: offset };
		}
	}
	return undefined;
}

/**
 * Exposes a candidate's basename, parent directory, and owner-relative path to
 * the {@link scoreItemFuzzy} family.
 */
interface IFileCompletionCandidate {
	readonly uri: URI;
	readonly owner: URI;
	readonly ownerIndex: number;
	readonly relativePath: string;
}

class FileCompletionCandidateAccessor implements IItemAccessor<IFileCompletionCandidate> {

	getItemLabel(item: IFileCompletionCandidate): string {
		return basename(item.uri);
	}

	getItemDescription(item: IFileCompletionCandidate): string | undefined {
		const idx = item.relativePath.lastIndexOf('/');
		return idx > 0 ? item.relativePath.slice(0, idx) : undefined;
	}

	getItemPath(item: IFileCompletionCandidate): string {
		return item.relativePath;
	}
}

/**
 * Generic completion provider that contributes workspace file references
 * for a {@link CompletionItemKind.UserMessage} input — typically used for
 * `@`-mentions in the user message composer.
 *
 * When the user has typed an `@`-prefixed token at the cursor position,
 * this provider enumerates files under the session's effective working directories
 * (via {@link AgentHostWorkspaceFiles}, which uses ripgrep and respects
 * `.gitignore`), ranks them with the same fuzzy scorer used by the
 * VS Code Quick Open file picker, and returns up to {@link MAX_RESULTS}
 * matches.
 */
export class AgentHostFileCompletionProvider implements IAgentHostCompletionItemProvider {

	readonly kinds: ReadonlySet<CompletionItemKind> = new Set([CompletionItemKind.UserMessage]);

	readonly triggerCharacters: readonly string[] = [CompletionTriggerCharacter.File, CompletionTriggerCharacter.Hash];

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _workspaceFiles: AgentHostWorkspaceFiles,
		private readonly _logService: ILogService,
	) { }

	async provideCompletionItems(params: CompletionsParams, token: CancellationToken): Promise<readonly CompletionItem[]> {
		const workingDirectoryStrings = this._stateManager.getSessionState(params.channel)?.workingDirectories;
		if (!workingDirectoryStrings?.length) {
			return [];
		}
		const roots = resolveAgentHostFileCompletionRoots(workingDirectoryStrings.map(workingDirectory => URI.parse(workingDirectory)));
		if (roots.enumerationRoots.length === 0) {
			return [];
		}

		const at = extractAtToken(params.text, params.offset);
		if (!at) {
			return [];
		}

		let filesByRoot: readonly (readonly URI[])[];
		try {
			filesByRoot = await this._enumerateRootFiles(roots, token);
		} catch (err) {
			if (isCancellationError(err)) {
				return [];
			}
			throw err;
		}
		if (token.isCancellationRequested) {
			return [];
		}

		const query = prepareQuery(at.token);
		const candidates: IFileCompletionCandidate[] = [];
		const candidateCountByOwner = new Array<number>(roots.logicalRoots.length).fill(0);
		const seen = new Set<string>();
		for (const files of filesByRoot) {
			for (const uri of files) {
				const key = extUriBiasedIgnorePathCase.getComparisonKey(uri);
				if (seen.has(key)) {
					continue;
				}
				const owner = findDeepestContainingWorkingDirectory(uri, roots.logicalRoots);
				const ownerIndex = owner ? roots.logicalRoots.indexOf(owner) : -1;
				if (!owner || ownerIndex < 0 || (!query.normalized && candidateCountByOwner[ownerIndex] >= MAX_RESULTS)) {
					continue;
				}
				const relativePath = extUriBiasedIgnorePathCase.relativePath(owner, uri);
				if (relativePath === undefined) {
					continue;
				}
				seen.add(key);
				candidateCountByOwner[ownerIndex]++;
				candidates.push({ uri, owner, ownerIndex, relativePath });
			}
		}
		if (candidates.length === 0) {
			return [];
		}
		const accessor = new FileCompletionCandidateAccessor();
		const cache: FuzzyScorerCache = Object.create(null);

		let results: IFileCompletionCandidate[];
		if (!query.normalized) {
			results = this._takeFairResults(candidates);
		} else {
			// Filter out non-matches first to avoid sorting tens of thousands of zeros.
			const matching = candidates.filter(candidate => scoreItemFuzzy(candidate, query, true, accessor, cache).score > 0);
			matching.sort((a, b) =>
				compareItemsByFuzzyScore(a, b, query, true, accessor, cache)
				|| a.ownerIndex - b.ownerIndex
				|| compare(a.relativePath, b.relativePath)
			);
			results = matching.slice(0, MAX_RESULTS);
		}

		const duplicateNames = new Set<string>();
		const names = new Set<string>();
		for (const candidate of results) {
			const name = basename(candidate.uri);
			if (names.has(name)) {
				duplicateNames.add(name);
			} else {
				names.add(name);
			}
		}
		const ownerLabels = this._getOwnerLabels(results);

		return results.map((candidate): CompletionItem => {
			const name = basename(candidate.uri);
			const ownerLabel = ownerLabels.get(extUriBiasedIgnorePathCase.getComparisonKey(candidate.owner)) ?? candidate.owner.path;
			return {
				insertText: at.triggerChar + name,
				rangeStart: at.rangeStart,
				rangeEnd: at.rangeEnd,
				attachment: {
					type: MessageAttachmentKind.Resource,
					uri: candidate.uri.toString(),
					label: duplicateNames.has(name) ? `${ownerLabel} \u2022 ${candidate.relativePath}` : name,
					displayKind: 'document',
				},
			};
		});
	}

	/**
	 * Uses root basenames when unique and shortens only roots whose basenames collide.
	 */
	private _getOwnerLabels(candidates: readonly IFileCompletionCandidate[]): ReadonlyMap<string, string> {
		const owners = new Map<string, URI>();
		for (const candidate of candidates) {
			owners.set(extUriBiasedIgnorePathCase.getComparisonKey(candidate.owner), candidate.owner);
		}

		const entries = [...owners.entries()];
		const ownerNameCounts = new Map<string, number>();
		for (const [, owner] of entries) {
			const ownerName = basename(owner);
			ownerNameCounts.set(ownerName, (ownerNameCounts.get(ownerName) ?? 0) + 1);
		}

		const shortenedOwnerPaths = shorten(entries.map(([, owner]) => owner.path), '/');
		return new Map(entries.map(([key, owner], index) => {
			const ownerName = basename(owner);
			const label = ownerName && ownerNameCounts.get(ownerName) === 1 ? ownerName : shortenedOwnerPaths[index];
			return [key, label];
		}));
	}

	private async _enumerateRootFiles(roots: IAgentHostFileCompletionRoots, token: CancellationToken): Promise<readonly (readonly URI[])[]> {
		const filesByRoot: (readonly URI[])[] = [];
		const queuedRoots = new Set(roots.enumerationRoots.map(root => extUriBiasedIgnorePathCase.getComparisonKey(root)));
		let pendingRoots = [...roots.enumerationRoots];

		while (pendingRoots.length > 0) {
			const currentRoots = pendingRoots;
			pendingRoots = [];
			const enumerations = await Promise.all(currentRoots.map(async root => {
				try {
					const result = await this._workspaceFiles.getFiles(root, token);
					return { root, files: result.files, needsFallback: result.isTruncated };
				} catch (err) {
					if (isCancellationError(err)) {
						throw err;
					}
					this._logService.warn(`[AgentHostFileCompletionProvider] Failed to enumerate ${root.toString()}: ${err}`);
					return { root, files: [], needsFallback: true };
				}
			}));

			for (const enumeration of enumerations) {
				filesByRoot.push(enumeration.files);
				if (!enumeration.needsFallback) {
					continue;
				}

				const nestedRoots = roots.logicalRoots.filter(root =>
					!extUriBiasedIgnorePathCase.isEqual(root, enumeration.root)
					&& extUriBiasedIgnorePathCase.isEqualOrParent(root, enumeration.root)
					&& !queuedRoots.has(extUriBiasedIgnorePathCase.getComparisonKey(root))
				);
				for (const fallbackRoot of resolveAgentHostFileCompletionRoots(nestedRoots).enumerationRoots) {
					queuedRoots.add(extUriBiasedIgnorePathCase.getComparisonKey(fallbackRoot));
					pendingRoots.push(fallbackRoot);
				}
			}
		}

		return filesByRoot;
	}

	/**
	 * Interleaves empty-query candidates by logical root before applying the result limit.
	 */
	private _takeFairResults(candidates: readonly IFileCompletionCandidate[]): IFileCompletionCandidate[] {
		const buckets: IFileCompletionCandidate[][] = [];
		for (const candidate of candidates) {
			(buckets[candidate.ownerIndex] ??= []).push(candidate);
		}

		const results: IFileCompletionCandidate[] = [];
		for (let index = 0; results.length < MAX_RESULTS; index++) {
			let added = false;
			for (const bucket of buckets) {
				if (!bucket) {
					continue;
				}
				const candidate = bucket[index];
				if (candidate) {
					results.push(candidate);
					added = true;
					if (results.length === MAX_RESULTS) {
						break;
					}
				}
			}
			if (!added) {
				break;
			}
		}
		return results;
	}
}
