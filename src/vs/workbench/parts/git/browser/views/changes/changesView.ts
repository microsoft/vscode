/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./changesView';
import nls = require('vs/nls');
import Platform = require('vs/base/common/platform');
import Lifecycle = require('vs/base/common/lifecycle');
import EventEmitter = require('vs/base/common/eventEmitter');
import Strings = require('vs/base/common/strings');
import Errors = require('vs/base/common/errors');
import * as paths from 'vs/base/common/paths';
import WinJS = require('vs/base/common/winjs.base');
import Builder = require('vs/base/browser/builder');
import { StandardKeyboardEvent, IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import Actions = require('vs/base/common/actions');
import ActionBar = require('vs/base/browser/ui/actionbar/actionbar');
import Tree = require('vs/base/parts/tree/browser/tree');
import TreeImpl = require('vs/base/parts/tree/browser/treeImpl');
import git = require('vs/workbench/parts/git/common/git');
import GitView = require('vs/workbench/parts/git/browser/views/view');
import GitActions = require('vs/workbench/parts/git/browser/gitActions');
import GitModel = require('vs/workbench/parts/git/common/gitModel');
import Viewer = require('vs/workbench/parts/git/browser/views/changes/changesViewer');
import GitEditorInputs = require('vs/workbench/parts/git/browser/gitEditorInputs');
import { IOutputService } from 'vs/workbench/parts/output/common/output';
import WorkbenchEditorCommon = require('vs/workbench/common/editor');
import InputBox = require('vs/base/browser/ui/inputbox/inputBox');
import Severity from 'vs/base/common/severity';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IEditorInput } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService } from 'vs/platform/message/common/message';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

import IGitService = git.IGitService;

var $ = Builder.$;

export class ChangesView extends EventEmitter.EventEmitter implements GitView.IView, GitActions.ICommitState {

	public ID = 'changes';

	private static COMMIT_KEYBINDING = Platform.isMacintosh ? 'Cmd+Enter' : 'Ctrl+Enter';
	private static NEED_MESSAGE = nls.localize('needMessage', "Please provide a commit message. You can always press **{0}** to commit changes. If there are any staged changes, only those will be committed; otherwise, all changes will.", ChangesView.COMMIT_KEYBINDING);
	private static NOTHING_TO_COMMIT = nls.localize('nothingToCommit', "Once there are some changes to commit, type in the commit message and either press **{0}** to commit changes. If there are any staged changes, only those will be committed; otherwise, all changes will.", ChangesView.COMMIT_KEYBINDING);
	private static LONG_COMMIT = nls.localize('longCommit', "It is recommended to keep the commit's first line under 50 characters. Feel free to use more lines for extra information.");

	private instantiationService: IInstantiationService;
	private editorService: IWorkbenchEditorService;
	private messageService: IMessageService;
	private contextViewService: IContextViewService;
	private contextService: IWorkspaceContextService;
	private gitService: IGitService;
	private outputService: IOutputService;

	private $el: Builder.Builder;
	private $commitView: Builder.Builder;
	private $statusView: Builder.Builder;
	private commitInputBox: InputBox.InputBox;
	private tree: Tree.ITree;

	private visible: boolean;
	private currentDimension: Builder.Dimension;

	private smartCommitAction: GitActions.SmartCommitAction;
	private actions: Actions.IAction[];
	private secondaryActions: Actions.IAction[];
	private actionRunner: Actions.IActionRunner;

	private toDispose: Lifecycle.IDisposable[];

	constructor(actionRunner: Actions.IActionRunner,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IMessageService messageService: IMessageService,
		@IContextViewService contextViewService: IContextViewService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IGitService gitService: IGitService,
		@IOutputService outputService: IOutputService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super();

		this.instantiationService = instantiationService;
		this.editorService = editorService;
		this.messageService = messageService;
		this.contextViewService = contextViewService;
		this.contextService = contextService;
		this.gitService = gitService;
		this.outputService = outputService;

		this.visible = false;
		this.currentDimension = null;
		this.actionRunner = actionRunner;

		this.toDispose = [
			this.smartCommitAction = this.instantiationService.createInstance(GitActions.SmartCommitAction, this),
			editorGroupService.onEditorsChanged(() => this.onEditorsChanged(this.editorService.getActiveEditorInput()).done(null, Errors.onUnexpectedError)),
			this.gitService.addListener2(git.ServiceEvents.OPERATION_START, (e) => this.onGitOperationStart(e)),
			this.gitService.addListener2(git.ServiceEvents.OPERATION_END, (e) => this.onGitOperationEnd(e)),
			this.gitService.getModel().addListener2(git.ModelEvents.MODEL_UPDATED, this.onGitModelUpdate.bind(this))
		];
	}

