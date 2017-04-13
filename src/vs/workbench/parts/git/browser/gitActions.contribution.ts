/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import lifecycle = require('vs/base/common/lifecycle');
import platform = require('vs/platform/platform');
import abr = require('vs/workbench/browser/actionBarRegistry');
import { TPromise } from 'vs/base/common/winjs.base';
import editorbrowser = require('vs/editor/browser/editorBrowser');
import editorcommon = require('vs/editor/common/editorCommon');
import baseeditor = require('vs/workbench/browser/parts/editor/baseEditor');
import WorkbenchEditorCommon = require('vs/workbench/common/editor');
import tdeditor = require('vs/workbench/browser/parts/editor/textDiffEditor');
import teditor = require('vs/workbench/browser/parts/editor/textEditor');
import filesCommon = require('vs/workbench/parts/files/common/files');
import gitcontrib = require('vs/workbench/parts/git/browser/gitWorkbenchContributions');
import diffei = require('vs/workbench/common/editor/diffEditorInput');
import { IGitService, Status, IFileStatus, StatusType } from 'vs/workbench/parts/git/common/git';
import gitei = require('vs/workbench/parts/git/browser/gitEditorInputs');
import { getSelectedChanges, applyChangesToModel, getChangeRevertEdits } from 'vs/workbench/parts/git/common/stageRanges';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import wbar = require('vs/workbench/common/actionRegistry');
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import {
	OpenChangeAction, OpenFileAction, SyncAction, PullAction, PushAction,
	PushToRemoteAction, PublishAction, StartGitBranchAction, StartGitCheckoutAction,
	InputCommitAction, UndoLastCommitAction, BaseStageAction, BaseUnstageAction,
	PullWithRebaseAction
} from './gitActions';
import paths = require('vs/base/common/paths');
import URI from 'vs/base/common/uri';
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import SCMPreview from 'vs/workbench/parts/scm/browser/scmPreview';
import { IMessageService } from 'vs/platform/message/common/message';

function getStatus(gitService: IGitService, contextService: IWorkspaceContextService, input: WorkbenchEditorCommon.IFileEditorInput): IFileStatus {
	const model = gitService.getModel();
	const repositoryRoot = model.getRepositoryRoot();
	const statusModel = model.getStatus();
	const repositoryRelativePath = paths.normalize(paths.relative(repositoryRoot, input.getResource().fsPath));

	return statusModel.getWorkingTreeStatus().find(repositoryRelativePath) ||
		statusModel.getIndexStatus().find(repositoryRelativePath) ||
		statusModel.getMergeStatus().find(repositoryRelativePath);
}

class OpenInDiffAction extends baseeditor.EditorInputAction {

	static ID = 'workbench.action.git.openInDiff';
	static Label = nls.localize('switchToChangesView', "Switch to Changes View");

	private gitService: IGitService;
	private viewletService: IViewletService;
	private editorService: IWorkbenchEditorService;
	private partService: IPartService;
	private contextService: IWorkspaceContextService;
	private toDispose: lifecycle.IDisposable[];

	constructor( @IWorkbenchEditorService editorService: IWorkbenchEditorService, @IGitService gitService: IGitService, @IViewletService viewletService: IViewletService, @IPartService partService: IPartService, @IWorkspaceContextService contextService: IWorkspaceContextService) {
		super(OpenInDiffAction.ID, OpenInDiffAction.Label);

		this.class = 'git-action open-in-diff';
		this.gitService = gitService;
		this.viewletService = viewletService;
		this.editorService = editorService;
		this.partService = partService;
		this.contextService = contextService;

		this.toDispose = [this.gitService.addBulkListener2(() => this.onGitStateChanged())];

		this.enabled = this.isEnabled();
	}

	public isEnabled(): boolean {
		if (!super.isEnabled()) {
			return false;
		}

		const model = this.gitService.getModel();
		if (!model || !(typeof model.getRepositoryRoot() === 'string')) {
			return false;
		}

		var status = this.getStatus();

		return status && (
			status.getStatus() === Status.MODIFIED ||
			status.getStatus() === Status.INDEX_MODIFIED ||
			status.getStatus() === Status.INDEX_RENAMED
		);
	}

	private onGitStateChanged(): void {
		if (this.gitService.isIdle()) {
			this.enabled = this.isEnabled();
		}
	}

