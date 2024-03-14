/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface HoverContext {

		/**
		 * Whether to increase or decrease the hover's verbosity
		 */
		action: HoverVerbosityAction;

		/**
		 * The previous hover sent for the same position
		 */
		previousHover: Hover;
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
		provideHover(document: TextDocument, position: Position, token: CancellationToken, context?: HoverContext): ProviderResult<Hover>;
	}
}
