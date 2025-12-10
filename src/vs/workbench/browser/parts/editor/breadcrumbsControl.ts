/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { PixelRatio } from '../../../../base/browser/pixelRatio.js';
import { BreadcrumbsItem, BreadcrumbsWidget, IBreadcrumbsItemEvent, IBreadcrumbsWidgetStyles } from '../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { applyDragImage } from '../../../../base/browser/ui/dnd/dnd.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { timeout } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { combinedDisposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { basename, extUri } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { DocumentSymbol } from '../../../../editor/common/languages.js';
import { OutlineElement } from '../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { fillInSymbolsDragData, LocalSelectionTransfer } from '../../../../platform/dnd/browser/dnd.js';
import { FileKind, IFileService, IFileStat } from '../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationService } from '../../../../platform/instantiation/common/instantiationService.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IListService, WorkbenchAsyncDataTree, WorkbenchDataTree, WorkbenchListFocusContextKey } from '../../../../platform/list/browser/listService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { defaultBreadcrumbsWidgetStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { EditorResourceAccessor, IEditorPartOptions, SideBySideEditor } from '../../../common/editor.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, ACTIVE_GROUP_TYPE, IEditorService, SIDE_GROUP, SIDE_GROUP_TYPE } from '../../../services/editor/common/editorService.js';
import { IOutline } from '../../../services/outline/browser/outline.js';
import { DraggedEditorIdentifier, fillEditorsDragData } from '../../dnd.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../labels.js';
import { BreadcrumbsConfig, IBreadcrumbsService } from './breadcrumbs.js';
import { BreadcrumbsModel, FileElement, OutlineElement2 } from './breadcrumbsModel.js';
import { BreadcrumbsFilePicker, BreadcrumbsOutlinePicker } from './breadcrumbsPicker.js';
import { IEditorGroupView } from './editor.js';
import './media/breadcrumbscontrol.css';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';

class OutlineItem extends BreadcrumbsItem {

	private readonly _disposables = new DisposableStore();

	constructor(
		readonly model: BreadcrumbsModel,
		readonly element: OutlineElement2,
		readonly options: IBreadcrumbsControlOptions,
		@IInstantiationService private readonly _instantiationService: InstantiationService,
	) {
		super();
	}

	dispose(): void {
		this._disposables.dispose();
	}

	equals(other: BreadcrumbsItem): boolean {
		if (!(other instanceof OutlineItem)) {
			return false;
		}
		return this.element.element === other.element.element &&
			this.options.showFileIcons === other.options.showFileIcons &&
			this.options.showSymbolIcons === other.options.showSymbolIcons;
	}

	render(container: HTMLElement): void {
		const { element, outline } = this.element;

		if (element === outline) {
			const element = dom.$('span', undefined, '…');
			container.appendChild(element);
			return;
		}

		const templateId = outline.config.delegate.getTemplateId(element);
		const renderer = outline.config.renderers.find(renderer => renderer.templateId === templateId);
		if (!renderer) {
			container.textContent = '<<NO RENDERER>>';
			return;
		}

		const template = renderer.renderTemplate(container);
		renderer.renderElement({
			element,
			children: [],
			depth: 0,
			visibleChildrenCount: 0,
			visibleChildIndex: 0,
			collapsible: false,
			collapsed: false,
			visible: true,
			filterData: undefined
		}, 0, template, undefined);

		if (!this.options.showSymbolIcons) {
			dom.hide(template.iconClass);
		}

		this._disposables.add(toDisposable(() => { renderer.disposeTemplate(template); }));

		if (element instanceof OutlineElement && outline.uri) {
			this._disposables.add(this._instantiationService.invokeFunction(accessor => createBreadcrumbDndObserver(accessor, container, element.symbol.name, { symbol: element.symbol, uri: outline.uri! }, this.model, this.options.dragEditor)));
		}
	}
}

class FileItem extends BreadcrumbsItem {

	private readonly _disposables = new DisposableStore();

