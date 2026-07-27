/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { LanguageContextResponse } from '../../../platform/inlineEdits/common/dataTypes/languageContext';
import { PromptSectionTokenCounts } from '../../../platform/inlineEdits/common/dataTypes/promptSectionTokens';
import * as xtabPromptOptions from '../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { AggressivenessLevel, CurrentFileOptions, GlobalBudgetOptions, PromptingStrategy, PromptOptions } from '../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { StatelessNextEditDocument } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { IXtabHistoryEntry } from '../../../platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { ContextKind, TraitContext } from '../../../platform/languageServer/common/languageContextService';
import { Result } from '../../../util/common/result';
import { range } from '../../../util/vs/base/common/arrays';
import { assertNever, softAssert } from '../../../util/vs/base/common/assert';
import { StringEdit, StringReplacement } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { getEditDiffHistory } from './diffHistoryForPrompt';
import { LintErrors } from './lintErrors';
import { countTokensForLines, toUniquePath } from './promptCraftingUtils';
import { appendLanguageContextSnippets, appendNeighborFileSnippets, AppendNeighborFileSnippetsResult, buildCodeSnippetsUsingPagedClipping, getRecentCodeSnippets, prepareRecentCodeSnippets, RecentlyViewedSubsectionSnippets } from './recentFilesForPrompt';
import { INeighborFileSnippet } from './similarFilesContextService';
import { PromptTags } from './tags';
import { CurrentDocument } from './xtabCurrentDocument';

export class PromptPieces {
	constructor(
		public readonly currentDocument: CurrentDocument,
		public readonly editWindowLinesRange: OffsetRange,
		public readonly areaAroundEditWindowLinesRange: OffsetRange,
		public readonly activeDoc: StatelessNextEditDocument,
		public readonly xtabHistory: readonly IXtabHistoryEntry[],
		public readonly taggedCurrentDocLines: readonly string[],
		public readonly areaAroundCodeToEdit: string,
		public readonly langCtx: LanguageContextResponse | undefined,
		public readonly aggressivenessLevel: AggressivenessLevel,
		public readonly lintErrors: LintErrors,
		public readonly computeTokens: (s: string) => number,
		public readonly opts: PromptOptions,
		public readonly neighborSnippets?: readonly INeighborFileSnippet[],
		/**
		 * A cascade result computed by the caller (the provider, which runs the
		 * cascade first so it can clip `currentFile` last to `currentFileBudget +
		 * finalSurplus`). When provided, {@link getUserPrompt} renders these
		 * snippets instead of running the cascade itself, guaranteeing the surplus
		 * used to size the current file matches the snippets that end up in the
		 * prompt. Only honored when `opts.globalBudget` is set.
		 */
		public readonly precomputedCascade?: CascadeResult,
	) {
	}
}

export interface UserPromptResult {
	readonly prompt: string;
	readonly nDiffsInPrompt: number;
	readonly neighborSnippetsResult: AppendNeighborFileSnippetsResult | undefined;
	/**
	 * Approximate per-section token counts for the user prompt. `systemPrompt` is
	 * left at 0 here (the system message is not part of the user prompt) and is
	 * filled in by the provider.
	 */
	readonly sectionTokens: PromptSectionTokenCounts;
}

