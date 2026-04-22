/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { LanguageContextResponse } from '../../../platform/inlineEdits/common/dataTypes/languageContext';
import * as xtabPromptOptions from '../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { PromptOptions, RecentFileClippingStrategy } from '../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { StatelessNextEditDocument } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { IXtabHistoryEditEntry, IXtabHistoryEntry } from '../../../platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { ContextKind } from '../../../platform/languageServer/common/languageContextService';
import { batchArrayElements } from '../../../util/common/arrays';
import { assertNever } from '../../../util/vs/base/common/assert';
import { illegalArgument } from '../../../util/vs/base/common/errors';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../util/vs/editor/common/core/text/abstractText';
import { expandRangeToPageRange } from './promptCrafting';
import { countTokensForLines, toUniquePath } from './promptCraftingUtils';
import { PromptTags } from './tags';

export function getRecentCodeSnippets(
	activeDoc: StatelessNextEditDocument,
	xtabHistory: readonly IXtabHistoryEntry[],
	langCtx: LanguageContextResponse | undefined,
	computeTokens: (code: string) => number,
	opts: PromptOptions,
): { codeSnippets: string; documents: Set<DocumentId> } {

	const { includeViewedFiles, nDocuments, clippingStrategy } = opts.recentlyViewedDocuments;

	let recentlyViewedCodeSnippets: RecentCodeSnippet[];

	if (clippingStrategy === RecentFileClippingStrategy.Proportional) {
		const grouped = collectRecentDocumentsGrouped(xtabHistory, activeDoc.id, includeViewedFiles, nDocuments);
		recentlyViewedCodeSnippets = grouped.map(g => historyEntriesToCodeSnippet(g.entries));
	} else {
		const docsBesidesActiveDoc = collectRecentDocuments(xtabHistory, activeDoc.id, includeViewedFiles, nDocuments);
		recentlyViewedCodeSnippets = docsBesidesActiveDoc.map(d => historyEntryToCodeSnippet(d, clippingStrategy));
	}

	const { snippets, docsInPrompt } = buildCodeSnippetsUsingPagedClipping(recentlyViewedCodeSnippets, computeTokens, opts);

	if (langCtx) {
		appendLanguageContextSnippets(langCtx, snippets, opts.languageContext.maxTokens, computeTokens, opts.recentlyViewedDocuments.includeLineNumbers);
	}

	return {
		codeSnippets: snippets.join('\n\n'),
		documents: docsInPrompt,
	};
}

function formatLinesWithLineNumbers(
	lines: string[],
	includeLineNumbers: xtabPromptOptions.IncludeLineNumbersOption,
	startLineOffset: number,
): string[] {
	switch (includeLineNumbers) {
		case xtabPromptOptions.IncludeLineNumbersOption.WithSpaceAfter:
			return lines.map((line, idx) => `${startLineOffset + idx}| ${line}`);
		case xtabPromptOptions.IncludeLineNumbersOption.WithoutSpace:
			return lines.map((line, idx) => `${startLineOffset + idx}|${line}`);
		case xtabPromptOptions.IncludeLineNumbersOption.None:
			return lines;
		default:
			assertNever(includeLineNumbers);
	}
}

function formatCodeSnippet(
	documentId: DocumentId,
	lines: string[],
	opts: { truncated: boolean; includeLineNumbers: xtabPromptOptions.IncludeLineNumbersOption; startLineOffset: number }
): string {
	const filePath = toUniquePath(documentId, undefined);
	const firstLine = opts.truncated
		? `code_snippet_file_path: ${filePath} (truncated)`
		: `code_snippet_file_path: ${filePath}`;

	const formattedLines = formatLinesWithLineNumbers(lines, opts.includeLineNumbers, opts.startLineOffset);
	const fileContent = formattedLines.join('\n');
	return [PromptTags.RECENT_FILE.start, firstLine, fileContent, PromptTags.RECENT_FILE.end].join('\n');
}

/**
 * Collect last `nDocuments` unique documents from xtab history, excluding the active document.
 * Returns entries from most to least recent.
 */
