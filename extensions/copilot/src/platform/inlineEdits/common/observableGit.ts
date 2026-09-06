/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { autorunWithStore, IObservable, ISettableObservable, mapObservableArrayCached, observableFromEvent, observableValue, waitForState } from '../../../util/vs/base/common/observable';
import { IGitExtensionService } from '../../git/common/gitExtensionService';
import { API } from '../../git/vscode/git';

export class ObservableGit extends Disposable {

	private readonly _gitApi: IObservable<API | undefined>;

	public readonly branch: ISettableObservable<string | undefined, void>;

	constructor(
		@IGitExtensionService private readonly _gitExtensionService: IGitExtensionService,
	) {
		super();

		this._gitApi = observableFromEvent(this, (listener) => this._gitExtensionService.onDidChange(listener), () => this._gitExtensionService.getExtensionApi());

		this.branch = observableValue<string | undefined>('branchName', undefined);

		this.init();
	}

	async init() {
		const gitApi = await waitForState(this._gitApi);
		if (this._store.isDisposed) {
			return;
		}

		const repos = observableFromEvent(this, (e) => gitApi.onDidOpenRepository(e), () => gitApi.repositories ?? []);

		await waitForState(repos, (repos) => repos.length > 0, undefined);
		if (this._store.isDisposed) {
			return;
		}

		mapObservableArrayCached(this, repos, (repo, store) => {
			const stateChangeObservable = observableFromEvent(listener => repo.state.onDidChange(listener), () => repo.state.HEAD?.name);
			store.add(autorunWithStore((reader, _store) => {
				this.branch.set(stateChangeObservable.read(reader), undefined);
			}));
		}, repo => repo.rootUri.toString()).recomputeInitiallyAndOnChange(this._store);
	}
}
