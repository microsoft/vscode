/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as dom from 'vs/base/browser/dom';
import { BreadcrumbsItem, BreadcrumbsWidget } from 'vs/base/browser/ui/breadcrumbs/breadcrumbsWidget';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { compareFileNames } from 'vs/base/common/comparers';
import { debounceEvent, Emitter, Event } from 'vs/base/common/event';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDataSource, IRenderer, ISelectionEvent, ISorter, ITree, ITreeConfiguration } from 'vs/base/parts/tree/browser/tree';
import 'vs/css!./media/editorbreadcrumbs';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { OutlineElement, OutlineGroup, TreeElement } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { OutlineController, OutlineDataSource, OutlineItemComparator, OutlineRenderer } from 'vs/editor/contrib/documentSymbols/outlineTree';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { FileKind, IFileService, IFileStat } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { WorkbenchTree } from 'vs/platform/list/browser/listService';
import { attachBreadcrumbsStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { FileLabel } from 'vs/workbench/browser/labels';
import { BreadcrumbElement, EditorBreadcrumbsModel, FileElement } from 'vs/workbench/browser/parts/editor/editorBreadcrumbsModel';
import { EditorInput } from 'vs/workbench/common/editor';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { IEditorBreadcrumbs, IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';


class Item extends BreadcrumbsItem {

	private readonly _disposables: IDisposable[] = [];

	constructor(
		readonly element: BreadcrumbElement,
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
			let label = this._instantiationService.createInstance(FileLabel, container, {});
			label.setFile(this.element.uri, {
				hidePath: true,
				fileKind: this.element.isFile ? FileKind.FILE : FileKind.FOLDER
			});
			this._disposables.push(label);

		} else if (this.element instanceof OutlineGroup) {
			// provider
			let label = new IconLabel(container);
			label.setValue(this.element.provider.displayName);
			this._disposables.push(label);

		} else if (this.element instanceof OutlineElement) {
			// symbol
			let label = new IconLabel(container);
			label.setValue(this.element.symbol.name);
			this._disposables.push(label);
		}
	}
}

export class EditorBreadcrumbs implements IEditorBreadcrumbs {

	static CK_BreadcrumbsVisible = new RawContextKey('breadcrumbsVisible', false);
	static CK_BreadcrumbsFocused = new RawContextKey('breadcrumbsFocused', false);

	private readonly _ckBreadcrumbsVisible: IContextKey<boolean>;
	private readonly _ckBreadcrumbsFocused: IContextKey<boolean>;

	private readonly _disposables = new Array<IDisposable>();
	private readonly _domNode: HTMLDivElement;
	private readonly _widget: BreadcrumbsWidget;

	private _breadcrumbsDisposables = new Array<IDisposable>();

	constructor(
		container: HTMLElement,
		private readonly _editorGroup: IEditorGroup,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceService: IWorkspaceContextService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		this._domNode = document.createElement('div');
		dom.addClasses(this._domNode, 'editor-breadcrumbs', 'show-file-icons');
		dom.append(container, this._domNode);

		this._widget = new BreadcrumbsWidget(this._domNode);
		this._widget.onDidSelectItem(this._onDidSelectItem, this, this._disposables);
		this._widget.onDidChangeFocus(val => this._ckBreadcrumbsFocused.set(val), undefined, this._disposables);
		this._disposables.push(attachBreadcrumbsStyler(this._widget, this._themeService));

		this._ckBreadcrumbsVisible = EditorBreadcrumbs.CK_BreadcrumbsVisible.bindTo(this._contextKeyService);
		this._ckBreadcrumbsFocused = EditorBreadcrumbs.CK_BreadcrumbsFocused.bindTo(this._contextKeyService);
	}

	dispose(): void {
		dispose(this._disposables);
		this._widget.dispose();
		this._ckBreadcrumbsVisible.reset();
	}

	getPreferredHeight(): number {
		return 25;
	}

	layout(dim: dom.Dimension): void {
		this._domNode.style.width = `${dim.width}px`;
		this._domNode.style.height = `${dim.height}px`;
		this._widget.layout(dim);
	}

	setActive(value: boolean): void {
		dom.toggleClass(this._domNode, 'active', value);
	}

	openEditor(input: EditorInput): void {

		this._breadcrumbsDisposables = dispose(this._breadcrumbsDisposables);

		let uri = input.getResource();
		if (!uri || !this._fileService.canHandleResource(uri)) {
			return this.closeEditor(undefined);
		}

		dom.toggleClass(this._domNode, 'hidden', false);
		this._ckBreadcrumbsVisible.set(true);

		let control = this._editorGroup.activeControl.getControl() as ICodeEditor;
		let model = new EditorBreadcrumbsModel(input.getResource(), isCodeEditor(control) ? control : undefined, this._workspaceService);
		let listener = model.onDidUpdate(_ => this._widget.setItems(model.getElements().map(element => new Item(element, this._instantiationService))));
		this._widget.setItems(model.getElements().map(element => new Item(element, this._instantiationService)));

		this._breadcrumbsDisposables.push(model, listener);


		// const render = (element: FileElement, target: HTMLElement, disposables: IDisposable[]) => {
		// 	let label = this._instantiationService.createInstance(FileLabel, target, {});
		// 	label.setFile(element.uri, { fileKind: element.kind, hidePath: true, fileDecorations: { colors: false, badges: false } });
		// 	disposables.push(label);
		// };

		// let fileItems: RenderedBreadcrumbsItem<FileElement>[] = [];
		// let workspace = this._workspaceService.getWorkspaceFolder(uri);
		// let path = uri.path;

		// while (true) {
		// 	let first = fileItems.length === 0;
		// 	let name = paths.basename(path);
		// 	uri = uri.with({ path });
		// 	if (workspace && isEqual(workspace.uri, uri, true)) {
		// 		break;
		// 	}
		// 	fileItems.unshift(new RenderedBreadcrumbsItem<FileElement>(
		// 		render,
		// 		new FileElement(name, first ? FileKind.FILE : FileKind.FOLDER, uri),
		// 		!first
		// 	));
		// 	path = paths.dirname(path);
		// 	if (path === '/') {
		// 		break;
		// 	}
		// }

		// this._widget.splice(0, this._widget.items().length, fileItems);

		// let control = this._editorGroup.activeControl.getControl() as ICodeEditor;

		// let model = new EditorBreadcrumbsModel(input.getResource(), isCodeEditor(control) ? control : undefined, this._workspaceService);
		// let listener = model.onDidUpdate(_ => console.log(model.getElements()));
		// console.log(model.getElements());
		// this._breadcrumbsDisposables.push(model, listener);

		// if (!isCodeEditor(control)) {
		// 	return;
		// }


		// let oracle = new class extends Emitter<void> {

		// 	private readonly _listener: IDisposable[] = [];

		// 	constructor() {
		// 		super();
		// 		DocumentSymbolProviderRegistry.onDidChange(_ => this.fire());
		// 		this._listener.push(control.onDidChangeModel(_ => this._checkModel()));
		// 		this._listener.push(control.onDidChangeModelLanguage(_ => this._checkModel()));
		// 		this._listener.push(setDisposableTimeout(_ => this._checkModel(), 0));
		// 	}

		// 	private _checkModel() {
		// 		if (control.getModel() && isEqual(control.getModel().uri, input.getResource())) {
		// 			this.fire();
		// 		}
		// 	}

		// 	dispose(): void {
		// 		dispose(this._listener);
		// 		super.dispose();
		// 	}
		// };

		// this._breadcrumbsDisposables.push(oracle);

		// oracle.event(async _ => {
		// 	let model = await asDisposablePromise(OutlineModel.create(control.getModel(), CancellationToken.None), undefined, this._breadcrumbsDisposables).promise;
		// 	if (!model) {
		// 		return;
		// 	}
		// 	type OutlineItem = OutlineElement | OutlineGroup;

		// 	let render = (element: OutlineItem, target: HTMLElement, disposables: IDisposable[]) => {
		// 		let label = this._instantiationService.createInstance(FileLabel, target, {});
		// 		if (element instanceof OutlineElement) {
		// 			label.setLabel({ name: element.symbol.name });
		// 		} else {
		// 			label.setLabel({ name: element.provider.displayName });
		// 		}
		// 		disposables.push(label);
		// 	};

		// 	let showOutlineForPosition = (position: IPosition) => {
		// 		let element = model.getItemEnclosingPosition(position) as TreeElement;
		// 		let outlineItems: RenderedBreadcrumbsItem<OutlineItem>[] = [];
		// 		while (element instanceof OutlineGroup || element instanceof OutlineElement) {
		// 			outlineItems.unshift(new RenderedBreadcrumbsItem<OutlineItem>(render, element, !!first(element.children)));
		// 			element = element.parent;
		// 		}
		// 		// todo@joh compare items for equality and only update changed...
		// 		this._widget.splice(fileItems.length, this._widget.items().length - fileItems.length, outlineItems);
		// 	};

		// 	showOutlineForPosition(control.getPosition());
		// 	debounceEvent(control.onDidChangeCursorPosition, (last, cur) => cur, 100)(_ => showOutlineForPosition(control.getPosition()), undefined, this._breadcrumbsDisposables);
		// });
	}

	closeEditor(input: EditorInput): void {
		this._ckBreadcrumbsVisible.set(false);
		dom.toggleClass(this._domNode, 'hidden', true);
	}

	focus(): void {
		this._widget.focus();
	}

	focusNext(): void {
		this._widget.focusNext();
	}

	focusPrev(): void {
		this._widget.focusPrev();
	}

	select(): void {
		const item = this._widget.getFocusedItem();
		if (item) {
			this._widget.select(item);
		}
	}

	private _onDidSelectItem(item: Item): void {
		this._editorGroup.focus();

		// let ctor: IConstructorSignature2<HTMLElement, any, BreadcrumbsPicker>;
		// let input: any;
		// if (item.element instanceof FileElement) {
		// 	ctor = BreadcrumbsFilePicker;
		// 	input = dirname(item.element.uri);
		// } else {
		// 	ctor = BreadcrumbsOutlinePicker;
		// 	input = item.element.parent;
		// }

		// this._contextViewService.showContextView({
		// 	getAnchor() {
		// 		return item.node;
		// 	},
		// 	render: (container: HTMLElement) => {
		// 		dom.addClasses(container, 'show-file-icons');
		// 		let res = this._instantiationService.createInstance(ctor, container, input);
		// 		res.layout({ width: 250, height: 300 });
		// 		res.onDidPickElement(data => {
		// 			this._contextViewService.hideContextView();
		// 			this._widget.select(undefined);
		// 			if (!data) {
		// 				return;
		// 			}
		// 			if (URI.isUri(data)) {
		// 				// open new editor
		// 				this._editorService.openEditor({ resource: data });

		// 			} else if (data instanceof OutlineElement) {

		// 				let resource: URI;
		// 				let candidate = data.parent;
		// 				while (candidate) {
		// 					if (candidate instanceof OutlineModel) {
		// 						resource = candidate.textModel.uri;
		// 						break;
		// 					}
		// 					candidate = candidate.parent;
		// 				}

		// 				this._editorService.openEditor({ resource, options: { selection: Range.collapseToStart(data.symbol.selectionRange) } });

		// 			}
		// 		});
		// 		return res;
		// 	},
		// });
	}
}

export abstract class BreadcrumbsPicker {

	readonly focus: dom.IFocusTracker;

	protected readonly _onDidPickElement = new Emitter<any>();
	readonly onDidPickElement: Event<any> = this._onDidPickElement.event;

	protected readonly _disposables = new Array<IDisposable>();
	protected readonly _domNode: HTMLDivElement;
	protected readonly _tree: WorkbenchTree;

	constructor(
		container: HTMLElement,
		input: any,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IThemeService protected readonly _themeService: IThemeService,
	) {
		this._domNode = document.createElement('div');
		this._domNode.style.background = this._themeService.getTheme().getColor(SIDE_BAR_BACKGROUND).toString();
		container.appendChild(this._domNode);

		this._tree = this._instantiationService.createInstance(WorkbenchTree, this._domNode, this._completeTreeConfiguration({ dataSource: undefined }), {});
		debounceEvent(this._tree.onDidChangeSelection, (_last, cur) => cur, 0)(this._onDidChangeSelection, this, this._disposables);

		this.focus = dom.trackFocus(this._domNode);
		this.focus.onDidBlur(_ => this._onDidPickElement.fire(undefined), undefined, this._disposables);

		this._tree.domFocus();
		this._tree.setInput(input);
	}

	dispose(): void {
		dispose(this._disposables);
		this._onDidPickElement.dispose();
		this._tree.dispose();
		this.focus.dispose();
	}

	layout(dim: dom.Dimension) {
		this._domNode.style.width = `${dim.width}px`;
		this._domNode.style.height = `${dim.height}px`;
		this._tree.layout(dim.height, dim.width);
	}

	protected abstract _completeTreeConfiguration(config: ITreeConfiguration): ITreeConfiguration;
	protected abstract _onDidChangeSelection(e: any): void;
}

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

export class FileRenderer implements IRenderer {

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	getHeight(tree: ITree, element: any): number {
		return 22;
	}

	getTemplateId(tree: ITree, element: any): string {
		return 'FileStat';
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement) {
		return this._instantiationService.createInstance(FileLabel, container, {});
	}

	renderElement(tree: ITree, element: IFileStat, templateId: string, templateData: FileLabel): void {
		templateData.setFile(element.resource, {
			hidePath: true,
			fileKind: element.isDirectory ? FileKind.FOLDER : FileKind.FILE,
			fileDecorations: { colors: true, badges: true }
		});
	}

	disposeTemplate(tree: ITree, templateId: string, templateData: FileLabel): void {
		templateData.dispose();
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


	protected _completeTreeConfiguration(config: ITreeConfiguration): ITreeConfiguration {
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

export class BreadcrumbsOutlinePicker extends BreadcrumbsPicker {

	protected _completeTreeConfiguration(config: ITreeConfiguration): ITreeConfiguration {
		config.dataSource = this._instantiationService.createInstance(OutlineDataSource);
		config.renderer = this._instantiationService.createInstance(OutlineRenderer);
		config.controller = this._instantiationService.createInstance(OutlineController, {});
		config.sorter = new OutlineItemComparator();
		return config;
	}

	protected _onDidChangeSelection(e: ISelectionEvent): void {
		if (e.payload && !e.payload.didClickElement) {
			return;
		}
		let [first] = e.selection;
		if (first instanceof OutlineElement) {
			this._onDidPickElement.fire(first);
		}
	}
}

//#region commands

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.focus',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_DOT,
	when: EditorBreadcrumbs.CK_BreadcrumbsVisible,
	handler(accessor) {
		let groups = accessor.get(IEditorGroupsService);
		groups.activeGroup.breadcrumbs.focus();
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.focusNext',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	primary: KeyCode.RightArrow,
	when: ContextKeyExpr.and(EditorBreadcrumbs.CK_BreadcrumbsVisible, EditorBreadcrumbs.CK_BreadcrumbsFocused),
	handler(accessor) {
		let groups = accessor.get(IEditorGroupsService);
		groups.activeGroup.breadcrumbs.focusNext();
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.focusPrevious',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	primary: KeyCode.LeftArrow,
	when: ContextKeyExpr.and(EditorBreadcrumbs.CK_BreadcrumbsVisible, EditorBreadcrumbs.CK_BreadcrumbsFocused),
	handler(accessor) {
		let groups = accessor.get(IEditorGroupsService);
		groups.activeGroup.breadcrumbs.focusPrev();
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.selectFocused',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	primary: KeyCode.Enter,
	secondary: [KeyCode.UpArrow, KeyCode.Space],
	when: ContextKeyExpr.and(EditorBreadcrumbs.CK_BreadcrumbsVisible, EditorBreadcrumbs.CK_BreadcrumbsFocused),
	handler(accessor) {
		let groups = accessor.get(IEditorGroupsService);
		groups.activeGroup.breadcrumbs.select();
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.selectEditor',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	primary: KeyCode.Escape,
	when: ContextKeyExpr.and(EditorBreadcrumbs.CK_BreadcrumbsVisible, EditorBreadcrumbs.CK_BreadcrumbsFocused),
	handler(accessor) {
		let groups = accessor.get(IEditorGroupsService);
		groups.activeGroup.activeControl.focus();
	}
});

//#endregion