function collectRecentDocuments(
	xtabHistory: readonly IXtabHistoryEntry[],
	activeDocId: DocumentId,
	includeViewedFiles: boolean,
	nDocuments: number,
): IXtabHistoryEntry[] {
	const result: IXtabHistoryEntry[] = [];
	const seenDocuments = new Set<DocumentId>();

	for (let i = xtabHistory.length - 1; i >= 0; --i) {
		const entry = xtabHistory[i];

		if (!includeViewedFiles && entry.kind === 'visibleRanges') {
			continue;
		}

		if (entry.docId === activeDocId || seenDocuments.has(entry.docId)) {
			continue;
		}
		result.push(entry);
		seenDocuments.add(entry.docId);
		if (result.length >= nDocuments) {
			break;
		}
	}

	return result;
}

interface GroupedDocumentEntries {
	readonly docId: DocumentId;
	readonly entries: IXtabHistoryEntry[];
}

/**
 * Collect last `nDocuments` unique documents from xtab history, excluding the active document.
 * Unlike {@link collectRecentDocuments}, this returns *all* entries per document (not just the latest),
 * so that multiple edit locations within a single document can be used as focal ranges.
 * Returns groups from most to least recently active document.
 */
function collectRecentDocumentsGrouped(
	xtabHistory: readonly IXtabHistoryEntry[],
	activeDocId: DocumentId,
	includeViewedFiles: boolean,
	nDocuments: number,
): GroupedDocumentEntries[] {
	const docOrder: DocumentId[] = [];
	const docEntries = new Map<DocumentId, IXtabHistoryEntry[]>();

	for (let i = xtabHistory.length - 1; i >= 0; --i) {
		const entry = xtabHistory[i];

		if (!includeViewedFiles && entry.kind === 'visibleRanges') {
			continue;
		}

		if (entry.docId === activeDocId) {
			continue;
		}

		const existing = docEntries.get(entry.docId);
		if (existing) {
			existing.push(entry);
		} else {
			if (docOrder.length >= nDocuments) {
				continue; // already have enough unique docs, skip entries for new docs
			}
			docOrder.push(entry.docId);
			docEntries.set(entry.docId, [entry]);
		}
	}

	return docOrder.map(docId => ({ docId, entries: docEntries.get(docId)! }));
}

type RecentCodeSnippet = {
	readonly id: DocumentId;
	readonly content: StringText;
	readonly focalRanges?: readonly OffsetRange[];
	readonly editEntryCount?: number;
};

/**
 * Select focal ranges prioritizing the most recent (earliest in array order),
 * capping the total line span to prevent wide-scatter edits from blowing up
 * the initial page coverage in {@link clipAroundFocalRanges}.
 *
 * Focal ranges from {@link historyEntriesToCodeSnippet} are ordered most-recent-first.
 * When edits are spread across a file (e.g., line 10 + line 90), including all
 * ranges would cause the initial focal span to cover the entire document. This
 * function greedily includes ranges until a line span cap is reached.
 *
 * @param focalRanges  Character-offset ranges ordered most-recent-first.
 * @param getLineNumber Maps a character offset to a 1-based line number.
 * @param maxSpanLines  Maximum allowed line span for the combined focal range.
 */
export function selectFocalRangesWithinSpanCap(
	focalRanges: readonly OffsetRange[],
	getLineNumber: (offset: number) => number,
	maxSpanLines: number,
): readonly OffsetRange[] {
	if (focalRanges.length <= 1) {
		return focalRanges;
	}

	const selected: OffsetRange[] = [focalRanges[0]];
	let startLine = getLineNumber(focalRanges[0].start);
	let endLine = getLineNumber(Math.max(focalRanges[0].start, focalRanges[0].endExclusive - 1));

	for (let i = 1; i < focalRanges.length; i++) {
		const range = focalRanges[i];
		const rangeStartLine = getLineNumber(range.start);
		const rangeEndLine = getLineNumber(Math.max(range.start, range.endExclusive - 1));
		const candidateStart = Math.min(startLine, rangeStartLine);
		const candidateEnd = Math.max(endLine, rangeEndLine);
		if (candidateEnd - candidateStart > maxSpanLines) {
			break;
		}
		selected.push(range);
		startLine = candidateStart;
		endLine = candidateEnd;
	}

	return selected;
}

