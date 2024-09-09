/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/singleeditortabscontrol.css';
import { EditorResourceAccessor, Verbosity, IEditorPartOptions, SideBySideEditor, preventEditorClose, EditorCloseMethod, IToolbarActions } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { EditorTabsControl } from './editorTabsControl.js';
import { ResourceLabel, IResourceLabel } from '../../labels.js';
import { TAB_ACTIVE_FOREGROUND, TAB_UNFOCUSED_ACTIVE_FOREGROUND } from '../../../common/theme.js';
import { EventType as TouchEventType, GestureEvent, Gesture } from '../../../../base/browser/touch.js';
import { addDisposableListener, EventType, EventHelper, Dimension, isAncestor, DragAndDropObserver, isHTMLElement } from '../../../../base/browser/dom.js';
import { CLOSE_EDITOR_COMMAND_ID, UNLOCK_GROUP_COMMAND_ID } from './editorCommands.js';
import { Color } from '../../../../base/common/color.js';
import { assertIsDefined, assertAllDefined } from '../../../../base/common/types.js';
import { equals } from '../../../../base/common/objects.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { defaultBreadcrumbsWidgetStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IEditorTitleControlDimensions } from './editorTitleControl.js';
import { BreadcrumbsControlFactory } from './breadcrumbsControl.js';
import { IHoverOptions } from '../../../../base/browser/ui/hover/hover.js';
import { IHoverDelegateOptions } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { WorkbenchHoverDelegate, IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IEditorPartsView, IEditorGroupsView, IEditorGroupView } from '../../../../workbench/browser/parts/editor/editor.js';
import { IReadonlyEditorGroupModel } from '../../../../workbench/common/editor/editorGroupModel.js';
import { IEditorResolverService } from '../../../../workbench/services/editor/common/editorResolverService.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';

interface IRenderedEditorLabel {
	readonly editor?: EditorInput;
	readonly pinned: boolean;
}

class SingleEditorTabHoverDelegate extends WorkbenchHoverDelegate {

	constructor(
		private readonly control: SingleEditorTabsControl,
		@IConfigurationService configurationService: IConfigurationService,
		@IHoverService hoverService: IHoverService,

	) {
		super(
			'element',
			true,
			(options) => {
				return { ...this.getOverrideOptions(options), appearance: { showPointer: true } };
			},
			configurationService,
			hoverService
		);
	}

	private getOverrideOptions(options: IHoverDelegateOptions): Partial<IHoverOptions> {
		const activeLabel = this.control.activeLabel;
		if (!activeLabel?.editor || activeLabel.pinned) {
			return {};
		}
		return {
			content: new MarkdownString('', { supportThemeIcons: true, isTrusted: true }).appendText(activeLabel.editor.getTitle(Verbosity.LONG)).appendMarkdown(' (_preview_ [$(gear)](command:workbench.action.openSettings?%5B%22workbench.editor.enablePreview%22%5D "Configure Preview Mode"))'),
		};
	}
}

export class SingleEditorTabsControl extends EditorTabsControl {

	private titleContainer: HTMLElement | undefined;
	private labelContainer: HTMLElement | undefined;
	private editorLabel: IResourceLabel | undefined;
	private hoverDelegate: SingleEditorTabHoverDelegate | undefined;
	public _activeLabel: IRenderedEditorLabel = Object.create(null);

	public get activeLabel(): IRenderedEditorLabel { return this._activeLabel; }

	private breadcrumbsControlFactory: BreadcrumbsControlFactory | undefined;
	private get breadcrumbsControl() { return this.breadcrumbsControlFactory?.control; }

