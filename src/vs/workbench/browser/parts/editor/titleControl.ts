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
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IAction, WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification, SubmenuAction, ActionRunner } from 'vs/base/common/actions';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { dispose, DisposableStore } from 'vs/base/common/lifecycle';
import { createActionViewItem, createAndFillInActionBarActions, createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenu, IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { listActiveSelectionBackground, listActiveSelectionForeground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService, registerThemingParticipant, Themable } from 'vs/platform/theme/common/themeService';
import { DraggedEditorGroupIdentifier, DraggedEditorIdentifier, fillEditorsDragData, LocalSelectionTransfer } from 'vs/workbench/browser/dnd';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { BreadcrumbsConfig } from 'vs/workbench/browser/parts/editor/breadcrumbs';
import { BreadcrumbsControl, IBreadcrumbsControlOptions } from 'vs/workbench/browser/parts/editor/breadcrumbsControl';
import { IEditorGroupsAccessor, IEditorGroupTitleHeight, IEditorGroupView } from 'vs/workbench/browser/parts/editor/editor';
import { IEditorCommandsContext, IEditorInput, EditorResourceAccessor, IEditorPartOptions, SideBySideEditor, ActiveEditorPinnedContext, ActiveEditorStickyContext, EditorsOrder, ActiveEditorGroupLockedContext } from 'vs/workbench/common/editor';
import { ResourceContextKey } from 'vs/workbench/common/resources';
import { AnchorAlignment } from 'vs/base/browser/ui/contextview/contextview';
import { IFileService } from 'vs/platform/files/common/files';
import { withNullAsUndefined, withUndefinedAsNull, assertIsDefined } from 'vs/base/common/types';
import { isFirefox } from 'vs/base/browser/browser';
import { isPromiseCanceledError } from 'vs/base/common/errors';

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

	override run(action: IAction): Promise<void> {
		return super.run(action, this.context);
	}
}

export abstract class TitleControl extends Themable {

	protected readonly groupTransfer = LocalSelectionTransfer.getInstance<DraggedEditorGroupIdentifier>();
	protected readonly editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();

	protected breadcrumbsControl: BreadcrumbsControl | undefined = undefined;

	private editorActionsToolbar: ToolBar | undefined;

	private resourceContext: ResourceContextKey;

	private editorPinnedContext: IContextKey<boolean>;
	private editorStickyContext: IContextKey<boolean>;

	private groupLockedContext: IContextKey<boolean>;

	private readonly editorToolBarMenuDisposables = this._register(new DisposableStore());

	private contextMenu: IMenu;
	private renderDropdownAsChildElement: boolean;

	constructor(
		parent: HTMLElement,
		protected accessor: IEditorGroupsAccessor,
		protected group: IEditorGroupView,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
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
		this.editorStickyContext = ActiveEditorStickyContext.bindTo(contextKeyService);

		this.groupLockedContext = ActiveEditorGroupLockedContext.bindTo(contextKeyService);

		this.contextMenu = this._register(this.menuService.createMenu(MenuId.EditorTitleContext, this.contextKeyService));
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

		this._register(this.fileService.onDidChangeFileSystemProviderRegistrations(() => {
			if (this.breadcrumbsControl?.update()) {
				this.handleBreadcrumbsEnablementChange();
			}
		}));
	}

	protected abstract handleBreadcrumbsEnablementChange(): void;