export function getUserPrompt(promptPieces: PromptPieces): UserPromptResult {

	const { activeDoc, xtabHistory, taggedCurrentDocLines, areaAroundCodeToEdit, langCtx, aggressivenessLevel, lintErrors, computeTokens, opts, neighborSnippets, precomputedCascade } = promptPieces;
	const currentFileContent = taggedCurrentDocLines.join('\n');

	let recentlyViewedCodeSnippets: string;
	let recentlyViewedSubsections: RecentlyViewedSubsectionSnippets;
	let docsInPrompt: Set<DocumentId>;
	let neighborSnippetsResult: AppendNeighborFileSnippetsResult | undefined;
	let editDiffHistory: string;
	let nDiffsInPrompt: number;

	if (opts.globalBudget !== undefined) {
		// Reuse a cascade the caller already ran (the provider runs it first so it can
		// clip the current file last from `finalSurplus`), or run it now for callers
		// that set a global budget without precomputing (e.g. tests).
		const cascade = precomputedCascade ?? runGlobalBudgetCascade(activeDoc, xtabHistory, langCtx, computeTokens, opts, neighborSnippets, opts.globalBudget);
		recentlyViewedCodeSnippets = cascade.codeSnippets;
		recentlyViewedSubsections = cascade.subsections;
		docsInPrompt = cascade.documents;
		neighborSnippetsResult = cascade.neighborSnippetsResult;
		editDiffHistory = cascade.editDiffHistory;
		nDiffsInPrompt = cascade.nDiffsInPrompt;
	} else {
		const r = getRecentCodeSnippets(activeDoc, xtabHistory, langCtx, computeTokens, opts, neighborSnippets);
		recentlyViewedCodeSnippets = r.codeSnippets;
		recentlyViewedSubsections = r.subsections;
		docsInPrompt = r.documents;
		neighborSnippetsResult = r.neighborSnippetsResult;

		docsInPrompt.add(activeDoc.id); // Add active document to the set of documents in prompt

		const diff = getEditDiffHistory(activeDoc, xtabHistory, docsInPrompt, computeTokens, opts.diffHistory);
		editDiffHistory = diff.promptPiece;
		nDiffsInPrompt = diff.nDiffs;
	}

	const relatedInformation = getRelatedInformation(langCtx);

	const currentFilePath = toUniquePath(activeDoc.id, activeDoc.workspaceRoot?.path);

	const postScript = promptPieces.opts.includePostScript ? getPostScript(opts.promptingStrategy, currentFilePath, aggressivenessLevel) : '';

	const lintsWithNewLinePadding = opts.lintOptions ? `\n${lintErrors.getFormattedLintErrors(opts.lintOptions)}\n` : '';

	// Build each rendered section string exactly once and assemble `basePrompt`
	// from those same locals, so the per-section token counts below are derived
	// from the identical text that goes into the prompt (single source of truth,
	// no rebuild and no drift). `areaAroundCodeToEdit`/`cursorLocation` are
	// mutually exclusive and appended per-strategy below.
	const recentFilesSection = `${PromptTags.RECENT_FILES.start}\n${recentlyViewedCodeSnippets}\n${PromptTags.RECENT_FILES.end}`;
	const currentFileSection = `${PromptTags.CURRENT_FILE.start}\ncurrent_file_path: ${currentFilePath}\n${currentFileContent}\n${PromptTags.CURRENT_FILE.end}`;
	const editHistorySection = `${PromptTags.EDIT_HISTORY.start}\n${editDiffHistory}\n${PromptTags.EDIT_HISTORY.end}`;

	const basePrompt = `${recentFilesSection}\n\n${currentFileSection}\n${lintsWithNewLinePadding}\n${editHistorySection}`;

	let mainPrompt: string;
	let cursorLocationSection = '';
	let areaAroundSection = '';
	switch (opts.promptingStrategy) {
		case PromptingStrategy.PatchBased01:
			mainPrompt = basePrompt;
			break;
		case PromptingStrategy.PatchBased02:
		case PromptingStrategy.PatchBased02WithRecentLineNumbers:
		case PromptingStrategy.PatchBased02WithoutRecentLineNumbers: {
			const currentDocument = promptPieces.currentDocument;
			const cursorLine = currentDocument.lineWithCursor();
			const cursorLineWithTag = cursorLine.substring(0, currentDocument.cursorPosition.column - 1) + PromptTags.CURSOR + cursorLine.substring(currentDocument.cursorPosition.column - 1);
			const lineNumberZeroBased = currentDocument.cursorPosition.lineNumber - 1;
			let lineNumbering: string;
			switch (opts.currentFile.includeLineNumbers) {
				case xtabPromptOptions.IncludeLineNumbersOption.WithSpaceAfter:
					lineNumbering = `${lineNumberZeroBased}| `;
					break;
				case xtabPromptOptions.IncludeLineNumbersOption.WithoutSpace:
					lineNumbering = `${lineNumberZeroBased}|`;
					break;
				case xtabPromptOptions.IncludeLineNumbersOption.None:
					lineNumbering = '';
					break;
				default:
					assertNever(opts.currentFile.includeLineNumbers);
			}
			const lineWithCursorSnippet = [
				PromptTags.CURSOR_LOCATION.start,
				`${lineNumbering}${cursorLineWithTag}`,
				PromptTags.CURSOR_LOCATION.end
			].join('\n');
			cursorLocationSection = lineWithCursorSnippet;
			mainPrompt = basePrompt + `\n\n${lineWithCursorSnippet}`;
			break;
		}
		default:
			areaAroundSection = areaAroundCodeToEdit;
			mainPrompt = basePrompt + `\n\n${areaAroundCodeToEdit}`;
			break;
	}

	const includeBackticks = opts.promptingStrategy !== PromptingStrategy.Nes41Miniv3 &&
		opts.promptingStrategy !== PromptingStrategy.Codexv21NesUnified &&
		opts.promptingStrategy !== PromptingStrategy.PatchBased01 &&
		opts.promptingStrategy !== PromptingStrategy.PatchBased02 &&
		opts.promptingStrategy !== PromptingStrategy.PatchBased02WithRecentLineNumbers &&
		opts.promptingStrategy !== PromptingStrategy.PatchBased02WithoutRecentLineNumbers;

	const packagedPrompt = includeBackticks ? wrapInBackticks(mainPrompt) : mainPrompt;
	const packagedPromptWithRelatedInfo = addRelatedInformation(relatedInformation, packagedPrompt, opts.languageContext.traitPosition);
	const prompt = packagedPromptWithRelatedInfo + postScript;

	const trimmedPrompt = prompt.trim();

	const recentlyViewedTokens = computeTokens(recentFilesSection);
	const currentFileTokens = computeTokens(currentFileSection);
	const lintErrorsTokens = computeTokens(lintsWithNewLinePadding);
	const editHistoryTokens = computeTokens(editHistorySection);
	const areaAroundCodeToEditTokens = computeTokens(areaAroundSection);
	const cursorLocationTokens = computeTokens(cursorLocationSection);
	const relatedInformationTokens = computeTokens(relatedInformation);
	const postScriptTokens = computeTokens(postScript);
	const userPromptTotalTokens = computeTokens(trimmedPrompt);
	const sectionsSum = recentlyViewedTokens + currentFileTokens + lintErrorsTokens + editHistoryTokens + areaAroundCodeToEditTokens + cursorLocationTokens + relatedInformationTokens + postScriptTokens;
	const sectionTokens: PromptSectionTokenCounts = {
		recentlyViewed: recentlyViewedTokens,
		currentFile: currentFileTokens,
		lintErrors: lintErrorsTokens,
		editHistory: editHistoryTokens,
		areaAroundCodeToEdit: areaAroundCodeToEditTokens,
		cursorLocation: cursorLocationTokens,
		relatedInformation: relatedInformationTokens,
		postScript: postScriptTokens,
		overhead: userPromptTotalTokens - sectionsSum,
		userPromptTotal: userPromptTotalTokens,
		systemPrompt: 0,
		recentlyViewedSubsections: {
			recentlyViewedFiles: computeTokens(recentlyViewedSubsections.recentlyViewedFiles),
			languageContext: computeTokens(recentlyViewedSubsections.languageContext),
			neighborFiles: computeTokens(recentlyViewedSubsections.neighborFiles),
		},
	};

	return { prompt: trimmedPrompt, nDiffsInPrompt, neighborSnippetsResult, sectionTokens };
}

