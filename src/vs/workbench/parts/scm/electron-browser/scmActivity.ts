/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { IDisposable, dispose, empty as EmptyDisposable, OneDisposable } from 'vs/base/common/lifecycle';
import { VIEWLET_ID } from 'vs/workbench/parts/scm/common/scm';
import { ISCMService, ISCMProvider } from 'vs/workbench/services/scm/common/scm';
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
		this.scmService.onDidChangeProvider(this.setActiveProvider, this, this.disposables);
		this.setActiveProvider(this.scmService.activeProvider);
		this.disposables.push(this.badgeHandle);
	}

	getId(): string {
		return StatusUpdater.ID;
	}

	private setActiveProvider(activeProvider: ISCMProvider | undefined): void {
		this.providerChangeDisposable.dispose();
		this.providerChangeDisposable = activeProvider ? activeProvider.onDidChange(this.update, this) : EmptyDisposable;
		this.update();
	}

	private update(): void {
		const provider = this.scmService.activeProvider;
		let count = 0;

		if (provider) {
			if (typeof provider.count === 'number') {
				count = provider.count;
			} else {
				count = provider.resources.reduce<number>((r, g) => r + g.resources.length, 0);
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
