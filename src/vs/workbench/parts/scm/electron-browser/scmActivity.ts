/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { IDisposable, dispose, empty as EmptyDisposable, OneDisposable } from 'vs/base/common/lifecycle';
import { VIEWLET_ID } from 'vs/workbench/parts/scm/common/scm';
import { ISCMService, ISCMRepository } from 'vs/workbench/services/scm/common/scm';
import { IActivityBarService, NumberBadge } from 'vs/workbench/services/activity/common/activityBarService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';

export class StatusUpdater implements IWorkbenchContribution {

	static ID = 'vs.scm.statusUpdater';

	private providerChangeDisposable: IDisposable = EmptyDisposable;
	private badgeHandle = new OneDisposable();
	private disposables: IDisposable[] = [];

	constructor(
		@ISCMService private scmService: ISCMService,
		@IActivityBarService private activityBarService: IActivityBarService
	) {
		this.scmService.onDidChangeRepository(this.setActiveRepository, this, this.disposables);
		this.setActiveRepository(this.scmService.activeRepository);
		this.disposables.push(this.badgeHandle);
	}

	getId(): string {
		return StatusUpdater.ID;
	}

	private setActiveRepository(repository: ISCMRepository | undefined): void {
		this.providerChangeDisposable.dispose();
		this.providerChangeDisposable = repository ? repository.provider.onDidChange(this.update, this) : EmptyDisposable;
		this.update();
	}

	private update(): void {
		const repository = this.scmService.activeRepository;

		let count = 0;

		if (repository) {
			if (typeof repository.provider.count === 'number') {
				count = repository.provider.count;
			} else {
				count = repository.provider.resources.reduce<number>((r, g) => r + g.resources.length, 0);
			}
		}

		if (count > 0) {
			const badge = new NumberBadge(count, num => localize('scmPendingChangesBadge', '{0} pending changes', num));
			this.badgeHandle.value = this.activityBarService.showActivity(VIEWLET_ID, badge, 'scm-viewlet-label');
		} else {
			this.badgeHandle.value = null;
		}
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
