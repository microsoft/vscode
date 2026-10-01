/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../nls.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { Menus } from '../../../browser/menus.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { COMPARE_AGENTS_ENABLED_SETTING } from '../../../services/sessions/common/sessionComparison.js';
import { OPEN_SESSION_COMPARISON_COMMAND_ID } from '../common/sessionComparison.js';
import { SessionComparisonAccessibleView } from './sessionComparisonAccessibleView.js';
import { SessionComparisonToolContribution } from './sessionComparisonTool.js';
import { SessionComparisonGridController } from './sessionComparisonGridController.js';
import { SessionComparisonCustomView } from './sessionComparisonView.js';
import { ISessionComparisonViewService, SESSION_COMPARISON_VIEW_ID, SessionComparisonViewService } from './sessionComparisonViewService.js';

registerSingleton(ISessionComparisonViewService, SessionComparisonViewService, InstantiationType.Delayed);
registerWorkbenchContribution2(SessionComparisonToolContribution.ID, SessionComparisonToolContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(SessionComparisonGridController.ID, SessionComparisonGridController, WorkbenchPhase.Eventually);
AccessibleViewRegistry.register(new SessionComparisonAccessibleView());

/** Shows a comparison as one conversation in place of the session grid. */
class SessionComparisonViewContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.sessionComparisonView';

	constructor(
		@ICustomViewService customViewService: ICustomViewService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		this._register(customViewService.registerCustomView({
			id: SESSION_COMPARISON_VIEW_ID,
			ctor: new SyncDescriptor(SessionComparisonCustomView),
			actions: { style: 'toolbar', menuId: Menus.CustomViewSessionComparison },
		}, {
			restore: configurationService.getValue<boolean>(COMPARE_AGENTS_ENABLED_SETTING) === true,
		}));
	}
}

registerWorkbenchContribution2(SessionComparisonViewContribution.ID, SessionComparisonViewContribution, WorkbenchPhase.BlockRestore);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: OPEN_SESSION_COMPARISON_COMMAND_ID,
			title: localize2('openSessionComparison', "Open Comparison"),
			f1: false,
		});
	}
	override async run(accessor: ServicesAccessor, comparisonId: string): Promise<void> {
		await accessor.get(ISessionComparisonViewService).open(comparisonId);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.openComparisonSideBySide',
			title: localize2('openSessionComparisonSideBySide', "Open Side by Side"),
			icon: Codicon.splitHorizontal,
			f1: false,
			menu: { id: Menus.CustomViewSessionComparison, group: 'navigation', order: 1 },
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const viewService = accessor.get(ISessionComparisonViewService);
		const comparisonId = viewService.activeComparisonId.get();
		if (comparisonId) {
			await viewService.openSideBySide(comparisonId);
		}
	}
});