/**
 * Convert a single history entry to a code snippet.
 * When `clippingStrategy` is `AroundEditRange` or `Proportional`, edit entries get `focalRanges`
 * derived from the edit's replacement ranges in the post-edit document.
 */
function historyEntryToCodeSnippet(d: IXtabHistoryEntry, clippingStrategy: RecentFileClippingStrategy): RecentCodeSnippet {
	if (d.kind === 'edit') {
		const content = d.edit.edit.applyOnText(d.edit.base); // FIXME@ulugbekna: I don't like this being computed afresh
		const useFocalRanges = clippingStrategy !== RecentFileClippingStrategy.TopToBottom;
		return {
			id: d.docId,
			content,
			focalRanges: useFocalRanges ? d.edit.edit.getNewRanges() : undefined,
			editEntryCount: 1,
		};
	}
	return {
		id: d.docId,
		content: d.documentContent,
		focalRanges: d.visibleRanges,
	};
}

/**
 * Convert a group of history entries (all for the same document) into a single code snippet.
 * Merges focal ranges from all edit entries so clipping can center on all edit locations.
 *
 * Focal ranges are only collected from edit entries — visibleRanges entries are skipped
 * because their character offsets correspond to older document snapshots and cannot be
 * reliably transformed to the current content's coordinate space.
 *
 * For older edit entries, their focal ranges are transformed forward through the chain
 * of subsequent edits using {@link BaseStringEdit.applyToOffsetRange} so that they
 * remain valid in the most recent content.
 */
export function historyEntriesToCodeSnippet(entries: IXtabHistoryEntry[]): RecentCodeSnippet {
	// Use the most recent entry's content as the base
	const mostRecent = entries[0];
	const content = mostRecent.kind === 'edit'
		? mostRecent.edit.edit.applyOnText(mostRecent.edit.base)
		: mostRecent.documentContent;

	// Collect only edit entries (most recent first). VisibleRanges entries are
	// skipped because their character offsets refer to older document snapshots.
	const editEntries: IXtabHistoryEditEntry[] = [];
	for (const entry of entries) {
		if (entry.kind === 'edit') {
			editEntries.push(entry);
		}
	}

	// Transform focal ranges from each edit entry into the most recent content's
	// coordinate space. Each entry's getNewRanges() returns character offsets
	// valid in that entry's own post-edit document. The chain invariant is:
	//   editEntries[j].postEdit ≈ editEntries[j-1].base
	// so we apply each intervening edit's transformation in sequence (indices
	// j-1 down to 0) to project an older entry's ranges into the newest content.
	const allFocalRanges: OffsetRange[] = [];
	for (let j = 0; j < editEntries.length; j++) {
		let ranges = editEntries[j].edit.edit.getNewRanges();
		for (let k = j - 1; k >= 0; k--) {
			ranges = ranges.map(r => editEntries[k].edit.edit.applyToOffsetRange(r));
		}
		allFocalRanges.push(...ranges);
	}

	return {
		id: mostRecent.docId,
		content,
		focalRanges: allFocalRanges.length > 0 ? allFocalRanges : undefined,
		editEntryCount: Math.max(editEntries.length, 1),
	};
}

/**
 * Append language context snippets to the snippets array, respecting the token budget.
 */
function appendLanguageContextSnippets(
	langCtx: LanguageContextResponse,
	snippets: string[],
	tokenBudget: number,
	computeTokens: (code: string) => number,
	includeLineNumbers: xtabPromptOptions.IncludeLineNumbersOption,
): void {
	for (const langCtxEntry of langCtx.items) {
		// Context which is provided on timeout is not guranteed to be good context
		// TODO should these be included?
		if (langCtxEntry.onTimeout) {
			continue;
		}

		const ctx = langCtxEntry.context;
		// TODO@ulugbekna: currently we only include snippets
		// TODO@ulugbekna: are the snippets sorted by priority?
		if (ctx.kind === ContextKind.Snippet) {
			const langCtxSnippet = ctx.value;
			const potentialBudget = tokenBudget - computeTokens(langCtxSnippet);
			if (potentialBudget < 0) {
				break;
			}
			const documentId = DocumentId.create(ctx.uri.toString());
			snippets.push(formatCodeSnippet(documentId, langCtxSnippet.split(/\r?\n/), { truncated: false, includeLineNumbers, startLineOffset: 0 }));
			tokenBudget = potentialBudget;
		}
	}
}