	constructor(
		parent: HTMLElement,
		editorPartsView: IEditorPartsView,
		groupsView: IEditorGroupsView,
		groupView: IEditorGroupView,
		tabsModel: IReadonlyEditorGroupModel,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IThemeService themeService: IThemeService,
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IHostService hostService: IHostService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super(parent, editorPartsView, groupsView, groupView, tabsModel, contextMenuService, instantiationService, contextKeyService, keybindingService, notificationService, quickInputService, themeService, editorResolverService, hostService);

		// create() will have initialized these, but these lines are necessary to satisfy TS compiler
		const titleContainer = this.titleContainer ?? document.createElement('div');
		const labelContainer = this.labelContainer ?? document.createElement('div');

		// Editor Label
		const hoverDelegate = this.hoverDelegate = new SingleEditorTabHoverDelegate(this, this.configurationService, this.hoverService);
		this.editorLabel = this._register(this.instantiationService.createInstance(ResourceLabel, labelContainer, { hoverDelegate: hoverDelegate })).element;
		this._register(addDisposableListener(this.editorLabel.element, EventType.CLICK, e => this.onTitleLabelClick(e)));

		// Breadcrumbs
		this.breadcrumbsControlFactory = this._register(this.instantiationService.createInstance(BreadcrumbsControlFactory, labelContainer, this.groupView, {
			showFileIcons: false,
			showSymbolIcons: true,
			showDecorationColors: false,
			widgetStyles: { ...defaultBreadcrumbsWidgetStyles, breadcrumbsBackground: Color.transparent.toString() },
			showPlaceholder: false
		}));
		this._register(this.breadcrumbsControlFactory.onDidEnablementChange(() => this.handleBreadcrumbsEnablementChange()));
		titleContainer.classList.toggle('breadcrumbs', Boolean(this.breadcrumbsControl));
		this._register(toDisposable(() => titleContainer.classList.remove('breadcrumbs'))); // important to remove because the container is a shared dom node

		// Create editor actions toolbar
		this.createEditorActionsToolBar(titleContainer, ['title-actions']);
	}

	protected override create(parent: HTMLElement): void {
		super.create(parent);

		const titleContainer = this.titleContainer = parent;
		titleContainer.draggable = true;

		// Container listeners
		this.registerContainerListeners(titleContainer);

		// Gesture Support
		this._register(Gesture.addTarget(titleContainer));

		const labelContainer = this.labelContainer = document.createElement('div');
		labelContainer.classList.add('label-container');
		titleContainer.appendChild(labelContainer);
	}

	private registerContainerListeners(titleContainer: HTMLElement): void {

		// Drag & Drop support
		let lastDragEvent: DragEvent | undefined = undefined;
		let isNewWindowOperation = false;
		this._register(new DragAndDropObserver(titleContainer, {
			onDragStart: e => { isNewWindowOperation = this.onGroupDragStart(e, titleContainer); },
			onDrag: e => { lastDragEvent = e; },
			onDragEnd: e => { this.onGroupDragEnd(e, lastDragEvent, titleContainer, isNewWindowOperation); },
		}));

		// Pin on double click
		this._register(addDisposableListener(titleContainer, EventType.DBLCLICK, e => this.onTitleDoubleClick(e)));

		// Detect mouse click
		this._register(addDisposableListener(titleContainer, EventType.AUXCLICK, e => this.onTitleAuxClick(e)));

		// Detect touch
		this._register(addDisposableListener(titleContainer, TouchEventType.Tap, (e: GestureEvent) => this.onTitleTap(e)));

		// Context Menu
		for (const event of [EventType.CONTEXT_MENU, TouchEventType.Contextmenu]) {
			this._register(addDisposableListener(titleContainer, event, e => {
				if (this.tabsModel.activeEditor) {
					this.onTabContextMenu(this.tabsModel.activeEditor, e, titleContainer);
				}
			}));
		}
	}

	private onTitleLabelClick(e: MouseEvent): void {
		EventHelper.stop(e, false);

		// delayed to let the onTitleClick() come first which can cause a focus change which can close quick access
		setTimeout(() => this.quickInputService.quickAccess.show());
	}

	private onTitleDoubleClick(e: MouseEvent): void {
		EventHelper.stop(e);

		this.groupView.pinEditor();
	}

	private onTitleAuxClick(e: MouseEvent): void {
		if (e.button === 1 /* Middle Button */ && this.tabsModel.activeEditor) {
			EventHelper.stop(e, true /* for https://github.com/microsoft/vscode/issues/56715 */);

			if (!preventEditorClose(this.tabsModel, this.tabsModel.activeEditor, EditorCloseMethod.MOUSE, this.groupsView.partOptions)) {
				this.groupView.closeEditor(this.tabsModel.activeEditor);
			}
		}
	}

