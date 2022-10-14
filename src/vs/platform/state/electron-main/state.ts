/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStateService } from 'vs/platform/state/node/state';

export const IStateMainService = createDecorator<IStateMainService>('stateMainService');

export interface IStateMainService extends IStateService {

	readonly _serviceBrand: undefined;

	setItem(key: string, data?: object | string | number | boolean | undefined | null): void;
	setItems(items: readonly { key: string; data?: object | string | number | boolean | undefined | null }[]): void;

	removeItem(key: string): void;

	close(): Promise<void>;
}
