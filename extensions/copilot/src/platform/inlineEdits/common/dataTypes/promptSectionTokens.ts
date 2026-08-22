/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Approximate token counts for each section of the NES ("xtab") prompt.
 *
 * All values are computed with the same char/4 approximation used for prompt
 * budgeting (see `XtabProvider.computeTokens`), not an exact tokenizer, so they
 * are diagnostics rather than a precise reproduction of the endpoint's
 * `promptTokens`. Every count except `systemPrompt` is scoped to the user
 * message and reflects the rendered section (including its `<|...|>` tags and
 * any inline headers such as `current_file_path:`).
 */
export interface PromptSectionTokenCounts {
	/** `recently_viewed_code_snippets` block (in global-budget mode this merges recent docs, language-context snippets and neighbor files). */
	readonly recentlyViewed: number;
	/** `current_file_content` block, including the `current_file_path:` header. */
	readonly currentFile: number;
	/** Lint errors block (with its surrounding newline padding); 0 when absent. */
	readonly lintErrors: number;
	/** Rendered `edit_diff_history` block (including its section tags). */
	readonly editHistory: number;
	/** `area_around_code_to_edit` block; 0 for strategies that emit `cursor_location` or neither. */
	readonly areaAroundCodeToEdit: number;
	/** `cursor_location` block; 0 for strategies that emit `area_around_code_to_edit` or neither. */
	readonly cursorLocation: number;
	/** Related-information language traits (`getRelatedInformation`); 0 when absent. */
	readonly relatedInformation: number;
	/** Trailing instruction postScript; 0 when `includePostScript` is false. */
	readonly postScript: number;
	/** Formatting glue not attributed to any section: `userPromptTotal - sum(sections)` (newlines, optional backtick fences, trim, and char/4 rounding). May be slightly negative. */
	readonly overhead: number;
	/** Total tokens of the final trimmed user prompt. `sum(sections) + overhead === userPromptTotal`. */
	readonly userPromptTotal: number;
	/** Tokens of the system message. Not part of the user prompt; filled in by the provider. */
	readonly systemPrompt: number;

	/**
	 * Breakdown of the {@link recentlyViewed} section into the three sources it
	 * is assembled from. These do not sum exactly to {@link recentlyViewed}
	 * because that section also includes the `<|recently_viewed_code_snippets|>`
	 * tags and the `\n\n` glue joining the individual snippets.
	 */
	readonly recentlyViewedSubsections: RecentlyViewedSubsectionTokenCounts;
}

/**
 * Approximate (char/4) token counts for the constituent subsections of the
 * `recently_viewed_code_snippets` block. Rendered in the order below (recent
 * files first, neighbor files last, closest to the current file).
 */
export interface RecentlyViewedSubsectionTokenCounts {
	/** Recently-viewed/edited files reconstructed from the xtab edit/view history. */
	readonly recentlyViewedFiles: number;
	/** Language-context *snippets* from the language server (the `Snippet`-kind items; distinct from the `relatedInformation` traits section). */
	readonly languageContext: number;
	/** Neighbor ("similar") file snippets from the Completions-style provider. */
	readonly neighborFiles: number;
}