	constructor(
		readonly model: BreadcrumbsModel,
		readonly element: FileElement,
		readonly options: IBreadcrumbsControlOptions,
		private readonly _labels: ResourceLabels,
		private readonly _hoverDelegate: IHoverDelegate,
		@IInstantiationService private readonly _instantiationService: InstantiationService,
	) {
		super();
	}

	dispose(): void {
		this._disposables.dispose();
	}

	equals(other: BreadcrumbsItem): boolean {
		if (!(other instanceof FileItem)) {
			return false;
		}
		return (extUri.isEqual(this.element.uri, other.element.uri) &&
			this.options.showFileIcons === other.options.showFileIcons &&
			this.options.showSymbolIcons === other.options.showSymbolIcons);

	}

	render(container: HTMLElement): void {
		// file/folder
		const label = this._labels.create(container, { hoverDelegate: this._hoverDelegate });
		label.setFile(this.element.uri, {
			hidePath: true,
			hideIcon: this.element.kind === FileKind.FOLDER || !this.options.showFileIcons,
			fileKind: this.element.kind,
			fileDecorations: { colors: this.options.showDecorationColors, badges: false },
		});
		container.classList.add(FileKind[this.element.kind].toLowerCase());
		this._disposables.add(label);

		this._disposables.add(this._instantiationService.invokeFunction(accessor => createBreadcrumbDndObserver(accessor, container, basename(this.element.uri), this.element.uri, this.model, this.options.dragEditor)));
	}
}


function createBreadcrumbDndObserver(accessor: ServicesAccessor, container: HTMLElement, label: string, item: URI | { symbol: DocumentSymbol; uri: URI }, model: BreadcrumbsModel, dragEditor: boolean): IDisposable {
	const instantiationService = accessor.get(IInstantiationService);

	container.draggable = true;

	return new dom.DragAndDropObserver(container, {
		onDragStart: event => {
			if (!event.dataTransfer) {
				return;
			}

			// Set data transfer
			event.dataTransfer.effectAllowed = 'copyMove';

			instantiationService.invokeFunction(accessor => {
				if (URI.isUri(item)) {
					fillEditorsDragData(accessor, [item], event);
				} else { // Symbol
					fillEditorsDragData(accessor, [{ resource: item.uri, selection: item.symbol.range }], event);

					fillInSymbolsDragData([{
						name: item.symbol.name,
						fsPath: item.uri.fsPath,
						range: item.symbol.range,
						kind: item.symbol.kind
					}], event);
				}

				if (dragEditor && model.editor?.input) {
					const editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();
					editorTransfer.setData([new DraggedEditorIdentifier({ editor: model.editor.input, groupId: model.editor.group.id })], DraggedEditorIdentifier.prototype);
				}
			});

			applyDragImage(event, container, label);
		}
	});
}

export interface IBreadcrumbsControlOptions {
	readonly showFileIcons: boolean;
	readonly showSymbolIcons: boolean;
	readonly showDecorationColors: boolean;
	readonly showPlaceholder: boolean;
	readonly dragEditor: boolean;
	readonly widgetStyles?: IBreadcrumbsWidgetStyles;
}

const separatorIcon = registerIcon('breadcrumb-separator', Codicon.chevronRight, localize('separatorIcon', 'Icon for the separator in the breadcrumbs.'));

export class BreadcrumbsControl {

	static readonly HEIGHT = 22;

	private static readonly SCROLLBAR_SIZES = {
		default: 3,
		large: 8
	};

	private static readonly SCROLLBAR_VISIBILITY = {
		auto: ScrollbarVisibility.Auto,
		visible: ScrollbarVisibility.Visible,
		hidden: ScrollbarVisibility.Hidden
	};

	static readonly Payload_Reveal = {};
	static readonly Payload_RevealAside = {};
	static readonly Payload_Pick = {};

	static readonly CK_BreadcrumbsPossible = new RawContextKey('breadcrumbsPossible', false, localize('breadcrumbsPossible', "Whether the editor can show breadcrumbs"));
	static readonly CK_BreadcrumbsVisible = new RawContextKey('breadcrumbsVisible', false, localize('breadcrumbsVisible', "Whether breadcrumbs are currently visible"));
	static readonly CK_BreadcrumbsActive = new RawContextKey('breadcrumbsActive', false, localize('breadcrumbsActive', "Whether breadcrumbs have focus"));

