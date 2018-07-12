/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as dom from 'vs/base/browser/dom';
import { BreadcrumbsItem, BreadcrumbsWidget, IBreadcrumbsItemEvent } from 'vs/base/browser/ui/breadcrumbs/breadcrumbsWidget';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { compareFileNames } from 'vs/base/common/comparers';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { dispose, IDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { dirname, isEqual, basenameOrAuthority } from 'vs/base/common/resources';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDataSource, IRenderer, ISelectionEvent, ISorter, ITree, ITreeConfiguration } from 'vs/base/parts/tree/browser/tree';
import 'vs/css!./media/breadcrumbscontrol';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { OutlineElement, OutlineGroup, OutlineModel, TreeElement } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { OutlineDataSource, OutlineItemComparator, OutlineRenderer } from 'vs/editor/contrib/documentSymbols/outlineTree';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { FileKind, IFileService, IFileStat } from 'vs/platform/files/common/files';
import { IConstructorSignature2, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { WorkbenchTree } from 'vs/platform/list/browser/listService';
import { Registry } from 'vs/platform/registry/common/platform';
import { attachBreadcrumbsStyler, attachListStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { FileLabel } from 'vs/workbench/browser/labels';
import { BreadcrumbElement, EditorBreadcrumbsModel, FileElement } from 'vs/workbench/browser/parts/editor/breadcrumbsModel';
import { EditorGroupView } from 'vs/workbench/browser/parts/editor/editorGroupView';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IBreadcrumbsService } from 'vs/workbench/browser/parts/editor/breadcrumbs';
import { breadcrumbsActiveSelectionBackground } from 'vs/platform/theme/common/colorRegistry';
import { symbolKindToCssClass } from 'vs/editor/common/modes';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { FuzzyScore, createMatches, fuzzyScore } from 'vs/base/common/filters';

class Item extends BreadcrumbsItem {

	private readonly _disposables: IDisposable[] = [];

	constructor(
		readonly element: BreadcrumbElement,
		readonly options: IBreadcrumbsControlOptions,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();
	}

	dispose(): void {
		dispose(this._disposables);
	}

	equals(other: BreadcrumbsItem): boolean {
		if (!(other instanceof Item)) {
			return false;
		}
		if (this.element instanceof FileElement && other.element instanceof FileElement) {
			return isEqual(this.element.uri, other.element.uri);
		}
		if (this.element instanceof TreeElement && other.element instanceof TreeElement) {
			return this.element.id === other.element.id;
		}
		return false;
	}

	render(container: HTMLElement): void {
		if (this.element instanceof FileElement) {
			// file/folder
			if (this.options.showIcons) {
				let label = this._instantiationService.createInstance(FileLabel, container, {});
				label.setFile(this.element.uri, {
					hidePath: true,
					fileKind: this.element.isFile ? FileKind.FILE : FileKind.FOLDER,
					fileDecorations: { colors: this.options.showDecorationColors, badges: false }
				});
				this._disposables.push(label);

			} else {
				let label = new IconLabel(container);
				label.setValue(basenameOrAuthority(this.element.uri));
				this._disposables.push(label);
			}

		} else if (this.element instanceof OutlineGroup) {
			// provider
			let label = new IconLabel(container);
			label.setValue(this.element.provider.displayName);
			this._disposables.push(label);

		} else if (this.element instanceof OutlineElement) {
			// symbol

			if (this.options.showIcons) {
				let icon = document.createElement('div');
				icon.className = `symbol-icon ${symbolKindToCssClass(this.element.symbol.kind)}`;
				container.appendChild(icon);
			}

			let label = new IconLabel(container);
			label.setValue(this.element.symbol.name.replace(/\r|\n|\r\n/g, '\u23CE'));
			this._disposables.push(label);
		}
	}
}

export interface IBreadcrumbsControlOptions {
	showIcons: boolean;
	showDecorationColors: boolean;
}

export class BreadcrumbsControl {

	static HEIGHT = 25;

	static CK_BreadcrumbsVisible = new RawContextKey('breadcrumbsVisible', false);
	static CK_BreadcrumbsActive = new RawContextKey('breadcrumbsActive', false);

	private readonly _ckBreadcrumbsVisible: IContextKey<boolean>;
	private readonly _ckBreadcrumbsActive: IContextKey<boolean>;

	readonly domNode: HTMLDivElement;
	private readonly _widget: BreadcrumbsWidget;
	private _disposables = new Array<IDisposable>();

	private _breadcrumbsDisposables = new Array<IDisposable>();
	private _breadcrumbsPickerShowing = false;

	constructor(
		container: HTMLElement,
		private readonly _options: IBreadcrumbsControlOptions,
		private readonly _editorGroup: EditorGroupView,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IEditorService private readonly _editorService: IEditorService,
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceService: IWorkspaceContextService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IThemeService private readonly _themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IBreadcrumbsService breadcrumbsService: IBreadcrumbsService,
	) {
		this.domNode = document.createElement('div');
		dom.addClasses(this.domNode, 'breadcrumbs-control');
		dom.append(container, this.domNode);

		this._widget = new BreadcrumbsWidget(this.domNode);
		this._widget.onDidSelectItem(this._onSelectEvent, this, this._disposables);
		this._widget.onDidFocusItem(this._onFocusEvent, this, this._disposables);
		this._widget.onDidChangeFocus(this._updateCkBreadcrumbsActive, this, this._disposables);
		this._disposables.push(attachBreadcrumbsStyler(this._widget, this._themeService));

		this._ckBreadcrumbsVisible = BreadcrumbsControl.CK_BreadcrumbsVisible.bindTo(this._contextKeyService);
		this._ckBreadcrumbsActive = BreadcrumbsControl.CK_BreadcrumbsActive.bindTo(this._contextKeyService);

		this._disposables.push(breadcrumbsService.register(this._editorGroup.id, this._widget));
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
		this._breadcrumbsDisposables = dispose(this._breadcrumbsDisposables);
		this._ckBreadcrumbsVisible.reset();
		this._ckBreadcrumbsActive.reset();
		this._widget.dispose();
		this.domNode.remove();
	}

	layout(dim: dom.Dimension): void {
		this._widget.layout(dim);
	}

	update(): void {
		const input = this._editorGroup.activeEditor;
		this._breadcrumbsDisposables = dispose(this._breadcrumbsDisposables);

		if (!input || !input.getResource() || !this._fileService.canHandleResource(input.getResource())) {
			// cleanup and return when there is no input or when
			// we cannot handle this input
			this._ckBreadcrumbsVisible.set(false);
			dom.toggleClass(this.domNode, 'hidden', true);
			return;
		}

		dom.toggleClass(this.domNode, 'hidden', false);
		this._ckBreadcrumbsVisible.set(true);

		let control = this._editorGroup.activeControl.getControl() as ICodeEditor;
		let model = new EditorBreadcrumbsModel(input.getResource(), isCodeEditor(control) ? control : undefined, this._workspaceService);

		let updateBreadcrumbs = () => {
			let items = model.getElements().map(element => new Item(element, this._options, this._instantiationService));
			this._widget.setItems(items);
			this._widget.reveal(items[items.length - 1]);
		};
		let listener = model.onDidUpdate(updateBreadcrumbs);
		updateBreadcrumbs();
		this._breadcrumbsDisposables = [model, listener];
	}

	clear(): void {
		this._breadcrumbsDisposables = dispose(this._breadcrumbsDisposables);
		this._ckBreadcrumbsVisible.set(false);
		dom.toggleClass(this.domNode, 'hidden', true);
	}

	private _onFocusEvent(event: IBreadcrumbsItemEvent): void {
		if (event.item && this._breadcrumbsPickerShowing) {
			return this._widget.setSelection(event.item);
		}
	}

	private _onSelectEvent(event: IBreadcrumbsItemEvent): void {
		if (!event.item) {
			return;
		}

		this._editorGroup.focus();
		this._contextViewService.showContextView({
			getAnchor() {
				return event.node;
			},
			render: (parent: HTMLElement) => {
				let { element } = event.item as Item;
				let ctor: IConstructorSignature2<HTMLElement, BreadcrumbElement, BreadcrumbsPicker> = element instanceof FileElement ? BreadcrumbsFilePicker : BreadcrumbsOutlinePicker;
				let res = this._instantiationService.createInstance(ctor, parent, element);
				res.layout({ width: 220, height: 330 });
				let listener = res.onDidPickElement(data => {
					this._contextViewService.hideContextView();
					this._widget.setSelection(undefined);
					if (!data) {
						return;
					}
					if (URI.isUri(data)) {
						// open new editor
						this._editorService.openEditor({ resource: data });

					} else if (data instanceof OutlineElement) {

						let resource: URI;
						let candidate = data.parent;
						while (candidate) {
							if (candidate instanceof OutlineModel) {
								resource = candidate.textModel.uri;
								break;
							}
							candidate = candidate.parent;
						}

						this._editorService.openEditor({ resource, options: { selection: Range.collapseToStart(data.symbol.selectionRange) } });

					}
				});
				this._breadcrumbsPickerShowing = true;
				this._updateCkBreadcrumbsActive();

				return combinedDisposable([listener, res]);
			},
			onHide: (data) => {
				this._breadcrumbsPickerShowing = false;
				this._updateCkBreadcrumbsActive();
			}
		});
	}

	private _updateCkBreadcrumbsActive(): void {
		const value = this._widget.isDOMFocused() || this._breadcrumbsPickerShowing;
		this._ckBreadcrumbsActive.set(value);
	}
}

export abstract class BreadcrumbsPicker {

	protected readonly _disposables = new Array<IDisposable>();
	protected readonly _domNode: HTMLDivElement;
	protected readonly _focus: dom.IFocusTracker;
	protected readonly _input: InputBox;
	protected readonly _tree: WorkbenchTree;

	protected readonly _onDidPickElement = new Emitter<any>();

	readonly onDidPickElement: Event<any> = this._onDidPickElement.event;

	constructor(
		container: HTMLElement,
		input: BreadcrumbElement,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IThemeService protected readonly _themeService: IThemeService,
	) {
		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-breadcrumbs-picker';
		const color = this._themeService.getTheme().getColor(breadcrumbsActiveSelectionBackground);
		this._domNode.style.background = color.toString();
		this._domNode.style.boxShadow = `2px 2px 3px ${color.darken(.1)}`;
		this._domNode.style.position = 'absolute';
		this._domNode.style.zIndex = '1000';
		container.appendChild(this._domNode);

		this._focus = dom.trackFocus(this._domNode);
		this._focus.onDidBlur(_ => this._onDidPickElement.fire(undefined), undefined, this._disposables);

		this._input = new InputBox(this._domNode, undefined, { placeholder: localize('placeholder', "Find") });
		this._input.setEnabled(false);
		this._disposables.push(attachListStyler(this._input, this._themeService));

		let treeConifg = this._completeTreeConfiguration({ dataSource: undefined, renderer: undefined });
		this._tree = this._instantiationService.createInstance(WorkbenchTree, this._domNode, treeConifg, {});
		this._disposables.push(this._tree.onDidChangeSelection(e => {
			if (e.payload !== this) {
				setTimeout(_ => this._onDidChangeSelection(e)); // need to debounce here because this disposes the tree and the tree doesn't like to be disposed on click
			}
		}));

		this._tree.setInput(this._getInput(input)).then(_ => {

			let selection = this._getInitialSelection(this._tree, input);
			if (selection) {
				this._tree.setSelection([selection], this);
				this._tree.setFocus(selection);
				this._tree.reveal(selection);
			}

			// input - interact with tree
			this._disposables.push(dom.addStandardDisposableListener(this._input.inputElement, 'keyup', event => {
				if (event.keyCode === KeyCode.DownArrow) {
					this._tree.focusNext();
					this._tree.domFocus();
				} else if (event.keyCode === KeyCode.UpArrow) {
					this._tree.focusPrevious();
					this._tree.domFocus();
				} else if (event.keyCode === KeyCode.Enter) {
					this._onDidChangeSelection({ selection: this._tree.getSelection() });
				} else if (event.keyCode === KeyCode.Escape) {
					this._input.value = '';
					this._tree.domFocus();
				}
			}));

			// input - type to find
			this._disposables.push(this._input.onDidChange(async value => {
				let nav = this._tree.getNavigator(undefined, false);
				let topScore: FuzzyScore;
				let topElement: any;
				while (nav.next()) {
					let element = nav.current();
					let score = treeConifg.renderer.updateHighlights(this._tree, element, value);
					if (!topScore || score && topScore[0] < score[0]) {
						topScore = score;
						topElement = element;
					}
					this._tree.refresh(element).then(undefined, onUnexpectedError);
				}
				if (topElement) {
					this._tree.reveal(topElement);
					this._tree.setFocus(topElement);
					this._tree.setSelection([topElement], this);
				}
			}));

			this._input.setEnabled(true);

		}, onUnexpectedError);

		// this._input.focus();
		this._tree.domFocus();
	}

	dispose(): void {
		dispose(this._disposables);
		this._onDidPickElement.dispose();
		this._input.dispose();
		this._tree.dispose();
		this._focus.dispose();
	}

	layout(dim: dom.Dimension) {
		this._domNode.style.width = `${dim.width}px`;
		this._domNode.style.height = `${dim.height}px`;

		this._input.layout();
		this._tree.layout(dim.height - this._input.height, dim.width);
	}

	protected abstract _getInput(input: BreadcrumbElement): any;
	protected abstract _getInitialSelection(tree: ITree, input: BreadcrumbElement): any;
	protected abstract _completeTreeConfiguration(config: ITreeConfiguration2): ITreeConfiguration2;
	protected abstract _onDidChangeSelection(e: ISelectionEvent): void;
}

interface IHighlightingRenderer {
	updateHighlights(tree: ITree, element: any, pattern: string): FuzzyScore;
}

interface ITreeConfiguration2 extends ITreeConfiguration {
	renderer: IHighlightingRenderer & IRenderer;
}


//#region - Files

export class FileDataSource implements IDataSource {

	private readonly _parents = new WeakMap<IFileStat, IFileStat>();

	constructor(
		@IFileService private readonly _fileService: IFileService,
	) { }

	getId(tree: ITree, element: IFileStat | URI): string {
		return URI.isUri(element) ? element.toString() : element.resource.toString();
	}

	hasChildren(tree: ITree, element: IFileStat | URI): boolean {
		return URI.isUri(element) || element.isDirectory;
	}

	getChildren(tree: ITree, element: IFileStat | URI): TPromise<IFileStat[]> {
		return this._fileService.resolveFile(
			URI.isUri(element) ? element : element.resource
		).then(stat => {
			for (const child of stat.children) {
				this._parents.set(child, stat);
			}
			return stat.children;
		});
	}

	getParent(tree: ITree, element: IFileStat | URI): TPromise<IFileStat> {
		return TPromise.as(URI.isUri(element) ? undefined : this._parents.get(element));
	}
}

export class FileRenderer implements IRenderer, IHighlightingRenderer {

	private readonly _scores = new WeakMap<IFileStat, FuzzyScore>();

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) { }

	getHeight(tree: ITree, element: any): number {
		return 22;
	}

	getTemplateId(tree: ITree, element: any): string {
		return 'FileStat';
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement) {
		return this._instantiationService.createInstance(FileLabel, container, { supportHighlights: true });
	}

	renderElement(tree: ITree, element: IFileStat, templateId: string, templateData: FileLabel): void {
		templateData.setFile(element.resource, {
			hidePath: true,
			fileKind: element.isDirectory ? FileKind.FOLDER : FileKind.FILE,
			fileDecorations: { colors: true, badges: true },
			matches: createMatches((this._scores.get(element) || [, []])[1])
		});
	}

	disposeTemplate(tree: ITree, templateId: string, templateData: FileLabel): void {
		templateData.dispose();
	}

	updateHighlights(tree: ITree, element: any, pattern: string): FuzzyScore {
		let score = fuzzyScore(pattern, (element as IFileStat).name, undefined, true);
		this._scores.set(element, score);
		return score;
	}
}

