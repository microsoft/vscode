/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Promise, TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { IEventEmitter } from 'vs/base/common/eventEmitter';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { IDisposable, disposeAll } from 'vs/base/common/lifecycle';
import strings = require('vs/base/common/strings');
import { isString } from 'vs/base/common/types';
import { Action } from 'vs/base/common/actions';
import { IDiffEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import model = require('vs/workbench/parts/git/common/gitModel');
import inputs = require('vs/workbench/parts/git/browser/gitEditorInputs');
import { TextDiffEditorOptions } from 'vs/workbench/common/editor';
import errors = require('vs/base/common/errors');
import platform = require('vs/base/common/platform');
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { IEditor } from 'vs/platform/editor/common/editor';
import { IEventService } from 'vs/platform/event/common/event';
import { IFileService, IFileStat } from 'vs/platform/files/common/files';
import { IMessageService, IConfirmation } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import { IGitService, IFileStatus, Status, StatusType, ServiceState,
	IModel, IBranch, GitErrorCodes, ServiceOperations }
	from 'vs/workbench/parts/git/common/git';
import { IQuickOpenService } from 'vs/workbench/services/quickopen/common/quickOpenService';
import paths = require('vs/base/common/paths');
import URI from 'vs/base/common/uri';

function flatten(context?: any, preferFocus = false): IFileStatus[] {
	if (!context) {
		return context;

	} else if (Array.isArray(context)) {
		if (context.some((c: any) => !(c instanceof model.FileStatus))) {
			throw new Error('Invalid context.');
		}
		return context;

	} else if (context instanceof model.FileStatus) {
		return [<model.FileStatus> context];

	} else if (context instanceof model.StatusGroup) {
		return (<model.StatusGroup> context).all();

	} else if (context.tree) {
		var elements = (<ITree> context.tree).getSelection();
		return elements.indexOf(context.fileStatus) > -1 ? elements : [context.fileStatus];

	} else if (context.selection) {
		return !preferFocus && context.selection.indexOf(context.focus) > -1 ? context.selection : [context.focus];

	} else {
		throw new Error('Invalid context.');
	}
}

export abstract class GitAction extends Action {

	protected gitService: IGitService;
	protected toDispose: IDisposable[];

	constructor(id: string, label: string, cssClass: string, gitService: IGitService) {
		super(id, label, cssClass, false);

		this.gitService = gitService;
		this.toDispose = [this.gitService.addBulkListener2(() => this.onGitServiceChange())];
		this.onGitServiceChange();
	}

	protected onGitServiceChange(): void {
		this.updateEnablement();
	}

	protected updateEnablement(): void {
		this.enabled = this.isEnabled();
	}

	protected isEnabled():boolean {
		return !!this.gitService;
	}

	public abstract run(e?: any):Promise;

	public dispose(): void {
		this.gitService = null;
		this.toDispose = disposeAll(this.toDispose);

		super.dispose();
	}
}

export class OpenChangeAction extends GitAction {

	static ID = 'workbench.action.git.openChange';
	protected editorService: IWorkbenchEditorService;

	constructor(@IWorkbenchEditorService editorService: IWorkbenchEditorService, @IGitService gitService: IGitService) {
		super(OpenChangeAction.ID, nls.localize('openChange', "Open Change"), 'git-action open-change', gitService);
		this.editorService = editorService;
		this.onGitServiceChange();
	}

	protected isEnabled():boolean {
		return super.isEnabled() && !!this.editorService;
	}

	public run(context?: any):Promise {
		var statuses = flatten(context, true);

		return this.gitService.getInput(statuses[0]).then((input) => {
			var options = new TextDiffEditorOptions();

			options.forceOpen = true;

			return this.editorService.openEditor(input, options);
		});
	}
}

export class OpenFileAction extends GitAction {

	private static DELETED_STATES = [Status.BOTH_DELETED, Status.DELETED, Status.DELETED_BY_US, Status.INDEX_DELETED];
	static ID = 'workbench.action.git.openFile';

	protected fileService: IFileService;
	protected editorService: IWorkbenchEditorService;
	protected contextService: IWorkspaceContextService;

	constructor(@IWorkbenchEditorService editorService: IWorkbenchEditorService, @IFileService fileService: IFileService, @IGitService gitService: IGitService, @IWorkspaceContextService contextService: IWorkspaceContextService) {
		super(OpenFileAction.ID, nls.localize('openFile', "Open File"), 'git-action open-file', gitService);
		this.fileService = fileService;
		this.editorService = editorService;
		this.contextService = contextService;
		this.onGitServiceChange();
	}

	protected isEnabled():boolean {
		return super.isEnabled() && !!this.editorService || !!this.fileService;
	}

	private getPath(status: IFileStatus): string {
		if (status.getStatus() === Status.INDEX_RENAMED) {
			return status.getRename();
		} else {
			var indexStatus = this.gitService.getModel().getStatus().find(status.getPath(), StatusType.INDEX);

			if (indexStatus && indexStatus.getStatus() === Status.INDEX_RENAMED) {
				return status.getRename();
			} else {
				return status.getPath();
			}
		}
	}

	public run(context?: any):Promise {
		var statuses = flatten(context, true);
		var status = statuses[0];

		if (!(status instanceof model.FileStatus)) {
			return Promise.wrapError(new Error('Can\'t open file.'));
		}

		if (OpenFileAction.DELETED_STATES.indexOf(status.getStatus()) > -1) {
			return Promise.wrapError(new Error('Can\'t open file which is has been deleted.'));
		}

		const resource = URI.file(paths.join(this.gitService.getModel().getRepositoryRoot(), this.getPath(status)));

		return this.fileService.resolveFile(resource)
			.then(stat => this.editorService.openEditor({
				resource: stat.resource,
				mime: stat.mime,
				options: { forceOpen: true }
			}));
	}
}

export class InitAction extends GitAction {

	static ID = 'workbench.action.git.init';

	constructor(@IGitService gitService: IGitService) {
		super(InitAction.ID, nls.localize('init', "Init"), 'git-action init', gitService);
	}

	protected isEnabled():boolean {
		return super.isEnabled() && this.gitService.getState() === ServiceState.NotARepo;
	}

	public run():Promise {
		return this.gitService.init();
	}
}

export class RefreshAction extends GitAction {

	static ID = 'workbench.action.git.refresh';

	constructor(@IGitService gitService: IGitService) {
		super(RefreshAction.ID, nls.localize('refresh', "Refresh"), 'git-action refresh', gitService);
	}

	public run():Promise {
		return this.gitService.status();
	}
}

export abstract class BaseStageAction extends GitAction {
	private editorService: IWorkbenchEditorService;

	constructor(id: string, label: string, className: string, gitService: IGitService, editorService: IWorkbenchEditorService) {
		super(id, label, className, gitService);
		this.editorService = editorService;
	}

	public run(context?: any):Promise {
		var flatContext = flatten(context);

		return this.gitService.add(flatten(context)).then((status: IModel) => {
			var targetEditor = this.findGitWorkingTreeEditor();
			if (!targetEditor) {
				return TPromise.as(status);
			}

			var currentGitEditorInput = <inputs.IEditorInputWithStatus>(<any>targetEditor.input);
			var currentFileStatus = currentGitEditorInput.getFileStatus();

			if (flatContext && flatContext.every((f) => f !== currentFileStatus)) {
				return TPromise.as(status);
			}

			var path = currentGitEditorInput.getFileStatus().getPath();
			var fileStatus = status.getStatus().find(path, StatusType.INDEX);

			if (!fileStatus) {
				return TPromise.as(status);
			}

			var editorControl = <any>targetEditor.getControl();
			var viewState = editorControl ? editorControl.saveViewState() : null;

			return this.gitService.getInput(fileStatus).then((input) => {
				var options = new TextDiffEditorOptions();
				options.forceOpen = true;

				return this.editorService.openEditor(input, options, targetEditor.position).then((editor) => {
					if (viewState) {
						editorControl.restoreViewState(viewState);
					}

					return status;
				});
			});
		});
	}

	private findGitWorkingTreeEditor(): IEditor {
		var editors = this.editorService.getVisibleEditors();
		for (var i = 0; i < editors.length; i++) {
			var editor = editors[i];
			if (inputs.isGitEditorInput(editor.input)) {
				return editor;
			}
		}

		return null;
	}

	public dispose(): void {
		this.editorService = null;

		super.dispose();
	}
}

export class StageAction extends BaseStageAction {
	static ID = 'workbench.action.git.stage';
	static LABEL = nls.localize('stageChanges', "Stage");

	constructor(@IGitService gitService: IGitService, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		super(StageAction.ID, StageAction.LABEL, 'git-action stage', gitService, editorService);
	}
}

export class GlobalStageAction extends BaseStageAction {

	static ID = 'workbench.action.git.stageAll';

	constructor(@IGitService gitService: IGitService, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		super(GlobalStageAction.ID, nls.localize('stageAllChanges', "Stage All"), 'git-action stage', gitService, editorService);
	}

	protected isEnabled():boolean {
		return super.isEnabled() && this.gitService.getModel().getStatus().getWorkingTreeStatus().all().length > 0;
	}

	public run(context?: any):Promise {
		return super.run();
	}
}

export abstract class BaseUndoAction extends GitAction {

	private eventService: IEventService;
	private editorService: IWorkbenchEditorService;
	private messageService: IMessageService;
	private fileService: IFileService;
	private contextService: IWorkspaceContextService;

	constructor(id: string, label: string, className: string, gitService: IGitService, eventService: IEventService, messageService: IMessageService, fileService:IFileService, editorService: IWorkbenchEditorService, contextService: IWorkspaceContextService) {
		super(id, label, className, gitService);
		this.eventService = eventService;
		this.editorService = editorService;
		this.messageService = messageService;
		this.fileService = fileService;
		this.contextService = contextService;
		this.onGitServiceChange();
	}

	protected isEnabled():boolean {
		return super.isEnabled() && !!this.eventService && !!this.editorService && !!this.fileService;
	}

	public run(context?: any):Promise {
		if (!this.messageService.confirm(this.getConfirm(context))) {
			return TPromise.as(null);
		}

		var promises: Promise[] = [];

		if (context instanceof model.StatusGroup) {
			promises = [ this.gitService.undo() ];

		} else {
			var all: IFileStatus[] = flatten(context);
			var toClean: IFileStatus[] = [];
			var toCheckout: IFileStatus[] = [];

			for (var i = 0; i < all.length; i++) {
				var status = all[i].clone();

				switch (status.getStatus()) {
					case Status.UNTRACKED:
					case Status.IGNORED:
						toClean.push(status);
						break;

					default:
						toCheckout.push(status);
						break;
				}
			}

			if (toClean.length > 0) {
				promises.push(this.gitService.clean(toClean));
			}

			if (toCheckout.length > 0) {
				promises.push(this.gitService.checkout('', toCheckout));
			}
		}

		return Promise.join(promises).then((statuses: IModel[]) => {
			if (statuses.length === 0) {
				return TPromise.as(null);
			}

			var status = statuses[statuses.length - 1];

			var targetEditor = this.findWorkingTreeDiffEditor();
			if (!targetEditor) {
				return TPromise.as(status);
			}

			var currentGitEditorInput = <inputs.GitWorkingTreeDiffEditorInput> targetEditor.input;
			var currentFileStatus = currentGitEditorInput.getFileStatus();

			if (all && all.every((f) => f !== currentFileStatus)) {
				return TPromise.as(status);
			}

			var path = currentGitEditorInput.getFileStatus().getPath();

			var editor = <IDiffEditor> targetEditor.getControl();
			var modifiedEditorControl = editor ? <any>editor.getModifiedEditor() : null;
			var modifiedViewState = modifiedEditorControl ? modifiedEditorControl.saveViewState() : null;

			return this.fileService.resolveFile(this.contextService.toResource(path)).then((stat: IFileStat) => {
				return this.editorService.openEditor({
					resource: stat.resource,
					mime: stat.mime,
					options: {
						forceOpen: true
					}
				}, targetEditor.position).then((editor) => {
					if (modifiedViewState) {
						var codeEditor = <ICodeEditor> targetEditor.getControl();

						if (codeEditor) {
							codeEditor.restoreViewState(modifiedViewState);
						}
					}
				});
			});
		}).then(null, (errors: any[]): Promise => {
			console.error('One or more errors occurred', errors);
			return Promise.wrapError(errors[0]);
		});
	}

	private findWorkingTreeDiffEditor(): IEditor {
		var editors = this.editorService.getVisibleEditors();
		for (var i = 0; i < editors.length; i++) {
			var editor = editors[i];
			if (editor.input instanceof inputs.GitWorkingTreeDiffEditorInput) {
				return editor;
			}
		}

		return null;
	}

	private getConfirm(context: any): IConfirmation {
		const all = flatten(context);

		if (all.length > 1) {
			const count = all.length;

			return {
				message: nls.localize('confirmUndoMessage', "Are you sure you want to clean all changes?"),
				detail: count === 1
					? nls.localize('confirmUndoAllOne', "There are unstaged changes in {0} file.\n\nThis action is irreversible!", count)
					: nls.localize('confirmUndoAllMultiple', "There are unstaged changes in {0} files.\n\nThis action is irreversible!", count),
				primaryButton: nls.localize({ key: 'cleanChangesLabel', comment: ['&& denotes a mnemonic'] }, "&&Clean Changes")
			};
		}

		const label = all[0].getPathComponents().reverse()[0];

		return {
			message: nls.localize('confirmUndo', "Are you sure you want to clean changes in '{0}'?", label),
			detail: nls.localize('irreversible', "This action is irreversible!"),
			primaryButton: nls.localize({ key: 'cleanChangesLabel', comment: ['&& denotes a mnemonic'] }, "&&Clean Changes")
		};
	}

	public dispose(): void {
		this.eventService = null;
		this.editorService = null;
		this.fileService = null;

		super.dispose();
	}
}

export class UndoAction extends BaseUndoAction {
	static ID = 'workbench.action.git.undo';
	constructor( @IGitService gitService: IGitService, @IEventService eventService: IEventService, @IMessageService messageService: IMessageService, @IFileService fileService: IFileService, @IWorkbenchEditorService editorService: IWorkbenchEditorService, @IWorkspaceContextService contextService: IWorkspaceContextService) {
		super(UndoAction.ID, nls.localize('undoChanges', "Clean"), 'git-action undo', gitService, eventService, messageService, fileService, editorService, contextService);
	}
}

export class GlobalUndoAction extends BaseUndoAction {

	static ID = 'workbench.action.git.undoAll';

	constructor(@IGitService gitService: IGitService, @IEventService eventService: IEventService, @IMessageService messageService: IMessageService, @IFileService fileService: IFileService, @IWorkbenchEditorService editorService: IWorkbenchEditorService, @IWorkspaceContextService contextService: IWorkspaceContextService) {
		super(GlobalUndoAction.ID, nls.localize('undoAllChanges', "Clean All"), 'git-action undo', gitService, eventService, messageService, fileService, editorService, contextService);
	}

	protected isEnabled():boolean {
		return super.isEnabled() && this.gitService.getModel().getStatus().getWorkingTreeStatus().all().length > 0;
	}

	public run(context?: any):Promise {
		return super.run(this.gitService.getModel().getStatus().getWorkingTreeStatus());
	}
}

export abstract class BaseUnstageAction extends GitAction {

	private editorService: IWorkbenchEditorService;

	constructor(id: string, label: string, className: string, gitService: IGitService, editorService: IWorkbenchEditorService) {
		super(id, label, className, gitService);
		this.editorService = editorService;
		this.onGitServiceChange();
	}

	protected isEnabled():boolean {
		return super.isEnabled() && !!this.editorService;
	}

	public run(context?: any):Promise {
		var flatContext = flatten(context);

		return this.gitService.revertFiles('HEAD', flatContext).then((status: IModel) => {
			var targetEditor = this.findGitIndexEditor();
			if (!targetEditor) {
				return TPromise.as(status);
			}

			var currentGitEditorInput = <inputs.IEditorInputWithStatus>(<any>targetEditor.input);
			var currentFileStatus = currentGitEditorInput.getFileStatus();

			if (flatContext && flatContext.every((f) => f !== currentFileStatus)) {
				return TPromise.as(status);
			}

			var path = currentGitEditorInput.getFileStatus().getPath();
			var fileStatus = status.getStatus().find(path, StatusType.WORKING_TREE);

			if (!fileStatus) {
				return TPromise.as(status);
			}

			var editorControl = <any> targetEditor.getControl();
			var viewState = editorControl ? editorControl.saveViewState() : null;

			return this.gitService.getInput(fileStatus).then((input) => {
				var options = new TextDiffEditorOptions();
				options.forceOpen = true;

				return this.editorService.openEditor(input, options, targetEditor.position).then((editor) => {
					if (viewState) {
						editorControl.restoreViewState(viewState);
					}

					return status;
				});
			});
		});
	}

	private findGitIndexEditor(): IEditor {
		var editors = this.editorService.getVisibleEditors();
		for (var i = 0; i < editors.length; i++) {
			var editor = editors[i];
			if (inputs.isGitEditorInput(editor.input)) {
				return editor;
			}
		}

		return null;
	}

	public dispose(): void {
		this.editorService = null;

		super.dispose();
	}
}

export class UnstageAction extends BaseUnstageAction {
	static ID = 'workbench.action.git.unstage';

	constructor(@IGitService gitService: IGitService, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		super(UnstageAction.ID, nls.localize('unstage', "Unstage"), 'git-action unstage', gitService, editorService);
	}
}

export class GlobalUnstageAction extends BaseUnstageAction {

	static ID = 'workbench.action.git.unstageAll';

	constructor(@IGitService gitService: IGitService, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		super(GlobalUnstageAction.ID, nls.localize('unstageAllChanges', "Unstage All"), 'git-action unstage', gitService, editorService);
	}

	protected isEnabled():boolean {
		return super.isEnabled() && this.gitService.getModel().getStatus().getIndexStatus().all().length > 0;
	}

	public run(context?: any):Promise {
		return super.run();
	}
}

enum LifecycleState {
	Alive,
	Disposing,
	Disposed
}

export class CheckoutAction extends GitAction {

	static ID = 'workbench.action.git.checkout';
	private editorService: IWorkbenchEditorService;
	private branch: IBranch;
	private HEAD: IBranch;

	private state: LifecycleState;
	private runPromises: Promise[];

	constructor(branch: IBranch, @IGitService gitService: IGitService, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		super(CheckoutAction.ID, branch.name, 'git-action checkout', gitService);

		this.editorService = editorService;
		this.branch = branch;
		this.HEAD = null;
		this.state = LifecycleState.Alive;
		this.runPromises = [];
		this.onGitServiceChange();
	}

	protected onGitServiceChange(): void {
		if (this.gitService.getState() === ServiceState.OK) {
			this.HEAD = this.gitService.getModel().getHEAD();

			if (this.HEAD && this.HEAD.name === this.branch.name) {
				this.class = 'git-action checkout HEAD';
			} else {
				this.class = 'git-action checkout';
			}
		}

		super.onGitServiceChange();
	}

	protected isEnabled():boolean {
		return super.isEnabled() && !!this.HEAD;
	}

	public run(context?: any):Promise {
		if (this.state !== LifecycleState.Alive) {
			return Promise.wrapError('action disposed');
		} else if (this.HEAD && this.HEAD.name === this.branch.name) {
			return TPromise.as(null);
		}

		var result = this.gitService.checkout(this.branch.name).then(null, (err) => {
			if (err.gitErrorCode === GitErrorCodes.DirtyWorkTree) {
				return Promise.wrapError(new Error(nls.localize('dirtyTreeCheckout', "Can't checkout. Please commit or stage your work first.")));
			}

			return Promise.wrapError(err);
		});

		this.runPromises.push(result);
		result.done(() => this.runPromises.splice(this.runPromises.indexOf(result), 1));

		return result;
	}

	public dispose(): void {
		if (this.state !== LifecycleState.Alive) {
			return;
		}

		this.state = LifecycleState.Disposing;
		Promise.join(this.runPromises).done(() => this.actuallyDispose());
	}

	private actuallyDispose(): void {
		this.editorService = null;
		this.branch = null;
		this.HEAD = null;

		super.dispose();

		this.state = LifecycleState.Disposed;
	}
}

export class BranchAction extends GitAction {

	static ID = 'workbench.action.git.branch';
	private checkout:boolean;

	constructor(checkout: boolean, @IGitService gitService: IGitService) {
		super(BranchAction.ID, nls.localize('branch', "Branch"), 'git-action checkout', gitService);
		this.checkout = checkout;
	}

	public run(context?: any):Promise {
		if (!isString(context)) {
			return TPromise.as(false);
		}

		return this.gitService.branch(<string> context, this.checkout);
	}
}

export interface ICommitState extends IEventEmitter {
	getCommitMessage():string;
	onEmptyCommitMessage():void;
}

export abstract class BaseCommitAction extends GitAction {
	protected commitState: ICommitState;

	constructor(commitState: ICommitState, id: string, label: string, cssClass: string, gitService: IGitService) {
		super(id, label, cssClass, gitService);

		this.commitState = commitState;

		this.toDispose.push(commitState.addListener2('change/commitInputBox', () => {
			this.updateEnablement();
		}));

		this.onGitServiceChange();
	}

	protected isEnabled():boolean {
		return super.isEnabled() && this.gitService.getModel().getStatus().getIndexStatus().all().length > 0;
	}

	public run(context?: any):Promise {
		if (!this.commitState.getCommitMessage()) {
			this.commitState.onEmptyCommitMessage();
			return TPromise.as(null);
		}

		return this.gitService.commit(this.commitState.getCommitMessage());
	}
}

export class CommitAction extends BaseCommitAction {

	static ID = 'workbench.action.git.commit';

	constructor(commitState: ICommitState, @IGitService gitService: IGitService) {
		super(commitState, CommitAction.ID, nls.localize('commitStaged', "Commit Staged"), 'git-action commit', gitService);
	}

}

export class StageAndCommitAction extends BaseCommitAction {

	static ID = 'workbench.action.git.stageAndCommit';

	constructor(commitState: ICommitState, @IGitService gitService: IGitService) {
		super(commitState, StageAndCommitAction.ID, nls.localize('commitAll', "Commit All"), 'git-action stage-and-commit', gitService);
	}

	protected isEnabled():boolean {
		if (!this.gitService) {
			return false;
		}

		if (!this.gitService.isIdle()) {
			return false;
		}

		var status = this.gitService.getModel().getStatus();

		return status.getIndexStatus().all().length > 0
			|| status.getWorkingTreeStatus().all().length > 0;
	}

	public run(context?: any):Promise {
		if (!this.commitState.getCommitMessage()) {
			this.commitState.onEmptyCommitMessage();
			return TPromise.as(null);
		}

		return this.gitService.commit(this.commitState.getCommitMessage(), false, true);
	}
}

export class SmartCommitAction extends BaseCommitAction {

	static ID = 'workbench.action.git.commitAll';
	private static ALL = nls.localize('commitAll2', "Commit All");
	private static STAGED = nls.localize('commitStaged2', "Commit Staged");

	private messageService: IMessageService;

	constructor(commitState: ICommitState, @IGitService gitService: IGitService, @IMessageService messageService: IMessageService) {
		super(commitState, SmartCommitAction.ID, SmartCommitAction.ALL, 'git-action smart-commit', gitService);
		this.messageService = messageService;
		this.onGitServiceChange();
	}

	protected onGitServiceChange(): void {
		super.onGitServiceChange();

		if (!this.enabled) {
			this.label = SmartCommitAction.ALL;
			return;
		}

		var status = this.gitService.getModel().getStatus();

		if (status.getIndexStatus().all().length > 0) {
			this.label = SmartCommitAction.STAGED;
		} else {
			this.label = SmartCommitAction.ALL;
		}

		this.label += ' (' + (platform.isMacintosh ? 'Cmd+Enter' : 'Ctrl+Enter') + ')';
	}

	protected isEnabled():boolean {
		if (!this.gitService) {
			return false;
		}

		if (!this.gitService.isIdle()) {
			return false;
		}

		var status = this.gitService.getModel().getStatus();

		return status.getIndexStatus().all().length > 0
			|| status.getWorkingTreeStatus().all().length > 0;
	}

	public run(context?: any):Promise {
		if (!this.commitState.getCommitMessage()) {
			this.commitState.onEmptyCommitMessage();
			return TPromise.as(null);
		}

		var status = this.gitService.getModel().getStatus();

		return this.gitService.commit(this.commitState.getCommitMessage(), false, status.getIndexStatus().all().length === 0);
	}
}

export class PullAction extends GitAction {

	static ID = 'workbench.action.git.pull';
	static LABEL = nls.localize('pull', "Pull");

	constructor(
		id = PullAction.ID,
		label = PullAction.LABEL,
		@IGitService gitService: IGitService
	) {
		super(id, label, 'git-action pull', gitService);
	}

	protected isEnabled():boolean {
		if (!super.isEnabled()) {
			return false;
		}

		if (!this.gitService.isIdle()) {
			return false;
		}

		var model = this.gitService.getModel();
		var HEAD = model.getHEAD();

		if (!HEAD || !HEAD.name || !HEAD.upstream) {
			return false;
		}

		return true;
	}

	public run(context?: any):Promise {
		return this.pull();
	}

	protected pull(rebase = false): Promise {
		return this.gitService.pull(rebase).then(null, (err) => {
			if (err.gitErrorCode === GitErrorCodes.DirtyWorkTree) {
				return Promise.wrapError(errors.create(nls.localize('dirtyTreePull', "Can't pull. Please commit or stage your work first."), { severity: Severity.Warning }));
			} else if (err.gitErrorCode === GitErrorCodes.AuthenticationFailed) {
				return Promise.wrapError(errors.create(nls.localize('authFailed', "Authentication failed on the git remote.")));
			}

			return Promise.wrapError(err);
		});
	}
}

export class PullWithRebaseAction extends PullAction {

	static ID = 'workbench.action.git.pull.rebase';
	static LABEL = nls.localize('pullWithRebase', "Pull (Rebase)");

	constructor(@IGitService gitService: IGitService) {
		super(PullWithRebaseAction.ID, PullWithRebaseAction.LABEL, gitService);
	}

	public run(context?: any):Promise {
		return this.pull(true);
	}
}

export class PushAction extends GitAction {

	static ID = 'workbench.action.git.push';
	static LABEL = nls.localize('push', "Push");

	constructor(
		id: string = PushAction.ID,
		label: string = PushAction.LABEL,
		@IGitService gitService: IGitService
	) {
		super(id, label, 'git-action push', gitService);
	}

	protected isEnabled():boolean {
		if (!super.isEnabled()) {
			return false;
		}

		if (!this.gitService.isIdle()) {
			return false;
		}

		var model = this.gitService.getModel();
		var HEAD = model.getHEAD();

		if (!HEAD || !HEAD.name || !HEAD.upstream) {
			return false;
		}

		if (!HEAD.ahead) { // no commits to pull or push
			return false;
		}

		return true;
	}

	public run(context?: any):Promise {
		return this.gitService.push().then(null, (err) => {
			if (err.gitErrorCode === GitErrorCodes.AuthenticationFailed) {
				return Promise.wrapError(errors.create(nls.localize('authFailed', "Authentication failed on the git remote.")));
			}

			return Promise.wrapError(err);
		});
	}
}

export class PublishAction extends GitAction {

	static ID = 'workbench.action.git.publish';
	static LABEL = nls.localize('publish', "Publish");

	constructor(
		id: string = PublishAction.ID,
		label: string = PublishAction.LABEL,
		@IGitService gitService: IGitService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IMessageService private messageService: IMessageService
	) {
		super(id, label, 'git-action publish', gitService);
	}

	protected isEnabled():boolean {
		if (!super.isEnabled()) {
			return false;
		}

		if (!this.gitService.isIdle()) {
			return false;
		}

		const model = this.gitService.getModel();

		if (model.getRemotes().length === 0) {
			return false;
		}

		const HEAD = model.getHEAD();

		if (!HEAD || !HEAD.name || HEAD.upstream) {
			return false;
		}

		return true;
	}

	public run(context?: any):Promise {
		const model = this.gitService.getModel();
		const remotes = model.getRemotes();
		const branchName = model.getHEAD().name;
		let promise: TPromise<string>;

		if (remotes.length === 1) {
			const remoteName = remotes[0].name;

			const result = this.messageService.confirm({
				message: nls.localize('confirmPublishMessage', "Are you sure you want to publish '{0}' to '{1}'?", branchName, remoteName),
				primaryButton: nls.localize({ key: 'confirmPublishMessageButton', comment: ['&& denotes a mnemonic'] }, "&&Publish")
			});

			promise = TPromise.as(result ? remoteName : null);
		} else {
			promise = this.quickOpenService.pick(remotes.map(r => r.name), {
				placeHolder: nls.localize('publishPickMessage', "Pick a remote to publish the branch '{0}' to:", branchName)
			});
		}

		return promise
			.then(remote => remote && this.gitService.push(remote, branchName, { setUpstream: true }))
			.then(null, err => {
				if (err.gitErrorCode === GitErrorCodes.AuthenticationFailed) {
					return Promise.wrapError(errors.create(nls.localize('authFailed', "Authentication failed on the git remote.")));
				}

				return Promise.wrapError(err);
			});
	}
}

export abstract class BaseSyncAction extends GitAction {

	constructor(id: string, label: string, className: string, gitService: IGitService) {
		super(id, label, className, gitService);
	}

	protected isEnabled():boolean {
		if (!super.isEnabled()) {
			return false;
		}

		if (!this.gitService.isIdle()) {
			return false;
		}

		var model = this.gitService.getModel();
		var HEAD = model.getHEAD();

		if (!HEAD || !HEAD.name || !HEAD.upstream) {
			return false;
		}

		return true;
	}

	public run(context?: any):Promise {
		if (!this.enabled) {
			return TPromise.as(null);
		}

		return this.gitService.sync().then(null, (err) => {
			if (err.gitErrorCode === GitErrorCodes.AuthenticationFailed) {
				return Promise.wrapError(errors.create(nls.localize('authFailed', "Authentication failed on the git remote.")));
			}

			return Promise.wrapError(err);
		});
	}
}

export class SyncAction extends BaseSyncAction {

	static ID = 'workbench.action.git.sync';
	static LABEL = nls.localize('sync', "Sync");

	constructor(id: string, label: string, @IGitService gitService: IGitService) {
		super(id, label, 'git-action sync', gitService);
	}
}

export class LiveSyncAction extends BaseSyncAction {

	static ID = 'workbench.action.git.liveSync';
	static CLASS_NAME = 'git-action live-sync';
	static CLASS_NAME_LOADING = 'git-action live-sync loading';

	constructor(@IGitService gitService: IGitService) {
		super(LiveSyncAction.ID, nls.localize('sync', "Sync"), LiveSyncAction.CLASS_NAME, gitService);
	}

	protected onGitServiceChange(): void {
		super.onGitServiceChange();

		if (this.gitService.getRunningOperations().some(op =>
			op.id === ServiceOperations.SYNC ||
			op.id === ServiceOperations.PULL ||
			op.id === ServiceOperations.PUSH))
		{
			this.label = '';
			this.class = LiveSyncAction.CLASS_NAME_LOADING;
			this.tooltip = nls.localize('synchronizing', "Synchronizing...");

		} else {
			this.class = LiveSyncAction.CLASS_NAME;

			var model = this.gitService.getModel();
			var HEAD = model.getHEAD();

			if (!HEAD) {
				this.label = '';
				this.tooltip = '';

			} else if (!HEAD.name) {
				this.label = '';
				this.tooltip = nls.localize('currentlyDetached', "Can't sync in detached mode.");

			} else if (!HEAD.upstream) {
				this.label = '';
				this.tooltip = nls.localize('noUpstream', "Current branch '{0} doesn't have an upstream branch configured.", HEAD.name);

			} else if (!HEAD.ahead && !HEAD.behind) {
				this.label = '';
				this.tooltip = nls.localize('currentBranch', "Current branch '{0}' is up to date.", HEAD.name);

			} else {
				this.label = strings.format('{0}↓ {1}↑', HEAD.behind, HEAD.ahead);

				if (model.getStatus().getGroups().some(g => g.all().length > 0)) {
					this.tooltip = nls.localize('dirtyChanges', "Please commit, undo or stash your changes before synchronizing.");
				} else if (HEAD.behind === 1 && HEAD.ahead === 1) {
					this.tooltip = nls.localize('currentBranchSingle', "Current branch '{0}' is {1} commit behind and {2} commit ahead of '{3}'.", HEAD.name, HEAD.behind, HEAD.ahead, HEAD.upstream);
				} else if (HEAD.behind === 1) {
					this.tooltip = nls.localize('currentBranchSinglePlural', "Current branch '{0}' is {1} commit behind and {2} commits ahead of '{3}'.", HEAD.name, HEAD.behind, HEAD.ahead, HEAD.upstream);
				} else if (HEAD.ahead === 1) {
					this.tooltip = nls.localize('currentBranchPluralSingle', "Current branch '{0}' is {1} commits behind and {2} commit ahead of '{3}'.", HEAD.name, HEAD.behind, HEAD.ahead, HEAD.upstream);
				} else {
					this.tooltip = nls.localize('currentBranchPlural', "Current branch '{0}' is {1} commits behind and {2} commits ahead of '{3}'.", HEAD.name, HEAD.behind, HEAD.ahead, HEAD.upstream);
				}
			}
		}
	}
}

export class UndoLastCommitAction extends GitAction {

	static ID = 'workbench.action.git.undoLastCommit';

	constructor(@IGitService gitService: IGitService) {
		super(UndoLastCommitAction.ID, nls.localize('undoLastCommit', "Undo Last Commit"), 'git-action undo-last-commit', gitService);
	}

	public run():Promise {
		return this.gitService.reset('HEAD~');
	}
}

export class StartGitCheckoutAction extends Action {

	public static ID = 'workbench.action.git.startGitCheckout';
	public static LABEL = nls.localize('checkout', "Checkout");
	private quickOpenService: IQuickOpenService;

	constructor(id: string, label: string, @IQuickOpenService quickOpenService: IQuickOpenService) {
		super(id, label);
		this.quickOpenService = quickOpenService;
	}

	public run(event?:any): Promise {
		this.quickOpenService.show('git checkout ');
		return TPromise.as(null);
	}
}

export class StartGitBranchAction extends Action {

	public static ID = 'workbench.action.git.startGitBranch';
	public static LABEL = nls.localize('branch2', "Branch");
	private quickOpenService: IQuickOpenService;

	constructor(id: string, label: string, @IQuickOpenService quickOpenService: IQuickOpenService) {
		super(id, label);
		this.quickOpenService = quickOpenService;
	}

	public run(event?:any): Promise {
		this.quickOpenService.show('git branch ');
		return TPromise.as(null);
	}
}