export interface CascadeResult {
	readonly codeSnippets: string;
	readonly documents: Set<DocumentId>;
	readonly neighborSnippetsResult: AppendNeighborFileSnippetsResult | undefined;
	readonly editDiffHistory: string;
	readonly nDiffsInPrompt: number;
	/** Per-source breakdown of {@link codeSnippets} for per-subsection token reporting. */
	readonly subsections: RecentlyViewedSubsectionSnippets;
	/**
	 * Budget left unused after the last part in `order` ran. The provider adds it
	 * to the current file's clip budget (`currentFileBudget + finalSurplus`) so the
	 * current file, which is clipped last, reuses whatever the cascade left unused.
	 */
	readonly finalSurplus: number;
}

/**
 * Single-pool budget cascade across prompt parts, modeled after completions-core's
 * `CascadingPromptFactory`. For each part in `globalBudget.order`, allocate
 * `surplus + totalTokens * shares[part]` and run that sub-builder with the override.
 * Unspent budget cascades to the next part.
 *
 * The cascade starts with surplus `0` and renders only the parts in `order`.
 * `currentFile` is not rendered here (it is clipped separately by the caller) and
 * `lintOptions` is excluded entirely; both keep their own per-part caps for
 * clipping. Whatever budget is unused after the last part is returned as
 * {@link CascadeResult.finalSurplus}; the provider adds it to the current file's
 * clip budget so the current file reuses the leftover (it is clipped last).
 *
 * Sub-builders are invoked using existing helpers so behavior of each individual
 * part is unchanged. Each sub-builder reports `tokensConsumed` using the same
 * internal accounting it uses to make budget decisions (paged-clipping line cost,
 * raw-snippet cost for appenders, diff-entry cost for history). The cascade uses
 * that reported value to compute `surplus`, which keeps the cascade aligned with
 * how each part actually charges against its budget.
 */
