/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { posix } from 'path';
import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { Action, IAction, RadioGroup } from 'vs/base/common/actions';
import { firstIndex } from 'vs/base/common/arrays';
import { createCancelablePromise, TimeoutTimer } from 'vs/base/common/async';
import { isPromiseCanceledError, onUnexpectedError } from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { defaultGenerator } from 'vs/base/common/idGenerator';
import { KeyCode } from 'vs/base/common/keyCodes';
import { dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { LRUCache } from 'vs/base/common/map';
import { escape } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import 'vs/css!./outlinePanel';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ITextModel } from 'vs/editor/common/model';
import { IModelContentChangedEvent } from 'vs/editor/common/model/textModelEvents';
import { DocumentSymbolProviderRegistry } from 'vs/editor/common/modes';
import { LanguageFeatureRegistry } from 'vs/editor/common/modes/languageFeatureRegistry';
import { OutlineElement, OutlineModel, TreeElement } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { WorkbenchTree } from 'vs/platform/list/browser/listService';
import { IMarkerService, MarkerSeverity } from 'vs/platform/markers/common/markers';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { attachInputBoxStyler, attachProgressBarStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ViewletPanel } from 'vs/workbench/browser/parts/views/panelViewlet';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { CollapseAction } from 'vs/workbench/browser/viewlet';
import { IViewsService } from 'vs/workbench/common/views';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { OutlineController, OutlineDataSource, OutlineItemComparator, OutlineItemCompareType, OutlineItemFilter, OutlineRenderer, OutlineTreeState } from 'vs/editor/contrib/documentSymbols/outlineTree';
import { OutlineConfigKeys, OutlineViewFiltered, OutlineViewFocused, OutlineViewId } from './outline';

class RequestState {

	constructor(
		private _editorId: string,
		private _modelId: string,
		private _modelVersion: number,
		private _providerCount: number
	) {
		//
	}

	equals(other: RequestState): boolean {
		return other
			&& this._editorId === other._editorId
			&& this._modelId === other._modelId
			&& this._modelVersion === other._modelVersion
			&& this._providerCount === other._providerCount;
	}
}

class RequestOracle {

	private _disposables = new Array<IDisposable>();
	private _sessionDisposable: IDisposable;
	private _lastState: RequestState;

	constructor(
		private readonly _callback: (editor: ICodeEditor, change: IModelContentChangedEvent) => any,
		private readonly _featureRegistry: LanguageFeatureRegistry<any>,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		_editorService.onDidActiveEditorChange(this._update, this, this._disposables);
		_featureRegistry.onDidChange(this._update, this, this._disposables);
		this._update();
	}

	dispose(): void {
		dispose(this._disposables);
		dispose(this._sessionDisposable);
	}

	private _update(): void {

		let widget = this._editorService.activeTextEditorWidget;
		let codeEditor: ICodeEditor | undefined = undefined;
		if (isCodeEditor(widget)) {
			codeEditor = widget;
		} else if (isDiffEditor(widget)) {
			codeEditor = widget.getModifiedEditor();
		}

		if (!codeEditor || !codeEditor.getModel()) {
			this._lastState = undefined;
			this._callback(undefined, undefined);
			return;
		}

		let thisState = new RequestState(
			codeEditor.getId(),
			codeEditor.getModel().id,
			codeEditor.getModel().getVersionId(),
			this._featureRegistry.all(codeEditor.getModel()).length
		);

		if (thisState.equals(this._lastState)) {
			// prevent unneccesary changes...
			return;
		}
		dispose(this._sessionDisposable);
		this._lastState = thisState;
		this._callback(codeEditor, undefined);

		let handle: any;
		let contentListener = codeEditor.onDidChangeModelContent(event => {
			clearTimeout(handle);
			handle = setTimeout(() => this._callback(codeEditor, event), 350);
		});
		let modeListener = codeEditor.onDidChangeModelLanguage(_ => {
			this._callback(codeEditor, undefined);
		});
		let disposeListener = codeEditor.onDidDispose(() => {
			this._callback(undefined, undefined);
		});
		this._sessionDisposable = {
			dispose() {
				contentListener.dispose();
				clearTimeout(handle);
				modeListener.dispose();
				disposeListener.dispose();
			}
		};
	}
}

