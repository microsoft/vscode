/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/nextTitleControl';
import * as nls from 'vs/nls';
import { prepareActions } from 'vs/workbench/browser/actions';
import { IAction, Action, IRunEvent } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { RunOnceScheduler } from 'vs/base/common/async';
import * as arrays from 'vs/base/common/arrays';
import { IEditorStacksModel, IEditorIdentifier, EditorInput, toResource, IEditorCommandsContext, IEditorGroup, EditorOptions } from 'vs/workbench/common/editor';
import { IActionItem, ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { CloseOneEditorAction, SplitEditorGroupVerticalAction, SplitEditorGroupHorizontalAction } from 'vs/workbench/browser/parts/editor/editorActions';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { createActionItem, fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { IMenuService, MenuId, IMenu, ExecuteCommandAction } from 'vs/platform/actions/common/actions';
import { ResourceContextKey } from 'vs/workbench/common/resources';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Themable } from 'vs/workbench/common/theme';
import { isDiffEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { Dimension } from 'vs/base/browser/dom';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { INextEditorGroupsService, INextEditorGroup } from 'vs/workbench/services/editor/common/nextEditorGroupsService';
import { IEditorInput } from 'vs/platform/editor/common/editor';

export interface IToolbarActions {
	primary: IAction[];
	secondary: IAction[];
}

export interface INextTitleAreaControl extends IDisposable {

	openEditor(editor: EditorInput, options?: EditorOptions): void;
	closeEditor(editor: EditorInput): void;
	moveEditor(editor: EditorInput, targetIndex: number): void;
	setActive(isActive: boolean): void;
	pinEditor(editor: EditorInput): void;
	updateEditorLabel(editor: EditorInput): void;

	layout(dimension: Dimension): void;
}

export abstract class NextTitleControl extends Themable implements INextTitleAreaControl {

	protected stacks: IEditorStacksModel;

	protected closeOneEditorAction: CloseOneEditorAction;

	private currentPrimaryEditorActionIds: string[] = [];
	private currentSecondaryEditorActionIds: string[] = [];
	protected editorActionsToolbar: ToolBar;

	private mapActionsToEditors: { [editorId: string]: IToolbarActions; };
	private titleAreaUpdateScheduler: RunOnceScheduler;
	private titleAreaToolbarUpdateScheduler: RunOnceScheduler;
	private refreshScheduled: boolean;

	private resourceContext: ResourceContextKey;
	private disposeOnEditorActions: IDisposable[] = [];

	private splitEditorGroupVerticalAction: SplitEditorGroupVerticalAction;
	private splitEditorGroupHorizontalAction: SplitEditorGroupHorizontalAction;

	private contextMenu: IMenu;

	constructor(
		parent: HTMLElement,
		protected group: IEditorGroup,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@INextEditorGroupsService protected nextEditorGroupsService: INextEditorGroupsService,
		@IContextKeyService protected contextKeyService: IContextKeyService,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@ITelemetryService protected telemetryService: ITelemetryService,
		@INotificationService private notificationService: INotificationService,
		@IMenuService protected menuService: IMenuService,
		@IQuickOpenService protected quickOpenService: IQuickOpenService,
		@IThemeService protected themeService: IThemeService,
		@IExtensionService private extensionService: IExtensionService
	) {
		super(themeService);

		this.mapActionsToEditors = Object.create(null);

		this.titleAreaUpdateScheduler = new RunOnceScheduler(() => this.onSchedule(), 0);
		this._register(this.titleAreaUpdateScheduler);

		this.titleAreaToolbarUpdateScheduler = new RunOnceScheduler(() => this.updateEditorActionsToolbar(), 0);
		this._register(this.titleAreaToolbarUpdateScheduler);

		this.resourceContext = instantiationService.createInstance(ResourceContextKey);

		this.contextMenu = this.menuService.createMenu(MenuId.EditorTitleContext, this.contextKeyService);
		this._register(this.contextMenu);

		this.initActions(this.instantiationService);

		this.doCreate(parent);

		this.registerListeners();
	}

	private registerListeners(): void {

		// Update when extensions register so that e.g. actions are properly reflected in the toolbar
		this._register(this.extensionService.onDidRegisterExtensions(() => this.doScheduleUpdate()));
	}

	protected abstract doCreate(parent: HTMLElement): void;

	private onSchedule(): void {
		if (this.refreshScheduled) {
			this.doRefresh();
		} else {
			this.doUpdate();
		}

		this.refreshScheduled = false;
	}

	private doScheduleUpdate(instant?: boolean): void {
		if (instant) {
			this.titleAreaUpdateScheduler.cancel();
			this.onSchedule();
		} else {
			this.titleAreaUpdateScheduler.schedule();
		}

		this.titleAreaToolbarUpdateScheduler.cancel(); // a title area update will always refresh the toolbar too
	}

	private doScheduleRefresh(instant?: boolean) {
		this.refreshScheduled = true;

		if (instant) {
			this.titleAreaUpdateScheduler.cancel();
			this.onSchedule();
		} else {
			this.titleAreaUpdateScheduler.schedule();
		}

		this.titleAreaToolbarUpdateScheduler.cancel(); // a title area update will always refresh the toolbar too
	}

	protected get groupController(): INextEditorGroup {
		return this.nextEditorGroupsService.getGroup(this.group.id);
	}

	protected doUpdate(): void {
		this.doRefresh();
	}

	protected abstract doRefresh(): void;

	protected initActions(services: IInstantiationService): void {
		this.closeOneEditorAction = services.createInstance(CloseOneEditorAction, CloseOneEditorAction.ID, CloseOneEditorAction.LABEL);
		this.splitEditorGroupHorizontalAction = services.createInstance(SplitEditorGroupHorizontalAction, SplitEditorGroupHorizontalAction.ID, SplitEditorGroupHorizontalAction.LABEL);
		this.splitEditorGroupVerticalAction = services.createInstance(SplitEditorGroupVerticalAction, SplitEditorGroupVerticalAction.ID, SplitEditorGroupVerticalAction.LABEL);
	}

	protected createEditorActionsToolBar(container: HTMLElement): void {
		this.editorActionsToolbar = new ToolBar(container, this.contextMenuService, {
			actionItemProvider: action => this.actionItemProvider(action as Action),
			orientation: ActionsOrientation.HORIZONTAL,
			ariaLabel: nls.localize('araLabelEditorActions', "Editor actions"),
			getKeyBinding: action => this.getKeybinding(action)
		});

		// Context
		this.editorActionsToolbar.context = { groupId: this.group.id } as IEditorCommandsContext;

		// Action Run Handling
		this._register(this.editorActionsToolbar.actionRunner.onDidRun((e: IRunEvent) => {

			// Notify for Error
			this.notificationService.error(e.error);

			// Log in telemetry
			if (this.telemetryService) {
				/* __GDPR__
					"workbenchActionExecuted" : {
						"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
						"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
					}
				*/
				this.telemetryService.publicLog('workbenchActionExecuted', { id: e.action.id, from: 'editorPart' });
			}
		}));
	}

	protected actionItemProvider(action: Action): IActionItem {
		const activeControl = this.groupController.activeControl;

		// Check Active Editor
		let actionItem: IActionItem;
		if (activeControl instanceof BaseEditor) {
			actionItem = activeControl.getActionItem(action);
		}

		// Check extensions
		if (!actionItem) {
			actionItem = createActionItem(action, this.keybindingService, this.notificationService, this.contextMenuService);
		}

		return actionItem;
	}

	protected getEditorActions(identifier: IEditorIdentifier): IToolbarActions {
		const primary: IAction[] = [];
		const secondary: IAction[] = [];

		const { group } = identifier;

		// Update the resource context
		this.resourceContext.set(group && toResource(group.activeEditor, { supportSideBySide: true }));

		// Editor actions require the editor control to be there, so we retrieve it via service
		const activeControl = this.groupController.activeControl;
		if (activeControl instanceof BaseEditor && activeControl.input && typeof activeControl.position === 'number') {

			// Editor Control Actions
			let editorActions = this.mapActionsToEditors[activeControl.getId()];
			if (!editorActions) {
				editorActions = { primary: activeControl.getActions(), secondary: activeControl.getSecondaryActions() };
				this.mapActionsToEditors[activeControl.getId()] = editorActions;
			}
			primary.push(...editorActions.primary);
			secondary.push(...editorActions.secondary);

			// MenuItems
			// TODO This isn't very proper but needed as we have failed to
			// use the correct context key service per editor only once. Don't
			// take this code as sample of how to work with menus
			this.disposeOnEditorActions = dispose(this.disposeOnEditorActions);
			const widget = activeControl.getControl();
			const codeEditor = isCodeEditor(widget) && widget || isDiffEditor(widget) && widget.getModifiedEditor();
			const scopedContextKeyService = codeEditor && codeEditor.invokeWithinContext(accessor => accessor.get(IContextKeyService)) || this.contextKeyService;
			const titleBarMenu = this.menuService.createMenu(MenuId.EditorTitle, scopedContextKeyService);
			this.disposeOnEditorActions.push(titleBarMenu, titleBarMenu.onDidChange(_ => {
				// schedule the update for the title area toolbar only if no other
				// update to the title area is scheduled which will always also
				// update the toolbar
				if (!this.titleAreaUpdateScheduler.isScheduled()) {
					this.titleAreaToolbarUpdateScheduler.schedule();
				}
			}));

			fillInActions(titleBarMenu, { arg: this.resourceContext.get(), shouldForwardArgs: true }, { primary, secondary }, this.contextMenuService);
		}

		return { primary, secondary };
	}

	protected updateEditorActionsToolbar(): void {
		const editor = this.group.activeEditor;
		const isActive = this.groupController.isActive;

		// Update Editor Actions Toolbar
		let primaryEditorActions: IAction[] = [];
		let secondaryEditorActions: IAction[] = [];

		const editorActions = this.getEditorActions({ group: this.group, editor });

		// Primary actions only for the active group
		if (isActive) {
			primaryEditorActions = prepareActions(editorActions.primary);

			primaryEditorActions.push(this.splitEditorGroupHorizontalAction);
			primaryEditorActions.push(this.splitEditorGroupVerticalAction);
		}

		secondaryEditorActions = prepareActions(editorActions.secondary);

		const tabOptions = { showTabs: true }; // TODO@grid support real options (this.editorGroupService.getTabOptions();)

		const primaryEditorActionIds = primaryEditorActions.map(a => a.id);
		if (!tabOptions.showTabs) {
			primaryEditorActionIds.push(this.closeOneEditorAction.id); // always show "Close" when tabs are disabled
		}

		const secondaryEditorActionIds = secondaryEditorActions.map(a => a.id);
		if (
			!arrays.equals(primaryEditorActionIds, this.currentPrimaryEditorActionIds) ||
			!arrays.equals(secondaryEditorActionIds, this.currentSecondaryEditorActionIds) ||
			primaryEditorActions.some(action => action instanceof ExecuteCommandAction) || // execute command actions can have the same ID but different arguments
			secondaryEditorActions.some(action => action instanceof ExecuteCommandAction)  // see also https://github.com/Microsoft/vscode/issues/16298
		) {
			this.editorActionsToolbar.setActions(primaryEditorActions, secondaryEditorActions)();

			if (!tabOptions.showTabs) {
				this.editorActionsToolbar.addPrimaryAction(this.closeOneEditorAction)();
			}

			this.currentPrimaryEditorActionIds = primaryEditorActionIds;
			this.currentSecondaryEditorActionIds = secondaryEditorActionIds;
		}
	}

	protected clearEditorActionsToolbar(): void {
		this.editorActionsToolbar.setActions([], [])();

		this.currentPrimaryEditorActionIds = [];
		this.currentSecondaryEditorActionIds = [];
	}

	protected onContextMenu(editor: IEditorInput, e: Event, node: HTMLElement): void {

		// Update the resource context
		const currentContext = this.resourceContext.get();
		this.resourceContext.set(toResource(editor, { supportSideBySide: true }));

		// Find target anchor
		let anchor: HTMLElement | { x: number, y: number } = node;
		if (e instanceof MouseEvent) {
			const event = new StandardMouseEvent(e);
			anchor = { x: event.posx, y: event.posy };
		}

		// Fill in contributed actions
		const actions: IAction[] = [];
		fillInActions(this.contextMenu, { shouldForwardArgs: true, arg: this.resourceContext.get() }, actions, this.contextMenuService);

		// Show it
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => TPromise.as(actions),
			getActionsContext: () => ({ groupId: this.group.id, editorIndex: this.group.indexOf(editor) } as IEditorCommandsContext),
			getKeyBinding: (action) => this.getKeybinding(action),
			onHide: (cancel) => {

				// restore previous context
				this.resourceContext.set(currentContext);

				// restore focus to active group
				this.nextEditorGroupsService.activeGroup.focus();
			}
		});
	}

	protected getKeybinding(action: IAction): ResolvedKeybinding {
		return this.keybindingService.lookupKeybinding(action.id);
	}

	protected getKeybindingLabel(action: IAction): string {
		const keybinding = this.getKeybinding(action);

		return keybinding ? keybinding.getLabel() : void 0;
	}

	//#region IThemeable

	protected updateStyles(): void {
		this.doScheduleUpdate(true); // run a sync update when the theme changes to new styles
	}

	//#endregion

	//#region INextTitleAreaControl

	openEditor(editor: EditorInput, options?: EditorOptions): void {
		this.doScheduleRefresh(true); // TODO@grid optimize if possible
	}

	closeEditor(editor: EditorInput): void {
		this.doScheduleRefresh(); // TODO@grid optimize if possible
	}

	moveEditor(editor: EditorInput, targetIndex: number): void {
		this.doScheduleUpdate(true); // TODO@grid optimize if possible
	}

	pinEditor(editor: EditorInput): void {
		this.doScheduleUpdate(true); // TODO@grid optimize if possible
	}

	setActive(isActive: boolean): void {
		this.doScheduleUpdate(true); // TODO@grid optimize if possible
	}

	updateEditorLabel(editor: EditorInput): void {
		this.doScheduleUpdate(); // TODO@grid optimize if possible
	}

	layout(dimension: Dimension): void {
		// Optionally implemented in subclasses
	}

	dispose(): void {
		super.dispose();

		// Actions
		[
			this.splitEditorGroupHorizontalAction,
			this.splitEditorGroupVerticalAction,
			this.closeOneEditorAction
		].forEach((action) => {
			action.dispose();
		});

		// Toolbar
		this.editorActionsToolbar.dispose();
	}

	//#endregion
}
