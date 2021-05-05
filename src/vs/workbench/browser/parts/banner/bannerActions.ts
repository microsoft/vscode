/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { CATEGORIES } from 'vs/workbench/common/actions';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';


export class CloseBannerAction extends Action2 {

	static readonly ID = 'workbench.action.closeBanner';
	static readonly LABEL = localize('closeBanner', "Hide Banner");

	constructor() {
		super({
			id: CloseBannerAction.ID,
			title: { value: CloseBannerAction.LABEL, original: 'Close Banner' }
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(IWorkbenchLayoutService).setBannerHidden(true);
	}
}

registerAction2(CloseBannerAction);

class FocusBannerAction extends Action2 {

	static readonly ID = 'workbench.action.focusBanner';
	static readonly LABEL = localize('focusBanner', "Focus Banner");

	constructor() {
		super({
			id: FocusBannerAction.ID,
			title: { value: FocusBannerAction.LABEL, original: 'Focus Banner' },
			category: CATEGORIES.View,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		layoutService.focusPart(Parts.BANNER_PART);
	}
}

registerAction2(FocusBannerAction);
