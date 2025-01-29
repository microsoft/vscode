/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';

class ContextMenuContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@ILayoutService layoutService: ILayoutService,
		@IContextMenuService contextMenuService: IContextMenuService
	) {
		super();

		const update = (visible: boolean) => layoutService.activeContainer.classList.toggle('context-menu-visible', visible);
		this._register(contextMenuService.onDidShowContextMenu(() => update(true)));
		this._register(contextMenuService.onDidHideContextMenu(() => update(false)));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(ContextMenuContribution, LifecyclePhase.Eventually);
