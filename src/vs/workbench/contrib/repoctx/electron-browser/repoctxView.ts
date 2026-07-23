/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { join } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { OpenFolderAction } from '../../../browser/actions/workspaceActions.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { ITerminalService } from '../../terminal/browser/terminal.js';
import { findRepoctxEvidence, getRepoctxStageInvocation, getRepoctxStageState, RepoctxEvidence, RepoctxEvidenceStageId, RepoctxStageState } from '../common/repoctx.js';

import '../browser/media/repoctxView.css';

interface IRepoctxStagePresentation {
	readonly id: RepoctxEvidenceStageId;
	readonly title: string;
	readonly description: string;
	readonly command: string;
	readonly icon: ThemeIcon;
	readonly requiresTask: boolean;
	readonly tools?: readonly { readonly name: string; readonly purpose: string }[];
}

interface IRepoctxStageControl {
	readonly stage: IRepoctxStagePresentation;
	readonly artifactPath: string | undefined;
	readonly element: HTMLElement;
	readonly icon: HTMLElement;
	readonly state: HTMLElement;
	readonly action: HTMLButtonElement;
}

export class RepoctxTrustViewPane extends ViewPane {

	static readonly ID = 'workbench.view.repoctx.trust';
	static readonly TITLE = localize2('repoctxTrustView', "Trust");

	private readonly bodyDisposables = this._register(new DisposableStore());
	private content: HTMLElement | undefined;
	private taskInput: HTMLTextAreaElement | undefined;
	private taskRequest = '';
	private runningStage: RepoctxEvidenceStageId | undefined;
	private failedStage: RepoctxEvidenceStageId | undefined;
	private runNotice: { readonly kind: 'info' | 'error'; readonly message: string } | undefined;
	private requestHelp: HTMLElement | undefined;
	private readonly stageControls = new Map<RepoctxEvidenceStageId, IRepoctxStageControl>();
	private refreshToken = 0;

