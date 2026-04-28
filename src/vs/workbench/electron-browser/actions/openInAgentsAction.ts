/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/openInAgents.css';
import { $, append } from '../../../base/browser/dom.js';
import { getDefaultHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../base/common/actions.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { isMacintosh, isWindows } from '../../../base/common/platform.js';
import { localize, localize2 } from '../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../platform/actions/common/actions.js';
import { IActionViewItemService } from '../../../platform/actions/browser/actionViewItemService.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { INativeHostService } from '../../../platform/native/common/native.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../platform/workspace/common/workspace.js';
import { ToggleTitleBarConfigAction, TitleBarLeadingActionsGroup } from '../../browser/parts/titlebar/titlebarActions.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../common/contributions.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../common/contextkeys.js';
import { workbenchConfigurationNodeBase } from '../../common/configuration.js';
import { IWorkbenchEnvironmentService } from '../../services/environment/common/environmentService.js';
import { ChatEntitlementContextKeys } from '../../services/chat/common/chatEntitlementService.js';

const OpenInAgentsActionId = 'workbench.action.openInAgents';
const OpenInAgentsEnabledSetting = 'workbench.openInAgents.enabled';

// Context key tracking the current product quality so we can hide the
// "Open in Agents" entry in stable builds for now.
const OpenInAgentsProductQualityContext = new RawContextKey<string>('openInAgentsProductQuality', '');

type OpenInAgentsMode = 'siblingApp' | 'newWindow';

type OpenInAgentsEvent = { mode: OpenInAgentsMode };
type OpenInAgentsClassification = {
	owner: 'osortega';
	comment: 'Tracks when the user opens the Agents application from the VS Code titlebar.';
	mode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the Agents app was opened: siblingApp (launched separate Agents app) or newWindow (in-process agents window).' };
};

const OpenInAgentsVisibility = ContextKeyExpr.and(
	ContextKeyExpr.equals(`config.${OpenInAgentsEnabledSetting}`, true),
	IsSessionsWindowContext.toNegated(),
	IsAuxiliaryWindowContext.toNegated(),
	// Hide whenever the user has signaled (or policy/workspace trust dictates)
	// that AI features should not be shown in this window/workspace.
	ChatEntitlementContextKeys.Setup.hidden.negate(),
	ChatEntitlementContextKeys.Setup.disabled.negate(),
	ChatEntitlementContextKeys.Setup.disabledInWorkspace.negate(),
	ChatEntitlementContextKeys.Setup.untrusted.negate(),
	// Hide in stable builds for now (insider, exploration and OSS dev are allowed).
	ContextKeyExpr.notEquals(OpenInAgentsProductQualityContext.key, 'stable'),
);

/**
 * Action that opens the Agents application for the current workspace.
 *
 * In built builds where a sibling Agents app is registered (`darwinSiblingBundleIdentifier`
 * / `win32SiblingExeBasename`), launches it via {@link INativeHostService.launchSiblingApp}
 * with `--agents` and the current workspace folder/file. Otherwise falls back to opening
 * a new in-process Agents window via {@link INativeHostService.openAgentsWindow}.
 */
class OpenInAgentsAction extends Action2 {

	constructor() {
		super({
			id: OpenInAgentsActionId,
			title: localize2('openInAgents', "Open in Agents"),
			f1: true,
			precondition: OpenInAgentsVisibility,
			menu: [{
				// Render in the global titlebar tool bar in the dedicated leading
				// slot so we appear before the layout controls (and stay visible
				// when layout controls are toggled off).
				id: MenuId.TitleBar,
				group: TitleBarLeadingActionsGroup,
				order: -1000,
				when: OpenInAgentsVisibility,
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);
		const productService = accessor.get(IProductService);
		const environmentService = accessor.get(IWorkbenchEnvironmentService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const telemetryService = accessor.get(ITelemetryService);

		const args: string[] = ['--new-window'];

		const workspace = workspaceContextService.getWorkspace();
		switch (workspaceContextService.getWorkbenchState()) {
			case WorkbenchState.FOLDER:
				if (workspace.folders.length > 0) {
					args.push('--folder-uri', workspace.folders[0].uri.toString());
				}
				break;
			case WorkbenchState.WORKSPACE:
				if (workspace.configuration) {
					args.push('--file-uri', workspace.configuration.toString());
				}
				break;
		}

		const hasSibling = !!(
			productService.darwinSiblingBundleIdentifier ||
			productService.win32SiblingExeBasename
		);

		// In built builds with a sibling Agents app available, launch it.
		// Otherwise (dev / OSS / unsupported platform / no sibling), open a new agents window of
		// the current Electron app. `launchSiblingApp` is only implemented for macOS/Windows
		// (see `src/vs/platform/native/node/siblingApp.ts`), so gate on actual platform support.
		const canLaunchSiblingApp = isMacintosh || isWindows;
		const mode: OpenInAgentsMode = environmentService.isBuilt && hasSibling && canLaunchSiblingApp ? 'siblingApp' : 'newWindow';
		telemetryService.publicLog2<OpenInAgentsEvent, OpenInAgentsClassification>('vscode.openInAgents', { mode });

		if (mode === 'siblingApp') {
			await nativeHostService.launchSiblingApp(args);
		} else {
			await nativeHostService.openAgentsWindow({ forceNewWindow: true });
		}
	}
}

/**
 * Renders the "Open in Agents" titlebar entry as an icon-only button that
 * expands to reveal a label on hover / keyboard focus.
 */
class OpenInAgentsTitleBarWidget extends BaseActionViewItem {

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);

		container.classList.add('open-in-agents-titlebar-widget');
		container.setAttribute('role', 'button');

		const label = this.action.label || localize('openInAgentsLabel', "Open in Agents");
		container.setAttribute('aria-label', label);
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), container, label));

		const icon = append(container, $('span.open-in-agents-titlebar-widget-icon'));
		icon.setAttribute('aria-hidden', 'true');

		const labelEl = append(container, $('span.open-in-agents-titlebar-widget-label'));
		labelEl.textContent = label;
	}
}

class OpenInAgentsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.openInAgents.desktop';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IProductService productService: IProductService,
	) {
		super();
		OpenInAgentsProductQualityContext.bindTo(contextKeyService).set(productService.quality ?? '');
		this._register(actionViewItemService.register(MenuId.TitleBar, OpenInAgentsActionId, (action, options) => {
			return instantiationService.createInstance(OpenInAgentsTitleBarWidget, action, options);
		}, undefined));
	}
}

registerAction2(OpenInAgentsAction);
registerWorkbenchContribution2(OpenInAgentsContribution.ID, OpenInAgentsContribution, WorkbenchPhase.BlockRestore);

// Toggle entry in titlebar context menu (right-click on titlebar)
registerAction2(class ToggleOpenInAgents extends ToggleTitleBarConfigAction {
	constructor() {
		super(
			OpenInAgentsEnabledSetting,
			localize('toggle.openInAgents', 'Open in Agents'),
			localize('toggle.openInAgentsDescription', "Toggle visibility of the Open in Agents button in title bar"),
			6,
		);
	}
});

// Configuration setting backing the toggle.
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		[OpenInAgentsEnabledSetting]: {
			type: 'boolean',
			default: true,
			markdownDescription: localize('openInAgentsEnabled', "Controls whether the Open in Agents button is shown in the title bar."),
		}
	}
});
