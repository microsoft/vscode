/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IMarkdownString } from 'vs/base/common/htmlContent';

export const IHoverService = createDecorator<IHoverService>('hoverService');

/**
 * A service that enables the convenient display of rich markdown-based hovers in the workbench.
 */
export interface IHoverService {
	readonly _serviceBrand: undefined;

	/**
	 * Shows a hover.
	 * @param options A set of options defining the characteristics of the hover.
	 *
	 * **Example:** A simple usage with a single element target.
	 *
	 * ```typescript
	 * showHover({
	 *   text: new MarkdownString('Hello world'),
	 *   target: someElement
	 * });
	 * ```
	 */
	showHover(options: IHoverOptions): void;

	/**
	 * Hides the hover if it was visible.
	 */
	hideHover(): void;
}

export interface IHoverOptions {
	/**
	 * The text to display in the primary section of the hover.
	 */
	text: IMarkdownString;

	/**
	 * An custom link handler for markdown links, if this is not provided the IOpenerService will
	 * be used to open the links using its default options.
	 */
	linkHandler?: (url: string) => void;

	/**
	 * The target for the hover. This determines the position of the hover and it will only be
	 * hidden when the mouse leaves both the hover and the target. A HTMLElement can be used for
	 * simple cases and a IHoverTarget for more complex cases where multiple elements and/or a
	 * dispose method is required.
	 */
	target: IHoverTarget | HTMLElement;

	/**
	 * A set of actions for the hover's "status bar".
	 */
	actions?: IHoverAction[];
}

export interface IHoverAction {
	/**
	 * The label to use in the hover's status bar.
	 */
	label: string;

	/**
	 * An optional class of an icon that will be displayed before the label.
	 */
	iconClass?: string;

	/**
	 * The command ID of the action, this is used to resolve the keybinding to display after the
	 * action label.
	 */
	commandId: string;

	/**
	 * The callback to run the action.
	 * @param target The action element that was activated.
	 */
	run(target: HTMLElement): void;
}

/**
 * A target for a hover which can know about domain-specific locations.
 */
export interface IHoverTarget extends IDisposable {
	readonly targetElements: readonly HTMLElement[];
}
