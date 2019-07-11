/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { applyDragImage } from 'vs/base/browser/dnd';
import { addDisposableListener, Dimension, EventType } from 'vs/base/browser/dom';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { ActionsOrientation, IActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IAction, IRunEvent, WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification } from 'vs/base/common/actions';
import * as arrays from 'vs/base/common/arrays';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { dispose, DisposableStore } from 'vs/base/common/lifecycle';
import 'vs/css!./media/titlecontrol';
import { getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { localize } from 'vs/nls';
import { createActionViewItem, createAndFillInActionBarActions, createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { ExecuteCommandAction, IMenu, IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { listActiveSelectionBackground, listActiveSelectionForeground } from 'vs/platform/theme/common/colorRegistry';
import { ICssStyleCollector, ITheme, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { prepareActions } from 'vs/workbench/browser/actions';
import { DraggedEditorGroupIdentifier, DraggedEditorIdentifier, fillResourceDataTransfers, LocalSelectionTransfer } from 'vs/workbench/browser/dnd';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { BreadcrumbsConfig } from 'vs/workbench/browser/parts/editor/breadcrumbs';
import { BreadcrumbsControl, IBreadcrumbsControlOptions } from 'vs/workbench/browser/parts/editor/breadcrumbsControl';
import { EDITOR_TITLE_HEIGHT, IEditorGroupsAccessor, IEditorGroupView } from 'vs/workbench/browser/parts/editor/editor';
import { EditorCommandsContextActionRunner, IEditorCommandsContext, IEditorInput, toResource, IEditorPartOptions, SideBySideEditor, EditorPinnedContext } from 'vs/workbench/common/editor';
import { ResourceContextKey } from 'vs/workbench/common/resources';
import { Themable } from 'vs/workbench/common/theme';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { AnchorAlignment } from 'vs/base/browser/ui/contextview/contextview';
import { IFileService } from 'vs/platform/files/common/files';
import { withNullAsUndefined, withUndefinedAsNull } from 'vs/base/common/types';
import { ILabelService } from 'vs/platform/label/common/label';

export interface IToolbarActions {
	primary: IAction[];
	secondary: IAction[];
}

export abstract class TitleControl extends Themable {

	protected readonly groupTransfer = LocalSelectionTransfer.getInstance<DraggedEditorGroupIdentifier>();
	protected readonly editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();

	protected breadcrumbsControl?: BreadcrumbsControl;

	private currentPrimaryEditorActionIds: string[] = [];
	private currentSecondaryEditorActionIds: string[] = [];

	protected editorActionsToolbar: ToolBar;

	private resourceContext: ResourceContextKey;
	private editorPinnedContext: IContextKey<boolean>;

	private readonly editorToolBarMenuDisposables = this._register(new DisposableStore());

	private contextMenu: IMenu;

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
		@IQuickOpenService protected quickOpenService: IQuickOpenService,
		@IThemeService themeService: IThemeService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@ILabelService private readonly labelService: ILabelService
	) {
		super(themeService);

		this.resourceContext = this._register(instantiationService.createInstance(ResourceContextKey));
		this.editorPinnedContext = EditorPinnedContext.bindTo(contextKeyService);

		this.contextMenu = this._register(this.menuService.createMenu(MenuId.EditorTitleContext, this.contextKeyService));

		this.create(parent);
		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.extensionService.onDidRegisterExtensions(() => this.updateEditorActionsToolbar()));
		this._register(this.labelService.onDidChangeFormatters(() => this.updateEditorLabels()));
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
			if (this.breadcrumbsControl && this.breadcrumbsControl.update()) {
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
			ariaLabel: localize('araLabelEditorActions', "Editor actions"),
			getKeyBinding: action => this.getKeybinding(action),
			actionRunner: this._register(new EditorCommandsContextActionRunner(context)),
			anchorAlignmentProvider: () => AnchorAlignment.RIGHT
		}));

		// Context
		this.editorActionsToolbar.context = context;

		// Action Run Handling
		this._register(this.editorActionsToolbar.actionRunner.onDidRun((e: IRunEvent) => {

			// Notify for Error
			this.notificationService.error(e.error);

			// Log in telemetry
			if (this.telemetryService) {
				this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: e.action.id, from: 'editorPart' });
			}
		}));
	}

	private actionViewItemProvider(action: IAction): IActionViewItem | undefined {
		const activeControl = this.group.activeControl;

		// Check Active Editor
		let actionViewItem: IActionViewItem | undefined = undefined;
		if (activeControl instanceof BaseEditor) {
			actionViewItem = activeControl.getActionViewItem(action);
		}

		// Check extensions
		if (!actionViewItem) {
			actionViewItem = createActionViewItem(action, this.keybindingService, this.notificationService, this.contextMenuService);
		}

		return actionViewItem;
	}

	protected updateEditorActionsToolbar(): void {

		// Update Editor Actions Toolbar
		const { primaryEditorActions, secondaryEditorActions } = this.prepareEditorActions(this.getEditorActions());

		// Only update if something actually has changed
		const primaryEditorActionIds = primaryEditorActions.map(a => a.id);
		const secondaryEditorActionIds = secondaryEditorActions.map(a => a.id);
		if (
			!arrays.equals(primaryEditorActionIds, this.currentPrimaryEditorActionIds) ||
			!arrays.equals(secondaryEditorActionIds, this.currentSecondaryEditorActionIds) ||
			primaryEditorActions.some(action => action instanceof ExecuteCommandAction) || // execute command actions can have the same ID but different arguments
			secondaryEditorActions.some(action => action instanceof ExecuteCommandAction)  // see also https://github.com/Microsoft/vscode/issues/16298
		) {
			this.editorActionsToolbar.setActions(primaryEditorActions, secondaryEditorActions)();

			this.currentPrimaryEditorActionIds = primaryEditorActionIds;
			this.currentSecondaryEditorActionIds = secondaryEditorActionIds;
		}
	}

	protected prepareEditorActions(editorActions: IToolbarActions): { primaryEditorActions: IAction[]; secondaryEditorActions: IAction[]; } {
		let primaryEditorActions: IAction[];
		let secondaryEditorActions: IAction[];

		// Primary actions only for the active group
		if (this.accessor.activeGroup === this.group) {
			primaryEditorActions = prepareActions(editorActions.primary);
		} else {
			primaryEditorActions = [];
		}

		// Secondary actions for all groups
		secondaryEditorActions = prepareActions(editorActions.secondary);

		return { primaryEditorActions, secondaryEditorActions };
	}

	private getEditorActions(): IToolbarActions {
		const primary: IAction[] = [];
		const secondary: IAction[] = [];

		// Dispose previous listeners
		this.editorToolBarMenuDisposables.clear();

		// Update contexts
		this.resourceContext.set(this.group.activeEditor ? withUndefinedAsNull(toResource(this.group.activeEditor, { supportSideBySide: SideBySideEditor.MASTER })) : null);
		this.editorPinnedContext.set(this.group.activeEditor ? this.group.isPinned(this.group.activeEditor) : false);

		// Editor actions require the editor control to be there, so we retrieve it via service
		const activeControl = this.group.activeControl;
		if (activeControl instanceof BaseEditor) {
			const codeEditor = getCodeEditor(activeControl.getControl());
			const scopedContextKeyService = codeEditor && codeEditor.invokeWithinContext(accessor => accessor.get(IContextKeyService)) || this.contextKeyService;
			const titleBarMenu = this.menuService.createMenu(MenuId.EditorTitle, scopedContextKeyService);
			this.editorToolBarMenuDisposables.add(titleBarMenu);
			this.editorToolBarMenuDisposables.add(titleBarMenu.onDidChange(() => {
				this.updateEditorActionsToolbar(); // Update editor toolbar whenever contributed actions change
			}));

			this.editorToolBarMenuDisposables.add(createAndFillInActionBarActions(titleBarMenu, { arg: this.resourceContext.get(), shouldForwardArgs: true }, { primary, secondary }));
		}

		return { primary, secondary };
	}

	protected clearEditorActionsToolbar(): void {
		this.editorActionsToolbar.setActions([], [])();

		this.currentPrimaryEditorActionIds = [];
		this.currentSecondaryEditorActionIds = [];
	}

	protected enableGroupDragging(element: HTMLElement): void {

		// Drag start
		this._register(addDisposableListener(element, EventType.DRAG_START, (e: DragEvent) => {
			if (e.target !== element) {
				return; // only if originating from tabs container
			}

			// Set editor group as transfer
			this.groupTransfer.setData([new DraggedEditorGroupIdentifier(this.group.id)], DraggedEditorGroupIdentifier.prototype);
			e.dataTransfer!.effectAllowed = 'copyMove';

			// If tabs are disabled, treat dragging as if an editor tab was dragged
			if (!this.accessor.partOptions.showTabs) {
				const resource = this.group.activeEditor ? toResource(this.group.activeEditor, { supportSideBySide: SideBySideEditor.MASTER }) : null;
				if (resource) {
					this.instantiationService.invokeFunction(fillResourceDataTransfers, [resource], e);
				}
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

	protected onContextMenu(editor: IEditorInput, e: Event, node: HTMLElement): void {

		// Update contexts based on editor picked and remember previous to restore
		const currentResourceContext = this.resourceContext.get();
		this.resourceContext.set(withUndefinedAsNull(toResource(editor, { supportSideBySide: SideBySideEditor.MASTER })));
		const currentPinnedContext = !!this.editorPinnedContext.get();
		this.editorPinnedContext.set(this.group.isPinned(editor));

		// Find target anchor
		let anchor: HTMLElement | { x: number, y: number } = node;
		if (e instanceof MouseEvent) {
			const event = new StandardMouseEvent(e);
			anchor = { x: event.posx, y: event.posy };
		}

		// Fill in contributed actions
		const actions: IAction[] = [];
		const actionsDisposable = createAndFillInContextMenuActions(this.contextMenu, { shouldForwardArgs: true, arg: this.resourceContext.get() }, actions, this.contextMenuService);

		// Show it
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			getActionsContext: () => ({ groupId: this.group.id, editorIndex: this.group.getIndexOfEditor(editor) }),
			getKeyBinding: (action) => this.getKeybinding(action),
			onHide: () => {

				// restore previous contexts
				this.resourceContext.set(currentResourceContext || null);
				this.editorPinnedContext.set(currentPinnedContext);

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

	abstract closeEditor(editor: IEditorInput): void;

	abstract closeEditors(editors: IEditorInput[]): void;

	abstract closeAllEditors(): void;

	abstract moveEditor(editor: IEditorInput, fromIndex: number, targetIndex: number): void;

	abstract pinEditor(editor: IEditorInput): void;

	abstract setActive(isActive: boolean): void;

	abstract updateEditorLabel(editor: IEditorInput): void;

	abstract updateEditorLabels(): void;

	abstract updateEditorDirty(editor: IEditorInput): void;

	abstract updateOptions(oldOptions: IEditorPartOptions, newOptions: IEditorPartOptions): void;

	abstract updateStyles(): void;

	layout(dimension: Dimension): void {
		if (this.breadcrumbsControl) {
			this.breadcrumbsControl.layout(undefined);
		}
	}

	getPreferredHeight(): number {
		return EDITOR_TITLE_HEIGHT + (this.breadcrumbsControl && !this.breadcrumbsControl.isHidden() ? BreadcrumbsControl.HEIGHT : 0);
	}

	dispose(): void {
		dispose(this.breadcrumbsControl);
		this.breadcrumbsControl = undefined;

		super.dispose();
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {

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
