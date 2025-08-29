/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservableSignal } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IChatLayoutService = createDecorator<IChatLayoutService>('chatLayoutService');

export interface IChatLayoutService {
	readonly _serviceBrand: undefined;

	readonly configurationChangedSignal: IObservableSignal<void>;
}