	private readonly _ckBreadcrumbsPossible: IContextKey<boolean>;
	private readonly _ckBreadcrumbsVisible: IContextKey<boolean>;
	private readonly _ckBreadcrumbsActive: IContextKey<boolean>;

	private readonly _cfUseQuickPick: BreadcrumbsConfig<boolean>;
	private readonly _cfShowIcons: BreadcrumbsConfig<boolean>;
	private readonly _cfTitleScrollbarSizing: BreadcrumbsConfig<IEditorPartOptions['titleScrollbarSizing']>;
	private readonly _cfTitleScrollbarVisibility: BreadcrumbsConfig<IEditorPartOptions['titleScrollbarVisibility']>;

	readonly domNode: HTMLDivElement;
	private readonly _widget: BreadcrumbsWidget;

	private readonly _disposables = new DisposableStore();
	private readonly _breadcrumbsDisposables = new DisposableStore();
	private readonly _labels: ResourceLabels;
	private readonly _model = new MutableDisposable<BreadcrumbsModel>();
	private _breadcrumbsPickerShowing = false;
	private _breadcrumbsPickerIgnoreOnceItem: BreadcrumbsItem | undefined;

	private readonly _hoverDelegate: IHoverDelegate;

	private readonly _onDidVisibilityChange = this._disposables.add(new Emitter<void>());
	get onDidVisibilityChange() { return this._onDidVisibilityChange.event; }

	constructor(
		container: HTMLElement,
		private readonly _options: IBreadcrumbsControlOptions,
		private readonly _editorGroup: IEditorGroupView,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IFileService private readonly _fileService: IFileService,
		@IEditorService private readonly _editorService: IEditorService,
		@ILabelService private readonly _labelService: ILabelService,
		@IConfigurationService configurationService: IConfigurationService,
		@IBreadcrumbsService breadcrumbsService: IBreadcrumbsService
	) {
		this.domNode = document.createElement('div');
		this.domNode.classList.add('breadcrumbs-control');
		dom.append(container, this.domNode);

		this._cfUseQuickPick = BreadcrumbsConfig.UseQuickPick.bindTo(configurationService);
		this._cfShowIcons = BreadcrumbsConfig.Icons.bindTo(configurationService);
		this._cfTitleScrollbarSizing = BreadcrumbsConfig.TitleScrollbarSizing.bindTo(configurationService);
		this._cfTitleScrollbarVisibility = BreadcrumbsConfig.TitleScrollbarVisibility.bindTo(configurationService);

		this._labels = this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER);

		const sizing = this._cfTitleScrollbarSizing.getValue() ?? 'default';
		const styles = _options.widgetStyles ?? defaultBreadcrumbsWidgetStyles;
		const visibility = this._cfTitleScrollbarVisibility?.getValue() ?? 'auto';

		this._widget = new BreadcrumbsWidget(
			this.domNode,
			BreadcrumbsControl.SCROLLBAR_SIZES[sizing],
			BreadcrumbsControl.SCROLLBAR_VISIBILITY[visibility],
			separatorIcon,
			styles
		);
		this._widget.onDidSelectItem(this._onSelectEvent, this, this._disposables);
		this._widget.onDidFocusItem(this._onFocusEvent, this, this._disposables);
		this._widget.onDidChangeFocus(this._updateCkBreadcrumbsActive, this, this._disposables);

		this._ckBreadcrumbsPossible = BreadcrumbsControl.CK_BreadcrumbsPossible.bindTo(this._contextKeyService);
		this._ckBreadcrumbsVisible = BreadcrumbsControl.CK_BreadcrumbsVisible.bindTo(this._contextKeyService);
		this._ckBreadcrumbsActive = BreadcrumbsControl.CK_BreadcrumbsActive.bindTo(this._contextKeyService);

		this._hoverDelegate = getDefaultHoverDelegate('mouse');

