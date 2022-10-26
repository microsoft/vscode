/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStateMainService } from 'vs/platform/state/electron-main/state';
import { StateService } from 'vs/platform/state/node/stateService';

export class StateMainService extends StateService implements IStateMainService {

	declare readonly _serviceBrand: undefined;

	setItem(key: string, data?: object | string | number | boolean | undefined | null): void {
		this.fileStorage.setItem(key, data);
	}

	setItems(items: readonly { key: string; data?: object | string | number | boolean | undefined | null }[]): void {
		this.fileStorage.setItems(items);
	}

	removeItem(key: string): void {
		this.fileStorage.removeItem(key);
	}

	close(): Promise<void> {
		return this.fileStorage.close();
	}
}