	private getStatus(): IFileStatus {
		return getStatus(this.gitService, this.contextService, <FileEditorInput>this.input);
	}

	public run(context?: WorkbenchEditorCommon.IEditorContext): TPromise<any> {
		const event = context ? context.event : null;
		const sideBySide = !!(event && (event.ctrlKey || event.metaKey));
		const editor = <editorbrowser.ICodeEditor>this.editorService.getActiveEditor().getControl();
		const viewState = editor ? editor.saveViewState() : null;

		return this.gitService.getInput(this.getStatus()).then((input) => {
			var promise = TPromise.as(null);

			if (this.partService.isVisible(Parts.SIDEBAR_PART)) {
				promise = this.viewletService.openViewlet(gitcontrib.VIEWLET_ID, false);
			}

			return promise.then(() => {
				var options = new WorkbenchEditorCommon.TextDiffEditorOptions();
				options.forceOpen = true;
				options.autoRevealFirstChange = false;

				return this.editorService.openEditor(input, options, sideBySide).then((editor) => {
					if (viewState) {
						var codeEditor = <editorbrowser.ICodeEditor>this.editorService.getActiveEditor().getControl();
						codeEditor.restoreViewState({
							original: {},
							modified: viewState
						});
					}
				});
			});
		});
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
	}
}

class OpenInEditorAction extends baseeditor.EditorInputAction {

	private static DELETED_STATES = [Status.BOTH_DELETED, Status.DELETED, Status.DELETED_BY_US, Status.INDEX_DELETED];
	static ID = 'workbench.action.git.openInEditor';
	static LABEL = nls.localize('openInEditor', "Switch to Editor View");

	private gitService: IGitService;
	private fileService: IFileService;
	private viewletService: IViewletService;
	private editorService: IWorkbenchEditorService;
	private partService: IPartService;
	private contextService: IWorkspaceContextService;

	constructor( @IFileService fileService: IFileService, @IWorkbenchEditorService editorService: IWorkbenchEditorService, @IGitService gitService: IGitService, @IViewletService viewletService: IViewletService, @IPartService partService: IPartService, @IWorkspaceContextService contextService: IWorkspaceContextService) {
		super(OpenInEditorAction.ID, OpenInEditorAction.LABEL);

		this.class = 'git-action open-in-editor';
		this.gitService = gitService;
		this.fileService = fileService;
		this.viewletService = viewletService;
		this.editorService = editorService;
		this.partService = partService;
		this.contextService = contextService;

		this.enabled = this.isEnabled();
	}

	public isEnabled(): boolean {
		if (!super.isEnabled()) {
			return false;
		}

		const model = this.gitService.getModel();
		if (!model || !(typeof model.getRepositoryRoot() === 'string')) {
			return false;
		}

		var status: IFileStatus = (<any>this.input).getFileStatus();
		if (OpenInEditorAction.DELETED_STATES.indexOf(status.getStatus()) > -1) {
			return false;
		}

		return true;
	}

	public run(context?: WorkbenchEditorCommon.IEditorContext): TPromise<any> {
		const model = this.gitService.getModel();
		const resource = URI.file(paths.join(model.getRepositoryRoot(), this.getRepositoryRelativePath()));
		const event = context ? context.event : null;
		const sideBySide = !!(event && (event.ctrlKey || event.metaKey));
		const modifiedViewState = this.saveTextViewState();

		return this.fileService.resolveFile(resource).then(stat => {
			return this.editorService.openEditor({
				resource: stat.resource,
				options: {
					forceOpen: true
				}
			}, sideBySide).then(editor => {
				this.restoreTextViewState(modifiedViewState);

				if (this.partService.isVisible(Parts.SIDEBAR_PART)) {
					return this.viewletService.openViewlet(filesCommon.VIEWLET_ID, false);
				}
				return undefined;
			});
		});
	}

	private saveTextViewState(): editorcommon.IEditorViewState {
		var textEditor = this.getTextEditor();
		if (textEditor) {
			return textEditor.saveViewState();
		}

		return null;
	}

	private restoreTextViewState(state: editorcommon.IEditorViewState): void {
		var textEditor = this.getTextEditor();
		if (textEditor) {
			return textEditor.restoreViewState(state);
		}
	}

