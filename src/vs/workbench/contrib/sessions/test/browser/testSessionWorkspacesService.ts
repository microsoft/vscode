/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IRecentSessionWorkspace, ISessionWorkspacesService } from '../../common/sessionWorkspaces.js';

/** A workspaces service for tests: the workspaces are what a test sets, and nothing is read or written. */
export class TestSessionWorkspacesService implements ISessionWorkspacesService {
	declare readonly _serviceBrand: undefined;

	readonly enabled: ISettableObservable<boolean>;
	readonly managedWorkspaces: ISettableObservable<readonly IRecentSessionWorkspace[]>;
	readonly recentWorkspaceFiles: ISettableObservable<readonly IRecentSessionWorkspace[]>;
	readonly workspaces: IObservable<readonly IRecentSessionWorkspace[]>;

	constructor(managed: readonly IRecentSessionWorkspace[] = [], enabled = true) {
		this.enabled = observableValue(this, enabled);
		this.managedWorkspaces = observableValue(this, managed);
		this.recentWorkspaceFiles = observableValue(this, []);
		this.workspaces = this.managedWorkspaces;
	}

	getWorkspace(uri: URI): IRecentSessionWorkspace | undefined {
		return [...this.managedWorkspaces.get(), ...this.recentWorkspaceFiles.get()].find(workspace => [workspace.uri, ...workspace.previousUris ?? []].some(candidate => extUri.isEqual(candidate, uri)));
	}

	async resolveWorkspaceFile(): Promise<IRecentSessionWorkspace> { throw new Error('Not supported in tests'); }
	async createWorkspace(): Promise<IRecentSessionWorkspace> { throw new Error('Not supported in tests'); }
	async updateWorkspace(): Promise<IRecentSessionWorkspace> { throw new Error('Not supported in tests'); }
	async removeWorkspace(): Promise<void> { }
	async openWorkspace(): Promise<IRecentSessionWorkspace> { throw new Error('Not supported in tests'); }
	touchWorkspace(): void { }
	async refresh(): Promise<void> { }
}
