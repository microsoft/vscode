/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/editortabscontrol';
import { localize } from 'vs/nls';
import { applyDragImage, DataTransfers } from 'vs/base/browser/dnd';
import { addDisposableListener, Dimension, EventType } from 'vs/base/browser/dom';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { ActionsOrientation, IActionViewItem, prepareActions } from 'vs/base/browser/ui/actionbar/actionbar';
import { IAction, SubmenuAction, ActionRunner } from 'vs/base/common/actions';
import { ResolvedKeybinding } from 'vs/base/common/keybindings';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { createActionViewItem, createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
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
import { IEditorGroupsView, IEditorGroupView, IInternalEditorOpenOptions } from 'vs/workbench/browser/parts/editor/editor';
import { IEditorCommandsContext, EditorResourceAccessor, IEditorPartOptions, SideBySideEditor, EditorsOrder, EditorInputCapabilities } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { ResourceContextKey, ActiveEditorPinnedContext, ActiveEditorStickyContext, ActiveEditorGroupLockedContext, ActiveEditorCanSplitInGroupContext, SideBySideEditorActiveContext, ActiveEditorLastInGroupContext, ActiveEditorFirstInGroupContext, ActiveEditorAvailableEditorIdsContext, applyAvailableEditorIds } from 'vs/workbench/common/contextkeys';
import { AnchorAlignment } from 'vs/base/browser/ui/contextview/contextview';
import { assertIsDefined } from 'vs/base/common/types';
import { isFirefox } from 'vs/base/browser/browser';
import { isCancellationError } from 'vs/base/common/errors';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { LocalSelectionTransfer } from 'vs/platform/dnd/browser/dnd';
import { DraggedTreeItemsIdentifier } from 'vs/editor/common/services/treeViewsDnd';
import { IEditorResolverService } from 'vs/workbench/services/editor/common/editorResolverService';
import { IEditorTitleControlDimensions } from 'vs/workbench/browser/parts/editor/editorTitleControl';
import { IReadonlyEditorGroupModel } from 'vs/workbench/common/editor/editorGroupModel';
import { EDITOR_CORE_NAVIGATION_COMMANDS } from 'vs/workbench/browser/parts/editor/editorCommands';

export interface IToolbarActions {
	readonly primary: IAction[];
	readonly secondary: IAction[];
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

export interface IEditorTabsControl extends IDisposable {
	updateOptions(oldOptions: IEditorPartOptions, newOptions: IEditorPartOptions): void;
	openEditor(editor: EditorInput, options?: IInternalEditorOpenOptions): boolean;
	openEditors(editors: EditorInput[]): boolean;
	beforeCloseEditor(editor: EditorInput): void;
	closeEditor(editor: EditorInput): void;
	closeEditors(editors: EditorInput[]): void;
	moveEditor(editor: EditorInput, fromIndex: number, targetIndex: number, stickyStateChange: boolean): void;
	pinEditor(editor: EditorInput): void;
	stickEditor(editor: EditorInput): void;
	unstickEditor(editor: EditorInput): void;
	setActive(isActive: boolean): void;
	updateEditorLabel(editor: EditorInput): void;
	updateEditorDirty(editor: EditorInput): void;
	layout(dimensions: IEditorTitleControlDimensions): Dimension;
	getHeight(): number;
}

export abstract class EditorTabsControl extends Themable implements IEditorTabsControl {

	protected readonly editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();
	protected readonly groupTransfer = LocalSelectionTransfer.getInstance<DraggedEditorGroupIdentifier>();
	protected readonly treeItemsTransfer = LocalSelectionTransfer.getInstance<DraggedTreeItemsIdentifier>();

	private static readonly EDITOR_TAB_HEIGHT = {
		normal: 35 as const,
		compact: 22 as const
	};

	private editorActionsToolbar: WorkbenchToolBar | undefined;

	private resourceContext: ResourceContextKey;

	private editorPinnedContext: IContextKey<boolean>;
	private editorIsFirstContext: IContextKey<boolean>;
	private editorIsLastContext: IContextKey<boolean>;
	private editorStickyContext: IContextKey<boolean>;
	private editorAvailableEditorIds: IContextKey<string>;

	private editorCanSplitInGroupContext: IContextKey<boolean>;
	private sideBySideEditorContext: IContextKey<boolean>;

	private groupLockedContext: IContextKey<boolean>;

	private readonly editorToolBarMenuDisposables = this._register(new DisposableStore());

	private renderDropdownAsChildElement: boolean;

	constructor(
		private parent: HTMLElement,
		protected groupsView: IEditorGroupsView,
		protected groupView: IEditorGroupView,
		protected tabsModel: IReadonlyEditorGroupModel,
		@IContextMenuService protected readonly contextMenuService: IContextMenuService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IContextKeyService protected readonly contextKeyService: IContextKeyService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@INotificationService private readonly notificationService: INotificationService,
		@IMenuService private readonly menuService: IMenuService,
		@IQuickInputService protected quickInputService: IQuickInputService,
		@IThemeService themeService: IThemeService,
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService
	) {
		super(themeService);

		this.resourceContext = this._register(instantiationService.createInstance(ResourceContextKey));

		this.editorPinnedContext = ActiveEditorPinnedContext.bindTo(contextKeyService);
		this.editorIsFirstContext = ActiveEditorFirstInGroupContext.bindTo(contextKeyService);
		this.editorIsLastContext = ActiveEditorLastInGroupContext.bindTo(contextKeyService);
		this.editorStickyContext = ActiveEditorStickyContext.bindTo(contextKeyService);
		this.editorAvailableEditorIds = ActiveEditorAvailableEditorIdsContext.bindTo(this.contextKeyService);

		this.editorCanSplitInGroupContext = ActiveEditorCanSplitInGroupContext.bindTo(contextKeyService);
		this.sideBySideEditorContext = SideBySideEditorActiveContext.bindTo(contextKeyService);

		this.groupLockedContext = ActiveEditorGroupLockedContext.bindTo(contextKeyService);

		this.renderDropdownAsChildElement = false;

		this.create(parent);
	}

	protected create(parent: HTMLElement): void {
		this.updateTabHeight();
	}

	protected createEditorActionsToolBar(container: HTMLElement): void {
		const context: IEditorCommandsContext = { groupId: this.groupView.id };

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
			overflowBehavior: { maxItems: 9, exempted: EDITOR_CORE_NAVIGATION_COMMANDS },
			highlightToggledItems: true,
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
		const activeEditorPane = this.groupView.activeEditorPane;

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
			const activeEditor = this.groupView.activeEditor;

			this.resourceContext.set(EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY } ?? null));

			this.editorPinnedContext.set(activeEditor ? this.groupView.isPinned(activeEditor) : false);
			this.editorIsFirstContext.set(activeEditor ? this.groupView.isFirst(activeEditor) : false);
			this.editorIsLastContext.set(activeEditor ? this.groupView.isLast(activeEditor) : false);
			this.editorStickyContext.set(activeEditor ? this.groupView.isSticky(activeEditor) : false);
			applyAvailableEditorIds(this.editorAvailableEditorIds, activeEditor, this.editorResolverService);

			this.editorCanSplitInGroupContext.set(activeEditor ? activeEditor.hasCapability(EditorInputCapabilities.CanSplitInGroup) : false);
			this.sideBySideEditorContext.set(activeEditor?.typeId === SideBySideEditorInput.ID);

			this.groupLockedContext.set(this.groupView.isLocked);
		});

		// Editor actions require the editor control to be there, so we retrieve it via service
		const activeEditorPane = this.groupView.activeEditorPane;
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
		return this.groupView.activeEditorPane?.scopedContextKeyService ?? this.contextKeyService;
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
			this.groupTransfer.setData([new DraggedEditorGroupIdentifier(this.groupView.id)], DraggedEditorGroupIdentifier.prototype);
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'copyMove';
			}

			// Drag all tabs of the group if tabs are enabled
			let hasDataTransfer = false;
			if (this.groupsView.partOptions.showTabs) {
				hasDataTransfer = this.doFillResourceDataTransfers(this.groupView.getEditors(EditorsOrder.SEQUENTIAL), e);
			}

			// Otherwise only drag the active editor
			else {
				if (this.groupView.activeEditor) {
					hasDataTransfer = this.doFillResourceDataTransfers([this.groupView.activeEditor], e);
				}
			}

			// Firefox: requires to set a text data transfer to get going
			if (!hasDataTransfer && isFirefox) {
				e.dataTransfer?.setData(DataTransfers.TEXT, String(this.groupView.label));
			}

			// Drag Image
			if (this.groupView.activeEditor) {
				let label = this.groupView.activeEditor.getName();
				if (this.groupsView.partOptions.showTabs && this.groupView.count > 1) {
					label = localize('draggedEditorGroup', "{0} (+{1})", label, this.groupView.count - 1);
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
			this.instantiationService.invokeFunction(fillEditorsDragData, editors.map(editor => ({ editor, groupId: this.groupView.id })), e);

			return true;
		}

		return false;
	}

	protected onTabContextMenu(editor: EditorInput, e: Event, node: HTMLElement): void {

		// Update contexts based on editor picked and remember previous to restore
		const currentResourceContext = this.resourceContext.get();
		this.resourceContext.set(EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY } ?? null));
		const currentPinnedContext = !!this.editorPinnedContext.get();
		this.editorPinnedContext.set(this.tabsModel.isPinned(editor));
		const currentEditorIsFirstContext = !!this.editorIsFirstContext.get();
		this.editorIsFirstContext.set(this.tabsModel.isFirst(editor));
		const currentEditorIsLastContext = !!this.editorIsLastContext.get();
		this.editorIsLastContext.set(this.tabsModel.isLast(editor));
		const currentStickyContext = !!this.editorStickyContext.get();
		this.editorStickyContext.set(this.tabsModel.isSticky(editor));
		const currentGroupLockedContext = !!this.groupLockedContext.get();
		this.groupLockedContext.set(this.tabsModel.isLocked);
		const currentEditorCanSplitContext = !!this.editorCanSplitInGroupContext.get();
		this.editorCanSplitInGroupContext.set(editor.hasCapability(EditorInputCapabilities.CanSplitInGroup));
		const currentSideBySideEditorContext = !!this.sideBySideEditorContext.get();
		this.sideBySideEditorContext.set(editor.typeId === SideBySideEditorInput.ID);
		const currentEditorAvailableEditorIds = this.editorAvailableEditorIds.get() ?? '';
		applyAvailableEditorIds(this.editorAvailableEditorIds, editor, this.editorResolverService);

		// Find target anchor
		let anchor: HTMLElement | StandardMouseEvent = node;
		if (e instanceof MouseEvent) {
			anchor = new StandardMouseEvent(e);
		}

		// Show it
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			menuId: MenuId.EditorTitleContext,
			menuActionOptions: { shouldForwardArgs: true, arg: this.resourceContext.get() },
			contextKeyService: this.contextKeyService,
			getActionsContext: () => ({ groupId: this.groupView.id, editorIndex: this.groupView.getIndexOfEditor(editor) }),
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
				this.editorAvailableEditorIds.set(currentEditorAvailableEditorIds);

				// restore focus to active group
				this.groupsView.activeGroup.focus();
			}
		});
	}

	protected getKeybinding(action: IAction): ResolvedKeybinding | undefined {
		return this.keybindingService.lookupKeybinding(action.id, this.getEditorPaneAwareContextKeyService());
	}

	protected getKeybindingLabel(action: IAction): string | undefined {
		const keybinding = this.getKeybinding(action);

		return keybinding ? keybinding.getLabel() ?? undefined : undefined;
	}

	protected get tabHeight() {
		return this.groupsView.partOptions.tabHeight !== 'compact' ? EditorTabsControl.EDITOR_TAB_HEIGHT.normal : EditorTabsControl.EDITOR_TAB_HEIGHT.compact;
	}

	protected updateTabHeight(): void {
		this.parent.style.setProperty('--editor-group-tab-height', `${this.tabHeight}px`);
	}

	updateOptions(oldOptions: IEditorPartOptions, newOptions: IEditorPartOptions): void {

		// Update tab height
		if (oldOptions.tabHeight !== newOptions.tabHeight) {
			this.updateTabHeight();
		}
	}

	abstract openEditor(editor: EditorInput): boolean;

	abstract openEditors(editors: EditorInput[]): boolean;

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

	abstract layout(dimensions: IEditorTitleControlDimensions): Dimension;

	abstract getHeight(): number;
}
