/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IActivityService, IBadge } from 'vs/workbench/services/activity/common/activity';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IActivityBarService } from 'vs/workbench/services/activityBar/browser/activityBarService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class ActivityService implements IActivityService {

	public _serviceBrand: any;

	constructor(
		@IPanelService private readonly panelService: IPanelService,
		@IActivityBarService private readonly activityBarService: IActivityBarService
	) { }

	showActivity(compositeOrActionId: string, badge: IBadge, clazz?: string, priority?: number): IDisposable {
		if (this.panelService.getPanels().filter(p => p.id === compositeOrActionId).length) {
			return this.panelService.showActivity(compositeOrActionId, badge, clazz);
		}

		return this.activityBarService.showActivity(compositeOrActionId, badge, clazz, priority);
	}
}

registerSingleton(IActivityService, ActivityService, true);