class SimpleToggleAction extends Action {

	constructor(label: string, checked: boolean, callback: (action: SimpleToggleAction) => any, className?: string) {
		super(`simple` + defaultGenerator.nextId(), label, className, true, _ => {
			this.checked = !this.checked;
			callback(this);
			return undefined;
		});
		this.checked = checked;
	}
}


class OutlineViewState {

	private _followCursor = false;
	private _filterOnType = true;
	private _sortBy = OutlineItemCompareType.ByKind;

	private _onDidChange = new Emitter<{ followCursor?: boolean, sortBy?: boolean, filterOnType?: boolean }>();
	readonly onDidChange = this._onDidChange.event;

	set followCursor(value: boolean) {
		if (value !== this._followCursor) {
			this._followCursor = value;
			this._onDidChange.fire({ followCursor: true });
		}
	}

	get followCursor(): boolean {
		return this._followCursor;
	}

	get filterOnType() {
		return this._filterOnType;
	}

	set filterOnType(value) {
		if (value !== this._filterOnType) {
			this._filterOnType = value;
			this._onDidChange.fire({ filterOnType: true });
		}
	}

	set sortBy(value: OutlineItemCompareType) {
		if (value !== this._sortBy) {
			this._sortBy = value;
			this._onDidChange.fire({ sortBy: true });
		}
	}

	get sortBy(): OutlineItemCompareType {
		return this._sortBy;
	}

	persist(storageService: IStorageService): void {
		storageService.store('outline/state', JSON.stringify({ followCursor: this.followCursor, sortBy: this.sortBy }), StorageScope.WORKSPACE);
	}

	restore(storageService: IStorageService): void {
		let raw = storageService.get('outline/state', StorageScope.WORKSPACE);
		if (!raw) {
			return;
		}
		let data: any;
		try {
			data = JSON.parse(raw);
		} catch (e) {
			return;
		}
		this.followCursor = data.followCursor;
		this.sortBy = data.sortBy;
	}
}

export class OutlinePanel extends ViewletPanel {

	private _disposables = new Array<IDisposable>();

	private _editorDisposables = new Array<IDisposable>();
	private _outlineViewState = new OutlineViewState();
	private _requestOracle: RequestOracle;
	private _cachedHeight: number;
	private _domNode: HTMLElement;
	private _message: HTMLDivElement;
	private _inputContainer: HTMLDivElement;
	private _input: InputBox;
	private _progressBar: ProgressBar;
	private _tree: WorkbenchTree;
	private _treeDataSource: OutlineDataSource;
	private _treeRenderer: OutlineRenderer;
	private _treeFilter: OutlineItemFilter;
	private _treeComparator: OutlineItemComparator;
	private _treeStates = new LRUCache<string, OutlineTreeState>(10);

	private readonly _contextKeyFocused: IContextKey<boolean>;
	private readonly _contextKeyFiltered: IContextKey<boolean>;

	constructor(
		options: IViewletViewOptions,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IThemeService private readonly _themeService: IThemeService,
		@IStorageService private readonly _storageService: IStorageService,
		@IEditorService private readonly _editorService: IEditorService,
		@IMarkerService private readonly _markerService: IMarkerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
	) {
		super(options, _keybindingService, contextMenuService, configurationService);
		this._outlineViewState.restore(this._storageService);
		this._contextKeyFocused = OutlineViewFocused.bindTo(contextKeyService);
		this._contextKeyFiltered = OutlineViewFiltered.bindTo(contextKeyService);
		this._disposables.push(this.onDidFocus(_ => this._contextKeyFocused.set(true)));
		this._disposables.push(this.onDidBlur(_ => this._contextKeyFocused.set(false)));
	}

	dispose(): void {
		dispose(this._disposables);
		dispose(this._requestOracle);
		dispose(this._editorDisposables);
		super.dispose();
	}

	focus(): void {
		if (this._tree) {
			// focus on tree and fallback to root
			// dom node when the tree cannot take focus,
			// e.g. when hidden
			this._tree.domFocus();
			if (!this._tree.isDOMFocused()) {
				this._domNode.focus();
			}
		}
	}