		this._disposables.add(breadcrumbsService.register(this._editorGroup.id, this._widget));
		this.hide();
	}

	dispose(): void {
		this._disposables.dispose();
		this._breadcrumbsDisposables.dispose();
		this._model.dispose();
		this._ckBreadcrumbsPossible.reset();
		this._ckBreadcrumbsVisible.reset();
		this._ckBreadcrumbsActive.reset();
		this._cfUseQuickPick.dispose();
		this._cfShowIcons.dispose();
		this._cfTitleScrollbarSizing.dispose();
		this._cfTitleScrollbarVisibility.dispose();
		this._widget.dispose();
		this._labels.dispose();
		this.domNode.remove();
	}

	get model(): BreadcrumbsModel | undefined {
		return this._model.value;
	}

	layout(dim: dom.Dimension | undefined): void {
		this._widget.layout(dim);
	}

	isHidden(): boolean {
		return this.domNode.classList.contains('hidden');
	}

	hide(): void {
		const wasHidden = this.isHidden();

		this._breadcrumbsDisposables.clear();
		this._ckBreadcrumbsVisible.set(false);
		this.domNode.classList.toggle('hidden', true);

		if (!wasHidden) {
			this._onDidVisibilityChange.fire();
		}
	}

	private show(): void {
		const wasHidden = this.isHidden();

		this._ckBreadcrumbsVisible.set(true);
		this.domNode.classList.toggle('hidden', false);

		if (wasHidden) {
			this._onDidVisibilityChange.fire();
		}
	}

	revealLast(): void {
		this._widget.revealLast();
	}

	update(): boolean {
		this._breadcrumbsDisposables.clear();

		// honor diff editors and such
		const uri = EditorResourceAccessor.getCanonicalUri(this._editorGroup.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
		const wasHidden = this.isHidden();

		if (!uri || !this._fileService.hasProvider(uri)) {
			// cleanup and return when there is no input or when
			// we cannot handle this input
			this._ckBreadcrumbsPossible.set(false);
			if (!wasHidden) {
				this.hide();
				return true;
			} else {
				return false;
			}
		}

		// display uri which can be derived from certain inputs
		const fileInfoUri = EditorResourceAccessor.getOriginalUri(this._editorGroup.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });

		this.show();
		this._ckBreadcrumbsPossible.set(true);

		const model = this._instantiationService.createInstance(BreadcrumbsModel,
			fileInfoUri ?? uri,
			this._editorGroup.activeEditorPane
		);
		this._model.value = model;

		this.domNode.classList.toggle('backslash-path', this._labelService.getSeparator(uri.scheme, uri.authority) === '\\');

		const updateBreadcrumbs = () => {
			this.domNode.classList.toggle('relative-path', model.isRelative());
			const showIcons = this._cfShowIcons.getValue();
			const options: IBreadcrumbsControlOptions = {
				...this._options,
				showFileIcons: this._options.showFileIcons && showIcons,
				showSymbolIcons: this._options.showSymbolIcons && showIcons
			};
			const items = model.getElements().map(element => element instanceof FileElement
				? this._instantiationService.createInstance(FileItem, model, element, options, this._labels, this._hoverDelegate)
				: this._instantiationService.createInstance(OutlineItem, model, element, options));
			if (items.length === 0) {
				this._widget.setEnabled(false);
				this._widget.setItems([new class extends BreadcrumbsItem {
					render(container: HTMLElement): void {
						container.textContent = localize('empty', "no elements");
					}
					equals(other: BreadcrumbsItem): boolean {
						return other === this;
					}
					dispose(): void {

					}
				}]);
			} else {
				this._widget.setEnabled(true);
				this._widget.setItems(items);
				this._widget.reveal(items[items.length - 1]);
			}
		};
		const listener = model.onDidUpdate(updateBreadcrumbs);
		const configListener = this._cfShowIcons.onDidChange(updateBreadcrumbs);
		updateBreadcrumbs();
		this._breadcrumbsDisposables.clear();
		this._breadcrumbsDisposables.add(listener);
		this._breadcrumbsDisposables.add(toDisposable(() => this._model.clear()));
		this._breadcrumbsDisposables.add(configListener);
		this._breadcrumbsDisposables.add(toDisposable(() => this._widget.setItems([])));

		const updateScrollbarSizing = () => {
			const sizing = this._cfTitleScrollbarSizing.getValue() ?? 'default';
			const visibility = this._cfTitleScrollbarVisibility?.getValue() ?? 'auto';

			this._widget.setHorizontalScrollbarSize(BreadcrumbsControl.SCROLLBAR_SIZES[sizing]);
			this._widget.setHorizontalScrollbarVisibility(BreadcrumbsControl.SCROLLBAR_VISIBILITY[visibility]);
		};
		updateScrollbarSizing();
		const updateScrollbarSizeListener = this._cfTitleScrollbarSizing.onDidChange(updateScrollbarSizing);
		const updateScrollbarVisibilityListener = this._cfTitleScrollbarVisibility.onDidChange(updateScrollbarSizing);
		this._breadcrumbsDisposables.add(updateScrollbarSizeListener);
		this._breadcrumbsDisposables.add(updateScrollbarVisibilityListener);

		// close picker on hide/update
		this._breadcrumbsDisposables.add({
			dispose: () => {
				if (this._breadcrumbsPickerShowing) {
					this._contextViewService.hideContextView({ source: this });
				}
			}
		});

		return wasHidden !== this.isHidden();
	}

	private _onFocusEvent(event: IBreadcrumbsItemEvent): void {
		if (event.item && this._breadcrumbsPickerShowing) {
			this._breadcrumbsPickerIgnoreOnceItem = undefined;
			this._widget.setSelection(event.item);
		}
	}

	private _onSelectEvent(event: IBreadcrumbsItemEvent): void {
		if (!event.item) {
			return;
		}

		if (event.item === this._breadcrumbsPickerIgnoreOnceItem) {
			this._breadcrumbsPickerIgnoreOnceItem = undefined;
			this._widget.setFocused(undefined);
			this._widget.setSelection(undefined);
			return;
		}

		const { element } = event.item as FileItem | OutlineItem;
		this._editorGroup.focus();

		const group = this._getEditorGroup(event.payload);
		if (group !== undefined) {
			// reveal the item
			this._widget.setFocused(undefined);
			this._widget.setSelection(undefined);
			this._revealInEditor(event, element, group);
			return;
		}

		if (this._cfUseQuickPick.getValue()) {
			// using quick pick
			this._widget.setFocused(undefined);
			this._widget.setSelection(undefined);
			this._quickInputService.quickAccess.show(element instanceof OutlineElement2 ? '@' : '');
			return;
		}

		// show picker
		let picker: BreadcrumbsFilePicker | BreadcrumbsOutlinePicker;
		let pickerAnchor: { x: number; y: number };

		interface IHideData { didPick?: boolean; source?: BreadcrumbsControl }

		this._contextViewService.showContextView({
			render: (parent: HTMLElement) => {
				if (event.item instanceof FileItem) {
					picker = this._instantiationService.createInstance(BreadcrumbsFilePicker, parent, event.item.model.resource);
				} else if (event.item instanceof OutlineItem) {
					picker = this._instantiationService.createInstance(BreadcrumbsOutlinePicker, parent, event.item.model.resource);
				}

				const selectListener = picker.onWillPickElement(() => this._contextViewService.hideContextView({ source: this, didPick: true }));
				const zoomListener = PixelRatio.getInstance(dom.getWindow(this.domNode)).onDidChange(() => this._contextViewService.hideContextView({ source: this }));

				const focusTracker = dom.trackFocus(parent);
				const blurListener = focusTracker.onDidBlur(() => {
					this._breadcrumbsPickerIgnoreOnceItem = this._widget.isDOMFocused() ? event.item : undefined;
					this._contextViewService.hideContextView({ source: this });
				});

				this._breadcrumbsPickerShowing = true;
				this._updateCkBreadcrumbsActive();

				return combinedDisposable(
					picker,
					selectListener,
					zoomListener,
					focusTracker,
					blurListener
				);
			},
			getAnchor: () => {
				if (!pickerAnchor) {
					const window = dom.getWindow(this.domNode);
					const maxInnerWidth = window.innerWidth - 8 /*a little less the full widget*/;
					let maxHeight = Math.min(window.innerHeight * 0.7, 300);

					const pickerWidth = Math.min(maxInnerWidth, Math.max(240, maxInnerWidth / 4.17));
					const pickerArrowSize = 8;
					let pickerArrowOffset: number;

					const data = dom.getDomNodePagePosition(event.node.firstChild as HTMLElement);
					const y = data.top + data.height + pickerArrowSize;
					if (y + maxHeight >= window.innerHeight) {
						maxHeight = window.innerHeight - y - 30 /* room for shadow and status bar*/;
					}
					let x = data.left;
					if (x + pickerWidth >= maxInnerWidth) {
						x = maxInnerWidth - pickerWidth;
					}
					if (event.payload instanceof StandardMouseEvent) {
						const maxPickerArrowOffset = pickerWidth - 2 * pickerArrowSize;
						pickerArrowOffset = event.payload.posx - x;
						if (pickerArrowOffset > maxPickerArrowOffset) {
							x = Math.min(maxInnerWidth - pickerWidth, x + pickerArrowOffset - maxPickerArrowOffset);
							pickerArrowOffset = maxPickerArrowOffset;
						}
					} else {
						pickerArrowOffset = (data.left + (data.width * 0.3)) - x;
					}
					picker.show(element, maxHeight, pickerWidth, pickerArrowSize, Math.max(0, pickerArrowOffset));
					pickerAnchor = { x, y };
				}
				return pickerAnchor;
			},
			onHide: (data?: IHideData) => {
				if (!data?.didPick) {
					picker.restoreViewState();
				}
				this._breadcrumbsPickerShowing = false;
				this._updateCkBreadcrumbsActive();
				if (data?.source === this) {
					this._widget.setFocused(undefined);
					this._widget.setSelection(undefined);
				}
				picker.dispose();
			}
		});
	}

	private _updateCkBreadcrumbsActive(): void {
		const value = this._widget.isDOMFocused() || this._breadcrumbsPickerShowing;
		this._ckBreadcrumbsActive.set(value);
	}

	private async _revealInEditor(event: IBreadcrumbsItemEvent, element: FileElement | OutlineElement2, group: SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE | undefined, pinned: boolean = false): Promise<void> {

		if (element instanceof FileElement) {
			if (element.kind === FileKind.FILE) {
				await this._editorService.openEditor({ resource: element.uri, options: { pinned } }, group);
			} else {
				// show next picker
				const items = this._widget.getItems();
				const idx = items.indexOf(event.item);
				this._widget.setFocused(items[idx + 1]);
				this._widget.setSelection(items[idx + 1], BreadcrumbsControl.Payload_Pick);
			}
		} else {
			element.outline.reveal(element, { pinned }, group === SIDE_GROUP, false);
		}
	}

	private _getEditorGroup(data: unknown): SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE | undefined {
		if (data === BreadcrumbsControl.Payload_RevealAside) {
			return SIDE_GROUP;
		} else if (data === BreadcrumbsControl.Payload_Reveal) {
			return ACTIVE_GROUP;
		} else {
			return undefined;
		}
	}
}