	private getTextEditor(): editorcommon.ICommonCodeEditor {
		var editor = this.editorService.getActiveEditor();

		if (editor instanceof tdeditor.TextDiffEditor) {
			return (<editorbrowser.IDiffEditor>editor.getControl()).getModifiedEditor();
		} else if (editor instanceof teditor.BaseTextEditor) {
			return <editorbrowser.ICodeEditor>editor.getControl();
		}

		return null;
	}

	private getRepositoryRelativePath(): string {
		var status: IFileStatus = (<any>this.input).getFileStatus();

		if (status.getStatus() === Status.INDEX_RENAMED) {
			return status.getRename();
		} else {
			var indexStatus = this.gitService.getModel().getStatus().find(status.getPath(), StatusType.INDEX);

			if (indexStatus && indexStatus.getStatus() === Status.INDEX_RENAMED) {
				return indexStatus.getRename();
			} else {
				return status.getPath();
			}
		}
	}
}

export class WorkbenchStageAction extends BaseStageAction {

	static ID = 'workbench.action.git.stage';
	static LABEL = nls.localize('workbenchStage', "Stage");
	private contextService: IWorkspaceContextService;

	constructor(
		id = WorkbenchStageAction.ID,
		label = WorkbenchStageAction.LABEL,
		@IGitService gitService: IGitService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super(id, label, '', gitService, editorService);
		this.contextService = contextService;
		this.onGitServiceChange();
	}

	protected updateEnablement(): void {
		if (this.contextService) {
			this.enabled = this.isEnabled();
		} else {
			this.enabled = super.isEnabled();
		}
	}

	isEnabled(): boolean {
		if (!super.isEnabled()) {
			return false;
		}

		const editor = this.editorService.getActiveEditor();
		if (!editor || !(editor instanceof baseeditor.BaseEditor)) {
			return false;
		}

		return true;
	}

	run(context?: any): TPromise<void> {
		const input = this.editorService.getActiveEditor().input;
		let fileStatus: IFileStatus;

		if (gitei.isGitEditorInput(input)) {
			const gitInput = input as gitei.GitDiffEditorInput;
			fileStatus = gitInput.getFileStatus();
		} else {
			fileStatus = getStatus(this.gitService, this.contextService, input as WorkbenchEditorCommon.IFileEditorInput);
		}

		if (!fileStatus) {
			return TPromise.as<void>(null);
		}

		return super.run(fileStatus);
	}
}

export class WorkbenchUnstageAction extends BaseUnstageAction {

	static ID = 'workbench.action.git.unstage';
	static LABEL = nls.localize('workbenchUnstage', "Unstage");
	private contextService: IWorkspaceContextService;

	constructor(
		id = WorkbenchUnstageAction.ID,
		label = WorkbenchUnstageAction.LABEL,
		@IGitService gitService: IGitService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super(id, label, '', gitService, editorService);
		this.contextService = contextService;
		this.onGitServiceChange();
	}

	protected updateEnablement(): void {
		if (this.contextService) {
			this.enabled = this.isEnabled();
		} else {
			this.enabled = super.isEnabled();
		}
	}

	isEnabled(): boolean {
		if (!super.isEnabled()) {
			return false;
		}

		const editor = this.editorService.getActiveEditor();
		if (!editor || !(editor instanceof baseeditor.BaseEditor)) {
			return false;
		}

		return true;
	}

	run(context?: any): TPromise<void> {
		const input = this.editorService.getActiveEditor().input;
		let fileStatus: IFileStatus;

		if (gitei.isGitEditorInput(input)) {
			const gitInput = input as gitei.GitDiffEditorInput;
			fileStatus = gitInput.getFileStatus();
		} else {
			fileStatus = getStatus(this.gitService, this.contextService, input as WorkbenchEditorCommon.IFileEditorInput);
		}

		if (!fileStatus) {
			return TPromise.as<void>(null);
		}

		return super.run(fileStatus);
	}
}

export abstract class BaseStageRangesAction extends baseeditor.EditorInputAction {
	private gitService: IGitService;
	private editorService: IWorkbenchEditorService;
	private editor: editorbrowser.IDiffEditor;

	constructor(id: string, label: string, editor: tdeditor.TextDiffEditor, @IGitService gitService: IGitService, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		super(id, label);

		this.editorService = editorService;
		this.gitService = gitService;
		this.editor = editor.getControl();
		this.editor.onDidChangeCursorSelection(() => this.updateEnablement());
		this.editor.onDidUpdateDiff(() => this.updateEnablement());
		this.class = 'git-action stage-ranges';
	}

