/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { SessionsCategories } from '../../../common/categories.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IViewContainersRegistry, IViewsRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions, WindowVisibility } from '../../../../workbench/common/views.js';
import { OutputViewPane } from '../../../../workbench/contrib/output/browser/outputView.js';
import { OUTPUT_VIEW_ID } from '../../../../workbench/services/output/common/output.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';

const SESSIONS_LOGS_CONTAINER_ID = 'workbench.sessions.panel.logsContainer';

const CONTEXT_SESSIONS_SHOW_LOGS = new RawContextKey<boolean>('sessionsShowLogs', false);

const logsViewIcon = registerIcon('sessions-logs-view-icon', Codicon.output, localize('sessionsLogsViewIcon', 'View icon of the logs view in the sessions window.'));

class RegisterLogsViewContainerContribution implements IWorkbenchContribution {

	static readonly ID = 'sessions.registerLogsViewContainer';

	constructor() {
		const viewContainerRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

		// Deregister the output view and its container from the original registration
		const outputViewContainer = viewContainerRegistry.get(OUTPUT_VIEW_ID);
		if (outputViewContainer) {
			const view = viewsRegistry.getView(OUTPUT_VIEW_ID);
			if (view) {
				viewsRegistry.deregisterViews([view], outputViewContainer);
			}
			viewContainerRegistry.deregisterViewContainer(outputViewContainer);
		}

		// Register a new logs view container in the Panel for the sessions window
		const logsViewContainer = viewContainerRegistry.registerViewContainer({
			id: SESSIONS_LOGS_CONTAINER_ID,
			title: localize2('logs', "Logs"),
			icon: logsViewIcon,
			order: 2,
			ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [SESSIONS_LOGS_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
			storageId: SESSIONS_LOGS_CONTAINER_ID,
			hideIfEmpty: true,
			windowVisibility: WindowVisibility.Sessions,
		}, ViewContainerLocation.Panel, { doNotRegisterOpenCommand: true });

		// Re-register the output view inside the new logs container with a `when` context
		viewsRegistry.registerViews([{
			id: OUTPUT_VIEW_ID,
			name: localize2('logs', "Logs"),
			containerIcon: logsViewIcon,
			ctorDescriptor: new SyncDescriptor(OutputViewPane),
			canToggleVisibility: true,
			canMoveView: false,
			when: CONTEXT_SESSIONS_SHOW_LOGS,
			windowVisibility: WindowVisibility.Sessions,
		}], logsViewContainer);
	}
}

registerWorkbenchContribution2(RegisterLogsViewContainerContribution.ID, RegisterLogsViewContainerContribution, WorkbenchPhase.BlockStartup);

// Command: Sessions: Show Logs
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.sessions.action.showLogs',
			title: localize2('sessionsShowLogs', "Show Logs"),
			category: SessionsCategories.Sessions,
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const contextKeyService = accessor.get(IContextKeyService);
		const viewsService = accessor.get(IViewsService);
		CONTEXT_SESSIONS_SHOW_LOGS.bindTo(contextKeyService).set(true);
		await viewsService.openView(OUTPUT_VIEW_ID, true);
	}
});