export function runGlobalBudgetCascade(
	activeDoc: StatelessNextEditDocument,
	xtabHistory: readonly IXtabHistoryEntry[],
	langCtx: LanguageContextResponse | undefined,
	computeTokens: (s: string) => number,
	opts: PromptOptions,
	neighborSnippets: readonly INeighborFileSnippet[] | undefined,
	globalBudget: GlobalBudgetOptions,
): CascadeResult {
	GlobalBudgetOptions.validate(globalBudget);

	const recentlyViewedSnippets: string[] = [];
	const langCtxSnippets: string[] = [];
	const neighborOutSnippets: string[] = [];
	const docsInPrompt = new Set<DocumentId>();
	docsInPrompt.add(activeDoc.id);

	let neighborSnippetsResult: AppendNeighborFileSnippetsResult | undefined;
	let editDiffHistory = '';
	let nDiffsInPrompt = 0;

	const preparedRecent = prepareRecentCodeSnippets(activeDoc, xtabHistory, opts);

	let surplus = 0;
	for (const part of globalBudget.order) {
		const share = globalBudget.shares[part] ?? 0;
		const budget = Math.max(0, Math.floor(surplus + globalBudget.totalTokens * share));
		let tokensConsumed = 0;
		switch (part) {
			case 'recentlyViewedDocuments': {
				const overridden: PromptOptions = {
					...opts,
					recentlyViewedDocuments: { ...opts.recentlyViewedDocuments, maxTokens: budget },
				};
				const r = buildCodeSnippetsUsingPagedClipping(preparedRecent, computeTokens, overridden);
				recentlyViewedSnippets.push(...r.snippets);
				r.docsInPrompt.forEach(d => docsInPrompt.add(d));
				tokensConsumed = r.tokensConsumed;
				break;
			}
			case 'languageContext': {
				if (langCtx) {
					tokensConsumed = appendLanguageContextSnippets(langCtx, langCtxSnippets, budget, computeTokens);
				}
				break;
			}
			case 'neighborFiles': {
				if (opts.neighborFiles.enabled && neighborSnippets && neighborSnippets.length > 0) {
					neighborSnippetsResult = appendNeighborFileSnippets(neighborSnippets, neighborOutSnippets, docsInPrompt, budget, computeTokens, opts.recentlyViewedDocuments.includeLineNumbers);
					tokensConsumed = neighborSnippetsResult.tokensConsumed;
				}
				break;
			}
			case 'diffHistory': {
				const overriddenDiff = { ...opts.diffHistory, maxTokens: budget };
				const r = getEditDiffHistory(activeDoc, xtabHistory, docsInPrompt, computeTokens, overriddenDiff);
				editDiffHistory = r.promptPiece;
				nDiffsInPrompt = r.nDiffs;
				tokensConsumed = r.totalTokens;
				break;
			}
			default:
				assertNever(part);
		}
		// The conservation guarantee (current file + cascade <= totalTokens) relies
		// on every sub-builder reporting `0 <= tokensConsumed <= budget`. Surface a
		// violation (never silently clamp `tokensConsumed` down — that would hide
		// real overspend and let the prompt exceed the pool).
		softAssert(tokensConsumed >= 0 && tokensConsumed <= budget, `globalBudget part '${part}' reported tokensConsumed=${tokensConsumed} outside [0, ${budget}]`);
		surplus = Math.max(0, budget - tokensConsumed);
	}

	const codeSnippets = [...recentlyViewedSnippets, ...langCtxSnippets, ...neighborOutSnippets].join('\n\n');

	return {
		codeSnippets,
		documents: docsInPrompt,
		neighborSnippetsResult,
		editDiffHistory,
		nDiffsInPrompt,
		subsections: {
			recentlyViewedFiles: recentlyViewedSnippets.join('\n\n'),
			languageContext: langCtxSnippets.join('\n\n'),
			neighborFiles: neighborOutSnippets.join('\n\n'),
		},
		finalSurplus: surplus,
	};
}

function wrapInBackticks(content: string) {
	return `\`\`\`\n${content}\n\`\`\``;
}

function addRelatedInformation(relatedInformation: string, prompt: string, position: 'before' | 'after'): string {
	if (position === 'before') {
		return appendWithNewLineIfNeeded(relatedInformation, prompt, 2);
	}
	return appendWithNewLineIfNeeded(prompt, relatedInformation, 2);
}

function appendWithNewLineIfNeeded(base: string, toAppend: string, minNewLines: number): string {
	// Count existing newlines at the end of base and start of toAppend
	let existingNewLines = 0;
	for (let i = base.length - 1; i >= 0 && base[i] === '\n'; i--) {
		existingNewLines++;
	}
	for (let i = 0; i < toAppend.length && toAppend[i] === '\n'; i++) {
		existingNewLines++;
	}

	// Add newlines to reach the minimum required
	const newLinesToAdd = Math.max(0, minNewLines - existingNewLines);
	return (base + '\n'.repeat(newLinesToAdd) + toAppend).trim();
}

