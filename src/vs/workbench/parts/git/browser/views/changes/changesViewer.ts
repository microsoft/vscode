/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import winjs = require('vs/base/common/winjs.base');
import nls = require('vs/nls');
import platform = require('vs/base/common/platform');
import paths = require('vs/base/common/paths');
import severity from 'vs/base/common/severity';
import lifecycle = require('vs/base/common/lifecycle');
import dom = require('vs/base/browser/dom');
import keyboard = require('vs/base/browser/keyboardEvent');
import mouse = require('vs/base/browser/mouseEvent');
import comparers = require('vs/base/common/comparers');
import actions = require('vs/base/common/actions');
import actionbar = require('vs/base/browser/ui/actionbar/actionbar');
import countbadge = require('vs/base/browser/ui/countBadge/countBadge');
import tree = require('vs/base/parts/tree/browser/tree');
import treednd = require('vs/base/parts/tree/browser/treeDnd');
import treedefaults = require('vs/base/parts/tree/browser/treeDefaults');
import actionsrenderer = require('vs/base/parts/tree/browser/actionsRenderer');
import * as git from 'vs/workbench/parts/git/common/git';
import gitmodel = require('vs/workbench/parts/git/common/gitModel');
import gitactions = require('vs/workbench/parts/git/browser/gitActions');
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService } from 'vs/platform/message/common/message';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import URI from 'vs/base/common/uri';

import IGitService = git.IGitService;