/**
 * Clip a file without visible ranges by taking pages from the start until budget is exhausted.
 *
 * @returns The remaining token budget after clipping.
 */
function clipFullDocument(
	document: { id: DocumentId; content: StringText },
	pages: Iterable<string[]>,
	totalLineCount: number,
	tokenBudget: number,
	computeTokens: (s: string) => number,
	includeLineNumbers: xtabPromptOptions.IncludeLineNumbersOption,
	result: { snippets: string[]; docsInPrompt: Set<DocumentId> },
): number {
	let allowedBudget = tokenBudget;
	const linesToKeep: string[] = [];

	for (const page of pages) {
		const allowedBudgetLeft = allowedBudget - countTokensForLines(page, computeTokens);
		if (allowedBudgetLeft < 0) {
			break;
		}
		linesToKeep.push(...page);
		allowedBudget = allowedBudgetLeft;
	}

	if (linesToKeep.length > 0) {
		const isTruncated = linesToKeep.length !== totalLineCount;
		result.docsInPrompt.add(document.id);
		result.snippets.push(formatCodeSnippet(document.id, linesToKeep, { truncated: isTruncated, includeLineNumbers, startLineOffset: 0 }));
	}

	return allowedBudget;
}

/**
 * Compute the token cost of the focal pages for a file — the minimum tokens
 * needed to include just the pages that contain the focal ranges.
 *
 * Returns `undefined` when there are no usable focal ranges.
 */
export function computeFocalPageCost(
	content: StringText,
	focalRanges: readonly OffsetRange[],
	pageSize: number,
	computeTokens: (s: string) => number,
): number | undefined {
	const contentTransform = content.getTransformer();
	const maxFocalSpanLines = pageSize * 3;
	const capped = selectFocalRangesWithinSpanCap(
		focalRanges,
		offset => contentTransform.getPosition(offset).lineNumber,
		maxFocalSpanLines,
	);

	if (capped.length === 0) {
		return undefined;
	}

	const startOffset = Math.min(...capped.map(r => r.start));
	const endOffset = Math.max(...capped.map(r => r.endExclusive - 1));
	const startLine = contentTransform.getPosition(startOffset).lineNumber;
	const endLine = contentTransform.getPosition(endOffset).lineNumber;

	const lines = content.getLines();
	const firstPageIdx = Math.floor((startLine - 1) / pageSize);
	const lastPageIdxIncl = Math.floor((endLine - 1) / pageSize);

	let cost = 0;
	for (let p = firstPageIdx; p <= lastPageIdxIncl; p++) {
		const start = p * pageSize;
		const end = Math.min(start + pageSize, lines.length);
		cost += countTokensForLines(lines.slice(start, end), computeTokens);
	}
	return cost;
}

/**
 * Clip a file around its focal ranges (visible ranges or edit locations)
 * by expanding pages outward until budget is exhausted.
 *
 * The focal range span is capped to avoid blowing up the initial page
 * coverage when edits are spread across the file. Newer focal ranges
 * (earlier in the array) are prioritized over older ones.
 *
 * @returns The remaining token budget after clipping, or `undefined` if nothing fit into the budget.
 */
