/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { TreeView, TreeViewPane } from 'vs/workbench/browser/parts/views/treeView';
import { Extensions, ITreeItem, ITreeViewDataProvider, ITreeViewDescriptor, IViewsRegistry, TreeItemCollapsibleState, ViewContainer } from 'vs/workbench/common/views';
import { IEditSessionsWorkbenchService } from 'vs/workbench/contrib/editSessions/common/editSessions';
import { URI } from 'vs/base/common/uri';
import { fromNow } from 'vs/base/common/date';
import { Codicon } from 'vs/base/common/codicons';
import { API_OPEN_DIFF_EDITOR_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';

export class EditSessionsDataViews extends Disposable {
	constructor(
		container: ViewContainer,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.registerViews(container);
	}

	private registerViews(container: ViewContainer): void {
		const id = 'workbench.views.editSessions.data';
		const name = localize('edit sessions data', 'All Sessions');
		const treeView = this.instantiationService.createInstance(TreeView, id, name);
		treeView.showCollapseAllAction = true;
		treeView.showRefreshAction = true;
		const disposable = treeView.onDidChangeVisibility(visible => {
			if (visible && !treeView.dataProvider) {
				disposable.dispose();
				treeView.dataProvider = this.instantiationService.createInstance(EditSessionDataViewDataProvider);
			}
		});
		Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).registerViews([<ITreeViewDescriptor>{
			id,
			name,
			ctorDescriptor: new SyncDescriptor(TreeViewPane),
			canToggleVisibility: true,
			canMoveView: false,
			treeView,
			collapsed: false,
			order: 100,
			hideByDefault: true,
		}], container);
	}
}

class EditSessionDataViewDataProvider implements ITreeViewDataProvider {
	constructor(
		@IEditSessionsWorkbenchService private readonly editSessionsWorkbenchService: IEditSessionsWorkbenchService
	) { }

	async getChildren(element?: ITreeItem): Promise<ITreeItem[]> {
		if (!element) {
			return this.getAllEditSessions();
		}

		const [ref, folderName, filePath] = URI.parse(element.handle).path.substring(1).split('/');

		if (ref && !folderName) {
			return this.getEditSession(ref);
		} else if (ref && folderName && !filePath) {
			return this.getEditSessionFolderContents(ref, folderName);
		}

		return [];
	}

	private async getAllEditSessions(): Promise<ITreeItem[]> {
		const allEditSessions = await this.editSessionsWorkbenchService.list();
		return allEditSessions.map((session) => {
			const resource = URI.from({ scheme: 'vscode-edit-sessions', authority: 'remote-session-content', path: `/${session.ref}` });
			return {
				handle: resource.toString(),
				collapsibleState: TreeItemCollapsibleState.Collapsed,
				label: { label: session.ref },
				description: fromNow(session.created, true),
				themeIcon: Codicon.repo
			};
		});
	}

	private async getEditSession(ref: string): Promise<ITreeItem[]> {
		const data = await this.editSessionsWorkbenchService.read(ref);

		if (!data) {
			return [];
		}

		return data.editSession.folders.map((folder) => {
			const resource = URI.from({ scheme: 'vscode-edit-sessions', authority: 'remote-session-content', path: `/${data.ref}/${folder.name}` });
			return {
				handle: resource.toString(),
				collapsibleState: TreeItemCollapsibleState.Collapsed,
				label: { label: folder.name },
				themeIcon: Codicon.folder
			};
		});
	}

	private async getEditSessionFolderContents(ref: string, folderName: string): Promise<ITreeItem[]> {
		const data = await this.editSessionsWorkbenchService.read(ref);

		if (!data) {
			return [];
		}

		return (data.editSession.folders.find((folder) => folder.name === folderName)?.workingChanges ?? []).map((change) => {
			const resource = URI.from({ scheme: 'vscode-edit-sessions', authority: 'remote-session-content', path: `/${data.ref}/${folderName}/${change.relativeFilePath}` });
			return {
				handle: resource.toString(),
				resourceUri: resource,
				collapsibleState: TreeItemCollapsibleState.None,
				label: { label: change.relativeFilePath },
				themeIcon: Codicon.file,
				command: {
					id: API_OPEN_DIFF_EDITOR_COMMAND_ID,
					title: localize('open file', 'Open File'),
					arguments: [resource, undefined, undefined]
				}
			};
		});
	}
}
