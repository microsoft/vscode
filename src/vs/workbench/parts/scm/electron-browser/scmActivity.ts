/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { IDisposable, dispose, empty as EmptyDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { filterEvent } from 'vs/base/common/event';
import { VIEWLET_ID } from 'vs/workbench/parts/scm/common/scm';
import { ISCMService, ISCMRepository } from 'vs/workbench/services/scm/common/scm';
import { IActivityBarService, NumberBadge } from 'vs/workbench/services/activity/common/activityBarService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';

export class StatusUpdater implements IWorkbenchContribution {

	static ID = 'vs.scm.statusUpdater';

	private badgeDisposable: IDisposable = EmptyDisposable;
	private disposables: IDisposable[] = [];

	constructor(
		@ISCMService private scmService: ISCMService,
		@IActivityBarService private activityBarService: IActivityBarService
	) {
		this.scmService.onDidAddRepository(this.onDidAddRepository, this, this.disposables);
		this.render(this.scmService.repositories);
	}

	getId(): string {
		return StatusUpdater.ID;
	}

	private onDidAddRepository(repository: ISCMRepository): void {
		const changeDisposable = repository.provider.onDidChange(() => this.render(this.scmService.repositories));

		const onDidRemoveThisRepository = filterEvent(this.scmService.onDidRemoveRepository, r => r === repository);
		const removeDisposable = onDidRemoveThisRepository(() => {
			disposable.dispose();
			this.disposables = this.disposables.filter(d => d !== removeDisposable);
		});

		const disposable = combinedDisposable([changeDisposable, removeDisposable]);
		this.disposables.push(disposable);
	}

	private render(repositories: ISCMRepository[]): void {
		const count = repositories.reduce((r, repository) => {
			if (typeof repository.provider.count === 'number') {
				return r + repository.provider.count;
			} else {
				return r + repository.provider.resources.reduce<number>((r, g) => r + g.resources.length, 0);
			}
		}, 0);

		if (count > 0) {
			const badge = new NumberBadge(count, num => localize('scmPendingChangesBadge', '{0} pending changes', num));
			this.badgeDisposable = this.activityBarService.showActivity(VIEWLET_ID, badge, 'scm-viewlet-label');
		} else {
			this.badgeDisposable = EmptyDisposable;
		}
	}

	dispose(): void {
		this.badgeDisposable.dispose();
		this.disposables = dispose(this.disposables);
	}
}
