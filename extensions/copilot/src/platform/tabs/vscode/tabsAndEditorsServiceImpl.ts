/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Emitter } from '../../../util/vs/base/common/event';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { ResourceMap } from '../../../util/vs/base/common/map';
import { ITabsAndEditorsService, TabChangeEvent, TabInfo } from '../common/tabsAndEditorsService';

export class TabsAndEditorsServiceImpl implements ITabsAndEditorsService {

	declare _serviceBrand: undefined;

	private readonly _store = new DisposableStore();

	private readonly _tabGroupsUseInfo = new Map<vscode.TabGroup, number>();
	private _tabClock: number = 0;

	readonly onDidChangeActiveTextEditor: vscode.Event<vscode.TextEditor | undefined> = vscode.window.onDidChangeActiveTextEditor;
	private readonly _onDidChangeTabs = this._store.add(new Emitter<TabChangeEvent>());
	readonly onDidChangeTabs = this._onDidChangeTabs.event;

	constructor() {
		// Set the activeTabGroup as the most recently used
		const updateActiveTabGroup = () => this._tabGroupsUseInfo.set(vscode.window.tabGroups.activeTabGroup, this._tabClock++);

		updateActiveTabGroup();
		this._store.add(vscode.window.tabGroups.onDidChangeTabGroups(e => {
			// remove all tab groups!
			e.closed.forEach(item => this._tabGroupsUseInfo.delete(item));

			updateActiveTabGroup();
		}));

		this._store.add(vscode.window.tabGroups.onDidChangeTabs(e => {
			this._onDidChangeTabs.fire({
				changed: e.changed.map(t => this._asTabInfo(t)),
				closed: e.closed.map(t => this._asTabInfo(t)),
				opened: e.opened.map(t => this._asTabInfo(t))
			});
		}));
	}

	dispose(): void {
		this._store.dispose();
	}

	/**
	 * Returns the active text editor in the VS Code window.
	 *
	 * Uses vscode.window.activTextEditor but _ignores_ output editors. When no text editor is active,
	 * the most recent tab group that shows a text editor is used.
	 */
	get activeTextEditor(): vscode.TextEditor | undefined {

		const candidate = vscode.window.activeTextEditor;
		if (candidate && candidate.document.uri.scheme !== 'output') {
			return candidate;
		}

		const allEditors = new ResourceMap<vscode.TextEditor>();
		vscode.window.visibleTextEditors.forEach(e => allEditors.set(e.document.uri, e));

		const groups = [...this._tabGroupsUseInfo];
		groups.sort((a, b) => b[1] - a[1]);
		for (const [group] of groups) {
			if (group.activeTab) {
				const info = this._asTabInfo(group.activeTab);
				if (info.uri && allEditors.has(info.uri)) {
					const candidate = allEditors.get(info.uri);
					return candidate;
				}
			}
		}

		return undefined;
	}

	get visibleTextEditors(): readonly vscode.TextEditor[] {
		return vscode.window.visibleTextEditors;
	}

	get activeNotebookEditor(): vscode.NotebookEditor | undefined {
		return vscode.window.activeNotebookEditor;
	}

	get visibleNotebookEditors(): readonly vscode.NotebookEditor[] {
		return vscode.window.visibleNotebookEditors;
	}

	get tabs(): TabInfo[] {
		return vscode.window.tabGroups.all.flatMap(g => g.tabs).map(this._asTabInfo, this);
	}

	private _asTabInfo(tab: vscode.Tab): TabInfo {
		let uri: vscode.Uri | undefined;
		if (tab.input instanceof vscode.TabInputText || tab.input instanceof vscode.TabInputNotebook) {
			uri = tab.input.uri;
		} else if (tab.input instanceof vscode.TabInputTextDiff || tab.input instanceof vscode.TabInputNotebookDiff) {
			uri = tab.input.modified;
		}
		return {
			tab,
			uri
		};
	}
}
