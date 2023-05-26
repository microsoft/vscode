/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/titlecontrol';
import { localize } from 'vs/nls';
import { applyDragImage, DataTransfers } from 'vs/base/browser/dnd';
import { addDisposableListener, Dimension, EventType } from 'vs/base/browser/dom';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { ActionsOrientation, IActionViewItem, prepareActions } from 'vs/base/browser/ui/actionbar/actionbar';
import { IAction, SubmenuAction, ActionRunner } from 'vs/base/common/actions';
import { ResolvedKeybinding } from 'vs/base/common/keybindings';
import { dispose, DisposableStore } from 'vs/base/common/lifecycle';
import { createActionViewItem, createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { listActiveSelectionBackground, listActiveSelectionForeground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';
import { DraggedEditorGroupIdentifier, DraggedEditorIdentifier, fillEditorsDragData } from 'vs/workbench/browser/dnd';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { BreadcrumbsConfig } from 'vs/workbench/browser/parts/editor/breadcrumbs';
import { BreadcrumbsControl, IBreadcrumbsControlOptions } from 'vs/workbench/browser/parts/editor/breadcrumbsControl';
import { IEditorGroupsAccessor, IEditorGroupTitleHeight, IEditorGroupView } from 'vs/workbench/browser/parts/editor/editor';
import { IEditorCommandsContext, EditorResourceAccessor, IEditorPartOptions, SideBySideEditor, EditorsOrder, EditorInputCapabilities } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { ResourceContextKey, ActiveEditorPinnedContext, ActiveEditorStickyContext, ActiveEditorGroupLockedContext, ActiveEditorCanSplitInGroupContext, SideBySideEditorActiveContext, ActiveEditorLastInGroupContext, ActiveEditorFirstInGroupContext } from 'vs/workbench/common/contextkeys';
import { AnchorAlignment } from 'vs/base/browser/ui/contextview/contextview';
import { IFileService } from 'vs/platform/files/common/files';
import { withNullAsUndefined, withUndefinedAsNull, assertIsDefined } from 'vs/base/common/types';
import { isFirefox } from 'vs/base/browser/browser';
import { isCancellationError } from 'vs/base/common/errors';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { LocalSelectionTransfer } from 'vs/platform/dnd/browser/dnd';
import { DraggedTreeItemsIdentifier } from 'vs/editor/common/services/treeViewsDnd';

export interface IToolbarActions {
	primary: IAction[];
	secondary: IAction[];
}

export interface ITitleControlDimensions {

	/**
	 * The size of the parent container the title control is layed out in.
	 */
	container: Dimension;

	/**
	 * The maximum size the title control is allowed to consume based on
	 * other controls that are positioned inside the container.
	 */
	available: Dimension;
}

export class EditorCommandsContextActionRunner extends ActionRunner {

	constructor(
		private context: IEditorCommandsContext
	) {
		super();
	}

	override run(action: IAction, context?: { preserveFocus?: boolean }): Promise<void> {

		// Even though we have a fixed context for editor commands,
		// allow to preserve the context that is given to us in case
		// it applies.

		let mergedContext = this.context;
		if (context?.preserveFocus) {
			mergedContext = {
				...this.context,
				preserveFocus: true
			};
		}

		return super.run(action, mergedContext);
	}
}

export abstract class TitleControl extends Themable {

	protected readonly editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();
	protected readonly groupTransfer = LocalSelectionTransfer.getInstance<DraggedEditorGroupIdentifier>();
	protected readonly treeItemsTransfer = LocalSelectionTransfer.getInstance<DraggedTreeItemsIdentifier>();

	protected breadcrumbsControl: BreadcrumbsControl | undefined = undefined;

	private editorActionsToolbar: WorkbenchToolBar | undefined;

	private resourceContext: ResourceContextKey;

	private editorPinnedContext: IContextKey<boolean>;
	private editorIsFirstContext: IContextKey<boolean>;
	private editorIsLastContext: IContextKey<boolean>;
	private editorStickyContext: IContextKey<boolean>;

	private editorCanSplitInGroupContext: IContextKey<boolean>;
	private sideBySideEditorContext: IContextKey<boolean>;

	private groupLockedContext: IContextKey<boolean>;

	private readonly editorToolBarMenuDisposables = this._register(new DisposableStore());

	private renderDropdownAsChildElement: boolean;

	constructor(
		parent: HTMLElement,
		protected accessor: IEditorGroupsAccessor,
		protected group: IEditorGroupView,
		@IContextMenuService protected readonly contextMenuService: IContextMenuService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IContextKeyService protected readonly contextKeyService: IContextKeyService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@INotificationService private readonly notificationService: INotificationService,
		@IMenuService private readonly menuService: IMenuService,
		@IQuickInputService protected quickInputService: IQuickInputService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService
	) {
		super(themeService);

		this.resourceContext = this._register(instantiationService.createInstance(ResourceContextKey));

		this.editorPinnedContext = ActiveEditorPinnedContext.bindTo(contextKeyService);
		this.editorIsFirstContext = ActiveEditorFirstInGroupContext.bindTo(contextKeyService);
		this.editorIsLastContext = ActiveEditorLastInGroupContext.bindTo(contextKeyService);
		this.editorStickyContext = ActiveEditorStickyContext.bindTo(contextKeyService);

		this.editorCanSplitInGroupContext = ActiveEditorCanSplitInGroupContext.bindTo(contextKeyService);
		this.sideBySideEditorContext = SideBySideEditorActiveContext.bindTo(contextKeyService);

		this.groupLockedContext = ActiveEditorGroupLockedContext.bindTo(contextKeyService);

		this.renderDropdownAsChildElement = false;

		this.create(parent);
	}

	protected abstract create(parent: HTMLElement): void;

	protected createBreadcrumbsControl(container: HTMLElement, options: IBreadcrumbsControlOptions): void {
		const config = this._register(BreadcrumbsConfig.IsEnabled.bindTo(this.configurationService));
		this._register(config.onDidChange(() => {
			const value = config.getValue();
			if (!value && this.breadcrumbsControl) {
				this.breadcrumbsControl.dispose();
				this.breadcrumbsControl = undefined;
				this.handleBreadcrumbsEnablementChange();
			} else if (value && !this.breadcrumbsControl) {
				this.breadcrumbsControl = this.instantiationService.createInstance(BreadcrumbsControl, container, options, this.group);
				this.breadcrumbsControl.update();
				this.handleBreadcrumbsEnablementChange();
			}
		}));

		if (config.getValue()) {
			this.breadcrumbsControl = this.instantiationService.createInstance(BreadcrumbsControl, container, options, this.group);
		}

		this._register(this.fileService.onDidChangeFileSystemProviderRegistrations(e => {
			if (this.breadcrumbsControl?.model && this.breadcrumbsControl.model.resource.scheme !== e.scheme) {
				// ignore if the scheme of the breadcrumbs resource is not affected
				return;
			}
			if (this.breadcrumbsControl?.update()) {
				this.handleBreadcrumbsEnablementChange();
			}
		}));
	}

	protected abstract handleBreadcrumbsEnablementChange(): void;

	protected createEditorActionsToolBar(container: HTMLElement): void {
		const context: IEditorCommandsContext = { groupId: this.group.id };

		// Toolbar Widget

		this.editorActionsToolbar = this._register(this.instantiationService.createInstance(WorkbenchToolBar, container, {
			actionViewItemProvider: action => this.actionViewItemProvider(action),
			orientation: ActionsOrientation.HORIZONTAL,
			ariaLabel: localize('ariaLabelEditorActions', "Editor actions"),
			getKeyBinding: action => this.getKeybinding(action),
			actionRunner: this._register(new EditorCommandsContextActionRunner(context)),
			anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
			renderDropdownAsChildElement: this.renderDropdownAsChildElement,
			telemetrySource: 'editorPart',
			resetMenu: MenuId.EditorTitle,
			maxNumberOfItems: 9
		}));

		// Context
		this.editorActionsToolbar.context = context;

		// Action Run Handling
		this._register(this.editorActionsToolbar.actionRunner.onDidRun(e => {

			// Notify for Error
			if (e.error && !isCancellationError(e.error)) {
				this.notificationService.error(e.error);
			}
		}));
	}

	private actionViewItemProvider(action: IAction): IActionViewItem | undefined {
		const activeEditorPane = this.group.activeEditorPane;

		// Check Active Editor
		if (activeEditorPane instanceof EditorPane) {
			const result = activeEditorPane.getActionViewItem(action);

			if (result) {
				return result;
			}
		}

		// Check extensions
		return createActionViewItem(this.instantiationService, action, { menuAsChild: this.renderDropdownAsChildElement });
	}

	protected updateEditorActionsToolbar(): void {
		const { primary, secondary } = this.prepareEditorActions(this.getEditorActions());

		const editorActionsToolbar = assertIsDefined(this.editorActionsToolbar);
		editorActionsToolbar.setActions(prepareActions(primary), prepareActions(secondary));
	}

	protected abstract prepareEditorActions(editorActions: IToolbarActions): IToolbarActions;

	private getEditorActions(): IToolbarActions {
		const primary: IAction[] = [];
		const secondary: IAction[] = [];

		// Dispose previous listeners
		this.editorToolBarMenuDisposables.clear();

		// Update contexts
		this.contextKeyService.bufferChangeEvents(() => {
			const activeEditor = this.group.activeEditor;

			this.resourceContext.set(withUndefinedAsNull(EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY })));

			this.editorPinnedContext.set(activeEditor ? this.group.isPinned(activeEditor) : false);
			this.editorIsFirstContext.set(activeEditor ? this.group.isFirst(activeEditor) : false);
			this.editorIsLastContext.set(activeEditor ? this.group.isLast(activeEditor) : false);
			this.editorStickyContext.set(activeEditor ? this.group.isSticky(activeEditor) : false);

			this.editorCanSplitInGroupContext.set(activeEditor ? activeEditor.hasCapability(EditorInputCapabilities.CanSplitInGroup) : false);
			this.sideBySideEditorContext.set(activeEditor?.typeId === SideBySideEditorInput.ID);

			this.groupLockedContext.set(this.group.isLocked);
		});

		// Editor actions require the editor control to be there, so we retrieve it via service
		const activeEditorPane = this.group.activeEditorPane;
		if (activeEditorPane instanceof EditorPane) {
			const scopedContextKeyService = this.getEditorPaneAwareContextKeyService();
			const titleBarMenu = this.menuService.createMenu(MenuId.EditorTitle, scopedContextKeyService, { emitEventsForSubmenuChanges: true, eventDebounceDelay: 0 });
			this.editorToolBarMenuDisposables.add(titleBarMenu);
			this.editorToolBarMenuDisposables.add(titleBarMenu.onDidChange(() => {
				this.updateEditorActionsToolbar(); // Update editor toolbar whenever contributed actions change
			}));

			const shouldInlineGroup = (action: SubmenuAction, group: string) => group === 'navigation' && action.actions.length <= 1;

			createAndFillInActionBarActions(
				titleBarMenu,
				{ arg: this.resourceContext.get(), shouldForwardArgs: true },
				{ primary, secondary },
				'navigation',
				shouldInlineGroup
			);
		}

		return { primary, secondary };
	}

	private getEditorPaneAwareContextKeyService(): IContextKeyService {
		return this.group.activeEditorPane?.scopedContextKeyService ?? this.contextKeyService;
	}

	protected clearEditorActionsToolbar(): void {
		this.editorActionsToolbar?.setActions([], []);
	}

	protected enableGroupDragging(element: HTMLElement): void {

		// Drag start
		this._register(addDisposableListener(element, EventType.DRAG_START, e => {
			if (e.target !== element) {
				return; // only if originating from tabs container
			}

			// Set editor group as transfer
			this.groupTransfer.setData([new DraggedEditorGroupIdentifier(this.group.id)], DraggedEditorGroupIdentifier.prototype);
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'copyMove';
			}

			// Drag all tabs of the group if tabs are enabled
			let hasDataTransfer = false;
			if (this.accessor.partOptions.showTabs) {
				hasDataTransfer = this.doFillResourceDataTransfers(this.group.getEditors(EditorsOrder.SEQUENTIAL), e);
			}

			// Otherwise only drag the active editor
			else {
				if (this.group.activeEditor) {
					hasDataTransfer = this.doFillResourceDataTransfers([this.group.activeEditor], e);
				}
			}

			// Firefox: requires to set a text data transfer to get going
			if (!hasDataTransfer && isFirefox) {
				e.dataTransfer?.setData(DataTransfers.TEXT, String(this.group.label));
			}

			// Drag Image
			if (this.group.activeEditor) {
				let label = this.group.activeEditor.getName();
				if (this.accessor.partOptions.showTabs && this.group.count > 1) {
					label = localize('draggedEditorGroup', "{0} (+{1})", label, this.group.count - 1);
				}

				applyDragImage(e, label, 'monaco-editor-group-drag-image', this.getColor(listActiveSelectionBackground), this.getColor(listActiveSelectionForeground));
			}
		}));

		// Drag end
		this._register(addDisposableListener(element, EventType.DRAG_END, () => {
			this.groupTransfer.clearData(DraggedEditorGroupIdentifier.prototype);
		}));
	}

	protected doFillResourceDataTransfers(editors: readonly EditorInput[], e: DragEvent): boolean {
		if (editors.length) {
			this.instantiationService.invokeFunction(fillEditorsDragData, editors.map(editor => ({ editor, groupId: this.group.id })), e);

			return true;
		}

		return false;
	}

	protected onContextMenu(editor: EditorInput, e: Event, node: HTMLElement): void {

		// Update contexts based on editor picked and remember previous to restore
		const currentResourceContext = this.resourceContext.get();
		this.resourceContext.set(withUndefinedAsNull(EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY })));
		const currentPinnedContext = !!this.editorPinnedContext.get();
		this.editorPinnedContext.set(this.group.isPinned(editor));
		const currentEditorIsFirstContext = !!this.editorIsFirstContext.get();
		this.editorIsFirstContext.set(this.group.isFirst(editor));
		const currentEditorIsLastContext = !!this.editorIsLastContext.get();
		this.editorIsLastContext.set(this.group.isLast(editor));
		const currentStickyContext = !!this.editorStickyContext.get();
		this.editorStickyContext.set(this.group.isSticky(editor));
		const currentGroupLockedContext = !!this.groupLockedContext.get();
		this.groupLockedContext.set(this.group.isLocked);
		const currentEditorCanSplitContext = !!this.editorCanSplitInGroupContext.get();
		this.editorCanSplitInGroupContext.set(editor.hasCapability(EditorInputCapabilities.CanSplitInGroup));
		const currentSideBySideEditorContext = !!this.sideBySideEditorContext.get();
		this.sideBySideEditorContext.set(editor.typeId === SideBySideEditorInput.ID);

		// Find target anchor
		let anchor: HTMLElement | { x: number; y: number } = node;
		if (e instanceof MouseEvent) {
			const event = new StandardMouseEvent(e);
			anchor = { x: event.posx, y: event.posy };
		}

		// Show it
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			menuId: MenuId.EditorTitleContext,
			menuActionOptions: { shouldForwardArgs: true, arg: this.resourceContext.get() },
			contextKeyService: this.contextKeyService,
			getActionsContext: () => ({ groupId: this.group.id, editorIndex: this.group.getIndexOfEditor(editor) }),
			getKeyBinding: action => this.getKeybinding(action),
			onHide: () => {

				// restore previous contexts
				this.resourceContext.set(currentResourceContext || null);
				this.editorPinnedContext.set(currentPinnedContext);
				this.editorIsFirstContext.set(currentEditorIsFirstContext);
				this.editorIsLastContext.set(currentEditorIsLastContext);
				this.editorStickyContext.set(currentStickyContext);
				this.groupLockedContext.set(currentGroupLockedContext);
				this.editorCanSplitInGroupContext.set(currentEditorCanSplitContext);
				this.sideBySideEditorContext.set(currentSideBySideEditorContext);

				// restore focus to active group
				this.accessor.activeGroup.focus();
			}
		});
	}

	protected getKeybinding(action: IAction): ResolvedKeybinding | undefined {
		return this.keybindingService.lookupKeybinding(action.id, this.getEditorPaneAwareContextKeyService());
	}

	protected getKeybindingLabel(action: IAction): string | undefined {
		const keybinding = this.getKeybinding(action);

		return keybinding ? withNullAsUndefined(keybinding.getLabel()) : undefined;
	}

	abstract openEditor(editor: EditorInput): void;

	abstract openEditors(editors: EditorInput[]): void;

	abstract beforeCloseEditor(editor: EditorInput): void;

	abstract closeEditor(editor: EditorInput): void;

	abstract closeEditors(editors: EditorInput[]): void;

	abstract moveEditor(editor: EditorInput, fromIndex: number, targetIndex: number): void;

	abstract pinEditor(editor: EditorInput): void;

	abstract stickEditor(editor: EditorInput): void;

	abstract unstickEditor(editor: EditorInput): void;

	abstract setActive(isActive: boolean): void;

	abstract updateEditorLabel(editor: EditorInput): void;

	abstract updateEditorDirty(editor: EditorInput): void;

	abstract updateOptions(oldOptions: IEditorPartOptions, newOptions: IEditorPartOptions): void;

	abstract layout(dimensions: ITitleControlDimensions): Dimension;

	abstract getHeight(): IEditorGroupTitleHeight;

	override dispose(): void {
		dispose(this.breadcrumbsControl);
		this.breadcrumbsControl = undefined;

		super.dispose();
	}
}