export class FileSorter implements ISorter {
	compare(tree: ITree, a: IFileStat, b: IFileStat): number {
		if (a.isDirectory === b.isDirectory) {
			// same type -> compare on names
			return compareFileNames(a.name, b.name);
		} else if (a.isDirectory) {
			return -1;
		} else {
			return 1;
		}
	}
}

export class BreadcrumbsFilePicker extends BreadcrumbsPicker {

	protected _getInput(input: BreadcrumbElement): any {
		let { uri } = (input as FileElement);
		return dirname(uri);
	}

	protected _getInitialSelection(tree: ITree, input: BreadcrumbElement): any {
		let { uri } = (input as FileElement);
		let nav = tree.getNavigator();
		while (nav.next()) {
			if (isEqual(uri, (nav.current() as IFileStat).resource)) {
				return nav.current();
			}
		}
		return undefined;
	}

	protected _completeTreeConfiguration(config: ITreeConfiguration2): ITreeConfiguration2 {
		// todo@joh reuse explorer implementations?
		config.dataSource = this._instantiationService.createInstance(FileDataSource);
		config.renderer = this._instantiationService.createInstance(FileRenderer);
		config.sorter = new FileSorter();
		return config;
	}

	protected _onDidChangeSelection(e: ISelectionEvent): void {
		let [first] = e.selection;
		let stat = first as IFileStat;
		if (stat && !stat.isDirectory) {
			this._onDidPickElement.fire(stat.resource);
		}
	}
}
//#endregion

