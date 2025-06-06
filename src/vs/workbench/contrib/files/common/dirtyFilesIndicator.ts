/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { VIEWLET_ID } from './files.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IActivityService, NumberBadge } from '../../../services/activity/common/activity.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
import { IWorkingCopy, WorkingCopyCapabilities } from '../../../services/workingCopy/common/workingCopy.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';

export class DirtyFilesIndicator extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.dirtyFilesIndicator';

	private readonly badgeHandle = this._register(new MutableDisposable());

	private lastKnownDirtyCount = 0;

	constructor(
		@IActivityService private readonly activityService: IActivityService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService
	) {
		super();

		this.updateActivityBadge();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Working copy dirty indicator
		this._register(this.workingCopyService.onDidChangeDirty(workingCopy => this.onWorkingCopyDidChangeDirty(workingCopy)));
	}

	private onWorkingCopyDidChangeDirty(workingCopy: IWorkingCopy): void {
		const gotDirty = workingCopy.isDirty();
		if (gotDirty && !(workingCopy.capabilities & WorkingCopyCapabilities.Untitled) && this.filesConfigurationService.hasShortAutoSaveDelay(workingCopy.resource)) {
			return; // do not indicate dirty of working copies that are auto saved after short delay
		}

		if (gotDirty || this.lastKnownDirtyCount > 0) {
			this.updateActivityBadge();
		}
	}

	private updateActivityBadge(): void {
		const dirtyCount = this.lastKnownDirtyCount = this.workingCopyService.dirtyCount;

		// Indicate dirty count in badge if any
		if (dirtyCount > 0) {
			this.badgeHandle.value = this.activityService.showViewContainerActivity(
				VIEWLET_ID,
				{
					badge: new NumberBadge(dirtyCount, num => num === 1 ? nls.localize('dirtyFile', "1 unsaved file") : nls.localize('dirtyFiles', "{0} unsaved files", dirtyCount)),
				}
			);
		} else {
			this.badgeHandle.clear();
		}
	}
}
