/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IQuickNavigateConfiguration, IAutoFocus } from 'vs/base/parts/quickopen/common/quickOpen';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IShowOptions {
	quickNavigateConfiguration?: IQuickNavigateConfiguration;
	inputSelection?: { start: number; end: number; };
	autoFocus?: IAutoFocus;
}

export const IQuickOpenService = createDecorator<IQuickOpenService>('quickOpenService');

export interface IQuickOpenService {

	_serviceBrand: any;

	/**
	 * Asks the container to show the quick open control with the optional prefix set. If the optional parameter
	 * is set for quick navigation mode, the quick open control will quickly navigate when the quick navigate
	 * key is pressed and will run the selection after the ctrl key is released.
	 *
	 * The returned promise completes when quick open is closing.
	 */
	show(prefix?: string, options?: IShowOptions): Promise<void>;

	/**
	 * Allows to navigate from the outside in an opened picker.
	 */
	navigate(next: boolean, quickNavigate?: IQuickNavigateConfiguration): void;

	/**
	 * Accepts the selected value in quick open if visible.
	 */
	accept(): void;

	/**
	 * Focus into the quick open if visible.
	 */
	focus(): void;

	/**
	 * Closes any opened quick open.
	 */
	close(): void;

	/**
	 * Allows to register on the event that quick open is showing
	 */
	onShow: Event<void>;

	/**
	 * Allows to register on the event that quick open is hiding
	 */
	onHide: Event<void>;
}
