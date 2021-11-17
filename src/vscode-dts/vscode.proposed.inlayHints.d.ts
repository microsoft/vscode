/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/16221

	// todo@API Split between Inlay- and OverlayHints (InlayHint are for a position, OverlayHints for a non-empty range)
	// todo@API add "mini-markdown" for links and styles
	// (done) remove description
	// (done) rename to InlayHint
	// (done)  add InlayHintKind with type, argument, etc

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

	export enum InlayHintKind {
		Other = 0,
		Type = 1,
		Parameter = 2,
	}

	/**
	 * Inlay hint information.
	 */
	export class InlayHint {
		/**
		 * The text of the hint.
		 */
		// todo@API label?
		text: string;
		/**
		 * The position of this hint.
		 */
		position: Position;
		/**
		 * The kind of this hint.
		 */
		kind?: InlayHintKind;
		/**
		 * Whitespace before the hint.
		 */
		whitespaceBefore?: boolean;
		/**
		 * Whitespace after the hint.
		 */
		whitespaceAfter?: boolean;

		// todo@API make range first argument
		constructor(text: string, position: Position, kind?: InlayHintKind);
	}

	/**
	 * The inlay hints provider interface defines the contract between extensions and
	 * the inlay hints feature.
	 */
	export interface InlayHintsProvider {

		/**
		 * An optional event to signal that inlay hints have changed.
		 * @see {@link EventEmitter}
		 */
		//todo@API needs proper doc (like others)
		onDidChangeInlayHints?: Event<void>;

		/**
		 *
		 * @param model The document in which the command was invoked.
		 * @param range The range for which inlay hints should be computed.
		 * @param token A cancellation token.
		 * @return A list of inlay hints or a thenable that resolves to such.
		 */
		provideInlayHints(model: TextDocument, range: Range, token: CancellationToken): ProviderResult<InlayHint[]>;
	}
}