	public isEnabled(): boolean {
		if (!super.isEnabled()) {
			return false;
		}

		if (!this.gitService || !this.editorService) {
			return false;
		}

		var changes = this.editor.getLineChanges();
		var selections = this.editor.getSelections();

		if (!changes || !selections || selections.length === 0) {
			return false;
		}

		return getSelectedChanges(changes, selections).length > 0;
	}

	protected getRangesAppliedResult(editor: editorbrowser.IDiffEditor) {
		var selections = editor.getSelections();
		var changes = getSelectedChanges(editor.getLineChanges(), selections);
		return applyChangesToModel(editor.getModel().original, editor.getModel().modified, changes);
	}

	public run(): TPromise<any> {
		var result = this.getRangesAppliedResult(this.editor);

		var status = (<gitei.GitWorkingTreeDiffEditorInput>this.input).getFileStatus();
		var path = status.getPath();
		var viewState = this.editor.saveViewState();

		return this.gitService.stage(status.getPath(), result).then(() => {
			var statusModel = this.gitService.getModel().getStatus();

			status = statusModel.getWorkingTreeStatus().find(path) || statusModel.getIndexStatus().find(path);

			if (status) {
				return this.gitService.getInput(status).then((input) => {
					var options = new WorkbenchEditorCommon.TextDiffEditorOptions();
					options.forceOpen = true;
					options.autoRevealFirstChange = false;

					return this.editorService.openEditor(input, options, this.position).then(() => {
						this.editor.restoreViewState(viewState);
					});
				});
			}
			return undefined;
		});
	}

	private updateEnablement(): void {
		this.enabled = this.isEnabled();
	}
}

export class StageRangesAction extends BaseStageRangesAction {
	static ID = 'workbench.action.git.stageRanges';
	static LABEL = nls.localize('stageSelectedLines', "Stage Selected Lines");

	constructor(editor: tdeditor.TextDiffEditor, @IGitService gitService: IGitService, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		super(StageRangesAction.ID, StageRangesAction.LABEL, editor, gitService, editorService);
	}
}

export class UnstageRangesAction extends BaseStageRangesAction {
	static ID = 'workbench.action.git.unstageRanges';
	static LABEL = nls.localize('unstageSelectedLines', "Unstage Selected Lines");

	constructor(editor: tdeditor.TextDiffEditor, @IGitService gitService: IGitService, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		super(UnstageRangesAction.ID, UnstageRangesAction.LABEL, editor, gitService, editorService);
	}

	protected getRangesAppliedResult(editor: editorbrowser.IDiffEditor) {
		const selections = editor.getSelections();
		const changes = getSelectedChanges(editor.getLineChanges(), selections)
			.map(c => ({
				modifiedStartLineNumber: c.originalStartLineNumber,
				modifiedEndLineNumber: c.originalEndLineNumber,
				originalStartLineNumber: c.modifiedStartLineNumber,
				originalEndLineNumber: c.modifiedEndLineNumber
			}));

		return applyChangesToModel(editor.getModel().modified, editor.getModel().original, changes);
	}
}

export class RevertRangesAction extends baseeditor.EditorInputAction {
	static ID = 'workbench.action.git.revertRanges';
	static LABEL = nls.localize('revertSelectedLines', "Revert Selected Lines");

	private editor: editorbrowser.IDiffEditor;

	constructor(
		editor: tdeditor.TextDiffEditor,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IMessageService private messageService: IMessageService
	) {
		super(RevertRangesAction.ID, RevertRangesAction.LABEL);

		this.editor = editor.getControl();
		this.editor.onDidChangeCursorSelection(() => this.updateEnablement());
		this.editor.onDidUpdateDiff(() => this.updateEnablement());
		this.class = 'git-action revert-ranges';
	}

	public isEnabled(): boolean {
		if (!super.isEnabled()) {
			return false;
		}

		if (!this.editorService) {
			return false;
		}

		const changes = this.editor.getLineChanges();
		const selections = this.editor.getSelections();

		if (!changes || !selections || selections.length === 0) {
			return false;
		}

		return getSelectedChanges(changes, selections).length > 0;
	}

