/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as dom from 'vs/base/browser/dom';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { Action, IAction, RadioGroup } from 'vs/base/common/actions';
import { defaultGenerator } from 'vs/base/common/idGenerator';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import 'vs/css!./outlinePanel';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { CursorChangeReason } from 'vs/editor/common/controller/cursorEvents';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
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
import { IKeyboardEvent } from '../../../../base/browser/keyboardEvent';
import { KeyCode } from '../../../../base/common/keyCodes';
import { LRUCache } from '../../../../base/common/map';
import { escape } from '../../../../base/common/strings';
import LanguageFeatureRegistry from '../../../../editor/common/modes/languageFeatureRegistry';
import { OutlineItem, OutlineItemGroup, OutlineModel, getOutline } from './outlineModel';
import { OutlineController, OutlineDataSource, OutlineItemComparator, OutlineItemCompareType, OutlineItemFilter, OutlineRenderer, OutlineTreeState } from './outlineTree';

class RequestOracle {

	private _disposables = new Array<IDisposable>();
	private _sessionDisposable: IDisposable;

	constructor(
		private readonly _callback: (editor: ICodeEditor) => any,
		featureRegistry: LanguageFeatureRegistry<any>,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private readonly _workbenchEditorService: IWorkbenchEditorService,
	) {
		editorGroupService.onEditorsChanged(this._update, this, this._disposables);
		featureRegistry.onDidChange(this._update, this, this._disposables);
		this._update();
	}

	dispose(): void {
		dispose(this._disposables);
		dispose(this._sessionDisposable);
	}