export class BreadcrumbsControlFactory {

	private readonly _disposables = new DisposableStore();
	private readonly _controlDisposables = new DisposableStore();

	private _control: BreadcrumbsControl | undefined;
	get control() { return this._control; }

	private readonly _onDidEnablementChange = this._disposables.add(new Emitter<void>());
	get onDidEnablementChange() { return this._onDidEnablementChange.event; }

	private readonly _onDidVisibilityChange = this._disposables.add(new Emitter<void>());
	get onDidVisibilityChange() { return this._onDidVisibilityChange.event; }

	constructor(
		private readonly _container: HTMLElement,
		private readonly _editorGroup: IEditorGroupView,
		private readonly _options: IBreadcrumbsControlOptions,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IFileService fileService: IFileService
	) {
		const config = this._disposables.add(BreadcrumbsConfig.IsEnabled.bindTo(configurationService));
		this._disposables.add(config.onDidChange(() => {
			const value = config.getValue();
			if (!value && this._control) {
				this._controlDisposables.clear();
				this._control = undefined;
				this._onDidEnablementChange.fire();
			} else if (value && !this._control) {
				this._control = this.createControl();
				this._control.update();
				this._onDidEnablementChange.fire();
			}
		}));

		if (config.getValue()) {
			this._control = this.createControl();
		}

		this._disposables.add(fileService.onDidChangeFileSystemProviderRegistrations(e => {
			if (this._control?.model && this._control.model.resource.scheme !== e.scheme) {
				// ignore if the scheme of the breadcrumbs resource is not affected
				return;
			}
			if (this._control?.update()) {
				this._onDidEnablementChange.fire();
			}
		}));
	}

