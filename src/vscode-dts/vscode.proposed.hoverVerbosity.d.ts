/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * A hover represents additional information for a symbol or word. Hovers are
	 * rendered in a tooltip-like widget.
	 */
	export class VerboseHover {

		/**
		 * The contents of this hover.
		 */
		contents: Array<MarkdownString | MarkedString>;

		/**
		 * The range to which this hover applies. When missing, the
		 * editor will use the range at the current position or the
		 * current position itself.
		 */
		range?: Range;

		/**
		 * Verbosity metadata
		 */
		verbosityMetadata?: HoverVerbosityMetadata;

		/**
		 * Creates a new hover object.
		 *
		 * @param contents The contents of the hover.
		 * @param range The range to which the hover applies.
		 */
		constructor(contents: MarkdownString | MarkedString | Array<MarkdownString | MarkedString>, range?: Range, verbosityMetadata?: HoverVerbosityMetadata);
	}

	/**
	 * Hover extension metadata
	 */
	export interface HoverVerbosityMetadata {
		/**
		 * Can increase the verbosity of the hover
		 */
		canIncreaseVerbosity?: boolean;

		/**
		 * Can decrease the verbosity of the hover
		 */
		canDecreaseVerbosity?: boolean;
	}

	/**
	 * The context of the hover
	 */
	export interface HoverContext {

		/**
		 * The verbosity level to provide at the given position
		 */
		verbosityLevel: number;
	}

	/**
	 * The hover provider class
	 */
	export interface HoverProvider {

		/**
		 * Provide a hover for the given position and document. Multiple hovers at the same
		 * position will be merged by the editor. A hover can have a range which defaults
		 * to the word range at the position when omitted.
		 *
		 * @param document The document in which the command was invoked.
		 * @param position The position at which the command was invoked.
		 * @param token A cancellation token.
		 * @oaram context A hover context.
		 * @returns A hover or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideHover(document: TextDocument, position: Position, token: CancellationToken, context: HoverContext): ProviderResult<VerboseHover>;
	}

	export namespace languages {
		/**
		 * Register a hover provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A hover provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerHoverProvider(selector: DocumentSelector, provider: HoverProvider, providerMetadata: HoverProviderMetadata): Disposable;

		/**
		 * Metadata concerning the hover provider
		 */
		export interface HoverProviderMetadata {
			/**
			 * Whether the hover provider can increase the verbosity of the hover
			 */
			canIncreaseVerbosity: boolean;
		}
	}
}