	private _update(): void {
		dispose(this._sessionDisposable);

		let editor = this._workbenchEditorService.getActiveEditor();
		let control = editor && editor.getControl();
		let codeEditor: ICodeEditor = undefined;
		if (isCodeEditor(control)) {
			codeEditor = control;
		} else if (isDiffEditor(control)) {
			codeEditor = control.getModifiedEditor();
		}

		this._callback(codeEditor);

		if (codeEditor) {
			let handle: number;
			let listener = codeEditor.onDidChangeModelContent(_ => {
				handle = setTimeout(() => this._callback, 50);
			});
			this._sessionDisposable = {
				dispose() {
					listener.dispose();
					clearTimeout(handle);
				}
			};
		}
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

	private _disposables = new Array<IDisposable>();

	private _editorDisposables = new Array<IDisposable>();
	private _requestOracle: RequestOracle;
	private _domNode: HTMLElement;
	private _message: HTMLDivElement;
	private _input: InputBox;
	private _tree: Tree;
	private _treeFilter: OutlineItemFilter;
	private _treeComparator: OutlineItemComparator;
	private _treeStates = new LRUCache<string, OutlineTreeState>(10);

	// todo@joh have memento object
	private _followCursor = false;

	constructor(
		options: IViewOptions,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IThemeService private readonly _themeService: IThemeService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(options, keybindingService, contextMenuService, configurationService);
	}

	dispose(): void {
		dispose(this._disposables);
		dispose(this._requestOracle);
		super.dispose();
	}

	protected renderBody(container: HTMLElement): void {
		this._domNode = container;
		dom.addClass(container, 'outline-panel');

		this._message = dom.$('.outline-message');
		let inputContainer = dom.$('.outline-input');
		let treeContainer = dom.$('.outline-tree');
		dom.append(container, this._message, inputContainer, treeContainer);

		this._input = new InputBox(inputContainer, null, { placeholder: localize('filter', "Filter") });
		this._input.disable();

		this.disposables.push(attachInputBoxStyler(this._input, this._themeService));
		this.disposables.push(dom.addStandardDisposableListener(this._input.inputElement, 'keyup', event => {
			// todo@joh make those keybindings configurable?
			if (event.keyCode === KeyCode.DownArrow) {
				this._tree.domFocus();
			} else if (event.keyCode === KeyCode.Escape) {
				this._input.value = '';
				this._tree.domFocus();
			}
		}));

		const $this = this;
		const controller = new class extends OutlineController {
			onKeyDown(tree: ITree, event: IKeyboardEvent) {
				let handled = super.onKeyDown(tree, event);
				if (!handled && event.keyCode >= KeyCode.KEY_0 && event.keyCode <= KeyCode.KEY_Z) {
					// crazy -> during keydown focus moves to the input box
					// and because of that the keyup event is handled by the
					// input field
					$this._input.focus();
				}
				return handled;
			}
		};
		const dataSource = new OutlineDataSource();
		const renderer = new OutlineRenderer();
		this._treeComparator = new OutlineItemComparator();
		this._treeFilter = new OutlineItemFilter();
		this._tree = this._instantiationService.createInstance(WorkbenchTree, treeContainer, { controller, dataSource, renderer, sorter: this._treeComparator, filter: this._treeFilter }, {});

		this._disposables.push(this._tree, this._input);
	}

	protected layoutBody(height: number): void {
		this._tree.layout(height - this._input.height);
	}

	setVisible(visible: boolean): TPromise<void> {
		if (visible) {
			this._requestOracle = this._requestOracle || this._instantiationService.createInstance(RequestOracle, editor => this._onEditor(editor), DocumentSymbolProviderRegistry);
		} else {
			dispose(this._requestOracle);
			this._requestOracle = undefined;
			this._onEditor(undefined);
		}
		return super.setVisible(visible);
	}

	getSecondaryActions(): IAction[] {
		let group = new RadioGroup([
			new SimpleToggleAction(localize('sortByPosition', "Sort By: Position"), true, _ => this._onSortTypeChanged(OutlineItemCompareType.ByPosition)),
			new SimpleToggleAction(localize('sortByName', "Sort By: Name"), false, _ => this._onSortTypeChanged(OutlineItemCompareType.ByName)),
			new SimpleToggleAction(localize('sortByKind', "Sort By: Type"), false, _ => this._onSortTypeChanged(OutlineItemCompareType.ByKind)),
		]);
		let result = [
			new SimpleToggleAction(localize('live', "Follow Cursor"), false, action => this._followCursor = action.checked),
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

	private _showMessage(message: string) {
		dom.addClass(this._domNode, 'message');
		this._message.innerText = escape(message);
	}

	private async _onEditor(editor: ICodeEditor): TPromise<void> {
		dispose(this._editorDisposables);

		this._editorDisposables = new Array();
		this._input.disable();

		if (!editor || !DocumentSymbolProviderRegistry.has(editor.getModel())) {
			return this._showMessage(localize('no-editor', "There are no editors open that can provide outline information."));
		}

		dom.removeClass(this._domNode, 'message');
		let buffer = editor.getModel();
		let oldModel = <OutlineModel>this._tree.getInput();
		let model = new OutlineModel(buffer, getOutline(buffer));

		if (oldModel && oldModel.merge(model)) {
			model = oldModel;
			this._tree.refresh(undefined, true);

		} else {
			// persist state
			if (oldModel) {
				let state = OutlineTreeState.capture(this._tree);
				this._treeStates.set(oldModel.buffer.uri.toString(), state);
			}
			await this._tree.setInput(model);
			let state = this._treeStates.get(model.buffer.uri.toString());
			OutlineTreeState.restore(this._tree, state);
		}

		// wait for the actual model to work with...
		let group = await model.selected();

		this._input.enable();

		// feature: filter on type
		// on type -> update filters
		// on first type -> capture tree state
		// on erase -> restore captured tree state
		let beforePatternState: OutlineTreeState;
		this._editorDisposables.push(this._input.onDidChange(async pattern => {
			if (!beforePatternState) {
				beforePatternState = OutlineTreeState.capture(this._tree);
			}
			let item = group.updateMatches(pattern);
			await this._tree.refresh(undefined, true);
			if (item) {
				await this._tree.reveal(item);
				this._tree.setFocus(item, this);
				this._tree.setSelection([item], this);
				this._tree.expandAll(undefined /*all*/);
			}

			if (!pattern && beforePatternState) {
				await OutlineTreeState.restore(this._tree, beforePatternState);
				beforePatternState = undefined;
			}
		}));

		// feature: reveal outline selection in editor
		// on change -> reveal/select defining range
		this._editorDisposables.push(this._tree.onDidChangeSelection(e => {
			if (e.payload === this) {
				return;
			}
			let [first] = e.selection;
			let keyboard = e.payload && e.payload.origin === 'keyboard';
			if (first instanceof OutlineItem) {
				let { range } = first.symbol.location;
				editor.revealRangeInCenterIfOutsideViewport(range, ScrollType.Smooth);
				editor.setSelection(Range.collapseToStart(range));
				if (keyboard) {
					editor.focus();
				}
			}
		}));

		// feature: reveal editor selection in outline
		this._editorDisposables.push(editor.onDidChangeCursorSelection(e => e.reason === CursorChangeReason.Explicit && this._revealEditorSelection(group, e.selection)));
		this._revealEditorSelection(group, editor.getSelection());
	}

	private async _revealEditorSelection(group: OutlineItemGroup, selection: Selection): TPromise<void> {
		if (!this._followCursor) {
			return;
		}
		let item = group.getItemEnclosingPosition({
			lineNumber: selection.selectionStartLineNumber,
			column: selection.selectionStartColumn
		});
		if (item) {
			await this._tree.reveal(item, .5);
			this._tree.setFocus(item, this);
			this._tree.setSelection([item], this);
		} else {
			this._tree.setSelection([], this);
		}
	}
}