//#region - Symbols

class HighlightingOutlineRenderer extends OutlineRenderer implements IHighlightingRenderer {

	updateHighlights(tree: ITree, element: any, pattern: string): FuzzyScore {
		if (element instanceof OutlineElement) {
			return element.score = fuzzyScore(pattern, element.symbol.name, undefined, true) || [-1, []];
		}
		return undefined;
	}

}

export class BreadcrumbsOutlinePicker extends BreadcrumbsPicker {

	protected _getInput(input: BreadcrumbElement): any {
		let element = input as TreeElement;
		OutlineModel.get(element).updateMatches('');
		return (element).parent;
	}

	protected _getInitialSelection(_tree: ITree, input: BreadcrumbElement): any {
		return input;
	}

	protected _completeTreeConfiguration(config: ITreeConfiguration2): ITreeConfiguration2 {
		config.dataSource = this._instantiationService.createInstance(OutlineDataSource);
		config.renderer = this._instantiationService.createInstance(HighlightingOutlineRenderer);
		config.sorter = new OutlineItemComparator();
		return config;
	}

	protected _onDidChangeSelection(e: ISelectionEvent): void {
		if (e.payload && e.payload.didClickOnTwistie) {
			return;
		}
		let [first] = e.selection;
		if (first instanceof OutlineElement) {
			this._onDidPickElement.fire(first);
		}
	}
}