function getPostScript(strategy: PromptingStrategy | undefined, currentFilePath: string, aggressivenessLevel: AggressivenessLevel) {
	const xtab275BasePostScript = `The developer was working on a section of code within the tags \`code_to_edit\` in the file located at \`${currentFilePath}\`. Using the given \`recently_viewed_code_snippets\`, \`current_file_content\`, \`edit_diff_history\`, \`area_around_code_to_edit\`, and the cursor position marked as \`${PromptTags.CURSOR}\`, please continue the developer's work. Update the \`code_to_edit\` section by predicting and completing the changes they would have made next. Provide the revised code that was between the \`${PromptTags.EDIT_WINDOW.start}\` and \`${PromptTags.EDIT_WINDOW.end}\` tags, but do not include the tags themselves. Avoid undoing or reverting the developer's last change unless there are obvious typos or errors. Don't include the line numbers or the form #| in your response. Do not skip any lines. Do not be lazy.`;

	let postScript: string | undefined;
	switch (strategy) {
		case PromptingStrategy.PatchBased01:
		case PromptingStrategy.Codexv21NesUnified:
			break;
		case PromptingStrategy.PatchBased02:
		case PromptingStrategy.PatchBased02WithRecentLineNumbers:
		case PromptingStrategy.PatchBased02WithoutRecentLineNumbers:
			postScript = `The developer was working on a section of code within the \`current_file_content\` - carefully note their \`cursor_location\` marked with \`<|cursor|>\`. Using the given \`recently_viewed_code_snippets\`, \`current_file_content\`, \`edit_diff_history\`, and \`cursor_location\`, please continue the developer's work. Output a modified diff format with a sequence of intuitive next changes, where each patch must start with \`<filename>:<line number>\`. Order changes by priority and flow; for instance, edits adjacent to the user's cursor should always be prioritized, followed by lines near the cursor, followed by lines farther away. If there are no good edit candidates, output the empty string "". Avoid undoing or reverting the developer's last change unless there are obvious typos or errors. Adhere meticulously to the diff format.`;
			break;
		case PromptingStrategy.UnifiedModel:
			postScript = `The developer was working on a section of code within the tags \`code_to_edit\` in the file located at \`${currentFilePath}\`. Using the given \`recently_viewed_code_snippets\`, \`current_file_content\`, \`edit_diff_history\`, \`area_around_code_to_edit\`, and the cursor position marked as \`${PromptTags.CURSOR}\`, please continue the developer's work. Update the \`code_to_edit\` section by predicting and completing the changes they would have made next. Start your response with <EDIT>, <INSERT>, or <NO_CHANGE>. If you are making an edit, start with <EDIT> and then provide the rewritten code window followed by </EDIT>. If you are inserting new code, start with <INSERT> and then provide only the new code that will be inserted at the cursor position followed by </INSERT>. If no changes are necessary, reply only with <NO_CHANGE>. Avoid undoing or reverting the developer's last change unless there are obvious typos or errors.`;
			break;
		case PromptingStrategy.Nes41Miniv3:
			postScript = `The developer was working on a section of code within the tags <|code_to_edit|> in the file located at \`${currentFilePath}\`. Using the given \`recently_viewed_code_snippets\`, \`current_file_content\`, \`edit_diff_history\`, \`area_around_code_to_edit\`, and the cursor position marked as \`<|cursor|>\`, please continue the developer's work. Update the <|code_to_edit|> section by predicting and completing the changes they would have made next. Start your response with <EDIT> or <NO_CHANGE>. If you are making an edit, start with <EDIT> and then provide the rewritten code window followed by </EDIT>. If no changes are necessary, reply only with <NO_CHANGE>. Avoid undoing or reverting the developer's last change unless there are obvious typos or errors.`;
			break;
		case PromptingStrategy.Xtab275EditIntentShort:
		case PromptingStrategy.Xtab275EditIntent:
		case PromptingStrategy.Xtab275:
			postScript = xtab275BasePostScript;
			break;
		case PromptingStrategy.XtabAggressiveness:
			postScript = `<|aggressive|>${aggressivenessLevel}<|/aggressive|>`;
			break;
		case PromptingStrategy.Xtab275Aggressiveness:
			postScript = `${xtab275BasePostScript}\n<|aggressive|>${aggressivenessLevel}<|/aggressive|>`;
			break;
		case PromptingStrategy.Xtab275AggressivenessHighLow:
			postScript = aggressivenessLevel === AggressivenessLevel.Medium
				? xtab275BasePostScript
				: `${xtab275BasePostScript}\n<|aggressive|>${aggressivenessLevel}<|/aggressive|>`;
			break;
		case PromptingStrategy.PatchBased:
			postScript = `Output a modified diff style format with the changes you want. Each change patch must start with \`<filename>:<line number>\` and then include some non empty "anchor lines" preceded by \`-\` and the new lines meant to replace them preceded by \`+\`. Put your changes in the order that makes the most sense, for example edits inside the code_to_edit region and near the user's <|cursor|> should always be prioritized. Output "<NO_EDIT>" if you don't have a good edit candidate.`;
			break;
		case PromptingStrategy.SimplifiedSystemPrompt:
		case PromptingStrategy.CopilotNesXtab:
		case undefined:
			postScript = `The developer was working on a section of code within the tags \`code_to_edit\` in the file located at \`${currentFilePath}\`. \
Using the given \`recently_viewed_code_snippets\`, \`current_file_content\`, \`edit_diff_history\`, \`area_around_code_to_edit\`, and the cursor \
position marked as \`${PromptTags.CURSOR}\`, please continue the developer's work. Update the \`code_to_edit\` section by predicting and completing the changes \
they would have made next. Provide the revised code that was between the \`${PromptTags.EDIT_WINDOW.start}\` and \`${PromptTags.EDIT_WINDOW.end}\` tags with the following format, but do not include the tags themselves.
\`\`\`
// Your revised code goes here
\`\`\``;
			break;
		default:
			assertNever(strategy);
	}

	const formattedPostScript = postScript === undefined ? '' : `\n\n${postScript}`;
	return formattedPostScript;
}