	protected renderBody(container: HTMLElement): void {
		this._domNode = container;
		this._domNode.tabIndex = 0;
		dom.addClass(container, 'outline-panel');

		let progressContainer = dom.$('.outline-progress');
		this._message = dom.$('.outline-message');
		this._inputContainer = dom.$('.outline-input');

		this._progressBar = new ProgressBar(progressContainer);
		this.disposables.push(attachProgressBarStyler(this._progressBar, this._themeService));

		let treeContainer = dom.$('.outline-tree');
		dom.append(
			container,
			progressContainer, this._message, this._inputContainer, treeContainer
		);

		this._input = new InputBox(this._inputContainer, null, {
			placeholder: this._outlineViewState.filterOnType ? localize('filter.placeholder', "Filter") : localize('find.placeholder', "Find")
		});
		this._input.disable();

		this.disposables.push(attachInputBoxStyler(this._input, this._themeService));
		this.disposables.push(dom.addStandardDisposableListener(this._input.inputElement, 'keyup', event => {
			if (event.keyCode === KeyCode.DownArrow) {
				this._tree.focusNext();
				this._tree.domFocus();
			} else if (event.keyCode === KeyCode.UpArrow) {
				this._tree.focusPrevious();
				this._tree.domFocus();
			} else if (event.keyCode === KeyCode.Enter) {
				let element = this._tree.getFocus();
				if (element instanceof OutlineElement) {
					this._revealTreeSelection(OutlineModel.get(element), element, true, false);
				}
			} else if (event.keyCode === KeyCode.Escape) {
				this._input.value = '';
				this._tree.domFocus();
			}
		}));

		const $this = this;
		const controller = new class extends OutlineController {

			constructor() {
				super({}, $this.configurationService);
			}

			onKeyDown(tree: ITree, event: IKeyboardEvent) {
				let handled = super.onKeyDown(tree, event);
				if (handled) {
					return true;
				}
				if (this.upKeyBindingDispatcher.has(event.keyCode)) {
					return false;
				}
				// crazy -> during keydown focus moves to the input box
				// and because of that the keyup event is handled by the
				// input field
				if ($this._keybindingService.mightProducePrintableCharacter(event)) {
					$this._input.focus();
					return true;
				}
				return false;
			}
		};

		this._treeRenderer = this._instantiationService.createInstance(OutlineRenderer);
		this._treeDataSource = new OutlineDataSource();
		this._treeComparator = new OutlineItemComparator(this._outlineViewState.sortBy);
		this._treeFilter = new OutlineItemFilter();
		this._tree = this._instantiationService.createInstance(WorkbenchTree, treeContainer, { controller, renderer: this._treeRenderer, dataSource: this._treeDataSource, sorter: this._treeComparator, filter: this._treeFilter }, {});

		this._treeRenderer.renderProblemColors = this._configurationService.getValue(OutlineConfigKeys.problemsColors);
		this._treeRenderer.renderProblemBadges = this._configurationService.getValue(OutlineConfigKeys.problemsBadges);

		this._disposables.push(this._tree, this._input);
		this._disposables.push(this._outlineViewState.onDidChange(this._onDidChangeUserState, this));

		// feature: toggle icons
		dom.toggleClass(this._domNode, 'no-icons', !this._configurationService.getValue(OutlineConfigKeys.icons));
		this.disposables.push(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(OutlineConfigKeys.icons)) {
				dom.toggleClass(this._domNode, 'no-icons', !this._configurationService.getValue(OutlineConfigKeys.icons));
			}
		}));

		this.disposables.push(this.onDidChangeBodyVisibility(visible => {
			if (visible && !this._requestOracle) {
				this._requestOracle = this._instantiationService.createInstance(RequestOracle, (editor, event) => this._doUpdate(editor, event), DocumentSymbolProviderRegistry);
			} else if (!visible) {
				dispose(this._requestOracle);
				this._requestOracle = undefined;
				this._doUpdate(undefined, undefined);
			}
		}));
	}

	protected layoutBody(height: number): void {
		if (height !== this._cachedHeight) {
			this._cachedHeight = height;
			const treeHeight = height - (5 /*progressbar height*/ + 33 /*input height*/);
			this._tree.layout(treeHeight);
		}
	}

	getActions(): IAction[] {
		return [
			new Action('collapse', localize('collapse', "Collapse All"), 'explorer-action collapse-explorer', true, () => {
				return new CollapseAction(this._tree, true, undefined).run();
			})
		];
	}

	getSecondaryActions(): IAction[] {
		let group = new RadioGroup([
			new SimpleToggleAction(localize('sortByPosition', "Sort By: Position"), this._outlineViewState.sortBy === OutlineItemCompareType.ByPosition, _ => this._outlineViewState.sortBy = OutlineItemCompareType.ByPosition),
			new SimpleToggleAction(localize('sortByName', "Sort By: Name"), this._outlineViewState.sortBy === OutlineItemCompareType.ByName, _ => this._outlineViewState.sortBy = OutlineItemCompareType.ByName),
			new SimpleToggleAction(localize('sortByKind', "Sort By: Type"), this._outlineViewState.sortBy === OutlineItemCompareType.ByKind, _ => this._outlineViewState.sortBy = OutlineItemCompareType.ByKind),
		]);
		let result = [
			new SimpleToggleAction(localize('followCur', "Follow Cursor"), this._outlineViewState.followCursor, action => this._outlineViewState.followCursor = action.checked),
			new SimpleToggleAction(localize('filterOnType', "Filter on Type"), this._outlineViewState.filterOnType, action => this._outlineViewState.filterOnType = action.checked),
			new Separator(),
			...group.actions,
		];

		this.disposables.push(...result);
		this.disposables.push(group);
		return result;
	}

	private _onDidChangeUserState(e: { followCursor?: boolean, sortBy?: boolean, filterOnType?: boolean }) {
		this._outlineViewState.persist(this._storageService);
		if (e.followCursor) {
			// todo@joh update immediately
		}
		if (e.sortBy) {
			this._treeComparator.type = this._outlineViewState.sortBy;
			this._tree.refresh(undefined, true);
		}
		if (e.filterOnType) {
			this._applyTypeToFilter();
		}
	}

	private _showMessage(message: string) {
		dom.addClass(this._domNode, 'message');
		this._tree.setInput(undefined);
		this._progressBar.stop().hide();
		this._message.innerText = escape(message);
	}

	private static _createOutlineModel(model: ITextModel, disposables: IDisposable[]): Promise<OutlineModel> {
		let promise = createCancelablePromise(token => OutlineModel.create(model, token));
		disposables.push({ dispose() { promise.cancel(); } });
		return promise.catch(err => {
			if (!isPromiseCanceledError(err)) {
				throw err;
			}
			return undefined;
		});
	}

	private async _doUpdate(editor: ICodeEditor, event: IModelContentChangedEvent): Promise<void> {
		dispose(this._editorDisposables);

		this._editorDisposables = new Array();
		this._progressBar.infinite().show(150);
		this._input.disable();
		if (!event) {
			this._input.value = '';
		}

		if (!editor || !DocumentSymbolProviderRegistry.has(editor.getModel())) {
			return this._showMessage(localize('no-editor', "There are no editors open that can provide outline information."));
		}

		let textModel = editor.getModel();
		let loadingMessage: IDisposable;
		let oldModel = <OutlineModel>this._tree.getInput();
		if (!oldModel) {
			loadingMessage = new TimeoutTimer(
				() => this._showMessage(localize('loading', "Loading document symbols for '{0}'...", posix.basename(textModel.uri.path))),
				100
			);
		}

		let model = await OutlinePanel._createOutlineModel(textModel, this._editorDisposables);
		dispose(loadingMessage);
		if (!model) {
			return;
		}

		if (TreeElement.empty(model)) {
			return this._showMessage(localize('no-symbols', "No symbols found in document '{0}'", posix.basename(textModel.uri.path)));
		}

		let newSize = TreeElement.size(model);
		if (newSize > 7500) {
			// this is a workaround for performance issues with the tree: https://github.com/Microsoft/vscode/issues/18180
			return this._showMessage(localize('too-many-symbols', "We are sorry, but this file is too large for showing an outline."));
		}

		dom.removeClass(this._domNode, 'message');

		if (event && oldModel && textModel.getLineCount() >= 25) {
			// heuristic: when the symbols-to-lines ratio changes by 50% between edits
			// wait a little (and hope that the next change isn't as drastic).
			let newLength = textModel.getValueLength();
			let newRatio = newSize / newLength;
			let oldSize = TreeElement.size(oldModel);
			let oldLength = newLength - event.changes.reduce((prev, value) => prev + value.rangeLength, 0);
			let oldRatio = oldSize / oldLength;
			if (newRatio <= oldRatio * 0.5 || newRatio >= oldRatio * 1.5) {

				let waitPromise = new Promise<boolean>(resolve => {
					let handle = setTimeout(() => {
						handle = undefined;
						resolve(true);
					}, 2000);
					this._disposables.push({
						dispose() {
							clearTimeout(handle);
							resolve(false);
						}
					});
				});

				if (!await waitPromise) {
					return;
				}
			}
		}

		this._progressBar.stop().hide();

		if (oldModel && oldModel.merge(model)) {
			this._tree.refresh(undefined, true);
			model = oldModel;

		} else {
			// persist state
			if (oldModel) {
				let state = OutlineTreeState.capture(this._tree);
				this._treeStates.set(oldModel.textModel.uri.toString(), state);
			}
			await this._tree.setInput(model);
			let state = this._treeStates.get(model.textModel.uri.toString());
			await OutlineTreeState.restore(this._tree, state, this);
		}

		this._input.enable();
		this.layoutBody(this._cachedHeight);

		// transfer focus from domNode to the tree
		if (this._domNode === document.activeElement) {
			this._tree.domFocus();
		}

		// feature: filter on type
		// on type -> update filters
		// on first type -> capture tree state
		// on erase -> restore captured tree state
		let beforePatternState: OutlineTreeState;
		let onInputValueChanged = async pattern => {

			this._contextKeyFiltered.set(pattern.length > 0);

			if (pattern && !beforePatternState) {
				beforePatternState = OutlineTreeState.capture(this._tree);
			}
			let item = model.updateMatches(pattern);
			await this._tree.refresh(undefined, true);
			if (item) {
				await this._tree.expandAll(undefined /*all*/);
				await this._tree.reveal(item);
				this._tree.setFocus(item, this);
				this._tree.setSelection([item], this);
			}

			if (!pattern && beforePatternState) {
				await OutlineTreeState.restore(this._tree, beforePatternState, this);
				beforePatternState = undefined;
			}
		};
		if (this._input.value) {
			onInputValueChanged(this._input.value);
		}
		this._editorDisposables.push(this._input.onDidChange(onInputValueChanged));

		this._editorDisposables.push(toDisposable(() => this._contextKeyFiltered.reset()));

		// feature: reveal outline selection in editor
		// on change -> reveal/select defining range
		this._editorDisposables.push(this._tree.onDidChangeSelection(e => {
			if (e.payload === this || e.payload && e.payload.didClickOnTwistie) {
				return;
			}
			let [first] = e.selection;
			if (!(first instanceof OutlineElement)) {
				return;
			}

			let focus = false;
			let aside = false;
			if (e.payload) {
				if (e.payload.origin === 'keyboard') {
					focus = true;

				} else if (e.payload.origin === 'mouse' && e.payload.originalEvent instanceof StandardMouseEvent) {
					let event = <StandardMouseEvent>e.payload.originalEvent;
					focus = event.detail === 2;
					aside = !this._tree.useAltAsMultipleSelectionModifier && event.altKey || this._tree.useAltAsMultipleSelectionModifier && (event.ctrlKey || event.metaKey);
				}
			}
			this._revealTreeSelection(model, first, focus, aside);
		}));

		// feature: reveal editor selection in outline
		this._revealEditorSelection(model, editor.getSelection());
		const versionIdThen = model.textModel.getVersionId();
		this._editorDisposables.push(editor.onDidChangeCursorSelection(e => {
			// first check if the document has changed and stop revealing the
			// cursor position iff it has -> we will update/recompute the
			// outline view then anyways
			if (!model.textModel.isDisposed() && model.textModel.getVersionId() === versionIdThen) {
				this._revealEditorSelection(model, e.selection);
			}
		}));

		// feature: show markers in outline
		const updateMarker = (e: URI[], ignoreEmpty?: boolean) => {
			if (!this._configurationService.getValue(OutlineConfigKeys.problemsEnabled)) {
				return;
			}
			if (firstIndex(e, a => a.toString() === textModel.uri.toString()) < 0) {
				return;
			}
			const marker = this._markerService.read({ resource: textModel.uri, severities: MarkerSeverity.Error | MarkerSeverity.Warning });
			if (marker.length > 0 || !ignoreEmpty) {
				model.updateMarker(marker);
				this._tree.refresh(undefined, true);
			}
		};
		updateMarker([textModel.uri], true);
		this._editorDisposables.push(this._markerService.onMarkerChanged(updateMarker));

		this._editorDisposables.push(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(OutlineConfigKeys.problemsBadges) || e.affectsConfiguration(OutlineConfigKeys.problemsColors)) {
				this._treeRenderer.renderProblemColors = this._configurationService.getValue(OutlineConfigKeys.problemsColors);
				this._treeRenderer.renderProblemBadges = this._configurationService.getValue(OutlineConfigKeys.problemsBadges);
				this._tree.refresh(undefined, true);
				return;
			}
			if (!e.affectsConfiguration(OutlineConfigKeys.problemsEnabled)) {
				return;
			}
			if (!this._configurationService.getValue(OutlineConfigKeys.problemsEnabled)) {
				model.updateMarker([]);
				this._tree.refresh(undefined, true);
			} else {
				updateMarker([textModel.uri], true);
			}
		}));
	}

	private _applyTypeToFilter(): void {
		// depending on the user setting we filter or find elements
		if (this._outlineViewState.filterOnType) {
			this._treeFilter.enabled = true;
			this._treeDataSource.filterOnScore = true;
			this._input.setPlaceHolder(localize('filter', "Filter"));
		} else {
			this._treeFilter.enabled = false;
			this._treeDataSource.filterOnScore = false;
			this._input.setPlaceHolder(localize('find', "Find"));
		}
		if (this._tree.getInput()) {
			this._tree.refresh(undefined, true);
		}
	}

	private async _revealTreeSelection(model: OutlineModel, element: OutlineElement, focus: boolean, aside: boolean): Promise<void> {

		await this._editorService.openEditor({
			resource: model.textModel.uri,
			options: {
				preserveFocus: !focus,
				selection: Range.collapseToStart(element.symbol.selectionRange),
				revealInCenterIfOutsideViewport: true
			}
		} as IResourceInput, aside ? SIDE_GROUP : ACTIVE_GROUP);
	}

	private async _revealEditorSelection(model: OutlineModel, selection: Selection): Promise<void> {
		if (!this._outlineViewState.followCursor || !this._tree.getInput() || !selection) {
			return;
		}
		let [first] = this._tree.getSelection();
		let item = model.getItemEnclosingPosition({
			lineNumber: selection.selectionStartLineNumber,
			column: selection.selectionStartColumn
		}, first instanceof OutlineElement ? first : undefined);
		if (!item) {
			// nothing to reveal
			return;
		}
		let top = this._tree.getRelativeTop(item);
		if (top < 0 || top > 1) {
			// only when outside view port
			await this._tree.reveal(item, 0.5);
		}
		this._tree.setFocus(item, this);
		this._tree.setSelection([item], this);
	}

	focusHighlightedElement(up: boolean): void {
		if (!this._tree.getInput()) {
			return;
		}
		if (!this._tree.isDOMFocused()) {
			this._tree.domFocus();
			return;
		}
		let navi = this._tree.getNavigator(this._tree.getFocus(), false);
		let candidate: any;
		while (candidate = up ? navi.previous() : navi.next()) {
			if (candidate instanceof OutlineElement && candidate.score && candidate.score[1] > 0) {
				this._tree.setFocus(candidate, this);
				this._tree.reveal(candidate).then(undefined, onUnexpectedError);
				break;
			}
		}
	}
}

async function goUpOrDownToHighligthedElement(accessor: ServicesAccessor, prev: boolean) {
	const viewsService = accessor.get(IViewsService);
	const view = await viewsService.openView(OutlineViewId);
	if (view instanceof OutlinePanel) {
		view.focusHighlightedElement(prev);
	}
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'outline.focusDownHighlighted',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyCode.DownArrow,
	when: ContextKeyExpr.and(OutlineViewFiltered, OutlineViewFocused),
	handler: accessor => goUpOrDownToHighligthedElement(accessor, false)
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'outline.focusUpHighlighted',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyCode.UpArrow,
	when: ContextKeyExpr.and(OutlineViewFiltered, OutlineViewFocused),
	handler: accessor => goUpOrDownToHighligthedElement(accessor, true)
});
