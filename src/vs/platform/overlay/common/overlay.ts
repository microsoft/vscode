/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise } from 'vs/base/common/async';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IOverlayService = createDecorator<IOverlayService>('overlayService');

export interface IOverlayOptions {
	cancelId?: number;
}

/**
* A service to bring up modal overlays.
*/
export interface IOverlayService {

	_serviceBrand: any;

	/**
	 * Present a modal dialog to the user.
	 *
	 * @returns A promise that can be canceled to hide the overlay.
	 */

	show(message: string, buttons: string[], options?: IOverlayOptions): CancelablePromise<number>;
}