	// IView

	public get element(): HTMLElement {
		this.render();
		return this.$el.getHTMLElement();
	}

	private render(): void {
		if (this.$el) {
			return;
		}

		this.$el = $('.changes-view');
		this.$commitView = $('.commit-view').appendTo(this.$el);

		// Commit view

		this.commitInputBox = new InputBox.InputBox(this.$commitView.getHTMLElement(), this.contextViewService, {
			placeholder: nls.localize('commitMessage', "Message (press {0} to commit)", ChangesView.COMMIT_KEYBINDING),
			validationOptions: {
				showMessage: true,
				validation: (value): InputBox.IMessage => {
					const config = this.configurationService.getConfiguration<git.IGitConfiguration>('git');

					if (!config.enableLongCommitWarning) {
						return null;
					}

					if (/^[^\n]{51}/.test(value)) {
						return {
							content: ChangesView.LONG_COMMIT,
							type: InputBox.MessageType.WARNING
						};
					}

					return null;
				}
			},
			ariaLabel: nls.localize('commitMessageAriaLabel', "Git: Type commit message and press {0} to commit", ChangesView.COMMIT_KEYBINDING),
			flexibleHeight: true
		});

		this.commitInputBox.onDidChange((value) => this.emit('change', value));
		this.commitInputBox.onDidHeightChange((value) => this.emit('heightchange', value));

		$(this.commitInputBox.inputElement).on('keydown', (e: KeyboardEvent) => {
			var keyboardEvent = new StandardKeyboardEvent(e);

			if (keyboardEvent.equals(KeyMod.CtrlCmd | KeyCode.Enter) || keyboardEvent.equals(KeyMod.CtrlCmd | KeyCode.KEY_S)) {
				if (this.smartCommitAction.enabled) {
					this.actionRunner.run(this.smartCommitAction).done();
				} else {
					this.commitInputBox.showMessage({ content: ChangesView.NOTHING_TO_COMMIT, formatContent: true, type: InputBox.MessageType.INFO });
				}
			}
		}).on('blur', () => {
			this.commitInputBox.hideMessage();
		});

		// Status view

		this.$statusView = $('.status-view').appendTo(this.$el);

		var actionProvider = this.instantiationService.createInstance(Viewer.ActionProvider);
		var renderer = this.instantiationService.createInstance(Viewer.Renderer, actionProvider, this.actionRunner);
		var dnd = this.instantiationService.createInstance(Viewer.DragAndDrop);
		var controller = this.instantiationService.createInstance(Viewer.Controller, actionProvider);

		this.tree = new TreeImpl.Tree(this.$statusView.getHTMLElement(), {
			dataSource: new Viewer.DataSource(),
			renderer: renderer,
			filter: new Viewer.Filter(),
			sorter: new Viewer.Sorter(),
			accessibilityProvider: new Viewer.AccessibilityProvider(),
			dnd: dnd,
			controller: controller
		}, {
				indentPixels: 0,
				twistiePixels: 20,
				ariaLabel: nls.localize('treeAriaLabel', "Git Changes View")
			});

		this.tree.setInput(this.gitService.getModel().getStatus());
		this.tree.expandAll(this.gitService.getModel().getStatus().getGroups());

		this.toDispose.push(this.tree.addListener2('selection', (e) => this.onSelection(e)));
		this.toDispose.push(this.commitInputBox.onDidHeightChange(() => this.layout()));
	}

	public focus(): void {
		var selection = this.tree.getSelection();
		if (selection.length > 0) {
			this.tree.reveal(selection[0], 0.5).done(null, Errors.onUnexpectedError);
		}

		this.commitInputBox.focus();
	}

	public layout(dimension: Builder.Dimension = this.currentDimension): void {
		if (!dimension) {
			return;
		}

		this.currentDimension = dimension;

		this.commitInputBox.layout();
		var statusViewHeight = dimension.height - (this.commitInputBox.height + 12 /* margin */);
		this.$statusView.size(dimension.width, statusViewHeight);
		this.tree.layout(statusViewHeight);

		if (this.commitInputBox.height === 134) {
			this.$commitView.addClass('scroll');
		} else {
			this.$commitView.removeClass('scroll');
		}
	}

