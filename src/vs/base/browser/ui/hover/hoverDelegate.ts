/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IHoverWidget, IManagedHoverOptions } from 'vs/base/browser/ui/hover/hover';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IDisposable } from 'vs/base/common/lifecycle';

export interface IHoverDelegateTarget extends IDisposable {
	readonly targetElements: readonly HTMLElement[];
	x?: number;
}

export interface IHoverDelegateOptions extends IManagedHoverOptions {
	/**
	 * The content to display in the primary section of the hover. The type of text determines the
	 * default `hideOnHover` behavior.
	 */
	content: IMarkdownString | string | HTMLElement;
	/**
	 * The target for the hover. This determines the position of the hover and it will only be
	 * hidden when the mouse leaves both the hover and the target. A HTMLElement can be used for
	 * simple cases and a IHoverDelegateTarget for more complex cases where multiple elements and/or a
	 * dispose method is required.
	 */
	target: IHoverDelegateTarget | HTMLElement;
	/**
	 * The container to pass to {@link IContextViewProvider.showContextView} which renders the hover
	 * in. This is particularly useful for more natural tab focusing behavior, where the hover is
	 * created as the next tab index after the element being hovered and/or to workaround the
	 * element's container hiding on `focusout`.
	 */
	container?: HTMLElement;
	/**
	 * Options that defines where the hover is positioned.
	 */
	position?: {
		/**
		 * Position of the hover. The default is to show above the target. This option will be ignored
		 * if there is not enough room to layout the hover in the specified position, unless the
		 * forcePosition option is set.
		 */
		hoverPosition?: HoverPosition;
	};
	appearance?: {
		/**
		 * Whether to show the hover pointer
		 */
		showPointer?: boolean;
		/**
		 * When {@link hideOnHover} is explicitly true or undefined and its auto value is detected to
		 * hide, show a hint at the bottom of the hover explaining how to mouse over the widget. This
		 * should be used in the cases where despite the hover having no interactive content, it's
		 * likely the user may want to interact with it somehow.
		 */
		showHoverHint?: boolean;
		/**
		 * Whether to skip the fade in animation, this should be used when hovering from one hover to
		 * another in the same group so it looks like the hover is moving from one element to the other.
		 */
		skipFadeInAnimation?: boolean;
	};
}

export interface IHoverDelegate {
	showHover(options: IHoverDelegateOptions, focus?: boolean): IHoverWidget | undefined;
	onDidHideHover?: () => void;
	delay: number;
	placement?: 'mouse' | 'element';
	showNativeHover?: boolean; // TODO@benibenj remove this, only temp fix for contextviews
}

export interface IScopedHoverDelegate extends IHoverDelegate, IDisposable { }
