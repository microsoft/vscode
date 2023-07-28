/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';

export const IHoverService = createDecorator<IHoverService>('hoverService');

/**
 * Enables the convenient display of rich markdown-based hovers in the workbench.
 */
export interface IHoverService {
	readonly _serviceBrand: undefined;

	/**
	 * Shows a hover, provided a hover with the same options object is not already visible.
	 * @param options A set of options defining the characteristics of the hover.
	 * @param focus Whether to focus the hover (useful for keyboard accessibility).
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
	showHover(options: Readonly<IHoverOptions>, focus?: boolean): IHoverWidget | undefined;

	/**
	 * Hides the hover if it was visible. This call will be ignored if the the hover is currently
	 * "locked" via the alt/option key.
	 */
	hideHover(): void;

	/**
	 * This should only be used until we have the ability to show multiple context views
	 * simultaneously. #188822
	 */
	showAndFocusLastHover(): void;
}

export interface IHoverWidget extends IDisposable {
	readonly isDisposed: boolean;
}

export interface IHoverOptions {
	/**
	 * The content to display in the primary section of the hover. The type of text determines the
	 * default `hideOnHover` behavior.
	 */
	content: IMarkdownString | string | HTMLElement;

	/**
	 * The target for the hover. This determines the position of the hover and it will only be
	 * hidden when the mouse leaves both the hover and the target. A HTMLElement can be used for
	 * simple cases and a IHoverTarget for more complex cases where multiple elements and/or a
	 * dispose method is required.
	 */
	target: IHoverTarget | HTMLElement;

	/**
	 * An ID to associate with the hover to be used as an equality check. Normally when calling
	 * {@link IHoverService.showHover} the options object itself is used to determine if the hover
	 * is the same one that is already showing, when this is set, the ID will be used instead.
	 */
	id?: number | string;

	/**
	 * A set of actions for the hover's "status bar".
	 */
	actions?: IHoverAction[];

	/**
	 * An optional array of classes to add to the hover element.
	 */
	additionalClasses?: string[];

	/**
	 * An optional link handler for markdown links, if this is not provided the IOpenerService will
	 * be used to open the links using its default options.
	 */
	linkHandler?(url: string): void;

	/**
	 * Whether to hide the hover when the mouse leaves the `target` and enters the actual hover.
	 * This is false by default when text is an `IMarkdownString` and true when `text` is a
	 * `string`. Note that this will be ignored if any `actions` are provided as hovering is
	 * required to make them accessible.
	 *
	 * In general hiding on hover is desired for:
	 * - Regular text where selection is not important
	 * - Markdown that contains no links where selection is not important
	 */
	hideOnHover?: boolean;

	/**
	 * When {@link hideOnHover} is explicitly true or undefined and its auto value is detected to
	 * hide, show a hint at the bottom of the hover explaining how to mouse over the widget. This
	 * should be used in the cases where despite the hover having no interactive content, it's
	 * likely the user may want to interact with it somehow.
	 */
	showHoverHint?: boolean;

	/**
	 * Whether to hide the hover when a key is pressed.
	 */
	hideOnKeyDown?: boolean;

	/**
	 * Position of the hover. The default is to show above the target. This option will be ignored
	 * if there is not enough room to layout the hover in the specified position, unless the
	 * forcePosition option is set.
	 */
	hoverPosition?: HoverPosition;

	/**
	 * Force the hover position, reducing the size of the hover instead of adjusting the hover
	 * position.
	 */
	forcePosition?: boolean;

	/**
	 * Whether to show the hover pointer
	 */
	showPointer?: boolean;

	/**
	 * Whether to show a compact hover
	 */
	compact?: boolean;

	/**
	 * Whether to skip the fade in animation, this should be used when hovering from one hover to
	 * another in the same group so it looks like the hover is moving from one element to the other.
	 */
	skipFadeInAnimation?: boolean;

	/**
	 * Whether to trap focus in the following ways:
	 * - When the hover closes, focus goes to the element that had focus before the hover opened
	 * - If there are elements in the hover to focus, focus stays inside of the hover when tabbing
	 * Note that this is overridden to true when in screen reader optimized mode.
	 */
	trapFocus?: boolean;

	/*
	 * The container to pass to {@link IContextViewProvider.showContextView} which renders the hover
	 * in. This is particularly useful for more natural tab focusing behavior, where the hover is
	 * created as the next tab index after the element being hovered and/or to workaround the
	 * element's container hiding on `focusout`.
	 */
	container?: HTMLElement;
}

export interface IHoverAction {
	/**
	 * The label to use in the hover's status bar.
	 */
	label: string;

	/**
	 * The command ID of the action, this is used to resolve the keybinding to display after the
	 * action label.
	 */
	commandId: string;

	/**
	 * An optional class of an icon that will be displayed before the label.
	 */
	iconClass?: string;

	/**
	 * The callback to run the action.
	 * @param target The action element that was activated.
	 */
	run(target: HTMLElement): void;
}

/**
 * A target for a hover.
 */
export interface IHoverTarget extends IDisposable {
	/**
	 * A set of target elements used to position the hover. If multiple elements are used the hover
	 * will try to not overlap any target element. An example use case for this is show a hover for
	 * wrapped text.
	 */
	readonly targetElements: readonly HTMLElement[];

	/**
	 * An optional absolute x coordinate to position the hover with, for example to position the
	 * hover using `MouseEvent.pageX`.
	 */
	x?: number;

	/**
	 * An optional absolute y coordinate to position the hover with, for example to position the
	 * hover using `MouseEvent.pageY`.
	 */
	y?: number;
}
