/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { observableValue } from '../../../../../base/common/observable.js';
import { ContributionEnablementState, IEnablementModel } from '../../../chat/common/enablement.js';
import { IAutostartResult, IMcpServer, IMcpService, LazyCollectionState } from '../../common/mcpTypes.js';

export class TestEnablementModel implements IEnablementModel {
	readEnabled(_key: string): ContributionEnablementState {
		return ContributionEnablementState.EnabledProfile;
	}
	remove(_key: string): void { }
	setEnabled(_key: string, _state: ContributionEnablementState): void { }
}

export class TestMcpService implements IMcpService {
	declare readonly _serviceBrand: undefined;
	public servers = observableValue<readonly IMcpServer[]>(this, []);
	public readonly enablementModel: IEnablementModel = new TestEnablementModel();
	resetCaches(): void {

	}
	resetTrust(): void {

	}

	cancelAutostart(): void {

	}

	autostart() {
		return observableValue<IAutostartResult>(this, { working: false, starting: [], serversRequiringInteraction: [] });
	}

	public lazyCollectionState = observableValue(this, { state: LazyCollectionState.AllKnown, collections: [] });

	activateCollections(): Promise<void> {
		return Promise.resolve();
	}
}
