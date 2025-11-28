/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IDiagnosticsService } from '../common/diagnosticsService.js';
import { IStatusbarService, StatusbarAlignment, IStatusbarEntryAccessor } from '../../../services/statusbar/browser/statusbar.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ViewContainerExtensions, IViewContainersRegistry, IViewsRegistry, ViewContainer, ViewContainerLocation } from '../../../common/views.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { localize, localize2 } from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DiagnosticsView } from './diagnosticsView.js';
import { DIAGNOSTICS_VIEW_CONTAINER_ID, DIAGNOSTICS_VIEW_ID, DIAGNOSTICS_STATUS_BAR_ID } from '../common/diagnosticsConstants.js';
import { URI } from '../../../../base/common/uri.js';
import type { DiagnosticResult } from '../common/diagnosticsTypes.js';

const diagnosticsViewIcon = registerIcon('diagnostics-view-icon', Codicon.checklist, localize('diagnosticsViewIcon', 'View icon of the diagnostics view.'));

const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(
	ViewContainerExtensions.ViewContainersRegistry
).registerViewContainer({
	id: DIAGNOSTICS_VIEW_CONTAINER_ID,
	title: localize2('diagnostics.panel.title', 'Environment Diagnostics'),
	icon: diagnosticsViewIcon,
	hideIfEmpty: true,
	order: 10,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [
		DIAGNOSTICS_VIEW_CONTAINER_ID,
		{ mergeViewWithContainerWhenSingleView: true }
	]),
	storageId: DIAGNOSTICS_VIEW_CONTAINER_ID,
}, ViewContainerLocation.Panel, { doNotRegisterOpenCommand: true });

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: DIAGNOSTICS_VIEW_ID,
	containerIcon: diagnosticsViewIcon,
	name: localize2('diagnostics.view.name', 'Environment Diagnostics'),
	canToggleVisibility: true,
	canMoveView: true,
	ctorDescriptor: new SyncDescriptor(DiagnosticsView),
	openCommandActionDescriptor: {
		id: 'workbench.actions.view.diagnostics',
		mnemonicTitle: localize({ key: 'miDiagnostics', comment: ['&& denotes a mnemonic'] }, "Environment &&Diagnostics"),
		order: 10
	}
}], VIEW_CONTAINER);

export class DiagnosticsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.diagnostics';

	private statusBarEntry: IStatusbarEntryAccessor | undefined;

	constructor(
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IDiagnosticsService private readonly diagnosticsService: IDiagnosticsService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IFileService private readonly fileService: IFileService
	) {
		super();
		// Initialize asynchronously - errors are handled within initialize()
		this.initialize().catch(() => {
			// Errors are already handled in initialize(), this just prevents unhandled promise rejections
		});
	}

	private async initialize(): Promise<void> {
		if (await this.isVSCodeRepository()) {
			// Check if disposed before registering status bar item
			if (this._store.isDisposed) {
				return;
			}

			this.registerStatusBarItem();

			try {
				const results = await this.diagnosticsService.runDiagnostics();
				// Check again before updating status bar
				if (!this._store.isDisposed) {
					this.updateStatusBar(results);
				}
			} catch (error) {
				// If initial diagnostics fail, status bar will show initial state
				// Subsequent runs via onDidChangeResults will update it
			}

			// Check again before registering event listener
			if (!this._store.isDisposed) {
				this._register(this.diagnosticsService.onDidChangeResults((results) => {
					this.updateStatusBar(results);
				}));
			}
		}
	}

	private async isVSCodeRepository(): Promise<boolean> {
		const workspace = this.workspaceService.getWorkspace();
		if (workspace.folders.length === 0) {
			return false;
		}

		const workspaceRoot = workspace.folders[0].uri;
		const gitFolder = URI.joinPath(workspaceRoot, '.git');
		if (!(await this.fileService.exists(gitFolder))) {
			return false;
		}

		try {
			const packageJsonPath = URI.joinPath(workspaceRoot, 'package.json');
			if (await this.fileService.exists(packageJsonPath)) {
				const content = await this.fileService.readFile(packageJsonPath);
				const packageJson = JSON.parse(content.value.toString());
				if (packageJson.name === 'code-oss-dev') {
					return true;
				}
			}
		} catch {
			// If we can't read or parse package.json, it's not the VS Code repo
		}

		return false;
	}

	private registerStatusBarItem(): void {
		// Dispose any existing entry before creating a new one (defensive programming)
		if (this.statusBarEntry) {
			this.statusBarEntry.dispose();
		}
		this.statusBarEntry = this.statusbarService.addEntry({
			name: localize('diagnostics.statusBar.name', 'Environment Diagnostics'),
			text: '$(check)',
			tooltip: localize('diagnostics.statusBar.tooltip.allPass', 'Environment diagnostics: All checks passed'),
			command: {
				id: 'workbench.actions.view.diagnostics',
				title: localize('diagnostics.statusBar.command', 'Open Environment Diagnostics'),
				arguments: []
			},
			ariaLabel: localize('diagnostics.statusBar.ariaLabel', 'Environment Diagnostics')
		}, DIAGNOSTICS_STATUS_BAR_ID, StatusbarAlignment.RIGHT, 100);
	}

	private updateStatusBar(results: DiagnosticResult[]): void {
		if (!this.statusBarEntry || this._store.isDisposed) {
			return;
		}

		const failedCount = results.filter(r => r.status === 'fail').length;
		const unknownCount = results.filter(r => r.status === 'unknown').length;
		const issueCount = failedCount + unknownCount;

		if (issueCount === 0) {
			this.statusBarEntry.update({
				name: localize('diagnostics.statusBar.name', 'Environment Diagnostics'),
				text: '$(check)',
				tooltip: localize('diagnostics.statusBar.tooltip.allPass', 'Environment diagnostics: All checks passed'),
				command: {
					id: 'workbench.actions.view.diagnostics',
					title: localize('diagnostics.statusBar.command', 'Open Environment Diagnostics'),
					arguments: []
				},
				ariaLabel: localize('diagnostics.statusBar.ariaLabel', 'Environment Diagnostics')
			});
		} else {
			this.statusBarEntry.update({
				name: localize('diagnostics.statusBar.name', 'Environment Diagnostics'),
				text: '$(warning)',
				tooltip: localize('diagnostics.statusBar.tooltip.issues', 'Environment diagnostics: {0} issue{1} found', issueCount, issueCount === 1 ? '' : 's'),
				command: {
					id: 'workbench.actions.view.diagnostics',
					title: localize('diagnostics.statusBar.command', 'Open Environment Diagnostics'),
					arguments: []
				},
				ariaLabel: localize('diagnostics.statusBar.ariaLabel', 'Environment Diagnostics')
			});
		}
	}

	override dispose(): void {
		this.statusBarEntry?.dispose();
		this.statusBarEntry = undefined;
		super.dispose();
	}
}

registerWorkbenchContribution2(
	DiagnosticsContribution.ID,
	DiagnosticsContribution,
	WorkbenchPhase.Eventually
);