	private createControl(): BreadcrumbsControl {
		const control = this._controlDisposables.add(this._instantiationService.createInstance(BreadcrumbsControl, this._container, this._options, this._editorGroup));
		this._controlDisposables.add(control.onDidVisibilityChange(() => this._onDidVisibilityChange.fire()));

		return control;
	}

	dispose(): void {
		this._disposables.dispose();
		this._controlDisposables.dispose();
	}
}

//#region commands

// toggle command
registerAction2(class ToggleBreadcrumb extends Action2 {

	constructor() {
		super({
			id: 'breadcrumbs.toggle',
			title: localize2('cmd.toggle', "Toggle Breadcrumbs"),
			category: Categories.View,
			toggled: {
				condition: ContextKeyExpr.equals('config.breadcrumbs.enabled', true),
				title: localize('cmd.toggle2', "Toggle Breadcrumbs"),
				mnemonicTitle: localize({ key: 'miBreadcrumbs2', comment: ['&& denotes a mnemonic'] }, "&&Breadcrumbs")
			},
			menu: [
				{ id: MenuId.CommandPalette },
				{ id: MenuId.MenubarAppearanceMenu, group: '4_editor', order: 2 },
				{ id: MenuId.NotebookToolbar, group: 'notebookLayout', order: 2 },
				{ id: MenuId.StickyScrollContext },
				{ id: MenuId.NotebookStickyScrollContext, group: 'notebookView', order: 2 },
				{ id: MenuId.NotebookToolbarContext, group: 'notebookView', order: 2 }
			]
		});
	}

	run(accessor: ServicesAccessor): void {
		const config = accessor.get(IConfigurationService);
		const breadCrumbsConfig = BreadcrumbsConfig.IsEnabled.bindTo(config);
		const value = breadCrumbsConfig.getValue();
		breadCrumbsConfig.updateValue(!value);
		breadCrumbsConfig.dispose();
	}

});

