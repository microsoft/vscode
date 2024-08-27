/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * A hover represents additional information for a symbol or word. Hovers are
	 * rendered in a tooltip-like widget.
	 */
	export class VerboseHover extends Hover {

		/**
		 * Can increase the verbosity of the hover
		 */
		canIncreaseVerbosity?: boolean;

		/**
		 * Can decrease the verbosity of the hover
		 */
		canDecreaseVerbosity?: boolean;

		/**
		 * Creates a new hover object.
		 *
		 * @param contents The contents of the hover.
		 * @param range The range to which the hover applies.
		 */
		constructor(contents: MarkdownString | MarkedString | Array<MarkdownString | MarkedString>, range?: Range, canIncreaseVerbosity?: boolean, canDecreaseVerbosity?: boolean);
	}

	export interface HoverContext {

		/**
		 * The delta by which to increase/decrease the hover verbosity level
		 */
		readonly verbosityDelta?: number;

		/**
		 * The previous hover sent for the same position
		 */
		readonly previousHover?: Hover;
	}

	export enum HoverVerbosityAction {
		/**
		 * Increase the hover verbosity
		 */
		Increase = 0,
		/**
		 * Decrease the hover verbosity
		 */
		Decrease = 1
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
		provideHover(document: TextDocument, position: Position, token: CancellationToken, context?: HoverContext): ProviderResult<VerboseHover>;
	}
}
