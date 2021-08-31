/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IAriaAlertService = createDecorator<IAriaAlertService>('IAriaAlertService');

export interface IAriaAlertService {
	readonly _serviceBrand: undefined;

	/**
	 * Given the provided message, will make sure that it is read as alert to screen readers.
	 */
	alert(msg: string): void;
}