// focus/focus-and-select
function focusAndSelectHandler(accessor: ServicesAccessor, select: boolean): void {
	// find widget and focus/select
	const groups = accessor.get(IEditorGroupsService);
	const breadcrumbs = accessor.get(IBreadcrumbsService);
	const widget = breadcrumbs.getWidget(groups.activeGroup.id);
	if (widget) {
		const item = widget.getItems().at(-1);
		widget.setFocused(item);
		if (select) {
			widget.setSelection(item, BreadcrumbsControl.Payload_Pick);
		}
	}
}
registerAction2(class FocusAndSelectBreadcrumbs extends Action2 {
	constructor() {
		super({
			id: 'breadcrumbs.focusAndSelect',
			title: localize2('cmd.focusAndSelect', "Focus and Select Breadcrumbs"),
			precondition: BreadcrumbsControl.CK_BreadcrumbsVisible,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Period,
				when: BreadcrumbsControl.CK_BreadcrumbsPossible,
			},
			f1: true
		});
	}
	run(accessor: ServicesAccessor, ...args: unknown[]): void {
		focusAndSelectHandler(accessor, true);
	}
});

registerAction2(class FocusBreadcrumbs extends Action2 {
	constructor() {
		super({
			id: 'breadcrumbs.focus',
			title: localize2('cmd.focus', "Focus Breadcrumbs"),
			precondition: BreadcrumbsControl.CK_BreadcrumbsVisible,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Semicolon,
				when: BreadcrumbsControl.CK_BreadcrumbsPossible,
			},
			f1: true
		});
	}
	run(accessor: ServicesAccessor, ...args: unknown[]): void {
		focusAndSelectHandler(accessor, false);
	}
});