function clipAroundFocalRanges(
	document: { id: DocumentId; content: StringText; focalRanges: readonly OffsetRange[] },
	pageSize: number,
	totalLineCount: number,
	tokenBudget: number,
	computeTokens: (s: string) => number,
	includeLineNumbers: xtabPromptOptions.IncludeLineNumbersOption,
	result: { snippets: string[]; docsInPrompt: Set<DocumentId> },
): number | undefined {
	if (tokenBudget <= 0) {
		return undefined;
	}

	const contentTransform = document.content.getTransformer();

	// Limit focal range span so that wide-scatter edits don't consume
	// the entire budget on the initial pages alone.
	const maxFocalSpanLines = pageSize * 3;
	const focalRanges = selectFocalRangesWithinSpanCap(
		document.focalRanges,
		offset => contentTransform.getPosition(offset).lineNumber,
		maxFocalSpanLines,
	);

	if (focalRanges.length === 0) {
		return tokenBudget;
	}

	const startOffset = Math.min(...focalRanges.map(range => range.start));
	const endOffset = Math.max(...focalRanges.map(range => range.endExclusive - 1));
	const startPos = contentTransform.getPosition(startOffset);
	const endPos = contentTransform.getPosition(endOffset);

	const { firstPageIdx, lastPageIdxIncl, budgetLeft } = expandRangeToPageRange(
		document.content.getLines(),
		new OffsetRange(startPos.lineNumber - 1 /* convert from 1-based to 0-based */, endPos.lineNumber),
		pageSize,
		tokenBudget,
		computeTokens,
		false
	);

	if (budgetLeft === tokenBudget) {
		return undefined; // nothing fit — signal caller to stop
	}

	// If the focal pages alone exceed the budget (negative budgetLeft from
	// expandRangeToPageRange), skip this file rather than silently overshooting.
	if (budgetLeft < 0) {
		return undefined;
	}

	const startLineOffset = firstPageIdx * pageSize;
	const linesToKeep = document.content.getLines().slice(startLineOffset, (lastPageIdxIncl + 1) * pageSize);
	result.docsInPrompt.add(document.id);
	result.snippets.push(formatCodeSnippet(document.id, linesToKeep, { truncated: linesToKeep.length < totalLineCount, includeLineNumbers, startLineOffset }));
	return budgetLeft;
}

/**
 * Build code snippets using paged clipping.
 *
 * @param recentlyViewedCodeSnippets List of recently viewed code snippets from most to least recent
 */
export function buildCodeSnippetsUsingPagedClipping(
	recentlyViewedCodeSnippets: RecentCodeSnippet[],
	computeTokens: (s: string) => number,
	opts: PromptOptions,
): { snippets: string[]; docsInPrompt: Set<DocumentId> } {

	const pageSize = opts.pagedClipping?.pageSize;
	if (pageSize === undefined) {
		throw illegalArgument('Page size must be defined');
	}

	const clippingStrategy = opts.recentlyViewedDocuments.clippingStrategy;

	if (clippingStrategy === RecentFileClippingStrategy.Proportional) {
		return buildCodeSnippetsWithProportionalBudget(recentlyViewedCodeSnippets, computeTokens, opts, pageSize);
	}

	return buildCodeSnippetsGreedy(recentlyViewedCodeSnippets, computeTokens, opts, pageSize, clippingStrategy);
}

/**
 * Greedy (most-recent-first) code snippet building. Used for `TopToBottom` and `AroundEditRange` strategies.
 */
function buildCodeSnippetsGreedy(
	recentlyViewedCodeSnippets: RecentCodeSnippet[],
	computeTokens: (s: string) => number,
	opts: PromptOptions,
	pageSize: number,
	clippingStrategy: RecentFileClippingStrategy,
): { snippets: string[]; docsInPrompt: Set<DocumentId> } {

	const result: { snippets: string[]; docsInPrompt: Set<DocumentId> } = {
		snippets: [],
		docsInPrompt: new Set<DocumentId>(),
	};

	let maxTokenBudget = opts.recentlyViewedDocuments.maxTokens;
	const includeLineNumbers = opts.recentlyViewedDocuments.includeLineNumbers;

	for (const file of recentlyViewedCodeSnippets) {
		const lines = file.content.getLines();

		// When strategy is AroundEditRange and we have focalRanges (from edits or visible ranges),
		// center the clip around those ranges instead of truncating from top.
		const useFocalRanges = clippingStrategy !== RecentFileClippingStrategy.TopToBottom && file.focalRanges !== undefined;

		if (useFocalRanges) {
			const budgetLeft = clipAroundFocalRanges(
				file as { id: DocumentId; content: StringText; focalRanges: readonly OffsetRange[] },
				pageSize, lines.length, maxTokenBudget, computeTokens, includeLineNumbers, result
			);
			if (budgetLeft === undefined) {
				break;
			}
			maxTokenBudget = budgetLeft;
		} else {
			const pages = batchArrayElements(lines, pageSize);
			maxTokenBudget = clipFullDocument(file, pages, lines.length, maxTokenBudget, computeTokens, includeLineNumbers, result);
		}
	}

	return { snippets: result.snippets.reverse(), docsInPrompt: result.docsInPrompt };
}