//#endregion

//#region config

export abstract class BreadcrumbsConfig<T> {

	name: string;
	value: T;
	onDidChange: Event<T>;
	abstract dispose(): void;

	private constructor() {
		// internal
	}

	static IsEnabled = BreadcrumbsConfig._stub<boolean>('breadcrumbs.enabled');

	private static _stub<T>(name: string): { bindTo(service: IConfigurationService): BreadcrumbsConfig<T> } {
		return {
			bindTo(service) {
				let value: T = service.getValue(name);
				let onDidChange = new Emitter<T>();

				let listener = service.onDidChangeConfiguration(e => {
					if (e.affectsConfiguration(name)) {
						value = service.getValue(name);
						onDidChange.fire(value);
					}
				});

				return {
					name,
					get value() { return value; },
					onDidChange: onDidChange.event,
					dispose(): void {
						listener.dispose();
						onDidChange.dispose();
					}
				};
			}
		};
	}
}

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'breadcrumbs',
	title: localize('title', "Breadcrumb Navigation"),
	order: 101,
	type: 'object',
	properties: {
		'breadcrumbs.enabled': {
			'description': localize('enabled', "Enable/disable navigation breadcrumbss"),
			'type': 'boolean',
			'default': false
		}
	}
});

//#endregion

//#region commands

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.focus',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_DOT,
	when: BreadcrumbsControl.CK_BreadcrumbsVisible,
	handler(accessor) {
		const groups = accessor.get(IEditorGroupsService);
		const breadcrumbs = accessor.get(IBreadcrumbsService);
		//todo@joh focus last?
		breadcrumbs.getWidget(groups.activeGroup.id).domFocus();
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.focusNext',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	primary: KeyCode.RightArrow,
	secondary: [KeyMod.Shift | KeyCode.RightArrow],
	when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive),
	handler(accessor) {
		const groups = accessor.get(IEditorGroupsService);
		const breadcrumbs = accessor.get(IBreadcrumbsService);
		breadcrumbs.getWidget(groups.activeGroup.id).focusNext();
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.focusPrevious',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	primary: KeyCode.LeftArrow,
	secondary: [KeyMod.Shift | KeyCode.LeftArrow],
	when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive),
	handler(accessor) {
		const groups = accessor.get(IEditorGroupsService);
		const breadcrumbs = accessor.get(IBreadcrumbsService);
		breadcrumbs.getWidget(groups.activeGroup.id).focusPrev();
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.selectFocused',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	primary: KeyCode.Enter,
	secondary: [KeyCode.DownArrow, KeyCode.Space],
	when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive),
	handler(accessor) {
		const groups = accessor.get(IEditorGroupsService);
		const breadcrumbs = accessor.get(IBreadcrumbsService);
		const widget = breadcrumbs.getWidget(groups.activeGroup.id);
		widget.setSelection(widget.getFocused());
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.selectEditor',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive),
	handler(accessor) {
		const groups = accessor.get(IEditorGroupsService);
		const breadcrumbs = accessor.get(IBreadcrumbsService);
		breadcrumbs.getWidget(groups.activeGroup.id).setFocused(undefined);
		breadcrumbs.getWidget(groups.activeGroup.id).setSelection(undefined);
		groups.activeGroup.activeControl.focus();
	}
});

//#endregion
