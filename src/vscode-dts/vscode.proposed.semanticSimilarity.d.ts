/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface SemanticSimilarityProvider {
		/**
		 * Computes the semantic similarity score between two strings.
		 * @param string1 The string to compare to all other strings.
		 * @param comparisons An array of strings to compare string1 to. An array allows you to batch multiple comparisons in one call.
		 * @param token A cancellation token.
		 * @return A promise that resolves to the semantic similarity scores between string1 and each string in comparisons.
		 * The score should be a number between 0 and 1, where 0 means no similarity and 1 means
		 * perfect similarity.
		 */
		provideSimilarityScore(string1: string, comparisons: string[], token: CancellationToken): Thenable<number[]>;
	}
	export namespace ai {
		export function registerSemanticSimilarityProvider(provider: SemanticSimilarityProvider): Disposable;
	}
}