	public setVisible(visible: boolean): WinJS.TPromise<void> {
		this.visible = visible;

		if (visible) {
			this.tree.onVisible();
			this.updateCommitInputTemplate();
			return this.onEditorsChanged(this.editorService.getActiveEditorInput());
		} else {
			this.tree.onHidden();
			return WinJS.TPromise.as(null);
		}
	}

	private onUndoLastCommit(commit: git.ICommit): void {
		if (this.commitInputBox.value) {
			return;
		}

		this.commitInputBox.value = commit.message;
	}

	private updateCommitInputTemplate(): void {
		if (this.commitInputBox.value) {
			return;
		}

		this.gitService.getCommitTemplate()
			.then(template => template && (this.commitInputBox.value = template))
			.done(null, Errors.onUnexpectedError);
	}

	public getControl(): Tree.ITree {
		return this.tree;
	}

	public getActions(): Actions.IAction[] {
		if (!this.actions) {
			this.actions = [
				this.smartCommitAction,
				this.instantiationService.createInstance(GitActions.RefreshAction)
			];

			this.actions.forEach(a => this.toDispose.push(a));
		}

		return this.actions;
	}

	public getSecondaryActions(): Actions.IAction[] {
		if (!this.secondaryActions) {
			this.secondaryActions = [
				this.instantiationService.createInstance(GitActions.SyncAction, GitActions.SyncAction.ID, GitActions.SyncAction.LABEL),
				this.instantiationService.createInstance(GitActions.PullAction, GitActions.PullAction.ID, GitActions.PullAction.LABEL),
				this.instantiationService.createInstance(GitActions.PullWithRebaseAction),
				this.instantiationService.createInstance(GitActions.PushAction, GitActions.PushAction.ID, GitActions.PushAction.LABEL),
				this.instantiationService.createInstance(GitActions.PushToRemoteAction, GitActions.PushToRemoteAction.ID, GitActions.PushToRemoteAction.LABEL),
				new ActionBar.Separator(),
				this.instantiationService.createInstance(GitActions.PublishAction, GitActions.PublishAction.ID, GitActions.PublishAction.LABEL),
				new ActionBar.Separator(),
				this.instantiationService.createInstance(GitActions.CommitAction, this),
				this.instantiationService.createInstance(GitActions.CommitSignedOffAction, this),
				this.instantiationService.createInstance(GitActions.StageAndCommitAction, this, GitActions.StageAndCommitAction.ID, GitActions.StageAndCommitAction.LABEL, GitActions.StageAndCommitAction.CSSCLASS),
				this.instantiationService.createInstance(GitActions.StageAndCommitSignedOffAction, this),
				this.instantiationService.createInstance(GitActions.UndoLastCommitAction, GitActions.UndoLastCommitAction.ID, GitActions.UndoLastCommitAction.LABEL),
				new ActionBar.Separator(),
				this.instantiationService.createInstance(GitActions.GlobalUnstageAction),
				this.instantiationService.createInstance(GitActions.GlobalUndoAction),
				new ActionBar.Separator(),
				new Actions.Action('show.gitOutput', nls.localize('showOutput', "Show Git Output"), null, true, () => this.outputService.getChannel('Git').show())
			];

			this.secondaryActions.forEach(a => this.toDispose.push(a));
		}

		return this.secondaryActions;
	}

	// ICommitState

	public getCommitMessage(): string {
		return Strings.trim(this.commitInputBox.value);
	}

	public onEmptyCommitMessage(): void {
		this.commitInputBox.focus();
		this.commitInputBox.showMessage({ content: ChangesView.NEED_MESSAGE, formatContent: true, type: InputBox.MessageType.INFO });
	}

	// Events

	private onGitModelUpdate(): void {
		if (this.tree) {
			this.tree.refresh().done(() => {
				return this.tree.expandAll(this.gitService.getModel().getStatus().getGroups());
			});
		}
	}

	private onEditorsChanged(input: IEditorInput): WinJS.TPromise<void> {
		if (!this.tree) {
			return WinJS.TPromise.as(null);
		}

		var status = this.getStatusFromInput(input);

		if (!status) {
			this.tree.clearSelection();
		}

		if (this.visible && this.tree.getSelection().indexOf(status) === -1) {
			return this.tree.reveal(status, 0.5).then(() => {
				this.tree.setSelection([status], { origin: 'implicit' });
			});
		}

		return WinJS.TPromise.as(null);
	}