	public run(): TPromise<any> {
		const selections = this.editor.getSelections();
		const changes = getSelectedChanges(this.editor.getLineChanges(), selections);
		const {original, modified} = this.editor.getModel();

		const revertEdits = getChangeRevertEdits(original, modified, changes);

		if (revertEdits.length === 0) {
			return TPromise.as(null);
		}

		const confirm = {
			message: nls.localize('confirmRevertMessage', "Are you sure you want to revert the selected changes?"),
			detail: nls.localize('irreversible', "This action is irreversible!"),
			primaryButton: nls.localize({ key: 'revertChangesLabel', comment: ['&& denotes a mnemonic'] }, "&&Revert Changes")
		};

		if (!this.messageService.confirm(confirm)) {
			return TPromise.as(null);
		}

		modified.pushEditOperations(selections, revertEdits, () => selections);
		modified.pushStackElement();

		return TPromise.wrap(null);
	}

	private updateEnablement(): void {
		this.enabled = this.isEnabled();
	}
}

class FileEditorActionContributor extends baseeditor.EditorInputActionContributor {
	private instantiationService: IInstantiationService;

	constructor( @IInstantiationService instantiationService: IInstantiationService) {
		super();

		this.instantiationService = instantiationService;
	}

	public hasActionsForEditorInput(context: baseeditor.IEditorInputActionContext): boolean {
		return context.input instanceof FileEditorInput;
	}

	public getActionsForEditorInput(context: baseeditor.IEditorInputActionContext): baseeditor.IEditorInputAction[] {
		return [this.instantiationService.createInstance(OpenInDiffAction)];
	}
}

class GitEditorActionContributor extends baseeditor.EditorInputActionContributor {
	private instantiationService: IInstantiationService;

	constructor( @IInstantiationService instantiationService: IInstantiationService) {
		super();

		this.instantiationService = instantiationService;
	}

	public hasActionsForEditorInput(context: baseeditor.IEditorInputActionContext): boolean {
		return gitei.isGitEditorInput(context.input);
	}

	public getActionsForEditorInput(context: baseeditor.IEditorInputActionContext): baseeditor.IEditorInputAction[] {
		return [this.instantiationService.createInstance(OpenInEditorAction)];
	}
}

class GitWorkingTreeDiffEditorActionContributor extends baseeditor.EditorInputActionContributor {
	private instantiationService: IInstantiationService;

	constructor( @IInstantiationService instantiationService: IInstantiationService) {
		super();

		this.instantiationService = instantiationService;
	}

	public hasSecondaryActionsForEditorInput(context: baseeditor.IEditorInputActionContext): boolean {
		return (context.input instanceof gitei.GitDiffEditorInput && context.editor instanceof tdeditor.TextDiffEditor);
	}

	public getSecondaryActionsForEditorInput(context: baseeditor.IEditorInputActionContext): baseeditor.IEditorInputAction[] {
		if (context.input instanceof gitei.GitIndexDiffEditorInput) {
			return [this.instantiationService.createInstance(UnstageRangesAction, <tdeditor.TextDiffEditor>context.editor)];
		}

		return [
			this.instantiationService.createInstance(StageRangesAction, <tdeditor.TextDiffEditor>context.editor),
			this.instantiationService.createInstance(RevertRangesAction, <tdeditor.TextDiffEditor>context.editor)];
	}
}

class GlobalOpenChangeAction extends OpenChangeAction {

	static ID = 'workbench.action.git.globalOpenChange';
	static LABEL = nls.localize('openChange', "Open Change");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IGitService gitService: IGitService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IViewletService protected viewletService: IViewletService,
		@IPartService protected partService: IPartService
	) {
		super(editorService, gitService);
	}

	public getInput(): WorkbenchEditorCommon.IFileEditorInput {
		const input = this.editorService.getActiveEditorInput();
		if (input instanceof FileEditorInput) {
			return input;
		}

		return null;
	}

	public run(context?: any): TPromise<any> {
		let input = this.getInput();

		if (!input) {
			return TPromise.as(null);
		}

		let status = getStatus(this.gitService, this.contextService, input);

		if (!status) {
			return TPromise.as(null);
		}

		var sideBySide = !!(context && (context.ctrlKey || context.metaKey));
		var editor = <editorbrowser.ICodeEditor>this.editorService.getActiveEditor().getControl();
		var viewState = editor ? editor.saveViewState() : null;

		return this.gitService.getInput(status).then((input) => {
			var promise = TPromise.as(null);

			if (this.partService.isVisible(Parts.SIDEBAR_PART)) {
				promise = this.viewletService.openViewlet(gitcontrib.VIEWLET_ID, false);
			}

			return promise.then(() => {
				var options = new WorkbenchEditorCommon.TextDiffEditorOptions();
				options.forceOpen = true;
				options.autoRevealFirstChange = false;

				return this.editorService.openEditor(input, options, sideBySide).then((editor) => {
					if (viewState) {
						var codeEditor = <editorbrowser.ICodeEditor>this.editorService.getActiveEditor().getControl();
						codeEditor.restoreViewState({
							original: {},
							modified: viewState
						});
					}
				});
			});
		});
	}
}

