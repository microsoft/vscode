/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/diagnosticsView.css';
import { localize } from '../../../../nls.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDiagnosticsService } from '../common/diagnosticsService.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { append, $, clearNode } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import type { DiagnosticResult } from '../common/diagnosticsTypes.js';

export class DiagnosticsView extends ViewPane {
	private readonly resultsContainer: HTMLElement;
	private readonly disposables = this._register(new DisposableStore());
	private isRefreshing = false;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService protected override openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IDiagnosticsService private readonly diagnosticsService: IDiagnosticsService,
		@IProgressService private readonly progressService: IProgressService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this.resultsContainer = $('.diagnostics-results');
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		append(container, this.resultsContainer);

		this.updateResults();

		this.disposables.add(this.diagnosticsService.onDidChangeResults(() => {
			this.updateResults();
		}));
	}

	private updateResults(): void {
		clearNode(this.resultsContainer);
		const results = this.diagnosticsService.getResults();

		if (results.length === 0) {
			const emptyMessage = append(this.resultsContainer, $('.diagnostics-empty'));
			emptyMessage.textContent = localize('diagnostics.empty', 'No diagnostic results available. Click refresh to run checks.');
			return;
		}

		for (const result of results) {
			const item = this.createResultItem(result);
			append(this.resultsContainer, item);
		}
	}

	private createResultItem(result: DiagnosticResult): HTMLElement {
		const item = $('.diagnostics-item');

		const icon = append(item, $('.diagnostics-icon'));
		switch (result.status) {
			case 'pass':
				icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
				icon.style.color = 'var(--vscode-testing-iconPassed)';
				break;
			case 'fail':
				icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
				icon.style.color = 'var(--vscode-testing-iconFailed)';
				break;
			case 'unknown':
				icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.question));
				icon.style.color = 'var(--vscode-descriptionForeground)';
				break;
			case 'info':
				icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
				icon.style.color = 'var(--vscode-textLink-foreground)';
				break;
		}

		const content = append(item, $('.diagnostics-content'));
		const name = append(content, $('.diagnostics-name'));
		name.textContent = result.name;

		const message = append(content, $('.diagnostics-message'));
		message.textContent = result.message;

		if (result.error) {
			const error = append(content, $('.diagnostics-error'));
			error.textContent = result.error;
		}

		if (result.remediation) {
			const remediation = append(content, $('.diagnostics-remediation'));
			remediation.textContent = result.remediation;
		}

		if (result.documentationLink) {
			const link = append(content, $('a.diagnostics-link')) as HTMLAnchorElement;
			link.textContent = localize('diagnostics.viewDocumentation', 'View Documentation');
			link.href = '#';
			link.onclick = (e) => {
				e.preventDefault();
				this.openDocumentation(result.documentationLink!);
			};
		}

		return item;
	}

	private async openDocumentation(anchor: string): Promise<void> {
		const workspace = this.workspaceService.getWorkspace();
		const workspaceRoot = workspace.folders[0]?.uri;
		if (!workspaceRoot) {
			return;
		}

		const contributingUri = URI.joinPath(workspaceRoot, 'CONTRIBUTING.md');
		const fragment = anchor.startsWith('#') ? anchor.slice(1) : anchor;
		const uri = contributingUri.with({ fragment });
		await this.openerService.open(uri);
	}

	async refresh(): Promise<void> {
		if (this.isRefreshing) {
			return;
		}

		this.isRefreshing = true;

		await this.progressService.withProgress(
			{ location: ProgressLocation.Window },
			async () => {
				await this.diagnosticsService.runDiagnostics();
			}
		);

		this.isRefreshing = false;
	}
}

