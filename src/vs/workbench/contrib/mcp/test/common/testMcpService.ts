/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { observableValue } from '../../../../../base/common/observable.js';
import { ContributionEnablementState, IEnablementModel } from '../../../chat/common/enablement.js';
import { IAutostartResult, IMcpServer, IMcpService, IWorkspaceMcpServersEnablement, LazyCollectionState } from '../../common/mcpTypes.js';

export class TestEnablementModel implements IEnablementModel {
	readEnabled(_key: string): ContributionEnablementState {
		return ContributionEnablementState.EnabledProfile;
	}
	readProfileEnabled(_key: string): boolean {
		return true;
	}
	remove(_key: string): void { }
	setEnabled(_key: string, _state: ContributionEnablementState): void { }
}

export class TestWorkspaceMcpServersEnablement implements IWorkspaceMcpServersEnablement {
	isWorkspaceServer(_serverDefinitionId: string): boolean {
		return false;
	}
	readWorkspaceServersEnabled(): ContributionEnablementState {
		return ContributionEnablementState.EnabledProfile;
	}
	setWorkspaceServersEnabled(_enabled: boolean | undefined): void { }
}

export class TestMcpService implements IMcpService {
	declare readonly _serviceBrand: undefined;
	public servers = observableValue<readonly IMcpServer[]>(this, []);
	public readonly enablementModel: IEnablementModel = new TestEnablementModel();
	public readonly workspaceServersEnablement: IWorkspaceMcpServersEnablement = new TestWorkspaceMcpServersEnablement();
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
