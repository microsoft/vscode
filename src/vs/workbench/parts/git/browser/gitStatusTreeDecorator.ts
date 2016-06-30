/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
import tree = require('vs/base/parts/tree/browser/tree');
import {IGitService, IFileStatus, Status, ModelEvents} from 'vs/workbench/parts/git/common/git';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import lifecycle = require('vs/base/common/lifecycle');
import URI from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import {FileStat} from 'vs/workbench/parts/files/common/explorerViewModel';
import {OpenEditor} from 'vs/workbench/parts/files/browser/views/openEditorsViewer';
import DOM = require('vs/base/browser/dom');

export class GitStatusTreeDecorator implements tree.IDecorator {
	protected toDispose: lifecycle.IDisposable[] = [];
	constructor(
		@IGitService private gitService: IGitService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService) {

	}

	public onActivate(tree: tree.ITree): void {
		this.toDispose.push(this.gitService.getModel().addListener2(ModelEvents.MODEL_UPDATED, () => tree.refresh(tree.getInput())));
	}

	public decorate(tree: tree.ITree, element: any, templateId: string, row: tree.IRow): void {

		if (element instanceof OpenEditor) {
			let fileStatus = this.getStatus(element.getResource());
			let className = this.fileStatusToClassName(fileStatus);
			let child = row.element.querySelector('.open-editor .name');
			if (child instanceof HTMLElement) {
				this.cleanGitClassName(child);
				DOM.addClass(child, className);
			}
		}
		if (element instanceof FileStat){
			let fileStatus = this.getStatus((<FileStat>element).resource);
			let className = this.fileStatusToClassName(fileStatus);
			let child = row.element.querySelector('.explorer-item-label');
			if (child instanceof HTMLElement) {
				this.cleanGitClassName(child);
				DOM.addClass(child, className);
			}
		}
	}

	private getStatus(uri: URI) {

		const workspaceRoot = this.contextService.getWorkspace().resource.fsPath;
		if (!workspaceRoot || !paths.isEqualOrParent(uri.fsPath, workspaceRoot)) {
			return null; // out of workspace not yet supported
		}

		const model = this.gitService.getModel();
		const repositoryRoot = model.getRepositoryRoot();
		const statusModel = model.getStatus();

		if (!repositoryRoot || !paths.isEqualOrParent(uri.fsPath, repositoryRoot)) {
			return null; // out of repository not supported
		}

		const repositoryRelativePath = paths.normalize(paths.relative(repositoryRoot, uri.fsPath));
		return statusModel.getWorkingTreeStatus().find(repositoryRelativePath) ||
			statusModel.getIndexStatus().find(repositoryRelativePath);
	}

	private cleanGitClassName(element: HTMLElement) {
		DOM.removeClass(element, 'index-modified');
		DOM.removeClass(element, 'index-added');
		DOM.removeClass(element, 'index-deleted');
		DOM.removeClass(element, 'index-renamed');
		DOM.removeClass(element, 'index-copied');
		DOM.removeClass(element, 'modified');
		DOM.removeClass(element, 'deleted');
		DOM.removeClass(element, 'untracked');
		DOM.removeClass(element, 'ignored');
		DOM.removeClass(element, 'added-by-us');
		DOM.removeClass(element, 'added-by-them');
		DOM.removeClass(element, 'deleted-by-us');
		DOM.removeClass(element, 'deleted-by-them');
		DOM.removeClass(element, 'both-added');
		DOM.removeClass(element, 'both-deleted');
		DOM.removeClass(element, 'both-modified');
	}

	private fileStatusToClassName(stat: IFileStatus): string {
		let result = '';
		if (stat === null || stat === undefined) {
			return result;
		}
		let status: Status = stat.getStatus();
		switch (status) {
			case Status.INDEX_MODIFIED: result = 'index-modified'; break;
			case Status.INDEX_ADDED: result = 'index-added'; break;
			case Status.INDEX_DELETED: result = 'index-deleted'; break;
			case Status.INDEX_RENAMED: result = 'index-renamed'; break;
			case Status.INDEX_COPIED: result = 'index-copied'; break;
			case Status.MODIFIED: result = 'modified'; break;
			case Status.DELETED: result = 'deleted'; break;
			case Status.UNTRACKED: result = 'untracked'; break;
			case Status.IGNORED: result = 'ignored'; break;
			case Status.ADDED_BY_US: result = 'added-by-us'; break;
			case Status.ADDED_BY_THEM: result = 'added-by-them'; break;
			case Status.DELETED_BY_US: result = 'deleted-by-us'; break;
			case Status.DELETED_BY_THEM: result = 'deleted-by-them'; break;
			case Status.BOTH_ADDED: result = 'both-added'; break;
			case Status.BOTH_DELETED: result = 'both-deleted'; break;
			case Status.BOTH_MODIFIED: result = 'both-modified'; break;
		}

		return result;
	}

	public dispose(): void {
		this.toDispose.forEach(item => item.dispose());
	}


	public getId() {
		return 'workbench.tree.git.decorator';
	}

}