class GlobalOpenInEditorAction extends OpenFileAction {

	static ID = 'workbench.action.git.globalOpenFile';
	static LABEL = nls.localize('openFile', "Open File");

	constructor(
		id = GlobalOpenInEditorAction.ID,
		label = GlobalOpenInEditorAction.LABEL,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IGitService gitService: IGitService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super(editorService, fileService, gitService, contextService);
	}

	public run(event?: any): TPromise<any> {
		let input = this.editorService.getActiveEditorInput();
		if (input instanceof diffei.DiffEditorInput) {
			input = input.modifiedInput;
		}

		if (!(input instanceof FileEditorInput)) {
			return TPromise.as(null);
		}

		const status = getStatus(this.gitService, this.contextService, input);

		if (!status) {
			return TPromise.as(null);
		}

		return super.run(status);
	}
}

if (!SCMPreview.enabled) {
	var actionBarRegistry = <abr.IActionBarRegistry>platform.Registry.as(abr.Extensions.Actionbar);
	actionBarRegistry.registerActionBarContributor(abr.Scope.EDITOR, FileEditorActionContributor);
	actionBarRegistry.registerActionBarContributor(abr.Scope.EDITOR, GitEditorActionContributor);
	actionBarRegistry.registerActionBarContributor(abr.Scope.EDITOR, GitWorkingTreeDiffEditorActionContributor);

	let workbenchActionRegistry = (<wbar.IWorkbenchActionRegistry>platform.Registry.as(wbar.Extensions.WorkbenchActions));

	// Register Actions
	const category = nls.localize('git', "Git");
	workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(GlobalOpenChangeAction, GlobalOpenChangeAction.ID, GlobalOpenChangeAction.LABEL), 'Git: Open Change', category);
	workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(GlobalOpenInEditorAction, GlobalOpenInEditorAction.ID, GlobalOpenInEditorAction.LABEL), 'Git: Open File', category);
	workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(PullAction, PullAction.ID, PullAction.LABEL), 'Git: Pull', category);
	workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(PullWithRebaseAction, PullWithRebaseAction.ID, PullWithRebaseAction.LABEL), 'Git: Pull (Rebase)', category);
	workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(PushAction, PushAction.ID, PushAction.LABEL), 'Git: Push', category);
	workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(PushToRemoteAction, PushToRemoteAction.ID, PushToRemoteAction.LABEL), 'Git: Push to...', category);
	workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(SyncAction, SyncAction.ID, SyncAction.LABEL), 'Git: Sync', category);
	workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(PublishAction, PublishAction.ID, PublishAction.LABEL), 'Git: Publish', category);
	workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(StartGitBranchAction, StartGitBranchAction.ID, StartGitBranchAction.LABEL), 'Git: Branch', category);
	workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(StartGitCheckoutAction, StartGitCheckoutAction.ID, StartGitCheckoutAction.LABEL), 'Git: Checkout', category);
	workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(InputCommitAction, InputCommitAction.ID, InputCommitAction.LABEL), 'Git: Commit', category);
	workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(UndoLastCommitAction, UndoLastCommitAction.ID, UndoLastCommitAction.LABEL), 'Git: Undo Last Commit', category);
	workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(WorkbenchStageAction, WorkbenchStageAction.ID, WorkbenchStageAction.LABEL), 'Git: Stage', category);
	workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(WorkbenchUnstageAction, WorkbenchUnstageAction.ID, WorkbenchUnstageAction.LABEL), 'Git: Unstage', category);
}
