/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as dom from 'vs/base/browser/dom';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { BreadcrumbsItem, BreadcrumbsWidget, IBreadcrumbsItemEvent } from 'vs/base/browser/ui/breadcrumbs/breadcrumbsWidget';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { combinedDisposable, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isEqual } from 'vs/base/common/resources';
import 'vs/css!./media/breadcrumbscontrol';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { symbolKindToCssClass } from 'vs/editor/common/modes';
import { OutlineElement, OutlineGroup, OutlineModel, TreeElement } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { FileKind, IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { attachBreadcrumbsStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { FileLabel } from 'vs/workbench/browser/labels';
import { BreadcrumbsConfig, IBreadcrumbsService } from 'vs/workbench/browser/parts/editor/breadcrumbs';
import { BreadcrumbElement, EditorBreadcrumbsModel, FileElement } from 'vs/workbench/browser/parts/editor/breadcrumbsModel';
import { createBreadcrumbsPicker, BreadcrumbsPicker } from 'vs/workbench/browser/parts/editor/breadcrumbsPicker';
import { EditorGroupView } from 'vs/workbench/browser/parts/editor/editorGroupView';
import { IEditorService, SIDE_GROUP, SIDE_GROUP_TYPE, ACTIVE_GROUP_TYPE, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { localize } from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { tail } from 'vs/base/common/arrays';
import { WorkbenchListFocusContextKey } from 'vs/platform/list/browser/listService';

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
			let label = this._instantiationService.createInstance(FileLabel, container, {});
			label.setFile(this.element.uri, {
				hidePath: true,
				hideIcon: this.element.kind === FileKind.FOLDER || !this.options.showFileIcons,
				fileKind: this.element.kind,
				fileDecorations: { colors: this.options.showDecorationColors, badges: false },
			});
			dom.addClass(container, FileKind[this.element.kind].toLowerCase());
			this._disposables.push(label);

		} else if (this.element instanceof OutlineModel) {
			// has outline element but not in one
			let label = document.createElement('div');
			label.innerHTML = '&hellip;';
			label.className = 'hint-more';
			container.appendChild(label);

		} else if (this.element instanceof OutlineGroup) {
			// provider
			let label = new IconLabel(container);
			label.setValue(this.element.provider.displayName);
			this._disposables.push(label);

		} else if (this.element instanceof OutlineElement) {
			// symbol
			if (this.options.showSymbolIcons) {
				let icon = document.createElement('div');
				icon.className = symbolKindToCssClass(this.element.symbol.kind);
				container.appendChild(icon);
				dom.addClass(container, 'shows-symbol-icon');
			}
			let label = new IconLabel(container);
			let title = this.element.symbol.name.replace(/\r|\n|\r\n/g, '\u23CE');
			label.setValue(title);
			this._disposables.push(label);
		}
	}
}

export interface IBreadcrumbsControlOptions {
	showFileIcons: boolean;
	showSymbolIcons: boolean;
	showDecorationColors: boolean;
	extraClasses: string[];
}

export class BreadcrumbsControl {

	static HEIGHT = 25;

	static readonly Payload_Reveal = {};
	static readonly Payload_RevealAside = {};
	static readonly Payload_Pick = {};

	static CK_BreadcrumbsVisible = new RawContextKey('breadcrumbsVisible', false);
	static CK_BreadcrumbsActive = new RawContextKey('breadcrumbsActive', false);

	private readonly _ckBreadcrumbsVisible: IContextKey<boolean>;
	private readonly _ckBreadcrumbsActive: IContextKey<boolean>;