function toReadablePath(path: string): string {
	if (!platform.isWindows) {
		return path;
	}

	return path.replace(/\//g, '\\');
}

const $ = dom.$;

export class ActionContainer implements lifecycle.IDisposable {

	private cache: { [actionId: string]: actions.IAction; };
	private instantiationService: IInstantiationService;

	constructor(instantiationService: IInstantiationService) {
		this.cache = <any>{};
		this.instantiationService = instantiationService;
	}

	protected getAction(ctor: any, ...args: any[]): any {
		var action = this.cache[ctor.ID];

		if (!action) {
			args.unshift(ctor);
			action = this.cache[ctor.ID] = this.instantiationService.createInstance.apply(this.instantiationService, args);
		}

		return action;
	}

	public dispose(): void {
		Object.keys(this.cache).forEach(k => {
			this.cache[k].dispose();
		});

		this.cache = null;
	}
}

export class DataSource implements tree.IDataSource {

	public getId(tree: tree.ITree, element: any): string {
		if (element instanceof gitmodel.StatusModel) {
			return 'root';
		} else if (element instanceof gitmodel.StatusGroup) {
			var statusGroup = <git.IStatusGroup>element;

			switch (statusGroup.getType()) {
				case git.StatusType.INDEX: return 'index';
				case git.StatusType.WORKING_TREE: return 'workingTree';
				case git.StatusType.MERGE: return 'merge';
				default: throw new Error('Invalid group type');
			}
		}

		var status = <git.IFileStatus>element;
		return status.getId();
	}

	public hasChildren(tree: tree.ITree, element: any): boolean {
		if (element instanceof gitmodel.StatusModel) {
			return true;
		} else if (element instanceof gitmodel.StatusGroup) {
			var statusGroup = <git.IStatusGroup>element;
			return statusGroup.all().length > 0;
		}
		return false;
	}

	public getChildren(tree: tree.ITree, element: any): winjs.Promise {
		if (element instanceof gitmodel.StatusModel) {
			var model = <git.IStatusModel>element;
			return winjs.TPromise.as(model.getGroups());

		} else if (element instanceof gitmodel.StatusGroup) {
			var statusGroup = <git.IStatusGroup>element;
			return winjs.TPromise.as(statusGroup.all());
		}

		return winjs.TPromise.as([]);
	}

	public getParent(tree: tree.ITree, element: any): winjs.Promise {
		return winjs.TPromise.as(null);
	}
}

export class ActionProvider extends ActionContainer implements actionsrenderer.IActionProvider {

	private gitService: git.IGitService;

	constructor( @IInstantiationService instantiationService: IInstantiationService, @IGitService gitService: IGitService) {
		super(instantiationService);
		this.gitService = gitService;
	}

	public hasActions(tree: tree.ITree, element: any): boolean {
		if (element instanceof gitmodel.FileStatus) {
			return true;
		} else if (element instanceof gitmodel.StatusGroup && (<git.IStatusGroup>element).all().length > 0) {
			return true;
		}
		return false;
	}

	public getActions(tree: tree.ITree, element: any): winjs.TPromise<actions.IAction[]> {
		if (element instanceof gitmodel.StatusGroup) {
			return winjs.TPromise.as(this.getActionsForGroupStatusType(element.getType()));
		} else {
			return winjs.TPromise.as(this.getActionsForFileStatusType(element.getType()));
		}
	}

	public getActionsForFileStatusType(statusType: git.StatusType): actions.IAction[] {
		switch (statusType) {
			case git.StatusType.INDEX:
				return [this.getAction(gitactions.UnstageAction)];
			case git.StatusType.WORKING_TREE:
				return [this.getAction(gitactions.UndoAction), this.getAction(gitactions.StageAction)];
			case git.StatusType.MERGE:
				return [this.getAction(gitactions.StageAction)];
			default:
				return [];
		}
	}

	public getActionsForGroupStatusType(statusType: git.StatusType): actions.IAction[] {
		switch (statusType) {
			case git.StatusType.INDEX:
				return [this.getAction(gitactions.GlobalUnstageAction)];
			case git.StatusType.WORKING_TREE:
				return [this.getAction(gitactions.GlobalUndoAction), this.getAction(gitactions.GlobalStageAction)];
			case git.StatusType.MERGE:
				return [this.getAction(gitactions.StageAction)];
			default:
				return [];
		}
	}

	public hasSecondaryActions(tree: tree.ITree, element: any): boolean {
		return this.hasActions(tree, element);
	}

	public getSecondaryActions(tree: tree.ITree, element: any): winjs.TPromise<actions.IAction[]> {
		return this.getActions(tree, element).then((actions: actions.IAction[]) => {

			if (element instanceof gitmodel.FileStatus) {
				var fileStatus = <gitmodel.FileStatus>element;
				var status = fileStatus.getStatus();

				actions.push(new actionbar.Separator());

				if (status !== git.Status.DELETED && status !== git.Status.INDEX_DELETED) {
					actions.push(this.getAction(gitactions.OpenFileAction));
				}

				actions.push(this.getAction(gitactions.OpenChangeAction));
			}

			actions.reverse();
			return actions;
		});
	}

	public getActionItem(tree: tree.ITree, element: any, action: actions.IAction): actionbar.IActionItem {
		return null;
	}
}

interface IFileStatusTemplateData {
	root: HTMLElement;
	status: HTMLElement;
	name: HTMLElement;
	folder: HTMLElement;
	renameName: HTMLElement;
	renameFolder: HTMLElement;
	actionBar: actionbar.ActionBar;
}

interface IStatusGroupTemplateData {
	root: HTMLElement;
	count: countbadge.CountBadge;
	actionBar: actionbar.ActionBar;
}

const STAGED_CHANGES = nls.localize('stagedChanges', "Staged Changes");
const CHANGES = nls.localize('allChanges', "Changes");
const MERGE_CHANGES = nls.localize('mergeChanges', "Merge Changes");

export class Renderer implements tree.IRenderer {

	constructor(
		private actionProvider: ActionProvider,
		private actionRunner: actions.IActionRunner,
		@IMessageService private messageService: IMessageService,
		@IGitService private gitService: IGitService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		// noop
	}

	public getHeight(tree: tree.ITree, element: any): number {
		return 22;
	}

	public getTemplateId(tree: tree.ITree, element: any): string {
		if (element instanceof gitmodel.StatusGroup) {
			switch (element.getType()) {
				case git.StatusType.INDEX: return 'index';
				case git.StatusType.WORKING_TREE: return 'workingTree';
				case git.StatusType.MERGE: return 'merge';
			}
		}

		if (element instanceof gitmodel.FileStatus) {
			switch (element.getType()) {
				case git.StatusType.INDEX: return 'file:index';
				case git.StatusType.WORKING_TREE: return 'file:workingTree';
				case git.StatusType.MERGE: return 'file:merge';
			}
		}

		return null;
	}

	public renderTemplate(tree: tree.ITree, templateId: string, container: HTMLElement): any {
		if (/^file:/.test(templateId)) {
			return this.renderFileStatusTemplate(Renderer.templateIdToStatusType(templateId), container);
		} else {
			return this.renderStatusGroupTemplate(Renderer.templateIdToStatusType(templateId), container);
		}
	}

	private renderStatusGroupTemplate(statusType: git.StatusType, container: HTMLElement): IStatusGroupTemplateData {
		var data: IStatusGroupTemplateData = Object.create(null);

		data.root = dom.append(container, $('.status-group'));

		switch (statusType) {
			case git.StatusType.INDEX: data.root.textContent = STAGED_CHANGES; break;
			case git.StatusType.WORKING_TREE: data.root.textContent = CHANGES; break;
			case git.StatusType.MERGE: data.root.textContent = MERGE_CHANGES; break;
		}

		const wrapper = dom.append(container, $('.count-badge-wrapper'));
		data.count = new countbadge.CountBadge(wrapper);

		data.actionBar = new actionbar.ActionBar(container, { actionRunner: this.actionRunner });
		data.actionBar.push(this.actionProvider.getActionsForGroupStatusType(statusType), { icon: true, label: false });
		data.actionBar.addListener2('run', e => e.error && this.onError(e.error));

		return data;
	}

	private renderFileStatusTemplate(statusType: git.StatusType, container: HTMLElement): IFileStatusTemplateData {
		var data: IFileStatusTemplateData = Object.create(null);

		data.root = dom.append(container, $('.file-status'));
		data.status = dom.append(data.root, $('span.status'));
		data.name = dom.append(data.root, $('a.name.plain'));
		data.folder = dom.append(data.root, $('span.folder'));

		var rename = dom.append(data.root, $('span.rename'));
		var arrow = dom.append(rename, $('span.rename-arrow'));
		arrow.textContent = '←';

		data.renameName = dom.append(rename, $('span.rename-name'));
		data.renameFolder = dom.append(rename, $('span.rename-folder'));

		data.actionBar = new actionbar.ActionBar(container, { actionRunner: this.actionRunner });
		data.actionBar.push(this.actionProvider.getActionsForFileStatusType(statusType), { icon: true, label: false });
		data.actionBar.addListener2('run', e => e.error && this.onError(e.error));

		return data;
	}

	public renderElement(tree: tree.ITree, element: any, templateId: string, templateData: any): void {
		if (/^file:/.test(templateId)) {
			this.renderFileStatus(tree, <git.IFileStatus>element, templateData);
		} else {
			Renderer.renderStatusGroup(<git.IStatusGroup>element, templateData);
		}
	}

	private static renderStatusGroup(statusGroup: git.IStatusGroup, data: IStatusGroupTemplateData): void {
		data.actionBar.context = statusGroup;
		data.count.setCount(statusGroup.all().length);
	}

	private renderFileStatus(tree: tree.ITree, fileStatus: git.IFileStatus, data: IFileStatusTemplateData): void {
		data.actionBar.context = {
			tree: tree,
			fileStatus: fileStatus
		};

		const repositoryRoot = this.gitService.getModel().getRepositoryRoot();
		const workspaceRoot = this.contextService.getWorkspace().resource.fsPath;

		const status = fileStatus.getStatus();
		const renamePath = fileStatus.getRename();
		const path = fileStatus.getPath();
		const lastSlashIndex = path.lastIndexOf('/');
		const name = lastSlashIndex === -1 ? path : path.substr(lastSlashIndex + 1, path.length);
		const folder = (lastSlashIndex === -1 ? '' : path.substr(0, lastSlashIndex));

		data.root.className = 'file-status ' + Renderer.statusToClass(status);
		data.status.textContent = Renderer.statusToChar(status);
		data.status.title = Renderer.statusToTitle(status);

		const resource = URI.file(paths.normalize(paths.join(repositoryRoot, path)));
		let isInWorkspace = paths.isEqualOrParent(resource.fsPath, workspaceRoot);

		let rename = '';
		let renameFolder = '';

		if (renamePath) {
			const renameLastSlashIndex = renamePath.lastIndexOf('/');
			rename = renameLastSlashIndex === -1 ? renamePath : renamePath.substr(renameLastSlashIndex + 1, renamePath.length);
			renameFolder = (renameLastSlashIndex === -1 ? '' : renamePath.substr(0, renameLastSlashIndex));

			data.renameName.textContent = name;
			data.renameFolder.textContent = folder;

			const resource = URI.file(paths.normalize(paths.join(repositoryRoot, renamePath)));
			isInWorkspace = paths.isEqualOrParent(resource.fsPath, workspaceRoot);
		}

		if (isInWorkspace) {
			data.root.title = '';
		} else {
			data.root.title = nls.localize('outsideOfWorkspace', "This file is located outside the current workspace.");
			data.root.className += ' out-of-workspace';
		}

		data.name.textContent = rename || name;
		data.name.title = renamePath || path;
		data.folder.textContent = toReadablePath(renameFolder || folder);
	}

	public disposeTemplate(tree: tree.ITree, templateId: string, templateData: any): void {
		if (/^file:/.test(templateId)) {
			Renderer.disposeFileStatusTemplate(<IFileStatusTemplateData>templateData);
		}
	}

	private static disposeFileStatusTemplate(templateData: IFileStatusTemplateData): void {
		templateData.actionBar.dispose();
	}

	private static statusToChar(status: git.Status): string {
		switch (status) {
			case git.Status.INDEX_MODIFIED: return nls.localize('modified-char', "M");
			case git.Status.MODIFIED: return nls.localize('modified-char', "M");
			case git.Status.INDEX_ADDED: return nls.localize('added-char', "A");
			case git.Status.INDEX_DELETED: return nls.localize('deleted-char', "D");
			case git.Status.DELETED: return nls.localize('deleted-char', "D");
			case git.Status.INDEX_RENAMED: return nls.localize('renamed-char', "R");
			case git.Status.INDEX_COPIED: return nls.localize('copied-char', "C");
			case git.Status.UNTRACKED: return nls.localize('untracked-char', "U");
			case git.Status.IGNORED: return nls.localize('ignored-char', "!");
			case git.Status.BOTH_DELETED: return nls.localize('deleted-char', "D");
			case git.Status.ADDED_BY_US: return nls.localize('added-char', "A");
			case git.Status.DELETED_BY_THEM: return nls.localize('deleted-char', "D");
			case git.Status.ADDED_BY_THEM: return nls.localize('added-char', "A");
			case git.Status.DELETED_BY_US: return nls.localize('deleted-char', "D");
			case git.Status.BOTH_ADDED: return nls.localize('added-char', "A");
			case git.Status.BOTH_MODIFIED: return nls.localize('modified-char', "M");
			default: return '';
		}
	}

	public static statusToTitle(status: git.Status): string {
		switch (status) {
			case git.Status.INDEX_MODIFIED: return nls.localize('title-index-modified', "Modified in index");
			case git.Status.MODIFIED: return nls.localize('title-modified', "Modified");
			case git.Status.INDEX_ADDED: return nls.localize('title-index-added', "Added to index");
			case git.Status.INDEX_DELETED: return nls.localize('title-index-deleted', "Deleted in index");
			case git.Status.DELETED: return nls.localize('title-deleted', "Deleted");
			case git.Status.INDEX_RENAMED: return nls.localize('title-index-renamed', "Renamed in index");
			case git.Status.INDEX_COPIED: return nls.localize('title-index-copied', "Copied in index");
			case git.Status.UNTRACKED: return nls.localize('title-untracked', "Untracked");
			case git.Status.IGNORED: return nls.localize('title-ignored', "Ignored");
			case git.Status.BOTH_DELETED: return nls.localize('title-conflict-both-deleted', "Conflict: both deleted");
			case git.Status.ADDED_BY_US: return nls.localize('title-conflict-added-by-us', "Conflict: added by us");
			case git.Status.DELETED_BY_THEM: return nls.localize('title-conflict-deleted-by-them', "Conflict: deleted by them");
			case git.Status.ADDED_BY_THEM: return nls.localize('title-conflict-added-by-them', "Conflict: added by them");
			case git.Status.DELETED_BY_US: return nls.localize('title-conflict-deleted-by-us', "Conflict: deleted by us");
			case git.Status.BOTH_ADDED: return nls.localize('title-conflict-both-added', "Conflict: both added");
			case git.Status.BOTH_MODIFIED: return nls.localize('title-conflict-both-modified', "Conflict: both modified");
			default: return '';
		}
	}

	private static statusToClass(status: git.Status): string {
		switch (status) {
			case git.Status.INDEX_MODIFIED: return 'modified';
			case git.Status.MODIFIED: return 'modified';
			case git.Status.INDEX_ADDED: return 'added';
			case git.Status.INDEX_DELETED: return 'deleted';
			case git.Status.DELETED: return 'deleted';
			case git.Status.INDEX_RENAMED: return 'renamed';
			case git.Status.INDEX_COPIED: return 'copied';
			case git.Status.UNTRACKED: return 'untracked';
			case git.Status.IGNORED: return 'ignored';
			case git.Status.BOTH_DELETED: return 'conflict both-deleted';
			case git.Status.ADDED_BY_US: return 'conflict added-by-us';
			case git.Status.DELETED_BY_THEM: return 'conflict deleted-by-them';
			case git.Status.ADDED_BY_THEM: return 'conflict added-by-them';
			case git.Status.DELETED_BY_US: return 'conflict deleted-by-us';
			case git.Status.BOTH_ADDED: return 'conflict both-added';
			case git.Status.BOTH_MODIFIED: return 'conflict both-modified';
			default: return '';
		}
	}

	private static templateIdToStatusType(templateId: string): git.StatusType {
		if (/index$/.test(templateId)) {
			return git.StatusType.INDEX;
		} else if (/workingTree$/.test(templateId)) {
			return git.StatusType.WORKING_TREE;
		} else {
			return git.StatusType.MERGE;
		}
	}

	private onError(error: any): void {
		this.messageService.show(severity.Error, error);
	}
}

export class Filter implements tree.IFilter {

	public isVisible(tree: tree.ITree, element: any): boolean {
		if (element instanceof gitmodel.StatusGroup) {
			var statusGroup = <git.IStatusGroup>element;

			switch (statusGroup.getType()) {
				case git.StatusType.INDEX:
				case git.StatusType.MERGE:
					return statusGroup.all().length > 0;
				case git.StatusType.WORKING_TREE:
					return true;
			}
		}

		return true;
	}
}

export class Sorter implements tree.ISorter {

	public compare(tree: tree.ITree, element: any, otherElement: any): number {
		if (!(element instanceof gitmodel.FileStatus && otherElement instanceof gitmodel.FileStatus)) {
			return 0;
		}

		return Sorter.compareStatus(element, otherElement);
	}

	private static compareStatus(element: git.IFileStatus, otherElement: git.IFileStatus): number {
		var one = element.getPathComponents();
		var other = otherElement.getPathComponents();
		var lastOne = one.length - 1;
		var lastOther = other.length - 1;

		var endOne: boolean, endOther: boolean, onePart: string, otherPart: string;

		for (var i = 0; ; i++) {
			endOne = lastOne === i;
			endOther = lastOther === i;

			if (endOne && endOther) {
				return comparers.compareFileNames(one[i], other[i]);
			} else if (endOne) {
				return -1;
			} else if (endOther) {
				return 1;
			} else if ((onePart = one[i].toLowerCase()) !== (otherPart = other[i].toLowerCase())) {
				return onePart < otherPart ? -1 : 1;
			}
		}
	}
}

export class DragAndDrop extends ActionContainer implements tree.IDragAndDrop {

	private gitService: git.IGitService;
	private messageService: IMessageService;

	constructor( @IInstantiationService instantiationService: IInstantiationService, @IGitService gitService: IGitService, @IMessageService messageService: IMessageService) {
		super(instantiationService);
		this.gitService = gitService;
		this.messageService = messageService;
	}

	public getDragURI(tree: tree.ITree, element: any): string {
		if (element instanceof gitmodel.StatusGroup) {
			var statusGroup = <git.IStatusGroup>element;
			return 'git:' + statusGroup.getType();
		} else if (element instanceof gitmodel.FileStatus) {
			var status = <git.IFileStatus>element;
			return 'git:' + status.getType() + ':' + status.getPath();
		}

		return null;
	}

	getDragLabel(tree: tree.ITree, elements: any[]): string {
		if (elements.length > 1) {
			return String(elements.length);
		}

		const element = elements[0];

		if (element instanceof gitmodel.StatusGroup) {
			const group = element as gitmodel.StatusGroup;

			switch (group.getType()) {
				case git.StatusType.INDEX: return STAGED_CHANGES;
				case git.StatusType.WORKING_TREE: return CHANGES;
				case git.StatusType.MERGE: return MERGE_CHANGES;
			}
		}

		const status = element as gitmodel.FileStatus;
		return paths.basename(status.getPath());
	}

	public onDragStart(tree: tree.ITree, data: tree.IDragAndDropData, originalEvent: mouse.DragMouseEvent): void {
		// no-op
	}

	public onDragOver(_tree: tree.ITree, data: tree.IDragAndDropData, targetElement: any, originalEvent: mouse.DragMouseEvent): tree.IDragOverReaction {
		if (!this.gitService.isIdle()) {
			return tree.DRAG_OVER_REJECT;
		}

		if (!(data instanceof treednd.ElementsDragAndDropData)) {
			return tree.DRAG_OVER_REJECT;
		}

		var elements: any[] = data.getData();
		var element = elements[0];

		if (element instanceof gitmodel.StatusGroup) {
			var statusGroup = <git.IStatusGroup>element;
			return this.onDrag(targetElement, statusGroup.getType());

		} else if (element instanceof gitmodel.FileStatus) {
			var status = <git.IFileStatus>element;
			return this.onDrag(targetElement, status.getType());

		} else {
			return tree.DRAG_OVER_REJECT;
		}
	}

	private onDrag(targetElement: any, type: git.StatusType): tree.IDragOverReaction {
		if (type === git.StatusType.WORKING_TREE) {
			return this.onDragWorkingTree(targetElement);
		} else if (type === git.StatusType.INDEX) {
			return this.onDragIndex(targetElement);
		} else if (type === git.StatusType.MERGE) {
			return this.onDragMerge(targetElement);
		} else {
			return tree.DRAG_OVER_REJECT;
		}
	}

	private onDragWorkingTree(targetElement: any): tree.IDragOverReaction {
		if (targetElement instanceof gitmodel.StatusGroup) {
			var targetStatusGroup = <git.IStatusGroup>targetElement;
			return targetStatusGroup.getType() === git.StatusType.INDEX ? tree.DRAG_OVER_ACCEPT_BUBBLE_DOWN(false) : tree.DRAG_OVER_REJECT;
		} else if (targetElement instanceof gitmodel.FileStatus) {
			var targetStatus = <git.IFileStatus>targetElement;
			return targetStatus.getType() === git.StatusType.INDEX ? tree.DRAG_OVER_ACCEPT_BUBBLE_UP : tree.DRAG_OVER_REJECT;
		} else {
			return tree.DRAG_OVER_REJECT;
		}
	}

	private onDragIndex(targetElement: any): tree.IDragOverReaction {
		if (targetElement instanceof gitmodel.StatusGroup) {
			var targetStatusGroup = <git.IStatusGroup>targetElement;
			return targetStatusGroup.getType() === git.StatusType.WORKING_TREE ? tree.DRAG_OVER_ACCEPT_BUBBLE_DOWN(false) : tree.DRAG_OVER_REJECT;
		} else if (targetElement instanceof gitmodel.FileStatus) {
			var targetStatus = <git.IFileStatus>targetElement;
			return targetStatus.getType() === git.StatusType.WORKING_TREE ? tree.DRAG_OVER_ACCEPT_BUBBLE_UP : tree.DRAG_OVER_REJECT;
		} else {
			return tree.DRAG_OVER_REJECT;
		}
	}

	private onDragMerge(targetElement: any): tree.IDragOverReaction {
		if (targetElement instanceof gitmodel.StatusGroup) {
			var targetStatusGroup = <git.IStatusGroup>targetElement;
			return targetStatusGroup.getType() === git.StatusType.INDEX ? tree.DRAG_OVER_ACCEPT_BUBBLE_DOWN(false) : tree.DRAG_OVER_REJECT;
		} else if (targetElement instanceof gitmodel.FileStatus) {
			var targetStatus = <git.IFileStatus>targetElement;
			return targetStatus.getType() === git.StatusType.INDEX ? tree.DRAG_OVER_ACCEPT_BUBBLE_UP : tree.DRAG_OVER_REJECT;
		} else {
			return tree.DRAG_OVER_REJECT;
		}
	}

	public drop(tree: tree.ITree, data: tree.IDragAndDropData, targetElement: any, originalEvent: mouse.DragMouseEvent): void {
		var elements: any[] = data.getData();
		var element = elements[0];
		var files: git.IFileStatus[];

		if (element instanceof gitmodel.StatusGroup) {
			files = (<git.IStatusGroup>element).all();
			// } else if (element instanceof gitmodel.FileStatus) {
			// 	files = [ element ];
		} else {
			files = elements;
			// throw new Error('Invalid drag and drop data.');
		}

		var targetGroup = <git.IStatusGroup>targetElement;

		// Add files to index
		if (targetGroup.getType() === git.StatusType.INDEX) {
			this.getAction(gitactions.StageAction).run(files).done(null, (e: Error) => this.onError(e));
		}

		// Remove files from index
		if (targetGroup.getType() === git.StatusType.WORKING_TREE) {
			this.getAction(gitactions.UnstageAction).run(files).done(null, (e: Error) => this.onError(e));
		}
	}

	private onError(error: any): void {
		this.messageService.show(severity.Error, error);
	}
}

export class AccessibilityProvider implements tree.IAccessibilityProvider {

	public getAriaLabel(tree: tree.ITree, element: any): string {
		if (element instanceof gitmodel.FileStatus) {
			const fileStatus = <gitmodel.FileStatus>element;
			const status = fileStatus.getStatus();
			const path = fileStatus.getPath();
			const lastSlashIndex = path.lastIndexOf('/');
			const name = lastSlashIndex === -1 ? path : path.substr(lastSlashIndex + 1, path.length);
			const folder = (lastSlashIndex === -1 ? '' : path.substr(0, lastSlashIndex));

			return nls.localize('fileStatusAriaLabel', "File {0} in folder {1} has status: {2}, Git", name, folder, Renderer.statusToTitle(status));
		}

		if (element instanceof gitmodel.StatusGroup) {
			switch ((<gitmodel.StatusGroup>element).getType()) {
				case git.StatusType.INDEX: return nls.localize('ariaLabelStagedChanges', "Staged Changes, Git");
				case git.StatusType.WORKING_TREE: return nls.localize('ariaLabelChanges', "Changes, Git");
				case git.StatusType.MERGE: return nls.localize('ariaLabelMerge', "Merge, Git");
			}
		}
		return undefined;
	}
}

export class Controller extends treedefaults.DefaultController {

	private contextMenuService: IContextMenuService;
	private actionProvider: actionsrenderer.IActionProvider;

	constructor(actionProvider: actionsrenderer.IActionProvider, @IContextMenuService contextMenuService: IContextMenuService) {
		super({ clickBehavior: treedefaults.ClickBehavior.ON_MOUSE_UP });

		this.actionProvider = actionProvider;
		this.contextMenuService = contextMenuService;

		this.downKeyBindingDispatcher.set(KeyMod.Shift | KeyCode.UpArrow, this.onUp.bind(this));
		this.downKeyBindingDispatcher.set(KeyMod.Shift | KeyCode.DownArrow, this.onDown.bind(this));
		this.downKeyBindingDispatcher.set(KeyMod.Shift | KeyCode.PageUp, this.onPageUp.bind(this));
		this.downKeyBindingDispatcher.set(KeyMod.Shift | KeyCode.PageDown, this.onPageDown.bind(this));
	}

	protected onLeftClick(tree: tree.ITree, element: any, event: mouse.IMouseEvent): boolean {
		// Status group should never get selected nor expanded/collapsed
		if (element instanceof gitmodel.StatusGroup) {
			event.preventDefault();
			event.stopPropagation();

			return true;
		}

		if (event.shiftKey) {
			var focus = tree.getFocus();

			if (!(focus instanceof gitmodel.FileStatus) || !(element instanceof gitmodel.FileStatus)) {
				return undefined;
			}

			var focusStatus = <gitmodel.FileStatus>focus;
			var elementStatus = <gitmodel.FileStatus>element;

			if (focusStatus.getType() !== elementStatus.getType()) {
				return undefined;
			}

			if (this.canSelect(tree, element)) {
				tree.setFocus(element);
				if (tree.isSelected(element)) {
					tree.deselectRange(focusStatus, elementStatus);
				} else {
					tree.selectRange(focusStatus, elementStatus);
				}
			}

			return undefined;
		}

		tree.setFocus(element);

		if (platform.isMacintosh ? event.metaKey : event.ctrlKey) {
			if (this.canSelect(tree, element)) {
				tree.toggleSelection(element, { origin: 'mouse', originalEvent: event });
			}

			return undefined;
		}

		return super.onLeftClick(tree, element, event);
	}

	protected onEnter(tree: tree.ITree, event: keyboard.IKeyboardEvent): boolean {
		var element = tree.getFocus();

		// Status group should never get selected nor expanded/collapsed
		if (element instanceof gitmodel.StatusGroup) {
			event.preventDefault();
			event.stopPropagation();

			return true;
		}

		return super.onEnter(tree, event);
	}

	protected onSpace(tree: tree.ITree, event: keyboard.IKeyboardEvent): boolean {
		var focus = tree.getFocus();

		if (!focus) {
			event.preventDefault();
			event.stopPropagation();
			return true;
		}

		if (!this.canSelect(tree, focus)) {
			return false;
		}

		tree.toggleSelection(focus, { origin: 'keyboard', originalEvent: event });
		event.preventDefault();
		event.stopPropagation();
		return true;
	}

	public onContextMenu(tree: tree.ITree, element: any, event: tree.ContextMenuEvent): boolean {
		if (event.target && event.target.tagName && event.target.tagName.toLowerCase() === 'input') {
			return false;
		}

		event.preventDefault();
		event.stopPropagation();

		tree.setFocus(element);

		if (this.actionProvider.hasSecondaryActions(tree, element)) {
			var anchor = { x: event.posx + 1, y: event.posy };
			var context = {
				selection: tree.getSelection(),
				focus: element
			};

			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => this.actionProvider.getSecondaryActions(tree, element),
				getActionItem: this.actionProvider.getActionItem.bind(this.actionProvider, tree, element),
				getActionsContext: () => context,
				onHide: (wasCancelled?: boolean) => {
					if (wasCancelled) {
						tree.DOMFocus();
					}
				}
			});

			return true;
		}

		return false;
	}

	protected onLeft(tree: tree.ITree, event: keyboard.IKeyboardEvent): boolean {
		return true;
	}

	protected onRight(tree: tree.ITree, event: keyboard.IKeyboardEvent): boolean {
		return true;
	}

	protected onUp(tree: tree.ITree, event: keyboard.IKeyboardEvent): boolean {
		var oldFocus = tree.getFocus();
		var base = super.onUp(tree, event);

		if (!base || !event.shiftKey) {
			return false;
		}

		return this.shiftSelect(tree, oldFocus, event);
	}

	protected onPageUp(tree: tree.ITree, event: keyboard.IKeyboardEvent): boolean {
		var oldFocus = tree.getFocus();
		var base = super.onPageUp(tree, event);

		if (!base || !event.shiftKey) {
			return false;
		}

		return this.shiftSelect(tree, oldFocus, event);
	}

	protected onDown(tree: tree.ITree, event: keyboard.IKeyboardEvent): boolean {
		var oldFocus = tree.getFocus();
		var base = super.onDown(tree, event);

		if (!base || !event.shiftKey) {
			return false;
		}

		return this.shiftSelect(tree, oldFocus, event);
	}

	protected onPageDown(tree: tree.ITree, event: keyboard.IKeyboardEvent): boolean {
		var oldFocus = tree.getFocus();
		var base = super.onPageDown(tree, event);

		if (!base || !event.shiftKey) {
			return false;
		}

		return this.shiftSelect(tree, oldFocus, event);
	}

	private canSelect(tree: tree.ITree, ...elements: any[]): boolean {
		if (elements.some(e => e instanceof gitmodel.StatusGroup || e instanceof gitmodel.StatusModel)) {
			return false;
		}

		return elements.every(e => {
			var first = <gitmodel.FileStatus>tree.getSelection()[0];
			var clicked = <gitmodel.FileStatus>e;
			return !first || (first.getType() === clicked.getType());
		});
	}

	private shiftSelect(tree: tree.ITree, oldFocus: any, event: keyboard.IKeyboardEvent): boolean {
		var payload = { origin: 'keyboard', originalEvent: event };
		var focus = tree.getFocus();

		if (focus === oldFocus) {
			return false;
		}

		var oldFocusIsSelected = tree.isSelected(oldFocus);
		var focusIsSelected = tree.isSelected(focus);

		if (oldFocusIsSelected && focusIsSelected) {
			tree.deselectRange(focus, oldFocus, payload);
		} else if (!oldFocusIsSelected && !focusIsSelected) {
			if (this.canSelect(tree, oldFocus, focus)) {
				tree.selectRange(focus, oldFocus, payload);
			}
		} else if (oldFocusIsSelected) {
			if (this.canSelect(tree, focus)) {
				tree.selectRange(focus, oldFocus, payload);
			}
		} else {
			tree.deselectRange(focus, oldFocus, payload);
		}

		return true;
	}
}
