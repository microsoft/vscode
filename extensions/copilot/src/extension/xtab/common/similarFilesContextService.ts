/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { LineRange0Based } from './lineRange';

/**
 * A neighbor-file snippet selected via Jaccard similarity, ready to be
 * embedded into the recently_viewed_code_snippets section of the prompt.
 */
export interface INeighborFileSnippet {
	readonly uri: string;
	readonly relativePath: string | undefined;
	readonly snippet: string;
	readonly lineRange: LineRange0Based;
	readonly score: number;
	/**
	 * `true` when the snippet comes from a language-service "related" file
	 * (a non-open-tab file suggested by a language service) rather than from an
	 * open tab. Related-file snippets omit line numbers in the prompt.
	 */
	readonly isFromRelatedFile: boolean;
}

export interface ISimilarFilesContextService {
	readonly _serviceBrand: undefined;

	/**
	 * Computes GhostText-style similar files context (neighbor code snippets via Jaccard similarity).
	 * @param includeRelatedFiles when `false`, language-service "related" (non-open-tab) files are
	 * skipped and only open-tab neighbors are considered.
	 * @returns JSON-serialized telemetry payload, or `undefined` on any error. Never throws.
	 */
	compute(uri: string, languageId: string, source: string, cursorOffset: number, includeRelatedFiles: boolean): Promise<string | undefined>;

	/**
	 * Computes neighbor-file snippets (Jaccard-ranked) intended for inclusion in the prompt.
	 * @param includeRelatedFiles when `false`, language-service "related" (non-open-tab) files are
	 * skipped and only open-tab neighbors are considered.
	 * @returns Snippets ordered with best (highest scores) last, or `undefined` on any error. Never throws.
	 */
	getSnippetsForPrompt(uri: string, languageId: string, source: string, cursorOffset: number, includeRelatedFiles: boolean): Promise<readonly INeighborFileSnippet[] | undefined>;
}

export const ISimilarFilesContextService = createServiceIdentifier<ISimilarFilesContextService>('ISimilarFilesContextService');

export class NullSimilarFilesContextService implements ISimilarFilesContextService {
	declare readonly _serviceBrand: undefined;

	async compute(): Promise<undefined> {
		return undefined;
	}

	async getSnippetsForPrompt(): Promise<undefined> {
		return undefined;
	}
}
