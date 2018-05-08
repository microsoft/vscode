/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { DocumentSymbolProviderRegistry } from 'vs/editor/common/modes';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WorkbenchTree } from 'vs/platform/list/browser/listService';
import { IViewOptions, ViewsViewletPanel } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { Emitter, Event } from 'vs/base/common/event';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { getOutline, OneOutline } from './outlineModel';
import { OutlineDataSource, OutlineRenderer, OutlineSorter } from './outlineTree';

class OutlineRequestLogic {

	private readonly _disposables = new Array<IDisposable>();
	private readonly _onDidChangeActiveEditor = new Emitter<ICodeEditor>();

	private _editorListener: IDisposable;

	readonly onDidChangeActiveEditor: Event<ICodeEditor> = this._onDidChangeActiveEditor.event;

	constructor(
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private readonly _workbenchEditorService: IWorkbenchEditorService,
	) {
		editorGroupService.onEditorsChanged(this._update, this, this._disposables);
		DocumentSymbolProviderRegistry.onDidChange(this._update, this, this._disposables);
	}

	dispose(): void {
		dispose(this._disposables);
	}

	private _update(): void {
		dispose(this._editorListener);
		let editor = this._workbenchEditorService.getActiveEditor();
		let control = editor && editor.getControl();
		let codeEditor: ICodeEditor = undefined;
		if (isCodeEditor(control)) {
			codeEditor = control;
		} else if (isDiffEditor(control)) {
			codeEditor = control.getModifiedEditor();
		}
		this._editorListener = codeEditor && codeEditor.onDidChangeModelContent(e => this._onDidChangeActiveEditor.fire(codeEditor));
		this._onDidChangeActiveEditor.fire(codeEditor);
	}
}

export class OutlinePanel extends ViewsViewletPanel {

	private readonly _disposables = new Array<IDisposable>();
	private readonly _activeEditorOracle: OutlineRequestLogic;

	private _tree: Tree;

	constructor(
		options: IViewOptions,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(options, keybindingService, contextMenuService, configurationService);

		this._activeEditorOracle = _instantiationService.createInstance(OutlineRequestLogic);
		this._disposables.push(this._activeEditorOracle.onDidChangeActiveEditor(editor => {
			if (editor) {
				getOutline(editor.getModel()).then(outline => {
					let model = <OneOutline>this._tree.getInput();
					let [first] = outline;
					if (first) {
						if (model instanceof OneOutline && first.source === model.source) {
							model.items.splice(0, model.items.length, ...first.items);
							this._tree.refresh(undefined, true);
						} else {
							this._tree.setInput(first);
						}
					}
				}, err => {
					console.error(err);
				});
			}
		}));
		this._disposables.push(this._activeEditorOracle);
	}

	dispose(): void {
		dispose(this._disposables);
		super.dispose();
	}

	protected renderBody(container: HTMLElement): void {
		const dataSource = new OutlineDataSource();
		const renderer = new OutlineRenderer();
		const sorter = new OutlineSorter();

		this._tree = this._instantiationService.createInstance(
			WorkbenchTree,
			container,
			{ dataSource, renderer, sorter },
			{}
		);
		this._disposables.push(this._tree);
	}

	protected layoutBody(height: number): void {
		this._tree.layout(height);
	}

	setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible);
	}
}
