/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as dom from 'vs/base/browser/dom';
import { BreadcrumbsItem, BreadcrumbsWidget, IBreadcrumbsItemEvent } from 'vs/base/browser/ui/breadcrumbs/breadcrumbsWidget';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { compareFileNames } from 'vs/base/common/comparers';
import { debounceEvent, Emitter, Event } from 'vs/base/common/event';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { dispose, IDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { dirname, isEqual } from 'vs/base/common/resources';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDataSource, IRenderer, ISelectionEvent, ISorter, ITree, ITreeConfiguration } from 'vs/base/parts/tree/browser/tree';
import 'vs/css!./media/breadcrumbs';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { OutlineElement, OutlineGroup, OutlineModel, TreeElement } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { OutlineController, OutlineDataSource, OutlineItemComparator, OutlineRenderer } from 'vs/editor/contrib/documentSymbols/outlineTree';
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
import { attachBreadcrumbsStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { FileLabel } from 'vs/workbench/browser/labels';
import { BreadcrumbElement, EditorBreadcrumbsModel, FileElement } from 'vs/workbench/browser/parts/editor/breadcrumbsModel';
import { EditorGroupView } from 'vs/workbench/browser/parts/editor/editorGroupView';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IBreadcrumbsService } from 'vs/workbench/browser/parts/editor/breadcrumbs';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';

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
			label.setValue(this.element.symbol.name.replace(/\r|\n|\r\n/g, '\u23CE'));
			this._disposables.push(label);
		}
	}
}

export class BreadcrumbsControl {

	static CK_BreadcrumbsVisible = new RawContextKey('breadcrumbsVisible', false);
	static CK_BreadcrumbsActive = new RawContextKey('breadcrumbsActive', false);

	private readonly _ckBreadcrumbsVisible: IContextKey<boolean>;
	private readonly _ckBreadcrumbsActive: IContextKey<boolean>;

	private readonly _domNode: HTMLDivElement;
	private readonly _widget: BreadcrumbsWidget;
	private _disposables = new Array<IDisposable>();

	private _breadcrumbsDisposables = new Array<IDisposable>();
	private _breadcrumbsPickerShowing = false;

	constructor(
		container: HTMLElement,
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
		this._domNode = document.createElement('div');
		dom.addClasses(this._domNode, 'breadcrumbs-control');
		dom.append(container, this._domNode);

		this._widget = new BreadcrumbsWidget(this._domNode);
		this._widget.onDidSelectItem(this._onDidSelectItem, this, this._disposables);
		this._widget.onDidFocusItem(this._onDidSelectItem, this, this._disposables);
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
		this._domNode.remove();
	}

	getPreferredHeight(): number {
		return 25;
	}

	layout(dim: dom.Dimension): void {
		if (dim) {
			this._domNode.style.width = `${dim.width}px`;
			this._domNode.style.height = `${dim.height}px`;
		}
		this._widget.layout(dim);
	}

	setActive(value: boolean): void {
		dom.toggleClass(this._domNode, 'active', value);
	}

	update(): void {
		const input = this._editorGroup.activeEditor;
		this._breadcrumbsDisposables = dispose(this._breadcrumbsDisposables);

		if (!input || !input.getResource() || !this._fileService.canHandleResource(input.getResource())) {
			// cleanup and return when there is no input or when
			// we cannot handle this input
			this._ckBreadcrumbsVisible.set(false);
			dom.toggleClass(this._domNode, 'hidden', true);
			return;
		}

		dom.toggleClass(this._domNode, 'hidden', false);
		this._ckBreadcrumbsVisible.set(true);

		let control = this._editorGroup.activeControl.getControl() as ICodeEditor;
		let model = new EditorBreadcrumbsModel(input.getResource(), isCodeEditor(control) ? control : undefined, this._workspaceService);
		let listener = model.onDidUpdate(_ => this._widget.setItems(model.getElements().map(element => new Item(element, this._instantiationService))));
		this._widget.setItems(model.getElements().map(element => new Item(element, this._instantiationService)));
		this._breadcrumbsDisposables = [model, listener];
	}

	focus(): void {
		this._widget.domFocus();
	}

	focusNext(): void {
		this._widget.focusNext();
	}

	focusPrev(): void {
		this._widget.focusPrev();
	}

	select(): void {
		const item = this._widget.getFocused();
		if (item) {
			this._widget.setSelected(item);
		}
	}

	private _onDidSelectItem(event: IBreadcrumbsItemEvent): void {
		if (!event.item) {
			return;
		}

		if (event.type === 'focus' && !this._breadcrumbsPickerShowing) {
			// focus change only moves the picker when already active
			return;
		}

		this._editorGroup.focus();
		this._contextViewService.showContextView({
			getAnchor() {
				return event.node;
			},
			render: (parent: HTMLElement) => {
				const container = document.createElement('div');
				parent.appendChild(container);
				const theme = this._themeService.getTheme();
				const color = theme.getColor(editorBackground).darken(theme.type === 'dark' ? .2 : .1);
				container.style.borderColor = color.toString();
				container.style.boxShadow = `2px 2px 3px ${color.toString()}`;
				container.style.position = 'absolute';
				container.style.zIndex = '1000';
				dom.addClasses(container, 'monaco-breadcrumbs-picker', 'monaco-workbench', 'show-file-icons');

				let { element } = event.item as Item;
				let ctor: IConstructorSignature2<HTMLElement, BreadcrumbElement, BreadcrumbsPicker> = element instanceof FileElement ? BreadcrumbsFilePicker : BreadcrumbsOutlinePicker;
				let res = this._instantiationService.createInstance(ctor, container, element);
				res.layout({ width: 250, height: 300 });
				let listener = res.onDidPickElement(data => {
					this._contextViewService.hideContextView();
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

	readonly focus: dom.IFocusTracker;

	protected readonly _onDidPickElement = new Emitter<any>();
	readonly onDidPickElement: Event<any> = this._onDidPickElement.event;

	protected readonly _disposables = new Array<IDisposable>();
	protected readonly _domNode: HTMLDivElement;
	protected readonly _tree: WorkbenchTree;

	constructor(
		container: HTMLElement,
		input: BreadcrumbElement,
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
		this._tree.setInput(this._getInput(input)).then(_ => {
			this._tree.focusFirst();
			this._tree.domFocus();
		}, onUnexpectedError);
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

	protected abstract _getInput(input: BreadcrumbElement): any;
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


	protected _getInput(input: BreadcrumbElement): any {
		let { uri } = (input as FileElement);
		return dirname(uri);
	}

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

	protected _getInput(input: BreadcrumbElement): any {
		return (input as TreeElement).parent;
	}

	protected _completeTreeConfiguration(config: ITreeConfiguration): ITreeConfiguration {
		config.dataSource = this._instantiationService.createInstance(OutlineDataSource);
		config.renderer = this._instantiationService.createInstance(OutlineRenderer);
		config.controller = this._instantiationService.createInstance(OutlineController, {});
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
	secondary: [KeyCode.UpArrow, KeyCode.Space],
	when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive),
	handler(accessor) {
		const groups = accessor.get(IEditorGroupsService);
		const breadcrumbs = accessor.get(IBreadcrumbsService);
		const widget = breadcrumbs.getWidget(groups.activeGroup.id);
		widget.setSelected(widget.getFocused());
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
		groups.activeGroup.activeControl.focus();
	}
});

//#endregion
