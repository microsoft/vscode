/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// @dbaeumer

	/**
	 * A layout of the window. A layout arranges the side bars, the panel, view
	 * containers, views and editor groups, and can define layout related settings.
	 *
	 * Extensions contribute layouts with the `layouts` contribution point, which
	 * also requires this proposal.
	 */
	export interface WindowLayout {

		/**
		 * The human readable name of the layout.
		 */
		readonly label: string;

		/**
		 * The contribution of the layout, if an extension contributes it.
		 */
		readonly contribution: WindowLayoutContribution | undefined;
	}

	/**
	 * Identifies a layout that an extension contributes.
	 */
	export interface WindowLayoutContribution {

		/**
		 * The identifier of the extension that contributes the layout,
		 * in the form of `publisher.name`.
		 */
		readonly extensionId: string;

		/**
		 * The identifier of the layout in the `layouts` contribution of the extension.
		 */
		readonly id: string;
	}

	/**
	 * The result of switching to a layout with {@link window.switchLayout}.
	 */
	export interface WindowLayoutSwitch {

		/**
		 * The layout that was active before the switch.
		 */
		readonly previousLayout: WindowLayout;

		/**
		 * Switches back to {@link WindowLayoutSwitch.previousLayout previous layout}.
		 *
		 * Restoring only switches the layout while the layout the extension switched to
		 * is still active, so that it does not undo a later switch of the user.
		 *
		 * @returns A promise that resolves to `true` if the previous layout was restored.
		 */
		restore(): Thenable<boolean>;
	}

	export namespace window {

		/**
		 * The layout that is active in the window.
		 */
		export const activeLayout: WindowLayout;

		/**
		 * An {@link Event} which fires when another layout became active in the window.
		 */
		export const onDidChangeActiveLayout: Event<WindowLayout>;

		/**
		 * Switches the window to a layout that this extension contributes. Changes the
		 * user made to the layout while it was active before are kept.
		 *
		 * Extensions can only switch to their own layouts. The promise is rejected if the
		 * extension does not contribute a layout with the given identifier or if layouts
		 * are not enabled.
		 *
		 * @param id The identifier of the layout in the `layouts` contribution of the extension.
		 * @returns A promise that resolves to a {@link WindowLayoutSwitch} that can restore the previous layout.
		 */
		export function switchLayout(id: string): Thenable<WindowLayoutSwitch>;
	}
}
