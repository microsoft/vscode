/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/124024 @hediet

	export namespace languages {
		/**
		 * Registers an inline completion provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider An inline completion provider.
		 * @param metadata Metadata about the provider.
		 * @return A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerInlineCompletionItemProvider(selector: DocumentSelector, provider: InlineCompletionItemProvider, metadata: InlineCompletionItemProviderMetadata): Disposable;

		/**
		 * temporary: to be removed
		 */
		export const inlineCompletionsUnificationState: InlineCompletionsUnificationState;
		/**
		 * temporary: to be removed
		 */
		export const onDidChangeCompletionsUnificationState: Event<void>;
	}

	export interface InlineCompletionItem {
		// insertText: string | SnippetString | undefined;

		/** If set to `true`, this item is treated as inline edit. */
		isInlineEdit?: boolean;

		/**
		 * A range specifying when the edit can be shown based on the cursor position.
		 * If the cursor is within this range, the inline edit can be displayed.
		 */
		showRange?: Range;

		showInlineEditMenu?: boolean;

		/**
		 * If set, specifies where insertText, filterText and range apply to.
		*/
		uri?: Uri;

		// TODO: rename to gutterMenuLinkAction
		action?: Command;

		displayLocation?: InlineCompletionDisplayLocation;

		/** Used for telemetry. Can be an arbitrary string. */
		correlationId?: string;

		/**
		 * If set to `true`, unopened closing brackets are removed and unclosed opening brackets are closed.
		 * Defaults to `false`.
		*/
		completeBracketPairs?: boolean;

		warning?: InlineCompletionWarning;
	}


	export interface InlineCompletionDisplayLocation {
		range: Range;
		kind: InlineCompletionDisplayLocationKind;
		label: string;
		jumpToEdit?: boolean;
	}

	export enum InlineCompletionDisplayLocationKind {
		Code = 1,
		Label = 2
	}

	export interface InlineCompletionWarning {
		message: MarkdownString | string;
		icon?: ThemeIcon;
	}

	export interface InlineCompletionItemProviderMetadata {
		/**
		 * Specifies a list of extension ids that this provider yields to if they return a result.
		 * If some inline completion provider registered by such an extension returns a result, this provider is not asked.
		 */
		yieldTo?: string[];
		/**
		 * Can override the extension id for the yieldTo mechanism. Used for testing, so that yieldTo can be tested within one extension.
		*/
		groupId?: string;

		debounceDelayMs?: number;

		displayName?: string;

		excludes?: string[];
	}

	export interface InlineCompletionItemProvider {
		/**
		 * @param completionItem The completion item that was shown.
		 * @param updatedInsertText The actual insert text (after brackets were fixed).
		 */
		// eslint-disable-next-line local/vscode-dts-provider-naming
		handleDidShowCompletionItem?(completionItem: InlineCompletionItem, updatedInsertText: string): void;

		/**
		 * Is called when an inline completion item was accepted partially.
		 * @param info Additional info for the partial accepted trigger.
		 */
		// eslint-disable-next-line local/vscode-dts-provider-naming
		handleDidPartiallyAcceptCompletionItem?(completionItem: InlineCompletionItem, info: PartialAcceptInfo): void;

		/**
		 * Is called when an inline completion item is no longer being used.
		 * Provides a reason of why it is not used anymore.
		*/
		// eslint-disable-next-line local/vscode-dts-provider-naming
		handleEndOfLifetime?(completionItem: InlineCompletionItem, reason: InlineCompletionEndOfLifeReason): void;

		/**
		 * Is called when an inline completion list is no longer being used (same reference as the list returned by provideInlineEditsForRange).
		*/
		// eslint-disable-next-line local/vscode-dts-provider-naming
		handleListEndOfLifetime?(list: InlineCompletionList, reason: InlineCompletionsDisposeReason): void;

		readonly onDidChange?: Event<void>;

		// #region Deprecated methods

		/**
		 * Is called when an inline completion item was accepted partially.
		 * @param acceptedLength The length of the substring of the inline completion that was accepted already.
		 * @deprecated Use `handleDidPartiallyAcceptCompletionItem` with `PartialAcceptInfo` instead.
		 */
		// eslint-disable-next-line local/vscode-dts-provider-naming
		handleDidPartiallyAcceptCompletionItem?(completionItem: InlineCompletionItem, acceptedLength: number): void;

		/**
		 * @param completionItem The completion item that was rejected.
		 * @deprecated Use {@link handleEndOfLifetime} instead.
		*/
		// eslint-disable-next-line local/vscode-dts-provider-naming
		handleDidRejectCompletionItem?(completionItem: InlineCompletionItem): void;

		// #endregion
	}

	export enum InlineCompletionEndOfLifeReasonKind {
		Accepted = 0,
		Rejected = 1,
		Ignored = 2,
	}

	export type InlineCompletionEndOfLifeReason = {
		kind: InlineCompletionEndOfLifeReasonKind.Accepted; // User did an explicit action to accept
	} | {
		kind: InlineCompletionEndOfLifeReasonKind.Rejected; // User did an explicit action to reject
	} | {
		kind: InlineCompletionEndOfLifeReasonKind.Ignored;
		supersededBy?: InlineCompletionItem;
		userTypingDisagreed: boolean;
	};

	export enum InlineCompletionsDisposeReasonKind {
		Other = 0,
		Empty = 1,
		TokenCancellation = 2,
		LostRace = 3,
		NotTaken = 4,
	}

	export type InlineCompletionsDisposeReason = { kind: InlineCompletionsDisposeReasonKind };

	export interface InlineCompletionContext {
		readonly userPrompt?: string;

		readonly requestUuid: string;

		readonly requestIssuedDateTime: number;

		readonly earliestShownDateTime: number;
	}

	export interface PartialAcceptInfo {
		kind: PartialAcceptTriggerKind;
		/**
		 * The length of the substring of the provided inline completion text that was accepted already.
		*/
		acceptedLength: number;
	}

	export enum PartialAcceptTriggerKind {
		Unknown = 0,
		Word = 1,
		Line = 2,
		Suggest = 3,
	}

	// When finalizing `commands`, make sure to add a corresponding constructor parameter.
	export interface InlineCompletionList {
		/**
		 * A list of commands associated with the inline completions of this list.
		 */
		commands?: Array<Command | { command: Command; icon: ThemeIcon }>;

		/**
		 * When set and the user types a suggestion without deviating from it, the inline suggestion is not updated.
		 * Defaults to false (might change).
		 */
		enableForwardStability?: boolean;
	}

	/**
	 * temporary: to be removed
	 */
	export interface InlineCompletionsUnificationState {
		codeUnification: boolean;
		modelUnification: boolean;
		extensionUnification: boolean;
		expAssignments: string[];
	}
}
