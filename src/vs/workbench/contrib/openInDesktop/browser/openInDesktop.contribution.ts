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
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { URI } from 'vs/base/common/uri';
import { IProductService } from 'vs/platform/product/common/productService';
import { Schemas } from 'vs/base/common/network';
import { posix } from 'vs/base/common/path';

export class OpenInDesktopIndicator extends Disposable implements IWorkbenchContribution {

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IWorkspaceContextService workspaceService: IWorkspaceContextService
	) {
		super();

		// "Open in Desktop" is only supported from an opened folder or workspace
		if (workspaceService.getWorkbenchState() !== WorkbenchState.EMPTY) {
			this.installOpenInDesktopIndicator();
		}
	}

	private installOpenInDesktopIndicator(): void {
		const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
		registry.registerWorkbenchAction(SyncActionDescriptor.create(OpenInDesktopAction, OpenInDesktopAction.ID, OpenInDesktopAction.LABEL), 'Open Workspace in Desktop');

		const properties: IStatusbarEntry = {
			backgroundColor: themeColorFromId(STATUS_BAR_PROMINENT_ITEM_BACKGROUND),
			color: themeColorFromId(STATUS_BAR_PROMINENT_ITEM_FOREGROUND),
			text: localize('openInDesktop', "Open in Desktop"),
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
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IProductService private readonly productService: IProductService
	) {
		super(id, label);
	}

	async run(): Promise<boolean> {

		// Figure out the remote workspace URI to use
		let workspaceUri: URI | undefined = undefined;
		const workspace = this.workspaceService.getWorkspace();
		switch (this.workspaceService.getWorkbenchState()) {
			case WorkbenchState.FOLDER:
				workspaceUri = workspace.folders[0].uri;
				break;
			case WorkbenchState.WORKSPACE:
				workspaceUri = workspace.configuration!;
				break;
		}

		if (!workspaceUri) {
			return false;
		}

		// Produce a protocol handler URI, e.g.
		// From: vscode-remote://wsl+ubuntu/mnt/c/GitDevelopment/monaco
		//   To: vscode://vscode-remote/wsl+ubuntu/mnt/c/GitDevelopment/monaco
		const codeProtocolUri = URI.from({
			scheme: this.productService.quality === 'stable' ? 'vscode' : 'vscode-insiders',
			authority: Schemas.vscodeRemote,
			path: posix.join(posix.sep, workspaceUri.authority, workspaceUri.path),
			query: workspaceUri.query,
			fragment: workspaceUri.fragment,
		});

		window.location.href = codeProtocolUri.toString();

		return true;
	}
}
