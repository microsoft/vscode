/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
// Unused imports commented out since runtime sessions container is disabled
// import { Codicon } from '../../../../base/common/codicons.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
// import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
// Unused imports commented out since runtime sessions container is disabled
// import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
// import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
// import { ViewContainer, IViewContainersRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions, IViewsRegistry, IViewDescriptor } from '../../../common/views.js';
// import { ErdosRuntimeSessionsViewPane } from './erdosRuntimeSessionsView.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope, } from '../../../../platform/configuration/common/configurationRegistry.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';

// The Erdos sessions view icon (disabled since container is not registered).
// const erdosRuntimeSessionsViewIcon = registerIcon(
// 	'erdos-runtime-sessions-view-icon',
// 	Codicon.versions,
// 	nls.localize('erdosRuntimeSessionsViewIcon', 'View icon of the Erdos sessions view.')
// );

// The configuration key for showing the sessions view.
const SHOW_SESSIONS_CONFIG_KEY = 'erdos.showSessions';

// Register configuration options for the runtime service
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'erdos',
	order: 20,
	type: 'object',
	title: nls.localize('erdosConfiguration', "Erdos"),
	properties: {
		'erdos.showSessions': {
			scope: ConfigurationScope.MACHINE,
			type: 'boolean',
			default: false,
			description: nls.localize('erdos.showSessions', "Enable debug Runtimes pane listing active interpreter sessions.")
		},
	}
});

// Runtime sessions view container registration disabled to remove from Activity Bar
// const ERDOS_RUNTIME_SESSIONS_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
// 	id: ERDOS_RUNTIME_VIEW_CONTAINER_ID,
// 	title: {
// 		value: nls.localize('erdos.view.runtime.view', "Runtimes"),
// 		original: 'Runtimes'
// 	},
// 	icon: erdosRuntimeSessionsViewIcon,
// 	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [ERDOS_RUNTIME_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
// 	storageId: ERDOS_RUNTIME_VIEW_CONTAINER_ID,
// 	hideIfEmpty: false,
// 	order: 10,
// }, ViewContainerLocation.AuxiliaryBar, {
// 	doNotRegisterOpenCommand: false,
// 	isDefault: false
// });

/**
 * The Erdos runtime sessions contribution; manages the Erdos sessions
 * view. Its main responsibility is managing the state of the view based on the
 * configuration. As the configuration changes, it registers or deregisters the
 * view.
 */
class ErdosRuntimeSessionsContribution extends Disposable {
	private _viewRegistered = false;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();

		// Register the view if the configuration is set to show it.
		if (this._configurationService.getValue<boolean>(SHOW_SESSIONS_CONFIG_KEY)) {
			this.registerSessionsView();
		}

		// Register the configuration change listener. If the user turns on the configuration, we
		// register the view. This allows us to toggle the view on and off without restarting the
		// workbench.
		this._configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(SHOW_SESSIONS_CONFIG_KEY)) {
				if (this._configurationService.getValue<boolean>(SHOW_SESSIONS_CONFIG_KEY)) {
					this.registerSessionsView();
				} else {
					// Runtime sessions container is disabled, no deregistration needed
					this._viewRegistered = false;
				}
			}
		});
	}

	/**
	 * Registers the Sessions view within the already-created container.
	 */
	private registerSessionsView(): void {
		// Prevent duplicate registration
		if (this._viewRegistered) {
			return;
		}

		// Runtime sessions container is disabled, cannot register views
		// Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews(
		// 	[
		// 		this.runtimeSessionViewDescriptor()
		// 	],
		// 	ERDOS_RUNTIME_SESSIONS_CONTAINER
		// );

		// Mark as registered to prevent duplicates
		this._viewRegistered = true;
	}

	/**
	 * Creates the view descriptor for the Erdos sessions view.
	 * Disabled since runtime sessions container is not registered.
	 *
	 * @returns The view descriptor for the Erdos sessions view.
	 */
	// private runtimeSessionViewDescriptor(): IViewDescriptor {
	// 	const descriptor: IViewDescriptor = {
	// 		id: ERDOS_RUNTIME_SESSIONS_VIEW_ID,
	// 		name: {
	// 			value: nls.localize('erdos.view.runtime.sessions', "Sessions"),
	// 			original: 'Sessions'
	// 		},
	// 		ctorDescriptor: new SyncDescriptor(ErdosRuntimeSessionsViewPane),
	// 		collapsed: false,
	// 		canToggleVisibility: true,
	// 		hideByDefault: false,
	// 		canMoveView: true,
	// 		containerIcon: erdosRuntimeSessionsViewIcon,
	// 		openCommandActionDescriptor: {
	// 			id: 'workbench.action.erdos.toggleSessions',
	// 			mnemonicTitle: nls.localize({ key: 'miToggleSessions', comment: ['&& denotes a mnemonic'] }, "&&Sessions"),
	// 			keybindings: {},
	// 			order: 1,
	// 		}
	// 	};

	// 	return descriptor;
	// }
}

// Register workbench contributions.
const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(ErdosRuntimeSessionsContribution, LifecyclePhase.Restored);
