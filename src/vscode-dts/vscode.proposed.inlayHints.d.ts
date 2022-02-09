/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/16221

	// todo@API support over an optional overlay range
	// todo@API all for more InlayHintLabelPart commands
	// todo@API allow for InlayHintLabelPart#colors?

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
	 *
	 * The kind of an inline hint defines its appearance, e.g the corresponding foreground and background colors are being
	 * used.
	 */
	export enum InlayHintKind {
		/**
		 * An inlay hint that for a type annotation.
		 */
		Type = 1,
		/**
		 * An inlay hint that is for a parameter.
		 */
		Parameter = 2,
	}

	/**
	 * An inlay hint label part allows for interactive and composite labels of inlay hints.
	 */
	export class InlayHintLabelPart {

		/**
		 * The value of this label part.
		 */
		value: string;

		/**
		 * The tooltip text when you hover over this label part.
		 *
		 * *Note* that this property can be set late during
		 * {@link InlayHintsProvider.resolveInlayHint resolving} of inlay hints.
		 */
		tooltip?: string | MarkdownString | undefined;

		/**
		 * An optional {@link Location source code location} that represents this label
		 * part.
		 *
		 * The editor will use this location for the hover and for code navigation features: This
		 * part will become a clickable link that resolves to the definition of the symbol at the
		 * given location (not necessarily the location itself), it shows the hover that shows at
		 * the given location, and it shows a context menu with further code navigation commands.
		 *
		 * *Note* that this property can be set late during
		 * {@link InlayHintsProvider.resolveInlayHint resolving} of inlay hints.
		 */
		location?: Location | undefined;

		/**
		 * An optional command for this label part.
		 *
		 * The editor renders parts with commands as clickable links. The command is added to the context menu
		 * when a label part defines {@link InlayHintLabelPart.location location} and {@link InlayHintLabelPart.command command} .
		 *
		 * *Note* that this property can be set late during
		 * {@link InlayHintsProvider.resolveInlayHint resolving} of inlay hints.
		 */
		command?: Command | undefined;

		/**
		 * Creates a new inlay hint label part.
		 *
		 * @param value The value of the part.
		 */
		constructor(value: string);
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
		 * The label of this hint. A human readable string or an array of {@link InlayHintLabelPart label parts}.
		 *
		 * *Note* that neither the string nor the label part can be empty.
		 */
		label: string | InlayHintLabelPart[];

		/**
		 * The tooltip text when you hover over this item.
		 */
		tooltip?: string | MarkdownString | undefined;

		/**
		 * Optional command that will be the default gesture of this inlay hint.
		 */
		command?: Command;

		/**
		 * The kind of this hint. The inlay hint kind defines the appearance of this inlay hint.
		 */
		kind?: InlayHintKind;

		/**
		 * Render padding before the hint. Padding will use the editor's background color,
		 * not the background color of the hint itself. That means padding can be used to visually
		 * align/separate an inlay hint.
		 */
		paddingLeft?: boolean;

		/**
		 * Render padding after the hint. Padding will use the editor's background color,
		 * not the background color of the hint itself. That means padding can be used to visually
		 * align/separate an inlay hint.
		 */
		paddingRight?: boolean;

		/**
		 * Creates a new inlay hint.
		 *
		 * @param position The position of the hint.
		 * @param label The label of the hint.
		 * @param kind The {@link InlayHintKind kind} of the hint.
		 */
		constructor(position: Position, label: string | InlayHintLabelPart[], kind?: InlayHintKind);
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
		 * *Note* that inlay hints that are not {@link Range.contains contained} by the given range are ignored.
		 *
		 * @param document The document in which the command was invoked.
		 * @param range The range for which inlay hints should be computed.
		 * @param token A cancellation token.
		 * @return An array of inlay hints or a thenable that resolves to such.
		 */
		provideInlayHints(document: TextDocument, range: Range, token: CancellationToken): ProviderResult<T[]>;

		/**
		 * Given an inlay hint fill in {@link InlayHint.tooltip tooltip}, {@link InlayHint.command command}, or complete
		 * label {@link InlayHintLabelPart parts}.
		 *
		 * *Note* that the editor will resolve an inlay hint at most once.
		 *
		 * @param hint An inlay hint.
		 * @param token A cancellation token.
		 * @return The resolved inlay hint or a thenable that resolves to such. It is OK to return the given `item`. When no result is returned, the given `item` will be used.
		 */
		resolveInlayHint?(hint: T, token: CancellationToken): ProviderResult<T>;
	}
}
