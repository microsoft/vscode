/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { observableValue } from '../../../../../base/common/observable.js';
import { IMcpServer, IMcpService, LazyCollectionState } from '../../common/mcpTypes.js';

export class TestMcpService implements IMcpService {
	declare readonly _serviceBrand: undefined;
	public servers = observableValue<readonly IMcpServer[]>(this, []);
	resetCaches(): void {

	}
	resetTrust(): void {

	}

	autostart(): Promise<void> {
		return Promise.resolve();
	}

	public lazyCollectionState = observableValue(this, { state: LazyCollectionState.AllKnown, collections: [] });

	activateCollections(): Promise<void> {
		return Promise.resolve();
	}
}