	private onTitleTap(e: GestureEvent): void {

		// We only want to open the quick access picker when
		// the tap occurred over the editor label, so we need
		// to check on the target
		// (https://github.com/microsoft/vscode/issues/107543)
		const target = e.initialTarget;
		if (!(isHTMLElement(target)) || !this.editorLabel || !isAncestor(target, this.editorLabel.element)) {
			return;
		}

		// TODO@rebornix gesture tap should open the quick access
		// editorGroupView will focus on the editor again when there
		// are mouse/pointer/touch down events we need to wait a bit as
		// `GesureEvent.Tap` is generated from `touchstart` and then
		// `touchend` events, which are not an atom event.
		setTimeout(() => this.quickInputService.quickAccess.show(), 50);
	}

	openEditor(editor: EditorInput): boolean {
		return this.doHandleOpenEditor();
	}

	openEditors(editors: EditorInput[]): boolean {
		return this.doHandleOpenEditor();
	}

	private doHandleOpenEditor(): boolean {
		const activeEditorChanged = this.ifActiveEditorChanged(() => this.redraw());
		if (!activeEditorChanged) {
			this.ifActiveEditorPropertiesChanged(() => this.redraw());
		}

		return activeEditorChanged;
	}

	beforeCloseEditor(editor: EditorInput): void {
		// Nothing to do before closing an editor
	}

	closeEditor(editor: EditorInput): void {
		this.ifActiveEditorChanged(() => this.redraw());
	}

	closeEditors(editors: EditorInput[]): void {
		this.ifActiveEditorChanged(() => this.redraw());
	}

	moveEditor(editor: EditorInput, fromIndex: number, targetIndex: number): void {
		this.ifActiveEditorChanged(() => this.redraw());
	}

	pinEditor(editor: EditorInput): void {
		this.ifEditorIsActive(editor, () => this.redraw());
	}

	stickEditor(editor: EditorInput): void { }

	unstickEditor(editor: EditorInput): void { }

	setActive(isActive: boolean): void {
		this.redraw();
	}

	updateEditorSelections(): void { }

	updateEditorLabel(editor: EditorInput): void {
		this.ifEditorIsActive(editor, () => this.redraw());
	}

	updateEditorDirty(editor: EditorInput): void {
		this.ifEditorIsActive(editor, () => {
			const titleContainer = assertIsDefined(this.titleContainer);

			// Signal dirty (unless saving)
			if (editor.isDirty() && !editor.isSaving()) {
				titleContainer.classList.add('dirty');
			}

			// Otherwise, clear dirty
			else {
				titleContainer.classList.remove('dirty');
			}
		});
	}

	override updateOptions(oldOptions: IEditorPartOptions, newOptions: IEditorPartOptions): void {
		super.updateOptions(oldOptions, newOptions);

		if (oldOptions.labelFormat !== newOptions.labelFormat || !equals(oldOptions.decorations, newOptions.decorations)) {
			this.redraw();
		}
	}

	override updateStyles(): void {
		this.redraw();
	}

	override dispose(): void {
		super.dispose();
		this.hoverDelegate?.dispose();
		this.breadcrumbsControlFactory?.dispose();

	}

	protected handleBreadcrumbsEnablementChange(): void {
		const titleContainer = assertIsDefined(this.titleContainer);
		titleContainer.classList.toggle('breadcrumbs', Boolean(this.breadcrumbsControl));

		this.redraw();
	}

	private ifActiveEditorChanged(fn: () => void): boolean {
		if (
			!this._activeLabel.editor && this.tabsModel.activeEditor || 						// active editor changed from null => editor
			this._activeLabel.editor && !this.tabsModel.activeEditor || 						// active editor changed from editor => null
			(!this._activeLabel.editor || !this.tabsModel.isActive(this._activeLabel.editor))	// active editor changed from editorA => editorB
		) {
			fn();

			return true;
		}

		return false;
	}

