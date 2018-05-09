/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as dom from 'vs/base/browser/dom';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { Action, IAction, RadioGroup } from 'vs/base/common/actions';
import { Emitter, Event } from 'vs/base/common/event';
import { defaultGenerator } from 'vs/base/common/idGenerator';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import 'vs/css!./outlinePanel';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { CursorChangeReason } from 'vs/editor/common/controller/cursorEvents';
import { Range } from 'vs/editor/common/core/range';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { DocumentSymbolProviderRegistry } from 'vs/editor/common/modes';
import { localize } from 'vs/nls';
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
import { OutlineItem, OutlineItemGroup, getOutline } from './outlineModel';
import { OutlineDataSource, OutlineItemComparator, OutlineItemCompareType, OutlineItemFilter, OutlineRenderer } from './outlineTree';
import { KeyCode } from '../../../../base/common/keyCodes';

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

class SimpleToggleAction extends Action {

	constructor(label: string, checked: boolean, callback: (action: SimpleToggleAction) => any) {
		super(`simple` + defaultGenerator.nextId(), label, undefined, true, _ => {
			this.checked = !this.checked;
			callback(this);
			return undefined;
		});
		this.checked = checked;
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
	private _followCursor: boolean = true;

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
		this.disposables.push(dom.addStandardDisposableListener(this._input.inputElement, 'keyup', event => {
			if (event.keyCode === KeyCode.DownArrow) {
				this._tree.domFocus();
			}
		}));

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
			new SimpleToggleAction(localize('sortByPosition', "Sort By: Position"), true, _ => this._onSortTypeChanged(OutlineItemCompareType.ByPosition)),
			new SimpleToggleAction(localize('sortByName', "Sort By: Name"), false, _ => this._onSortTypeChanged(OutlineItemCompareType.ByName)),
			new SimpleToggleAction(localize('sortByKind', "Sort By: Type"), false, _ => this._onSortTypeChanged(OutlineItemCompareType.ByKind)),
		]);
		let result = [
			new SimpleToggleAction(localize('live', "Follow Cursor"), true, action => this._followCursor = action.checked),
			new Separator(),
			...group.actions,
		];

		this.disposables.push(...result);
		this.disposables.push(group);
		return result;
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
			let model = <OutlineItemGroup>this._tree.getInput();
			let [first] = outline;
			if (!first) {
				return; // todo@joh
			}

			if (model instanceof OutlineItemGroup && first.source === model.source) {
				model.children.splice(0, model.children.length, ...first.children);
				this._tree.refresh(undefined, true);
			} else {
				this._tree.setInput(first);
			}

			this._editorDisposables.push(editor.onDidChangeCursorSelection(e => {
				if (!this._followCursor || e.reason !== CursorChangeReason.Explicit) {
					return;
				}
				let item = model.getItemEnclosingPosition({
					lineNumber: e.selection.selectionStartLineNumber,
					column: e.selection.selectionStartColumn
				});
				if (item) {
					this._tree.reveal(item);
					this._tree.setSelection([item], this);
				} else {
					this._tree.setSelection([], this);
				}
			}));

			this._input.enable();

			this._editorDisposables.push(this._input.onDidChange(query => {
				//todo@joh `updateFilter` should return the best match and it should be focused already
				model.updateFilter(query);
				this._tree.refresh(undefined, true);
			}));

			this._editorDisposables.push(this._tree.onDidChangeSelection(e => {
				if (e.payload === this) {
					return;
				}
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
