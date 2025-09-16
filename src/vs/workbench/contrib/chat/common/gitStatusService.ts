/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { autorun, runOnChange } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ISCMService } from '../../scm/common/scm.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';

export const IGitStatus = createDecorator<IGitStatus>('gitStatus');

export interface IGitStatus {
	readonly _serviceBrand: undefined;
	/**
	 * Best-effort current branch name. Undefined when:
	 *  - No repositories
	 *  - Multiple repositories (ambiguous)
	 *  - Provider has no history (branch concept unavailable)
	 */
	getCurrentBranch(): string | undefined;

	/**
	 * Event that fires when the current branch changes
	 */
	readonly onChangedBranch: Event<string | undefined>;
}

class GitStatusService extends Disposable implements IGitStatus {
	declare readonly _serviceBrand: undefined;

	private readonly _onChangedBranch = this._register(new Emitter<string | undefined>());
	readonly onChangedBranch = this._onChangedBranch.event;

	constructor(
		@ISCMService private readonly scmService: ISCMService,
	) {
		super();
		this._setupBranchChangeListener();
	}

	private _setupBranchChangeListener(): void {
		// Listen for new repositories being added
		this._register(this.scmService.onDidAddRepository(repo => {
			this._setupRepositoryListener(repo);
		}));

		// Handle existing repositories
		for (const repo of this.scmService.repositories) {
			this._setupRepositoryListener(repo);
		}
	}

	private _setupRepositoryListener(repo: any): void {
		// Use autorun to react to changes in the historyProvider observable
		this._register(autorun(reader => {
			/** @description GitStatusService.historyProviderAutorun */
			const historyProvider = repo.provider.historyProvider.read(reader);

			if (historyProvider?.historyItemRefChanges) {
				// Set up listener for history item ref changes
				return runOnChange(historyProvider.historyItemRefChanges, () => {
					// Fire event when the current branch reference changes
					const currentBranch = this.getCurrentBranch();
					this._onChangedBranch.fire(currentBranch);
				});
			}
			return undefined;
		}));
	}

	getCurrentBranch(): string | undefined {
		const repos = Array.from(this.scmService.repositories);
		if (repos.length !== 1) {
			return undefined; // Avoid ambiguity with multiple repos
		}

		const repo = repos[0];
		const historyProvider = repo.provider.historyProvider.get();
		const ref = historyProvider?.historyItemRef.get();
		return ref?.name;
	}


}

registerSingleton(IGitStatus, GitStatusService, InstantiationType.Delayed);