	private onSelection(e: Tree.ISelectionEvent): void {
		if (e.payload && e.payload && e.payload.origin === 'implicit') {
			return;
		}

		if (e.selection.length !== 1) {
			return;
		}

		var element = e.selection[0];

		if (!(element instanceof GitModel.FileStatus)) {
			return;
		}

		if (e.payload && e.payload.origin === 'keyboard' && !(<IKeyboardEvent>e.payload.originalEvent).equals(KeyCode.Enter)) {
			return;
		}

		var isMouseOrigin = e.payload && (e.payload.origin === 'mouse');

		if (isMouseOrigin && (e.payload.originalEvent.metaKey || e.payload.originalEvent.shiftKey)) {
			return;
		}

		var isDoubleClick = isMouseOrigin && e.payload.originalEvent && e.payload.originalEvent.detail === 2;

		var status = <git.IFileStatus>element;

		this.gitService.getInput(status).done((input) => {
			var options = new WorkbenchEditorCommon.TextDiffEditorOptions();

			if (isMouseOrigin) {
				options.preserveFocus = true;

				var originalEvent: MouseEvent = e && e.payload && e.payload.origin === 'mouse' && e.payload.originalEvent;
				if (originalEvent && originalEvent.detail === 2) {
					options.preserveFocus = false;
					originalEvent.preventDefault(); // focus moves to editor, we need to prevent default
				}
			}

			options.forceOpen = true;
			options.pinned = isDoubleClick;

			var sideBySide = (e && e.payload && e.payload.originalEvent && e.payload.originalEvent.altKey);

			return this.editorService.openEditor(input, options, sideBySide);
		}, (e) => {
			if (e.gitErrorCode === git.GitErrorCodes.CantOpenResource) {
				this.messageService.show(Severity.Warning, e);
				return;
			}

			this.messageService.show(Severity.Error, e);
		});
	}

	private onGitOperationStart(operation: git.IGitOperation): void {
		if (operation.id === git.ServiceOperations.COMMIT) {
			if (this.commitInputBox) {
				this.commitInputBox.disable();
			}
		} else if (operation.id === git.ServiceOperations.RESET) {
			const promise = this.gitService.getCommit('HEAD');
			const listener = this.gitService.addListener2(git.ServiceEvents.OPERATION_END, e => {
				if (e.operation.id === git.ServiceOperations.RESET && !e.error) {
					promise.done(c => this.onUndoLastCommit(c));
					listener.dispose();
				}
			});
		}
	}

	private onGitOperationEnd(e: { operation: git.IGitOperation; error: any; }): void {
		if (e.operation.id === git.ServiceOperations.COMMIT) {
			if (this.commitInputBox) {
				this.commitInputBox.enable();

				if (!e.error) {
					this.commitInputBox.value = '';
					this.updateCommitInputTemplate();
				}
			}
		}
	}

	// Misc

	private getStatusFromInput(input: IEditorInput): git.IFileStatus {
		if (!input) {
			return null;
		}

		if (input instanceof GitEditorInputs.GitDiffEditorInput) {
			return (<GitEditorInputs.GitDiffEditorInput>input).getFileStatus();
		}

		if (input instanceof GitEditorInputs.NativeGitIndexStringEditorInput) {
			return (<GitEditorInputs.NativeGitIndexStringEditorInput>input).getFileStatus() || null;
		}

		const resource = WorkbenchEditorCommon.toResource(input, { filter: 'file' });
		if (resource) {
			const workspaceRoot = this.contextService.getWorkspace().resource.fsPath;
			if (!workspaceRoot || !paths.isEqualOrParent(resource.fsPath, workspaceRoot)) {
				return null; // out of workspace not yet supported
			}

			const repositoryRoot = this.gitService.getModel().getRepositoryRoot();
			if (!repositoryRoot || !paths.isEqualOrParent(resource.fsPath, repositoryRoot)) {
				return null; // out of repository not supported
			}

			const repositoryRelativePath = paths.normalize(paths.relative(repositoryRoot, resource.fsPath));

			var status = this.gitService.getModel().getStatus().getWorkingTreeStatus().find(repositoryRelativePath);
			if (status && (status.getStatus() === git.Status.UNTRACKED || status.getStatus() === git.Status.IGNORED)) {
				return status;
			}

			status = this.gitService.getModel().getStatus().getMergeStatus().find(repositoryRelativePath);
			if (status) {
				return status;
			}
		}

		return null;
	}

	public dispose(): void {
		if (this.$el) {
			this.$el.dispose();
			this.$el = null;
		}

		this.toDispose = Lifecycle.dispose(this.toDispose);

		super.dispose();
	}
}