	private readonly _cfUseQuickPick: BreadcrumbsConfig<boolean>;

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
		@IWorkspaceContextService private readonly _workspaceService: IWorkspaceContextService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IThemeService private readonly _themeService: IThemeService,
		@IQuickOpenService private readonly _quickOpenService: IQuickOpenService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@IBreadcrumbsService breadcrumbsService: IBreadcrumbsService,
	) {
		this.domNode = document.createElement('div');
		dom.addClass(this.domNode, 'breadcrumbs-control');
		dom.addClasses(this.domNode, ..._options.extraClasses);
		dom.append(container, this.domNode);

		this._widget = new BreadcrumbsWidget(this.domNode);
		this._widget.onDidSelectItem(this._onSelectEvent, this, this._disposables);
		this._widget.onDidFocusItem(this._onFocusEvent, this, this._disposables);
		this._widget.onDidChangeFocus(this._updateCkBreadcrumbsActive, this, this._disposables);
		this._disposables.push(attachBreadcrumbsStyler(this._widget, this._themeService));

		this._ckBreadcrumbsVisible = BreadcrumbsControl.CK_BreadcrumbsVisible.bindTo(this._contextKeyService);
		this._ckBreadcrumbsActive = BreadcrumbsControl.CK_BreadcrumbsActive.bindTo(this._contextKeyService);

		this._cfUseQuickPick = BreadcrumbsConfig.UseQuickPick.bindTo(_configurationService);

		this._disposables.push(breadcrumbsService.register(this._editorGroup.id, this._widget));
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
		this._breadcrumbsDisposables = dispose(this._breadcrumbsDisposables);
		this._ckBreadcrumbsVisible.reset();
		this._ckBreadcrumbsActive.reset();
		this._cfUseQuickPick.dispose();
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

		if (!input || !input.getResource() || (input.getResource().scheme !== Schemas.untitled && !this._fileService.canHandleResource(input.getResource()))) {
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
		let model = new EditorBreadcrumbsModel(input.getResource(), isCodeEditor(control) ? control : undefined, this._workspaceService, this._configurationService);
		dom.toggleClass(this.domNode, 'relative-path', model.isRelative());

		let updateBreadcrumbs = () => {
			let items = model.getElements().map(element => new Item(element, this._options, this._instantiationService));
			this._widget.setItems(items);
			this._widget.reveal(items[items.length - 1]);
		};
		let listener = model.onDidUpdate(updateBreadcrumbs);
		updateBreadcrumbs();
		this._breadcrumbsDisposables = [model, listener];

		// close picker on hide/update
		this._breadcrumbsDisposables.push({
			dispose: () => {
				if (this._breadcrumbsPickerShowing) {
					this._contextViewService.hideContextView(this);
				}
			}
		});

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
		const { element } = event.item as Item;

		const group = this._getEditorGroup(event.payload);
		if (group !== undefined) {
			// reveal the item
			this._widget.setFocused(undefined);
			this._widget.setSelection(undefined);
			this._revealInEditor(event, element, group);
			return;
		}

		if (this._cfUseQuickPick.value) {
			// using quick pick
			this._widget.setFocused(undefined);
			this._widget.setSelection(undefined);
			this._quickOpenService.show(element instanceof TreeElement ? '@' : '');
			return;
		}

		// show picker
		let picker: BreadcrumbsPicker;
		this._contextViewService.showContextView({
			render: (parent: HTMLElement) => {
				picker = createBreadcrumbsPicker(this._instantiationService, parent, element);
				let listener = picker.onDidPickElement(data => {
					this._contextViewService.hideContextView(this);
					this._revealInEditor(event, data.target, this._getEditorGroup(data.payload && data.payload.originalEvent));
				});
				this._breadcrumbsPickerShowing = true;
				this._updateCkBreadcrumbsActive();

				return combinedDisposable([listener, picker]);
			},
			getAnchor() {

				let pickerHeight = 330;
				let pickerWidth = Math.max(220, dom.getTotalWidth(event.node));
				let pickerArrowSize = 8;
				let pickerArrowOffset: number;

				let data = dom.getDomNodePagePosition(event.node.firstChild as HTMLElement);
				let y = data.top + data.height - pickerArrowSize;
				let x = data.left;
				if (x + pickerWidth >= window.innerWidth) {
					x = window.innerWidth - pickerWidth;
				}
				if (event.payload instanceof StandardMouseEvent) {
					pickerArrowOffset = event.payload.posx - x - pickerArrowSize;
				} else {
					pickerArrowOffset = (data.left + (data.width * .3)) - x;
				}
				picker.layout(pickerHeight, pickerWidth, pickerArrowSize, Math.max(0, pickerArrowOffset));
				picker.setInput(element);
				return { x, y };
			},
			onHide: (data) => {
				this._breadcrumbsPickerShowing = false;
				this._updateCkBreadcrumbsActive();
				if (data === this) {
					this._widget.setFocused(undefined);
					this._widget.setSelection(undefined);
				}
			}
		});
	}

	private _updateCkBreadcrumbsActive(): void {
		const value = this._widget.isDOMFocused() || this._breadcrumbsPickerShowing;
		this._ckBreadcrumbsActive.set(value);
	}

	private _revealInEditor(event: IBreadcrumbsItemEvent, element: any, group: SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): void {
		if (element instanceof FileElement) {
			if (element.kind === FileKind.FILE) {
				// open file in editor
				this._editorService.openEditor({ resource: element.uri }, group);
			} else {
				// show next picker
				let items = this._widget.getItems();
				let idx = items.indexOf(event.item);
				this._widget.setFocused(items[idx + 1]);
				this._widget.setSelection(items[idx + 1], BreadcrumbsControl.Payload_Pick);
			}

		} else if (element instanceof OutlineElement) {
			// open symbol in editor
			let model = OutlineModel.get(element);
			this._editorService.openEditor({
				resource: model.textModel.uri,
				options: { selection: Range.collapseToStart(element.symbol.selectionRange) }
			}, group);
		}
	}

	private _getEditorGroup(data: StandardMouseEvent | object): SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE | undefined {
		if (data === BreadcrumbsControl.Payload_RevealAside || (data instanceof StandardMouseEvent && data.altKey)) {
			return SIDE_GROUP;
		} else if (data === BreadcrumbsControl.Payload_Reveal || (data instanceof StandardMouseEvent && data.metaKey)) {
			return ACTIVE_GROUP;
		} else {
			return undefined;
		}
	}
}

