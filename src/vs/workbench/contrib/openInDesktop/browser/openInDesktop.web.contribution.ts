/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { STATUS_BAR_PROMINENT_ITEM_BACKGROUND, STATUS_BAR_PROMINENT_ITEM_FOREGROUND } from 'vs/workbench/common/theme';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { Disposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchContributionsExtensions } from 'vs/workbench/common/contributions';
import { StatusbarAlignment, IStatusbarService, IStatusbarEntry } from 'vs/workbench/services/statusbar/common/statusbar';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Action } from 'vs/base/common/actions';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IApplicationLink } from 'vs/workbench/workbench.web.api';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IOpenerService } from 'vs/platform/opener/common/opener';

export class OpenInDesktopIndicator extends Disposable implements IWorkbenchContribution {

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IWorkspaceContextService workspaceService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService
	) {
		super();

		const links = environmentService.options?.applicationLinks;
		if (Array.isArray(links) && links?.length > 0) {
			this.installOpenInDesktopIndicator(links);
		}
	}

	private installOpenInDesktopIndicator(links: readonly IApplicationLink[]): void {

		// Register action to trigger "Open In Desktop"
		const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
		registry.registerWorkbenchAction(SyncActionDescriptor.create(OpenInDesktopAction, OpenInDesktopAction.ID, OpenInDesktopAction.LABEL), 'Open Workspace in Desktop');

		// Show in status bar
		const properties: IStatusbarEntry = {
			backgroundColor: themeColorFromId(STATUS_BAR_PROMINENT_ITEM_BACKGROUND),
			color: themeColorFromId(STATUS_BAR_PROMINENT_ITEM_FOREGROUND),
			text: links.length === 1 ? links[0].label : localize('openInDesktop', "Open in Desktop..."),
			command: 'workbench.web.openWorkspaceInDesktop'
		};

		this.statusbarService.addEntry(properties, 'status.openInDesktop', properties.text, StatusbarAlignment.LEFT, Number.MAX_VALUE /* first entry */);
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchContributionsExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(OpenInDesktopIndicator, LifecyclePhase.Starting);

export class OpenInDesktopAction extends Action {
	static readonly ID = 'workbench.web.openWorkspaceInDesktop';
	static readonly LABEL = localize('openWorkspaceInDesktop', "Open Workspace in Desktop");

	constructor(
		id: string,
		label: string,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IOpenerService private readonly openerService: IOpenerService
	) {
		super(id, label);
	}

	async run(): Promise<boolean> {
		const links = this.environmentService.options?.applicationLinks;
		if (Array.isArray(links)) {
			if (links.length === 1) {
				return this.openApplicationLink(links[0]);
			}

			return this.runWithPicker(links);
		}

		return true;
	}

	private async runWithPicker(links: readonly IApplicationLink[]): Promise<boolean> {

		// Show a picker with choices
		const quickPick = this.quickInputService.createQuickPick<IApplicationLink>();
		quickPick.items = links;
		quickPick.placeholder = OpenInDesktopAction.LABEL;
		quickPick.canSelectMany = false;
		quickPick.onDidAccept(() => {
			const selectedItems = quickPick.selectedItems;
			if (selectedItems.length === 1) {
				this.openApplicationLink(selectedItems[0]);
			}
			quickPick.hide();
		});

		quickPick.show();

		return true;
	}

	private async openApplicationLink(link: IApplicationLink): Promise<boolean> {
		this.openerService.open(link.uri, { openExternal: true });

		return true;
	}
}