	constructor(
		options: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@IEditorService private readonly editorService: IEditorService,
		@ICommandService private readonly commandService: ICommandService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => void this.refresh()));
		this._register(this.workspaceContextService.onDidChangeWorkbenchState(() => void this.refresh()));
		this._register(this.fileService.onDidFilesChange(event => {
			const folder = this.workspaceContextService.getWorkspace().folders[0];
			if (folder && event.affects(URI.joinPath(folder.uri, '.dev-context'))) {
				void this.refresh();
			}
		}));
		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible) {
				void this.refresh();
			}
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.classList.add('repoctx-trust-view');
		this.content = DOM.append(container, DOM.$('.repoctx-trust-body'));
		void this.refresh();
	}

	async refresh(): Promise<void> {
		if (!this.content) {
			return;
		}

		const token = ++this.refreshToken;
		const folder = this.workspaceContextService.getWorkspace().folders[0];
		if (!folder) {
			this.renderEmptyWorkspace();
			return;
		}

		this.renderLoading(folder.name);
		const evidenceRoot = URI.joinPath(folder.uri, '.dev-context');
		const evidence = await findRepoctxEvidence(relativePath => this.fileService.exists(URI.joinPath(evidenceRoot, relativePath)));
		if (token !== this.refreshToken) {
			return;
		}

		this.renderEvidence(folder.name, evidenceRoot, evidence);
	}

	private renderLoading(repositoryName: string): void {
		if (!this.content) {
			return;
		}

		this.bodyDisposables.clear();
		this.stageControls.clear();
		DOM.clearNode(this.content);
		this.renderSummary(repositoryName, localize('repoctxCheckingEvidence', "Checking evidence…"));
		const loading = DOM.append(this.content, DOM.$('.repoctx-loading'));
		const loadingIcon = DOM.append(loading, DOM.$('span'));
		loadingIcon.classList.add(...ThemeIcon.asClassNameArray(ThemeIcon.modify(Codicon.loading, 'spin')));
		DOM.append(loading, DOM.$('span', undefined, localize('repoctxCheckingWorkspace', "Reading .dev-context")));
	}

	private renderEmptyWorkspace(): void {
		if (!this.content) {
			return;
		}

		this.bodyDisposables.clear();
		DOM.clearNode(this.content);
		this.renderSummary(localize('repoctxNoRepository', "No repository"), localize('repoctxOpenRepositoryDetail', "Open a folder to begin building evidence."));

		const empty = DOM.append(this.content, DOM.$('.repoctx-empty'));
		const icon = DOM.append(empty, DOM.$('span.repoctx-empty-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.repo));
		DOM.append(empty, DOM.$('p', undefined, localize('repoctxOpenRepository', "Repoctx starts with a repository.")));

		const button = this.bodyDisposables.add(new Button(empty, defaultButtonStyles));
		button.label = localize('repoctxOpenFolder', "Open Folder");
		button.onDidClick(() => this.commandService.executeCommand(OpenFolderAction.ID), this, this.bodyDisposables);
	}

	private renderEvidence(repositoryName: string, evidenceRoot: URI, evidence: RepoctxEvidence): void {
		if (!this.content) {
			return;
		}

		this.bodyDisposables.clear();
		DOM.clearNode(this.content);

		const availableCount = Object.values(evidence).filter(Boolean).length;
		const summary = availableCount === 5
			? localize('repoctxEvidenceReady', "All five evidence stages are available.")
			: localize('repoctxEvidenceCount', "{0} of 5 evidence stages available.", availableCount);
		this.renderSummary(repositoryName, summary);
		this.renderChangeRequest();

		if (this.runNotice) {
			const notice = DOM.append(this.content, DOM.$(`.repoctx-run-notice.${this.runNotice.kind}`));
			const noticeIcon = DOM.append(notice, DOM.$('span'));
			noticeIcon.classList.add(...ThemeIcon.asClassNameArray(this.runNotice.kind === 'error' ? Codicon.error : Codicon.info));
			DOM.append(notice, DOM.$('span', undefined, this.runNotice.message));
		}

		const stages = DOM.append(this.content, DOM.$('.repoctx-stage-list'));
		for (const stage of this.getStagePresentations()) {
			this.renderStage(stages, evidenceRoot, stage, evidence[stage.id]);
		}

		const note = DOM.append(this.content, DOM.$('.repoctx-evidence-note'));
		DOM.append(note, DOM.$('span', undefined, localize('repoctxEvidenceNote', "Evidence is read from .dev-context and never inferred from color or activity alone.")));
	}

	private renderChangeRequest(): void {
		if (!this.content) {
			return;
		}

		const request = DOM.append(this.content, DOM.$('.repoctx-change-request'));
		DOM.append(request, DOM.$('label', { for: 'repoctx-change-request' }, localize('repoctxChangeRequest', "Change request")));
		this.taskInput = DOM.append(request, DOM.$('textarea#repoctx-change-request'));
		this.taskInput.rows = 3;
		this.taskInput.value = this.taskRequest;
		this.taskInput.placeholder = localize('repoctxChangeRequestPlaceholder', "Describe the change you want to make");
		this.taskInput.setAttribute('aria-describedby', 'repoctx-change-request-help');
		this.requestHelp = DOM.append(request, DOM.$('p#repoctx-change-request-help', { 'aria-live': 'polite' }));
		this.updateRequestHelp();
		this.bodyDisposables.add(DOM.addDisposableListener(this.taskInput, DOM.EventType.INPUT, () => {
			this.taskRequest = this.taskInput?.value ?? '';
			this.updateRequestHelp();
			this.updateTaskDependentStages();
		}));
	}

	private renderSummary(repositoryName: string, summary: string): void {
		if (!this.content) {
			return;
		}

		const header = DOM.append(this.content, DOM.$('.repoctx-summary'));
		DOM.append(header, DOM.$('span.repoctx-eyebrow', undefined, localize('repoctxTrustSummary', "Repository trust")));
		DOM.append(header, DOM.$('h2', undefined, repositoryName));
		DOM.append(header, DOM.$('p', undefined, summary));
	}

	private renderStage(container: HTMLElement, evidenceRoot: URI, stage: IRepoctxStagePresentation, artifactPath: string | undefined): void {
		const state = this.getStageState(stage, artifactPath);
		const element = DOM.append(container, DOM.$('.repoctx-stage'));
		element.setAttribute('data-stage-id', stage.id);
		this.applyStageClass(element, state);

		const node = DOM.append(element, DOM.$('.repoctx-stage-node'));
		const stageIcon = DOM.append(node, DOM.$('span'));
		this.updateStageIcon(stageIcon, stage, state);

		const content = DOM.append(element, DOM.$('.repoctx-stage-content'));
		const titleRow = DOM.append(content, DOM.$('.repoctx-stage-title-row'));
		DOM.append(titleRow, DOM.$('span.repoctx-stage-title', undefined, stage.title));
		const stateElement = DOM.append(titleRow, DOM.$('span.repoctx-stage-state', { role: 'status' }, this.getStageStateLabel(state)));
		DOM.append(content, DOM.$('span.repoctx-stage-description', undefined, stage.description));
		if (stage.tools?.length) {
			const tools = DOM.append(content, DOM.$('.repoctx-stage-tools', { role: 'list', 'aria-label': localize('repoctxGateTools', "Gate tools") }));
			for (const tool of stage.tools) {
				const item = DOM.append(tools, DOM.$('span.repoctx-stage-tool', { role: 'listitem', title: tool.purpose }));
				DOM.append(item, DOM.$('strong', undefined, tool.name));
				DOM.append(item, DOM.$('span', undefined, tool.purpose));
			}
		}
		DOM.append(content, DOM.$('code.repoctx-stage-evidence', undefined, artifactPath ? `.dev-context/${artifactPath}` : stage.command));

		const action = DOM.append(content, DOM.$('button.repoctx-stage-action')) as HTMLButtonElement;
		action.type = 'button';
		this.updateStageAction(action, stage, state);
		this.stageControls.set(stage.id, { stage, artifactPath, element, icon: stageIcon, state: stateElement, action });
		this.bodyDisposables.add(DOM.addDisposableListener(action, DOM.EventType.CLICK, () => {
			if (artifactPath) {
				void this.editorService.openEditor({ resource: URI.joinPath(evidenceRoot, artifactPath), options: { pinned: true } });
			} else if (this.getStageState(stage, artifactPath) === 'needs-request') {
				this.taskInput?.focus();
			} else {
				void this.runStage(stage);
			}
		}));
	}

	private getStageState(stage: IRepoctxStagePresentation, artifactPath: string | undefined): RepoctxStageState {
		return getRepoctxStageState({
			artifactPath,
			isRunning: this.runningStage === stage.id,
			hasFailed: this.failedStage === stage.id,
			requiresTask: stage.requiresTask,
			hasTask: Boolean(this.taskRequest.trim()),
		});
	}

	private getStageIcon(stage: IRepoctxStagePresentation, state: RepoctxStageState): ThemeIcon {
		switch (state) {
			case 'available': return Codicon.check;
			case 'running': return ThemeIcon.modify(Codicon.loading, 'spin');
			case 'failed': return Codicon.error;
			case 'needs-request': return Codicon.lock;
			case 'ready': return stage.icon;
		}
	}

	private updateStageIcon(icon: HTMLElement, stage: IRepoctxStagePresentation, state: RepoctxStageState): void {
		icon.className = '';
		icon.classList.add(...ThemeIcon.asClassNameArray(this.getStageIcon(stage, state)));
	}

	private getStageStateLabel(state: RepoctxStageState): string {
		switch (state) {
			case 'available': return localize('repoctxEvidenceReadyState', "Evidence ready");
			case 'running': return localize('repoctxRunning', "Running");
			case 'failed': return localize('repoctxFailed', "Failed");
			case 'needs-request': return localize('repoctxNeedsRequest', "Needs request");
			case 'ready': return localize('repoctxReady', "Ready");
		}
	}

	private applyStageClass(element: HTMLElement, state: RepoctxStageState): void {
		for (const className of ['is-available', 'is-running', 'is-failed', 'is-blocked', 'is-ready']) {
			element.classList.remove(className);
		}
		element.classList.add(state === 'needs-request' ? 'is-blocked' : `is-${state}`);
	}

	private updateStageAction(action: HTMLButtonElement, stage: IRepoctxStagePresentation, state: RepoctxStageState): void {
		action.disabled = state === 'running';
		switch (state) {
			case 'available':
				action.textContent = localize('repoctxOpenStageEvidenceAction', "Open {0} evidence", stage.title);
				break;
			case 'running':
				action.textContent = localize('repoctxRunningAction', "Running in terminal…");
				break;
			case 'failed':
				action.textContent = localize('repoctxRetryStage', "Retry {0}", stage.title);
				break;
			case 'needs-request':
				action.textContent = localize('repoctxAddRequest', "Add change request");
				break;
			case 'ready':
				action.textContent = localize('repoctxRunStage', "Run {0}", stage.title);
				break;
		}
	}

	private updateTaskDependentStages(): void {
		for (const control of this.stageControls.values()) {
			if (!control.stage.requiresTask || control.artifactPath || this.runningStage === control.stage.id || this.failedStage === control.stage.id) {
				continue;
			}
			const state = this.getStageState(control.stage, control.artifactPath);
			this.applyStageClass(control.element, state);
			this.updateStageIcon(control.icon, control.stage, state);
			control.state.textContent = this.getStageStateLabel(state);
			this.updateStageAction(control.action, control.stage, state);
		}
	}

	private updateRequestHelp(): void {
		if (!this.requestHelp) {
			return;
		}
		const hasTask = Boolean(this.taskRequest.trim());
		this.requestHelp.textContent = hasTask
			? localize('repoctxChangeRequestReady', "Request ready. Context, Impact, Gate, and Audit are unlocked.")
			: localize('repoctxChangeRequestHelp', "Add a request to unlock Context, Impact, Gate, and Audit. Review can run now.");
	}

	private async runStage(stage: IRepoctxStagePresentation): Promise<void> {
		const folder = this.workspaceContextService.getWorkspace().folders[0];
		if (!folder || this.runningStage) {
			return;
		}

		this.taskRequest = this.taskInput?.value.trim() ?? this.taskRequest.trim();
		if (stage.requiresTask && !this.taskRequest) {
			this.runNotice = { kind: 'error', message: localize('repoctxTaskRequired', "Describe the change before running {0}.", stage.title) };
			await this.refresh();
			this.taskInput?.focus();
			return;
		}

		const invocation = getRepoctxStageInvocation(stage.id, this.taskRequest);
		const cliPath = join(this.environmentService.appRoot, 'node_modules', '@nugehs', 'repoctx', 'src', 'cli.js');
		this.runningStage = stage.id;
		if (this.failedStage === stage.id) {
			this.failedStage = undefined;
		}
		this.runNotice = { kind: 'info', message: localize('repoctxStageStarted', "{0} is running in the integrated terminal.", stage.title) };
		await this.refresh();

		try {
			const terminal = await this.terminalService.createTerminal({
				location: TerminalLocation.Panel,
				config: {
					name: invocation.title,
					type: 'Task',
					executable: this.environmentService.execPath,
					args: [cliPath, ...invocation.args],
					cwd: folder.uri,
					env: {
						ELECTRON_NO_ASAR: '1',
						ELECTRON_RUN_AS_NODE: '1',
						REPOCTX_AIGLARE: '1',
						REPOCTX_TIELINE_BIN: this.bundledToolBinary('tieline'),
						REPOCTX_BOUNCER_BIN: this.bundledToolBinary('bouncer'),
						REPOCTX_AIGLARE_BIN: this.bundledToolBinary('aiglare'),
					},
					waitOnExit: true,
				},
			});
			this.terminalService.setActiveInstance(terminal);
			await this.terminalService.revealActiveTerminal(true);

			this._register(terminal.onExit(result => {
				this.runningStage = undefined;
				if (result === 0) {
					this.failedStage = undefined;
					this.runNotice = { kind: 'info', message: localize('repoctxStageComplete', "{0} evidence is ready.", stage.title) };
				} else {
					this.failedStage = stage.id;
					this.runNotice = { kind: 'error', message: localize('repoctxStageFailed', "{0} did not complete. Check the Repoctx terminal for details.", stage.title) };
				}
				void this.refresh();
			}));
		} catch {
			this.runningStage = undefined;
			this.failedStage = stage.id;
			this.runNotice = { kind: 'error', message: localize('repoctxStageLaunchFailed', "{0} could not start. The bundled Repoctx runtime may be unavailable.", stage.title) };
			await this.refresh();
		}
	}

	private bundledToolBinary(name: string): string {
		return join(this.environmentService.appRoot, 'node_modules', '.bin', isWindows ? `${name}.cmd` : name);
	}

	private getStagePresentations(): readonly IRepoctxStagePresentation[] {
		return [
			{
				id: 'context',
				title: localize('repoctxContext', "Context"),
				description: localize('repoctxContextDescription', "Map the repository, its structure, and owner files."),
				command: 'repoctx context',
				icon: Codicon.repo,
				requiresTask: true,
			},
			{
				id: 'impact',
				title: localize('repoctxImpact', "Impact"),
				description: localize('repoctxImpactDescription', "Predict affected files, tests, and risk before editing."),
				command: 'repoctx impact',
				icon: Codicon.graph,
				requiresTask: true,
			},
			{
				id: 'review',
				title: localize('repoctxReview', "Review"),
				description: localize('repoctxReviewDescription', "Inspect changed-file risk and required validation."),
				command: 'repoctx pr',
				icon: Codicon.gitPullRequest,
				requiresTask: false,
			},
			{
				id: 'gate',
				title: localize('repoctxGate', "Gate"),
				description: localize('repoctxGateDescription', "Decide merge readiness from deterministic checks."),
				command: 'repoctx gate',
				icon: Codicon.shield,
				requiresTask: true,
				tools: [
					{ name: 'Tieline', purpose: localize('repoctxTielinePurpose', "contracts") },
					{ name: 'Bouncer', purpose: localize('repoctxBouncerPurpose', "compliance") },
					{ name: 'Aiglare', purpose: localize('repoctxAiglarePurpose', "AI governance") },
				],
			},
			{
				id: 'audit',
				title: localize('repoctxAudit', "Audit"),
				description: localize('repoctxAuditDescription', "Keep recomputable receipts and durable evidence."),
				command: 'repoctx converge',
				icon: Codicon.history,
				requiresTask: true,
			},
		];
	}
}
