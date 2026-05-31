/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { SimilarFilesOptions } from './snippetInclusion/similarFiles';

/**
 * Default PromptOptions are defined as constants to ensure the same values are shared
 * between:
 * - the class constructor
 * - the EXP default flags
 */

/** The maximum number of tokens in a completion. */
export const DEFAULT_MAX_COMPLETION_LENGTH = 500;

/** The maximum number of tokens in a prompt. */
export const DEFAULT_MAX_PROMPT_LENGTH = 8192 - DEFAULT_MAX_COMPLETION_LENGTH;

/** The maximal number of the final snippets to return. */
export const DEFAULT_NUM_SNIPPETS = 4;

/**
 * The default threshold for choosing a cached suffix.
 */
export const DEFAULT_SUFFIX_MATCH_THRESHOLD = 10;

/* The default allocation of the prompt to different components */
export const DEFAULT_PROMPT_ALLOCATION_PERCENT = {
	prefix: 35,
	suffix: 15,
	stableContext: 35,
	volatileContext: 15,
} as const;

export type PromptComponentId = keyof typeof DEFAULT_PROMPT_ALLOCATION_PERCENT;
export type PromptComponentAllocation = Record<PromptComponentId, number>;

/**
 * Information about a document, not including the offset.
 */
export interface DocumentInfo {
	/** The file path of the document relative to its containing project or folder, if known. */
	relativePath?: string;
	/** The URI of the document. We can't pass URI class instances directly due to limitations of passing objects to the worker thread. */
	uri: string;
	/** The source text of the document. */
	source: string;
	/** The language identifier of the document. */
	languageId: string;
}

/**
 * Information about a document, including an offset corresponding to
 * the cursor position.
 */
export interface DocumentInfoWithOffset extends DocumentInfo {
	/** The offset in the document where we want the completion (0-indexed, between characters). */
	offset: number;
}

/**
 * Information about a similar file.
 */
export type SimilarFileInfo = Omit<DocumentInfo, 'languageId'>;

export type PromptOptions = {
	/** The maximum prompt length in tokens */
	maxPromptLength: number;
	/** The number of snippets to include */
	numberOfSnippets: number;
	/** The percent of `maxPromptLength` to reserve for the suffix */
	suffixPercent: number;
	/** The threshold (in percent) for declaring match of new suffix with existing suffix */
	suffixMatchThreshold: number;
	/** The default parameters for the similar-files provider, for any language. */
	similarFilesOptions: SimilarFilesOptions;
};

/**
 * A map that normalises common aliases of languageIds.
 */
const languageNormalizationMap: { [language: string]: string } = {
	javascriptreact: 'javascript',
	jsx: 'javascript',
	typescriptreact: 'typescript',
	jade: 'pug',
	cshtml: 'razor',
	c: 'cpp',
};

/**
 * Return a normalized form of a language id, by lower casing and combining
 * certain languageId's that are not considered distinct by promptlib.
 */
export function normalizeLanguageId(languageId: string): string {
	languageId = languageId.toLowerCase();
	return languageNormalizationMap[languageId] ?? languageId;
}
