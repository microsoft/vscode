/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as dom from 'vs/base/browser/dom';
import { BreadcrumbsItem, BreadcrumbsWidget, IBreadcrumbsItemEvent } from 'vs/base/browser/ui/breadcrumbs/breadcrumbsWidget';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { dispose, IDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { isEqual, basenameOrAuthority } from 'vs/base/common/resources';
import URI from 'vs/base/common/uri';
import 'vs/css!./media/breadcrumbscontrol';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { OutlineElement, OutlineGroup, OutlineModel, TreeElement } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { FileKind, IFileService } from 'vs/platform/files/common/files';
import { IConstructorSignature2, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { attachBreadcrumbsStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { FileLabel } from 'vs/workbench/browser/labels';
import { BreadcrumbElement, EditorBreadcrumbsModel, FileElement } from 'vs/workbench/browser/parts/editor/breadcrumbsModel';
import { EditorGroupView } from 'vs/workbench/browser/parts/editor/editorGroupView';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';
import { IBreadcrumbsService } from 'vs/workbench/browser/parts/editor/breadcrumbs';
import { symbolKindToCssClass } from 'vs/editor/common/modes';
import { BreadcrumbsPicker, BreadcrumbsFilePicker, BreadcrumbsOutlinePicker } from 'vs/workbench/browser/parts/editor/breadcrumbsPicker';

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
			if (this.options.showFileIcons) {
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

			if (this.options.showSymbolIcons) {
				let icon = document.createElement('div');
				icon.className = `symbol-icon ${symbolKindToCssClass(this.element.symbol.kind)}`;
				container.appendChild(icon);
				container.classList.add('shows-symbol-icon');
			}

			let label = new IconLabel(container);
			label.setValue(this.element.symbol.name.replace(/\r|\n|\r\n/g, '\u23CE'));
			this._disposables.push(label);
		}
	}
}

export interface IBreadcrumbsControlOptions {
	showFileIcons: boolean;
	showSymbolIcons: boolean;
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

	isHidden(): boolean {
		return dom.hasClass(this.domNode, 'hidden');
	}

	hide(): void {
		this._breadcrumbsDisposables = dispose(this._breadcrumbsDisposables);
		this._ckBreadcrumbsVisible.set(false);
		dom.toggleClass(this.domNode, 'hidden', true);
	}

	update(): boolean {
		const input = this._editorGroup.activeEditor;
		this._breadcrumbsDisposables = dispose(this._breadcrumbsDisposables);

		if (!input || !input.getResource() || !this._fileService.canHandleResource(input.getResource())) {
			// cleanup and return when there is no input or when
			// we cannot handle this input
			if (!this.isHidden()) {
				this.hide();
				return true;
			} else {
				return false;
			}
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
		return true;
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
