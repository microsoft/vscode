/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export class InlineEdit {
		/**
		 * The position of the edit.
		 */
		position: Position;

		/**
		 * The new text for this edit.
		 */
		text: string;

		/**
		 * An optional range that will be replaced by the text of the inline edit.
		 */
		replaceRange?: Range;

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
		 * @param position The position of the edit.
		 * @param text The new text for this edit.
		 * @param replaceRange An optional range that will be replaced by the text of the inline edit.
		 */
		constructor(position: Position, text: string, replaceRange?: Range);
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

	export enum InlineEditRejectionReason {
		/**
		 * User rejected the inline edit with reject command.
		 */
		Explicit = 0,

		/**
		 * User rejected the inline edit by changing or closing the document.
		 */
		Implicit = 1,
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
