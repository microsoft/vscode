/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IMarkdownString } from 'vs/base/common/htmlContent';

export const IHoverService = createDecorator<IHoverService>('hoverService');

export interface IHoverService {
	readonly _serviceBrand: undefined;

	showHover(options: IHoverOptions): void;
	hideHover(): void;
}

export interface IHoverOptions {
	/**
	 * The text to display in the primary section of the hover.
	 */
	text: IMarkdownString;

	// TODO: Link handler not necessary?
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
	label: string;
	iconClass?: string;
	run: (target: HTMLElement) => void;
	commandId: string;
}

/**
 * A target for a hover which can know about domain-specific locations.
 */
export interface IHoverTarget extends IDisposable {
	readonly targetElements: readonly HTMLElement[];
}