/**
 * Two-pass proportional budget allocation:
 * 1. Compute the minimum focal page cost for each file and determine which files
 *    can be included within the total budget. When files must be dropped, the
 *    oldest (last in the most-recent-first input order) are dropped first.
 * 2. Distribute the remaining budget proportionally (by edit-entry-count weight)
 *    across included files for page expansion around their focal ranges.
 */
function buildCodeSnippetsWithProportionalBudget(
	recentlyViewedCodeSnippets: RecentCodeSnippet[],
	computeTokens: (s: string) => number,
	opts: PromptOptions,
	pageSize: number,
): { snippets: string[]; docsInPrompt: Set<DocumentId> } {

	const result: { snippets: string[]; docsInPrompt: Set<DocumentId> } = {
		snippets: [],
		docsInPrompt: new Set<DocumentId>(),
	};

	const totalBudget = opts.recentlyViewedDocuments.maxTokens;
	const includeLineNumbers = opts.recentlyViewedDocuments.includeLineNumbers;

	if (recentlyViewedCodeSnippets.length === 0) {
		return { snippets: [], docsInPrompt: new Set() };
	}

	// --- Pass 1: compute minimum focal costs ---
	const focalCosts = recentlyViewedCodeSnippets.map(file =>
		file.focalRanges !== undefined && file.focalRanges.length > 0
			? computeFocalPageCost(file.content, file.focalRanges, pageSize, computeTokens) ?? 0
			: 0
	);

	// Determine which files to include. Input is ordered most-recent-first,
	// so we drop from the end (oldest) when focal minimums exceed the budget.
	let includedCount = recentlyViewedCodeSnippets.length;
	let sumFocalCosts = focalCosts.reduce((a, b) => a + b, 0);
	while (includedCount > 0 && sumFocalCosts > totalBudget) {
		includedCount--;
		sumFocalCosts -= focalCosts[includedCount];
	}

	if (includedCount === 0) {
		return { snippets: [], docsInPrompt: new Set() };
	}

	// --- Pass 2: distribute expansion budget proportionally ---
	const expansionBudget = totalBudget - sumFocalCosts;

	const weights = recentlyViewedCodeSnippets.slice(0, includedCount).map(f => f.editEntryCount ?? 1);
	const totalWeight = weights.reduce((sum, w) => sum + w, 0);

	// Per-file expansion shares, proportional to edit-entry weight
	const expansionShares = weights.map(w => Math.floor(expansionBudget * (w / totalWeight)));

	let unspentBudget = 0;

	for (let i = 0; i < includedCount; i++) {
		const file = recentlyViewedCodeSnippets[i];
		const lines = file.content.getLines();
		// Each file's budget = guaranteed focal cost + proportional expansion share + carry-forward
		const effectiveBudget = focalCosts[i] + expansionShares[i] + unspentBudget;

		if (file.focalRanges !== undefined && file.focalRanges.length > 0) {
			const budgetLeft = clipAroundFocalRanges(
				file as { id: DocumentId; content: StringText; focalRanges: readonly OffsetRange[] },
				pageSize, lines.length, effectiveBudget, computeTokens, includeLineNumbers, result
			);
			unspentBudget = budgetLeft ?? effectiveBudget;
		} else {
			const pages = batchArrayElements(lines, pageSize);
			unspentBudget = clipFullDocument(file, pages, lines.length, effectiveBudget, computeTokens, includeLineNumbers, result);
		}
	}

	return { snippets: result.snippets.reverse(), docsInPrompt: result.docsInPrompt };
}