	protected createEditorActionsToolBar(container: HTMLElement): void {
		const context: IEditorCommandsContext = { groupId: this.group.id };

		this.editorActionsToolbar = this._register(new ToolBar(container, this.contextMenuService, {
			actionViewItemProvider: action => this.actionViewItemProvider(action),
			orientation: ActionsOrientation.HORIZONTAL,
			ariaLabel: localize('ariaLabelEditorActions', "Editor actions"),
			getKeyBinding: action => this.getKeybinding(action),
			actionRunner: this._register(new EditorCommandsContextActionRunner(context)),
			anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
			renderDropdownAsChildElement: this.renderDropdownAsChildElement
		}));

		// Context
		this.editorActionsToolbar.context = context;

		// Action Run Handling
		this._register(this.editorActionsToolbar.actionRunner.onDidRun(e => {

			// Notify for Error
			if (e.error && !isPromiseCanceledError(e.error)) {
				this.notificationService.error(e.error);
			}

			// Log in telemetry
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: e.action.id, from: 'editorPart' });
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
			this.resourceContext.set(withUndefinedAsNull(EditorResourceAccessor.getOriginalUri(this.group.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY })));

			this.editorPinnedContext.set(this.group.activeEditor ? this.group.isPinned(this.group.activeEditor) : false);
			this.editorStickyContext.set(this.group.activeEditor ? this.group.isSticky(this.group.activeEditor) : false);

			this.groupLockedContext.set(this.group.isLocked);
		});

		// Editor actions require the editor control to be there, so we retrieve it via service
		const activeEditorPane = this.group.activeEditorPane;
		if (activeEditorPane instanceof EditorPane) {
			const scopedContextKeyService = activeEditorPane.scopedContextKeyService ?? this.contextKeyService;
			const titleBarMenu = this.menuService.createMenu(MenuId.EditorTitle, scopedContextKeyService, { emitEventsForSubmenuChanges: true });
			this.editorToolBarMenuDisposables.add(titleBarMenu);
			this.editorToolBarMenuDisposables.add(titleBarMenu.onDidChange(() => {
				this.updateEditorActionsToolbar(); // Update editor toolbar whenever contributed actions change
			}));

			const shouldInlineGroup = (action: SubmenuAction, group: string) => group === 'navigation' && action.actions.length <= 1;

			this.editorToolBarMenuDisposables.add(createAndFillInActionBarActions(
				titleBarMenu,
				{ arg: this.resourceContext.get(), shouldForwardArgs: true },
				{ primary, secondary },
				'navigation',
				9,
				shouldInlineGroup
			));
		}

		return { primary, secondary };
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

				applyDragImage(e, label, 'monaco-editor-group-drag-image');
			}
		}));

		// Drag end
		this._register(addDisposableListener(element, EventType.DRAG_END, () => {
			this.groupTransfer.clearData(DraggedEditorGroupIdentifier.prototype);
		}));
	}

	protected doFillResourceDataTransfers(editors: readonly IEditorInput[], e: DragEvent): boolean {
		if (editors.length) {
			this.instantiationService.invokeFunction(fillEditorsDragData, editors.map(editor => ({ editor, groupId: this.group.id })), e);

			return true;
		}

		return false;
	}

	protected onContextMenu(editor: IEditorInput, e: Event, node: HTMLElement): void {

		// Update contexts based on editor picked and remember previous to restore
		const currentResourceContext = this.resourceContext.get();
		this.resourceContext.set(withUndefinedAsNull(EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY })));
		const currentPinnedContext = !!this.editorPinnedContext.get();
		this.editorPinnedContext.set(this.group.isPinned(editor));
		const currentStickyContext = !!this.editorStickyContext.get();
		this.editorStickyContext.set(this.group.isSticky(editor));
		const currentGroupLockedContext = !!this.groupLockedContext.get();
		this.groupLockedContext.set(this.group.isLocked);

		// Find target anchor
		let anchor: HTMLElement | { x: number, y: number } = node;
		if (e instanceof MouseEvent) {
			const event = new StandardMouseEvent(e);
			anchor = { x: event.posx, y: event.posy };
		}

		// Fill in contributed actions
		const actions: IAction[] = [];
		const actionsDisposable = createAndFillInContextMenuActions(this.contextMenu, { shouldForwardArgs: true, arg: this.resourceContext.get() }, actions);

		// Show it
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			getActionsContext: () => ({ groupId: this.group.id, editorIndex: this.group.getIndexOfEditor(editor) }),
			getKeyBinding: action => this.getKeybinding(action),
			onHide: () => {

				// restore previous contexts
				this.resourceContext.set(currentResourceContext || null);
				this.editorPinnedContext.set(currentPinnedContext);
				this.editorStickyContext.set(currentStickyContext);
				this.groupLockedContext.set(currentGroupLockedContext);

				// restore focus to active group
				this.accessor.activeGroup.focus();

				// Cleanup
				dispose(actionsDisposable);
			}
		});
	}

	private getKeybinding(action: IAction): ResolvedKeybinding | undefined {
		return this.keybindingService.lookupKeybinding(action.id);
	}

	protected getKeybindingLabel(action: IAction): string | undefined {
		const keybinding = this.getKeybinding(action);

		return keybinding ? withNullAsUndefined(keybinding.getLabel()) : undefined;
	}

	abstract openEditor(editor: IEditorInput): void;

	abstract openEditors(editors: IEditorInput[]): void;

	abstract closeEditor(editor: IEditorInput): void;

	abstract closeEditors(editors: IEditorInput[]): void;

	abstract moveEditor(editor: IEditorInput, fromIndex: number, targetIndex: number): void;

	abstract pinEditor(editor: IEditorInput): void;

	abstract stickEditor(editor: IEditorInput): void;

	abstract unstickEditor(editor: IEditorInput): void;

	abstract setActive(isActive: boolean): void;

	abstract updateEditorLabel(editor: IEditorInput): void;

	abstract updateEditorCapabilities(editor: IEditorInput): void;

	abstract updateEditorLabels(): void;

	abstract updateEditorDirty(editor: IEditorInput): void;

	abstract updateOptions(oldOptions: IEditorPartOptions, newOptions: IEditorPartOptions): void;

	abstract layout(dimensions: ITitleControlDimensions): Dimension;

	abstract getHeight(): IEditorGroupTitleHeight;

	override dispose(): void {
		dispose(this.breadcrumbsControl);
		this.breadcrumbsControl = undefined;

		super.dispose();
	}
}

registerThemingParticipant((theme, collector) => {

	// Drag Feedback
	const dragImageBackground = theme.getColor(listActiveSelectionBackground);
	const dragImageForeground = theme.getColor(listActiveSelectionForeground);
	collector.addRule(`
		.monaco-editor-group-drag-image {
			background: ${dragImageBackground};
			color: ${dragImageForeground};
		}
	`);
});