function getRelatedInformation(langCtx: LanguageContextResponse | undefined): string {
	if (langCtx === undefined) {
		return '';
	}

	const traits = langCtx.items
		.filter(ctx => ctx.context.kind === ContextKind.Trait)
		.map(t => t.context) as TraitContext[];

	if (traits.length === 0) {
		return '';
	}

	const relatedInformation: string[] = [];
	for (const trait of traits) {
		relatedInformation.push(`${trait.name}: ${trait.value}`);
	}

	return `Consider this related information:\n${relatedInformation.join('\n')}`;
}

export function truncateCode(
	lines: string[],
	fromBeginning: boolean,
	maxTokens: number
): [number, number] {
	if (!lines.length) {
		return [0, 0];
	}

	const allowedLength = maxTokens * 4;
	let totalLength = 0;
	let i = fromBeginning ? lines.length - 1 : 0;

	while (totalLength < allowedLength) {
		totalLength += lines[i].length + 1; // +1 for \n
		if (fromBeginning) {
			i--;
			if (i < 0) {
				break;
			}
		} else {
			i++;
			if (i >= lines.length) {
				break;
			}
		}
	}

	if (fromBeginning) {
		return [i + 1, lines.length];
	} else {
		return [0, i];
	}
}

export const N_LINES_ABOVE = 2;
export const N_LINES_BELOW = 5;

export const N_LINES_AS_CONTEXT = 15;

