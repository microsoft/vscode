/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/16221

	// todo@API Split between Inlay- and OverlayHints (InlayHint are for a position, OverlayHints for a non-empty range)
	// (done) add "mini-markdown" for links and styles
	// (done) remove description
	// (done) rename to InlayHint
	// (done) add InlayHintKind with type, argument, etc

	export namespace languages {
		/**
		 * Register a inlay hints provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider An inlay hints provider.
		 * @return A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerInlayHintsProvider(selector: DocumentSelector, provider: InlayHintsProvider): Disposable;
	}

	/**
	 * Inlay hint kinds.
	 */
	export enum InlayHintKind {
		Other = 0,
		Type = 1,
		Parameter = 2,
	}

	export class InlayHintLabelPart {

		/**
		 * The value of this label part.
		 */
		label: string;

		/**
		 * The tooltip text when you hover over this label part.
		 */
		tooltip?: string | MarkdownString | undefined;

		// invokes provider
		location?: Location | undefined;

		command?: Command | undefined;

		// todo@api
		// context menu, contextMenuCommands
		// secondaryCommands?: Command[];

		constructor(label: string);
	}

	/**
	 * Inlay hint information.
	 */
	export class InlayHint {
		/**
		 * The position of this hint.
		 */
		position: Position;
		/**
		 *
		 */
		label: string | InlayHintLabelPart[];
		/**
		 * The tooltip text when you hover over this item.
		 */
		tooltip?: string | MarkdownString | undefined;
		/**
		 * The kind of this hint.
		 */
		kind?: InlayHintKind;

		/**
		 * Render padding before the hint.
		 */
		paddingLeft?: boolean;
		/**
		 * Render padding after the hint.
		 */
		paddingRight?: boolean;

		// emphemeral overlay mode
		// overlayRange?: Range;

		// todo@API make range first argument
		constructor(label: string | InlayHintLabelPart[], position: Position, kind?: InlayHintKind);
	}

	/**
	 * The inlay hints provider interface defines the contract between extensions and
	 * the inlay hints feature.
	 */
	export interface InlayHintsProvider<T extends InlayHint = InlayHint> {

		/**
		 * An optional event to signal that inlay hints from this provider have changed.
		 */
		onDidChangeInlayHints?: Event<void>;

		/**
		 * Provide inlay hints for the given range and document.
		 *
		 * *Note* that inlay hints that are not {@link Range.contains contained} by the range are ignored.
		 *
		 * @param model The document in which the command was invoked.
		 * @param range The range for which inlay hints should be computed.
		 * @param token A cancellation token.
		 * @return An array of inlay hints or a thenable that resolves to such.
		 */
		provideInlayHints(model: TextDocument, range: Range, token: CancellationToken): ProviderResult<T[]>;

		/**
		 * Given an inlay hint fill in {@link InlayHint.tooltip tooltip} or complete label {@link InlayHintLabelPart parts}.
		 *
		 * The editor will at most resolve an inlay hint once.
		 *
		 * @param hint An inlay hint.
		 * @param token A cancellation token.
		 * @return The resolved inlay hint or a thenable that resolves to such. It is OK to return the given `item`. When no result is returned, the given `item` will be used.
		 */
		resolveInlayHint?(hint: T, token: CancellationToken): ProviderResult<T>;
	}
}
