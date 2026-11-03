/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ScoredSnippet } from './selectRelevance';

/** Indicates what provider produced a given snippet. */
export enum SnippetProviderType {
	SimilarFiles = 'similar-files',
	Path = 'path',
}

/**
 * The semantics of a snippet. For example, some providers
 * might always produce a snippet that is a complete function
 * whereas others might produce a snippet that are inherhently
 * partial.
 */
export enum SnippetSemantics {
	/** The contents of the snippet is a function. */
	Function = 'function',
	/** The contents of the snippet is an unspecified snippet. */
	Snippet = 'snippet',
	/** Contains multiple snippets of type snippet */
	Snippets = 'snippets',
	/** The following are from hover text */
	Variable = 'variable',
	Parameter = 'parameter',
	Method = 'method',
	Class = 'class',
	Module = 'module',
	Alias = 'alias',
	Enum = 'enum member',
	Interface = 'interface',
}

/** Extends a ScoredSnippet with information about its provider. */
export interface SnippetWithProviderInfo extends ScoredSnippet {
	/** The provider that created this snippet. */
	provider: SnippetProviderType;
	/** The semantical meaning of the snippet's contents. */
	semantics: SnippetSemantics;
}

type SnippetToAnnounce = Pick<SnippetWithProviderInfo, 'snippet' | 'semantics' | 'relativePath'>;

/**
 * A map from semantics enum to a human / LLM-readable label that we
 * include when announcing a snippet.
 */
const snippetSemanticsToString: { [key in SnippetSemantics]: string } = {
	[SnippetSemantics.Function]: 'function',
	[SnippetSemantics.Snippet]: 'snippet',
	[SnippetSemantics.Snippets]: 'snippets',
	[SnippetSemantics.Variable]: 'variable',
	[SnippetSemantics.Parameter]: 'parameter',
	[SnippetSemantics.Method]: 'method',
	[SnippetSemantics.Class]: 'class',
	[SnippetSemantics.Module]: 'module',
	[SnippetSemantics.Alias]: 'alias',
	[SnippetSemantics.Enum]: 'enum member',
	[SnippetSemantics.Interface]: 'interface',
};

/**
 * Formats a snippet for inclusion in the prompt.
 */
export function announceSnippet(snippet: SnippetToAnnounce) {
	const semantics = snippetSemanticsToString[snippet.semantics];
	const pluralizedSemantics = [SnippetSemantics.Snippets].includes(snippet.semantics) ? 'these' : 'this';
	const headline = snippet.relativePath
		? `Compare ${pluralizedSemantics} ${semantics} from ${snippet.relativePath}:`
		: `Compare ${pluralizedSemantics} ${semantics}:`;
	return { headline, snippet: snippet.snippet };
}