export function expandRangeToPageRange(
	currentDocLines: string[],
	areaAroundEditWindowLinesRange: OffsetRange,
	pageSize: number,
	maxTokens: number,
	computeTokens: (s: string) => number,
	prioritizeAboveCursor: boolean,
	useLeftoverBudgetFromAbove: boolean,
): { firstPageIdx: number; lastPageIdxIncl: number; budgetLeft: number } {

	const totalNOfPages = Math.ceil(currentDocLines.length / pageSize);

	function computeTokensForPage(kthPage: number) {
		const start = kthPage * pageSize;
		const end = Math.min(start + pageSize, currentDocLines.length);
		const page = currentDocLines.slice(start, end);
		return countTokensForLines(page, computeTokens);
	}

	// [0, pageSize) -> 0, [pageSize, 2*pageSize) -> 1, ...
	// eg 5 -> 0, 63 -> 6
	let firstPageIdx = Math.floor(areaAroundEditWindowLinesRange.start / pageSize);
	let lastPageIdxIncl = Math.floor((areaAroundEditWindowLinesRange.endExclusive - 1) / pageSize);

	const availableTokenBudget = maxTokens - range(firstPageIdx, lastPageIdxIncl + 1).reduce((sum, idx) => sum + computeTokensForPage(idx), 0);
	if (availableTokenBudget < 0) {
		return { firstPageIdx, lastPageIdxIncl, budgetLeft: availableTokenBudget };
	}

	let tokenBudget = availableTokenBudget;

	// TODO: this's specifically implemented with some code duplication to not accidentally change existing behavior
	if (!prioritizeAboveCursor) { // both above and below get the half of budget
		const halfOfAvailableTokenBudget = Math.floor(availableTokenBudget / 2);

		tokenBudget = halfOfAvailableTokenBudget; // split by 2 to give both above and below areaAroundCode same budget

		for (let i = firstPageIdx - 1; i >= 0 && tokenBudget > 0; --i) {
			const tokenCountForPage = computeTokensForPage(i);
			const newTokenBudget = tokenBudget - tokenCountForPage;
			if (newTokenBudget < 0) {
				break;
			}
			firstPageIdx = i;
			tokenBudget = newTokenBudget;
		}

		// Code below the cursor gets its own half of the budget plus, when
		// enabled, any budget left unused by the code above the cursor.
		const leftoverFromAbove = useLeftoverBudgetFromAbove ? tokenBudget : 0;
		tokenBudget = halfOfAvailableTokenBudget + leftoverFromAbove;

		for (let i = lastPageIdxIncl + 1; i < totalNOfPages && tokenBudget > 0; ++i) {
			const tokenCountForPage = computeTokensForPage(i);
			const newTokenBudget = tokenBudget - tokenCountForPage;
			if (newTokenBudget < 0) {
				break;
			}
			lastPageIdxIncl = i;
			tokenBudget = newTokenBudget;
		}
	} else { // code above consumes as much as it can and the leftover budget is given to code below
		tokenBudget = availableTokenBudget;

		for (let i = firstPageIdx - 1; i >= 0 && tokenBudget > 0; --i) {
			const tokenCountForPage = computeTokensForPage(i);
			const newTokenBudget = tokenBudget - tokenCountForPage;
			if (newTokenBudget < 0) {
				break;
			}
			firstPageIdx = i;
			tokenBudget = newTokenBudget;
		}

		for (let i = lastPageIdxIncl + 1; i < totalNOfPages && tokenBudget > 0; ++i) {
			const tokenCountForPage = computeTokensForPage(i);
			const newTokenBudget = tokenBudget - tokenCountForPage;
			if (newTokenBudget < 0) {
				break;
			}
			lastPageIdxIncl = i;
			tokenBudget = newTokenBudget;
		}
	}

	return { firstPageIdx, lastPageIdxIncl, budgetLeft: tokenBudget };
}

export function clipPreservingRange(
	docLines: string[],
	rangeToPreserve: OffsetRange,
	computeTokens: (s: string) => number,
	pageSize: number,
	opts: CurrentFileOptions,
): Result<OffsetRange, 'outOfBudget'> {

	// subtract budget consumed by rangeToPreserve
	const linesToPreserve = docLines.slice(rangeToPreserve.start, rangeToPreserve.endExclusive);
	const availableTokenBudget = opts.maxTokens - countTokensForLines(linesToPreserve, computeTokens);
	if (availableTokenBudget < 0) {
		return Result.error('outOfBudget');
	}

	const { firstPageIdx, lastPageIdxIncl } = expandRangeToPageRange(
		docLines,
		rangeToPreserve,
		pageSize,
		availableTokenBudget,
		computeTokens,
		opts.prioritizeAboveCursor,
		opts.useLeftoverBudgetFromAbove,
	);

	const linesOffsetStart = firstPageIdx * pageSize;
	const linesOffsetEndExcl = (lastPageIdxIncl + 1) * pageSize;
	return Result.ok(new OffsetRange(linesOffsetStart, linesOffsetEndExcl));
}

export class ClippedDocument {
	constructor(
		/** The lines of the document that were kept after clipping. */
		public readonly lines: string[],
		/** The line range in the original document that corresponds to the kept lines. */
		public readonly keptRange: OffsetRange,
	) { }
}

export function createTaggedCurrentFileContentUsingPagedClipping(
	currentDocLines: string[],
	areaAroundCodeToEdit: string[],
	areaAroundEditWindowLinesRange: OffsetRange,
	computeTokens: (s: string) => number,
	pageSize: number,
	opts: CurrentFileOptions
): Result<ClippedDocument, 'outOfBudget'> {

	const r = clipPreservingRange(
		currentDocLines,
		areaAroundEditWindowLinesRange,
		computeTokens,
		pageSize,
		opts
	);

	if (r.isError()) {
		return r;
	}

	const rangeToKeep = r.val;

	const taggedCurrentFileContent = [
		...currentDocLines.slice(rangeToKeep.start, areaAroundEditWindowLinesRange.start),
		...areaAroundCodeToEdit,
		...currentDocLines.slice(areaAroundEditWindowLinesRange.endExclusive, rangeToKeep.endExclusive),
	];

	const keptRange = new OffsetRange(
		rangeToKeep.start,
		rangeToKeep.start + taggedCurrentFileContent.length
	);

	return Result.ok(new ClippedDocument(taggedCurrentFileContent, keptRange));
}

