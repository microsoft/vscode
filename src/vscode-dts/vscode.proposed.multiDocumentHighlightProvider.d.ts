/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * Represents a collection of document highlights from multiple documents.
	 */
	export class MultiDocumentHighlight {

		/**
		 * The URI of the document containing the highlights.
		 */
		uri: Uri;

		/**
		 * The highlights for the document.
		 */
		highlights: DocumentHighlight[];

		/**
		 * Creates a new instance of MultiDocumentHighlight.
		 * @param uri The URI of the document containing the highlights.
		 * @param highlights The highlights for the document.
		 */
		constructor(uri: Uri, highlights: DocumentHighlight[]);
	}

	export interface MultiDocumentHighlightProvider {

		/**
		 * Provide a set of document highlights, like all occurrences of a variable or
		 * all exit-points of a function.
		 *
		 * @param document The document in which the command was invoked.
		 * @param position The position at which the command was invoked.
		 * @param otherDocuments An array of additional valid documents for which highlights should be provided.
		 * @param token A cancellation token.
		 * @returns A Map containing a mapping of the Uri of a document to the document highlights or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined`, `null`, or an empty map.
		 */
		provideMultiDocumentHighlights(document: TextDocument, position: Position, otherDocuments: TextDocument[], token: CancellationToken): ProviderResult<MultiDocumentHighlight[]>;
	}

	namespace languages {

		/**
		 * Register a multi document highlight provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are sorted
		 * by their {@link languages.match score} and groups sequentially asked for document highlights.
		 * The process stops when a provider returns a `non-falsy` or `non-failure` result.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A multi-document highlight provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerMultiDocumentHighlightProvider(selector: DocumentSelector, provider: MultiDocumentHighlightProvider): Disposable;
	}

}
