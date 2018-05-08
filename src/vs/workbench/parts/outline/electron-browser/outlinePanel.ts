/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./outlinePanel';
import * as dom from 'vs/base/browser/dom';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { DocumentSymbolProviderRegistry } from 'vs/editor/common/modes';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WorkbenchTree } from 'vs/platform/list/browser/listService';
import { attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewOptions, ViewsViewletPanel } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { OneOutline, OutlineItem, getOutline } from './outlineModel';
import { OutlineDataSource, OutlineRenderer, OutlineItemComparator, OutlineItemFilter, OutlineItemCompareType } from './outlineTree';
import { localize } from '../../../../nls';
import { IAction, Action, RadioGroup } from 'vs/base/common/actions';

class ActiveEditorOracle {

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

class ChangeSortAction extends Action {

	private static _labels = {
		[OutlineItemCompareType.ByPosition]: localize('sortByPosition', "Sort By: Position"),
		[OutlineItemCompareType.ByName]: localize('sortByName', "Sort By: Name"),
		[OutlineItemCompareType.ByKind]: localize('sortByKind', "Sort By: Type"),
	};

	constructor(type: OutlineItemCompareType, callback: (type: OutlineItemCompareType) => any) {
		super(String(type), ChangeSortAction._labels[type], null, true, () => {
			this.checked = true;
			callback(type);
			return undefined;
		});
	}
}

export class OutlinePanel extends ViewsViewletPanel {

	private readonly _disposables = new Array<IDisposable>();
	private readonly _activeEditorOracle: ActiveEditorOracle;

	private _editorDisposables = new Array<IDisposable>();

	private _input: InputBox;
	private _tree: Tree;
	private _treeFilter: OutlineItemFilter;
	private _treeComparator: OutlineItemComparator;

	constructor(
		options: IViewOptions,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IThemeService private readonly _themeService: IThemeService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(options, keybindingService, contextMenuService, configurationService);

		this._activeEditorOracle = _instantiationService.createInstance(ActiveEditorOracle);
		this._disposables.push(this._activeEditorOracle.onDidChangeActiveEditor(this._onEditor, this));
		this._disposables.push(this._activeEditorOracle);
	}

	dispose(): void {
		dispose(this._disposables);
		super.dispose();
	}

	protected renderBody(container: HTMLElement): void {

		dom.addClass(container, 'outline-panel');

		let inputContainer = dom.$('.outline-input');
		let treeContainer = dom.$('.outline-tree');
		dom.append(container, inputContainer, treeContainer);

		this._input = new InputBox(inputContainer, null, { placeholder: localize('filter', "Filter") });
		this._input.disable();
		this.disposables.push(attachInputBoxStyler(this._input, this._themeService));

		const dataSource = new OutlineDataSource();
		const renderer = new OutlineRenderer();
		this._treeComparator = new OutlineItemComparator();
		this._treeFilter = new OutlineItemFilter();
		this._tree = this._instantiationService.createInstance(WorkbenchTree, treeContainer, { dataSource, renderer, sorter: this._treeComparator, filter: this._treeFilter }, {});

		this._disposables.push(this._tree, this._input);
	}

	protected layoutBody(height: number): void {
		this._tree.layout(height - 36);
	}

	setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible);
	}

	getSecondaryActions(): IAction[] {
		let group = new RadioGroup([
			new ChangeSortAction(OutlineItemCompareType.ByPosition, type => this._onSortTypeChanged(type)),
			new ChangeSortAction(OutlineItemCompareType.ByName, type => this._onSortTypeChanged(type)),
			new ChangeSortAction(OutlineItemCompareType.ByKind, type => this._onSortTypeChanged(type)),
		]);
		group.actions[0].checked = true; // todo@joh persist/restore setting
		return group.actions;
	}

	private _onSortTypeChanged(type: OutlineItemCompareType) {
		if (this._treeComparator.type !== type) {
			this._treeComparator.type = type;
			this._tree.refresh(undefined, true);
		}
	}

	private _onEditor(editor: ICodeEditor): void {
		dispose(this._editorDisposables);
		this._editorDisposables = new Array();

		if (!editor) {
			//
			return;
		}

		// todo@joh show pending...
		const promise = getOutline(editor.getModel()).then(outline => {
			let model = <OneOutline>this._tree.getInput();
			let [first] = outline;
			if (!first) {
				return; // todo@joh
			}

			if (model instanceof OneOutline && first.source === model.source) {
				model.children.splice(0, model.children.length, ...first.children);
				this._tree.refresh(undefined, true);
			} else {
				this._tree.setInput(first);
			}

			this._input.enable();

			this._editorDisposables.push(this._input.onDidChange(query => {
				//todo@joh `updateFilter` should return the best match and it should be focused already
				model.updateFilter(query);
				this._tree.refresh(undefined, true);
			}));

			this._editorDisposables.push(this._tree.onDidChangeSelection(e => {
				let [first] = e.selection;
				if (first instanceof OutlineItem) {
					let { range } = first.symbol.location;
					editor.revealRangeInCenterIfOutsideViewport(range, ScrollType.Smooth);
					editor.setSelection(Range.collapseToStart(range));
					// editor.focus();
				}
			}));

		}, err => {
			//todo@joh have an error screen
			console.error(err);
		});

		this._editorDisposables.push({
			dispose() {
				promise.cancel();
			}
		});
	}
}