function addLineNumbers(lines: readonly string[], option: xtabPromptOptions.IncludeLineNumbersOption): string[] {
	switch (option) {
		case xtabPromptOptions.IncludeLineNumbersOption.WithSpaceAfter:
			return lines.map((line, idx) => `${idx}| ${line}`);
		case xtabPromptOptions.IncludeLineNumbersOption.WithoutSpace:
			return lines.map((line, idx) => `${idx}|${line}`);
		case xtabPromptOptions.IncludeLineNumbersOption.None:
			return [...lines];
		default:
			assertNever(option);
	}
}

export function constructTaggedFile(
	currentDocument: CurrentDocument,
	editWindowLinesRange: OffsetRange,
	areaAroundEditWindowLinesRange: OffsetRange,
	promptOptions: xtabPromptOptions.PromptOptions,
	computeTokens: (s: string) => number,
	opts: {
		includeLineNumbers: {
			areaAroundCodeToEdit: xtabPromptOptions.IncludeLineNumbersOption;
			currentFileContent: xtabPromptOptions.IncludeLineNumbersOption;
		};
	}
) {
	// Content with cursor tag - always created for areaAroundCodeToEdit
	const contentWithCursorAsLinesOriginal = (() => {
		const addCursorTagEdit = StringEdit.single(StringReplacement.insert(currentDocument.cursorOffset, PromptTags.CURSOR));
		const contentWithCursor = addCursorTagEdit.applyOnText(currentDocument.content);
		return contentWithCursor.getLines();
	})();

	const contentWithCursorAsLines = addLineNumbers(contentWithCursorAsLinesOriginal, opts.includeLineNumbers.areaAroundCodeToEdit);

	const editWindowWithCursorAsLines = contentWithCursorAsLines.slice(editWindowLinesRange.start, editWindowLinesRange.endExclusive);

	const areaAroundCodeToEdit = [
		PromptTags.AREA_AROUND.start,
		...contentWithCursorAsLines.slice(areaAroundEditWindowLinesRange.start, editWindowLinesRange.start),
		PromptTags.EDIT_WINDOW.start,
		...editWindowWithCursorAsLines,
		PromptTags.EDIT_WINDOW.end,
		...contentWithCursorAsLines.slice(editWindowLinesRange.endExclusive, areaAroundEditWindowLinesRange.endExclusive),
		PromptTags.AREA_AROUND.end
	];

	// For current file content, optionally include cursor tag based on includeCursorTag option
	const currentFileContentSourceLines = promptOptions.currentFile.includeCursorTag
		? contentWithCursorAsLinesOriginal
		: currentDocument.lines;
	const currentFileContentWithCursorLines = addLineNumbers(currentFileContentSourceLines, opts.includeLineNumbers.currentFileContent);
	const currentFileContentLines = addLineNumbers(currentDocument.lines, opts.includeLineNumbers.currentFileContent);

	let areaAroundCodeToEditForCurrentFile: string[];
	if (promptOptions.currentFile.includeTags && opts.includeLineNumbers.currentFileContent === opts.includeLineNumbers.areaAroundCodeToEdit) {
		areaAroundCodeToEditForCurrentFile = areaAroundCodeToEdit;
	} else {
		// Use currentFileContentWithCursorLines for edit window too
		const editWindowLines = currentFileContentWithCursorLines.slice(editWindowLinesRange.start, editWindowLinesRange.endExclusive);
		areaAroundCodeToEditForCurrentFile = [
			...currentFileContentWithCursorLines.slice(areaAroundEditWindowLinesRange.start, editWindowLinesRange.start),
			...editWindowLines,
			...currentFileContentWithCursorLines.slice(editWindowLinesRange.endExclusive, areaAroundEditWindowLinesRange.endExclusive),
		];
	}

	const taggedCurrentFileContentResult = createTaggedCurrentFileContentUsingPagedClipping(
		currentFileContentLines,
		areaAroundCodeToEditForCurrentFile,
		areaAroundEditWindowLinesRange,
		computeTokens,
		promptOptions.pagedClipping.pageSize,
		promptOptions.currentFile,
	);

	return taggedCurrentFileContentResult.map(clippedTaggedCurrentDoc => ({
		clippedTaggedCurrentDoc,
		areaAroundCodeToEdit: areaAroundCodeToEdit.join('\n'),
	}));
}