// this commands is only enabled when breadcrumbs are
// disabled which it then enables and focuses
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.toggleToOn',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Period,
	when: ContextKeyExpr.not('config.breadcrumbs.enabled'),
	handler: async accessor => {
		const instant = accessor.get(IInstantiationService);
		const config = accessor.get(IConfigurationService);
		// check if enabled and iff not enable
		const isEnabled = BreadcrumbsConfig.IsEnabled.bindTo(config);
		if (!isEnabled.getValue()) {
			await isEnabled.updateValue(true);
			await timeout(50); // hacky - the widget might not be ready yet...
		}
		isEnabled.dispose();
		return instant.invokeFunction(focusAndSelectHandler, true);
	}
});

// navigation
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
		const widget = breadcrumbs.getWidget(groups.activeGroup.id);
		if (!widget) {
			return;
		}
		widget.focusNext();
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
		const widget = breadcrumbs.getWidget(groups.activeGroup.id);
		if (!widget) {
			return;
		}
		widget.focusPrev();
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.focusNextWithPicker',
	weight: KeybindingWeight.WorkbenchContrib + 1,
	primary: KeyMod.CtrlCmd | KeyCode.RightArrow,
	mac: {
		primary: KeyMod.Alt | KeyCode.RightArrow,
	},
	when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive, WorkbenchListFocusContextKey),
	handler(accessor) {
		const groups = accessor.get(IEditorGroupsService);
		const breadcrumbs = accessor.get(IBreadcrumbsService);
		const widget = breadcrumbs.getWidget(groups.activeGroup.id);
		if (!widget) {
			return;
		}
		widget.focusNext();
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.focusPreviousWithPicker',
	weight: KeybindingWeight.WorkbenchContrib + 1,
	primary: KeyMod.CtrlCmd | KeyCode.LeftArrow,
	mac: {
		primary: KeyMod.Alt | KeyCode.LeftArrow,
	},
	when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive, WorkbenchListFocusContextKey),
	handler(accessor) {
		const groups = accessor.get(IEditorGroupsService);
		const breadcrumbs = accessor.get(IBreadcrumbsService);
		const widget = breadcrumbs.getWidget(groups.activeGroup.id);
		if (!widget) {
			return;
		}
		widget.focusPrev();
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
		if (!widget) {
			return;
		}
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
		if (!widget) {
			return;
		}
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
		const widget = breadcrumbs.getWidget(groups.activeGroup.id);
		if (!widget) {
			return;
		}
		widget.setFocused(undefined);
		widget.setSelection(undefined);
		groups.activeGroup.activeEditorPane?.focus();
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'breadcrumbs.revealFocusedFromTreeAside',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyCode.Enter,
	when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive, WorkbenchListFocusContextKey),
	handler(accessor) {
		const editors = accessor.get(IEditorService);
		const lists = accessor.get(IListService);

		const tree = lists.lastFocusedList;
		if (!(tree instanceof WorkbenchDataTree) && !(tree instanceof WorkbenchAsyncDataTree)) {
			return;
		}

		const element = <IFileStat | unknown>tree.getFocus()[0];

		if (URI.isUri((<IFileStat>element)?.resource)) {
			// IFileStat: open file in editor
			return editors.openEditor({
				resource: (<IFileStat>element).resource,
				options: { pinned: true }
			}, SIDE_GROUP);
		}

		// IOutline: check if this the outline and iff so reveal element
		const input = tree.getInput();
		if (input && typeof (<IOutline<unknown>>input).outlineKind === 'string') {
			return (<IOutline<unknown>>input).reveal(element, {
				pinned: true,
				preserveFocus: false
			}, true, false);
		}
	}
});
//#endregion
