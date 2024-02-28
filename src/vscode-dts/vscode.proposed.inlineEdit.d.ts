/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export class InlineEdit {


		/**
		 * The new text for this edit.
		 */
		readonly text: string;

		/**
		 * An range that will be replaced by the text of the inline edit.
		 * If change is only additive, this can be empty (same start and end position).
		 */
		readonly range: Range;

		/**
		 * An optional command that will be executed after applying the inline edit.
		 */
		accepted?: Command;

		/**
		 * An optional command that will be executed after rejecting the inline edit.
		 */
		rejected?: Command;

		/**
		 * Creates a new inline edit.
		 *
		 * @param text The new text for this edit.
		 * @param replaceRange An range that will be replaced by the text of the inline edit.
		 */
		constructor(text: string, range: Range);
	}

	export interface InlineEditContext {
		/**
		 * Describes how the inline edit was triggered.
		 */
		triggerKind: InlineEditTriggerKind;
	}

	export enum InlineEditTriggerKind {
		/**
		 * Completion was triggered explicitly by a user gesture.
		 * Return multiple completion items to enable cycling through them.
		 */
		Invoke = 0,

		/**
		 * Completion was triggered automatically while editing.
		 * It is sufficient to return a single completion item in this case.
		 */
		Automatic = 1,
	}

	export interface InlineEditProvider {
		/**
		 * Provide inline edit for the given document.
		 *
		 * @param document The document for which the inline edit are computed.
		 * @param context Additional context information about the request.
		 * @param token A cancellation token.
		 * @return An inline edit or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideInlineEdit(document: TextDocument, context: InlineEditContext, token: CancellationToken): ProviderResult<InlineEdit>;
	}

	export namespace languages {

		/**
		 * Register a provider that can handle inline edits.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A provider that can handle inline edits.
		 * @return A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerInlineEditProvider(selector: DocumentSelector, provider: InlineEditProvider): Disposable;

	}
}