//#region commands

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: 'breadcrumbs.toggle',
		title: localize('cmd.toggle', "Toggle Breadcrumbs")
	}
});
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '5_editor',
	order: 99,
	command: {
		id: 'breadcrumbs.toggle',
		title: localize('cmd.toggle', "Toggle Breadcrumbs")
	}
});
CommandsRegistry.registerCommand('breadcrumbs.toggle', accessor => {
	let config = accessor.get(IConfigurationService);
	let value = BreadcrumbsConfig.IsEnabled.bindTo(config).value;
	BreadcrumbsConfig.IsEnabled.bindTo(config).value = !value;
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: 'breadcrumbs.focusAndSelect',
		title: localize('cmd.focus', "Focus Breadcrumbs"),
		precondition: BreadcrumbsControl.CK_BreadcrumbsVisible
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.focusAndSelect',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_DOT,
	when: BreadcrumbsControl.CK_BreadcrumbsVisible,
	handler(accessor) {
		const groups = accessor.get(IEditorGroupsService);
		const breadcrumbs = accessor.get(IBreadcrumbsService);
		const widget = breadcrumbs.getWidget(groups.activeGroup.id);
		if (widget) {
			const item = tail(widget.getItems());
			widget.setFocused(item);
			widget.setSelection(item, BreadcrumbsControl.Payload_Pick);
		}
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.focus',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_SEMICOLON,
	when: BreadcrumbsControl.CK_BreadcrumbsVisible,
	handler(accessor) {
		const groups = accessor.get(IEditorGroupsService);
		const breadcrumbs = accessor.get(IBreadcrumbsService);
		const widget = breadcrumbs.getWidget(groups.activeGroup.id);
		if (widget) {
			const item = tail(widget.getItems());
			widget.setFocused(item);
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.focusNext',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyCode.RightArrow,
	secondary: [KeyMod.CtrlCmd | KeyCode.RightArrow],
	mac: {
		primary: KeyCode.RightArrow,
		secondary: [KeyMod.Alt | KeyCode.RightArrow],
	},
	when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive),
	handler(accessor) {
		const groups = accessor.get(IEditorGroupsService);
		const breadcrumbs = accessor.get(IBreadcrumbsService);
		breadcrumbs.getWidget(groups.activeGroup.id).focusNext();
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.focusPrevious',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyCode.LeftArrow,
	secondary: [KeyMod.CtrlCmd | KeyCode.LeftArrow],
	mac: {
		primary: KeyCode.LeftArrow,
		secondary: [KeyMod.Alt | KeyCode.LeftArrow],
	},
	when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive),
	handler(accessor) {
		const groups = accessor.get(IEditorGroupsService);
		const breadcrumbs = accessor.get(IBreadcrumbsService);
		breadcrumbs.getWidget(groups.activeGroup.id).focusPrev();
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.selectFocused',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyCode.Enter,
	secondary: [KeyCode.DownArrow],
	when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive),
	handler(accessor) {
		const groups = accessor.get(IEditorGroupsService);
		const breadcrumbs = accessor.get(IBreadcrumbsService);
		const widget = breadcrumbs.getWidget(groups.activeGroup.id);
		widget.setSelection(widget.getFocused(), BreadcrumbsControl.Payload_Pick);
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.revealFocused',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyCode.Space,
	secondary: [KeyMod.CtrlCmd | KeyCode.Enter],
	when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive),
	handler(accessor) {
		const groups = accessor.get(IEditorGroupsService);
		const breadcrumbs = accessor.get(IBreadcrumbsService);
		const widget = breadcrumbs.getWidget(groups.activeGroup.id);
		widget.setSelection(widget.getFocused(), BreadcrumbsControl.Payload_Reveal);
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.selectEditor',
	weight: KeybindingWeight.WorkbenchContrib + 1,
	primary: KeyCode.Escape,
	when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive),
	handler(accessor) {
		const groups = accessor.get(IEditorGroupsService);
		const breadcrumbs = accessor.get(IBreadcrumbsService);
		breadcrumbs.getWidget(groups.activeGroup.id).setFocused(undefined);
		breadcrumbs.getWidget(groups.activeGroup.id).setSelection(undefined);
		groups.activeGroup.activeControl.focus();
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.revealFocusedFromTreeAside',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyCode.Enter,
	when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive, WorkbenchListFocusContextKey),
	handler(accessor) {
		const groups = accessor.get(IEditorGroupsService);
		const breadcrumbs = accessor.get(IBreadcrumbsService);
		const widget = breadcrumbs.getWidget(groups.activeGroup.id);
		widget.setSelection(widget.getFocused(), BreadcrumbsControl.Payload_RevealAside);
	}
});
//#endregion