	private ifActiveEditorPropertiesChanged(fn: () => void): void {
		if (!this._activeLabel.editor || !this.tabsModel.activeEditor) {
			return; // need an active editor to check for properties changed
		}

		if (this._activeLabel.pinned !== this.tabsModel.isPinned(this.tabsModel.activeEditor)) {
			fn(); // only run if pinned state has changed
		}
	}

	private ifEditorIsActive(editor: EditorInput, fn: () => void): void {
		if (this.tabsModel.isActive(editor)) {
			fn();  // only run if editor is current active
		}
	}

	private redraw(): void {
		const editor = this.tabsModel.activeEditor ?? undefined;
		const options = this.groupsView.partOptions;

		const isEditorPinned = editor ? this.tabsModel.isPinned(editor) : false;
		const isGroupActive = this.groupsView.activeGroup === this.groupView;

		this._activeLabel = { editor, pinned: isEditorPinned };

		// Update Breadcrumbs
		if (this.breadcrumbsControl) {
			if (isGroupActive) {
				this.breadcrumbsControl.update();
				this.breadcrumbsControl.domNode.classList.toggle('preview', !isEditorPinned);
			} else {
				this.breadcrumbsControl.hide();
			}
		}

		// Clear if there is no editor
		const [titleContainer, editorLabel] = assertAllDefined(this.titleContainer, this.editorLabel);
		if (!editor) {
			titleContainer.classList.remove('dirty');
			editorLabel.clear();
			this.clearEditorActionsToolbar();
		}

		// Otherwise render it
		else {

			// Dirty state
			this.updateEditorDirty(editor);

			// Editor Label
			const { labelFormat } = this.groupsView.partOptions;
			let description: string;
			if (this.breadcrumbsControl && !this.breadcrumbsControl.isHidden()) {
				description = ''; // hide description when showing breadcrumbs
			} else if (labelFormat === 'default' && !isGroupActive) {
				description = ''; // hide description when group is not active and style is 'default'
			} else {
				description = editor.getDescription(this.getVerbosity(labelFormat)) || '';
			}

			editorLabel.setResource(
				{
					resource: EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.BOTH }),
					name: editor.getName(),
					description
				},
				{
					title: this.getHoverTitle(editor),
					italic: !isEditorPinned,
					extraClasses: ['single-tab', 'title-label'].concat(editor.getLabelExtraClasses()),
					fileDecorations: {
						colors: Boolean(options.decorations?.colors),
						badges: Boolean(options.decorations?.badges)
					},
					icon: editor.getIcon(),
					hideIcon: options.showIcons === false,
				}
			);

			if (isGroupActive) {
				titleContainer.style.color = this.getColor(TAB_ACTIVE_FOREGROUND) || '';
			} else {
				titleContainer.style.color = this.getColor(TAB_UNFOCUSED_ACTIVE_FOREGROUND) || '';
			}

			// Update Editor Actions Toolbar
			this.updateEditorActionsToolbar();
		}
	}

	private getVerbosity(style: string | undefined): Verbosity {
		switch (style) {
			case 'short': return Verbosity.SHORT;
			case 'long': return Verbosity.LONG;
			default: return Verbosity.MEDIUM;
		}
	}

	protected override prepareEditorActions(editorActions: IToolbarActions): IToolbarActions {
		const isGroupActive = this.groupsView.activeGroup === this.groupView;

		// Active: allow all actions
		if (isGroupActive) {
			return editorActions;
		}

		// Inactive: only show "Close, "Unlock" and secondary actions
		else {
			return {
				primary: this.groupsView.partOptions.alwaysShowEditorActions ? editorActions.primary : editorActions.primary.filter(action => action.id === CLOSE_EDITOR_COMMAND_ID || action.id === UNLOCK_GROUP_COMMAND_ID),
				secondary: editorActions.secondary
			};
		}
	}

	getHeight(): number {
		return this.tabHeight;
	}

	layout(dimensions: IEditorTitleControlDimensions): Dimension {
		this.breadcrumbsControl?.layout(undefined);

		return new Dimension(dimensions.container.width, this.getHeight());
	}
}
