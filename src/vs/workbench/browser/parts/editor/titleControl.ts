/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/titlecontrol';
import * as nls from 'vs/nls';
import { prepareActions } from 'vs/workbench/browser/actions';
import { IAction, Action, IRunEvent } from 'vs/base/common/actions';
import * as errors from 'vs/base/common/errors';
import * as DOM from 'vs/base/browser/dom';
import { TPromise } from 'vs/base/common/winjs.base';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { RunOnceScheduler } from 'vs/base/common/async';
import * as arrays from 'vs/base/common/arrays';
import { IEditorStacksModel, IEditorGroup, IEditorIdentifier, EditorInput, IStacksModelChangeEvent, toResource, IEditorCommandsContext } from 'vs/workbench/common/editor';
import { IActionItem, ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { SplitEditorAction, CloseOneEditorAction } from 'vs/workbench/browser/parts/editor/editorActions';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { createActionItem, fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { IMenuService, MenuId, IMenu, ExecuteCommandAction } from 'vs/platform/actions/common/actions';
import { ResourceContextKey } from 'vs/workbench/common/resources';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Themable } from 'vs/workbench/common/theme';
import { isDiffEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { Dimension } from 'vs/base/browser/builder';
import { INotificationService } from 'vs/platform/notification/common/notification';

export interface IToolbarActions {
	primary: IAction[];
	secondary: IAction[];
}

export interface ITitleAreaControl {
	setContext(group: IEditorGroup): void;
	hasContext(): boolean;
	allowDragging(element: HTMLElement): boolean;
	setDragged(dragged: boolean): void;
	create(parent: HTMLElement): void;
	getContainer(): HTMLElement;
	refresh(instant?: boolean): void;
	update(instant?: boolean): void;
	updateEditorActionsToolbar(): void;
	layout(dimension: Dimension): void;
	dispose(): void;
}

export abstract class TitleControl extends Themable implements ITitleAreaControl {

	protected stacks: IEditorStacksModel;
	protected context: IEditorGroup;

	protected dragged: boolean;

	protected closeOneEditorAction: CloseOneEditorAction;
	protected splitEditorAction: SplitEditorAction;

	private parent: HTMLElement;

	private currentPrimaryEditorActionIds: string[] = [];
	private currentSecondaryEditorActionIds: string[] = [];
	protected editorActionsToolbar: ToolBar;

	private mapActionsToEditors: { [editorId: string]: IToolbarActions; };
	private titleAreaUpdateScheduler: RunOnceScheduler;
	private titleAreaToolbarUpdateScheduler: RunOnceScheduler;
	private refreshScheduled: boolean;

	private resourceContext: ResourceContextKey;
	private disposeOnEditorActions: IDisposable[] = [];

	private contextMenu: IMenu;

	constructor(
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IWorkbenchEditorService protected editorService: IWorkbenchEditorService,
		@IEditorGroupService protected editorGroupService: IEditorGroupService,
		@IContextKeyService protected contextKeyService: IContextKeyService,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@ITelemetryService protected telemetryService: ITelemetryService,
		@INotificationService private notificationService: INotificationService,
		@IMenuService protected menuService: IMenuService,
		@IQuickOpenService protected quickOpenService: IQuickOpenService,
		@IThemeService protected themeService: IThemeService
	) {
		super(themeService);

		this.stacks = editorGroupService.getStacksModel();
		this.mapActionsToEditors = Object.create(null);

		this.titleAreaUpdateScheduler = new RunOnceScheduler(() => this.onSchedule(), 0);
		this.toUnbind.push(this.titleAreaUpdateScheduler);

		this.titleAreaToolbarUpdateScheduler = new RunOnceScheduler(() => this.updateEditorActionsToolbar(), 0);
		this.toUnbind.push(this.titleAreaToolbarUpdateScheduler);

		this.resourceContext = instantiationService.createInstance(ResourceContextKey);

		this.contextMenu = this.menuService.createMenu(MenuId.EditorTitleContext, this.contextKeyService);
		this.toUnbind.push(this.contextMenu);

		this.initActions(this.instantiationService);
		this.registerListeners();
	}

	public setDragged(dragged: boolean): void {
		this.dragged = dragged;
	}

	private registerListeners(): void {
		this.toUnbind.push(this.stacks.onModelChanged(e => this.onStacksChanged(e)));
	}

	private onStacksChanged(e: IStacksModelChangeEvent): void {
		if (e.structural) {
			this.updateSplitActionEnablement();
		}
	}

	private updateSplitActionEnablement(): void {
		if (!this.context) {
			return;
		}

		const groupCount = this.stacks.groups.length;

		// Split editor
		this.splitEditorAction.enabled = groupCount < 3;
	}

	protected updateStyles(): void {
		super.updateStyles();

		this.update(true); // run an update when the theme changes to new styles
	}

	private onSchedule(): void {
		if (this.refreshScheduled) {
			this.doRefresh();
		} else {
			this.doUpdate();
		}

		this.refreshScheduled = false;
	}

	public setContext(group: IEditorGroup): void {
		this.context = group;

		this.editorActionsToolbar.context = { groupId: group ? group.id : void 0 } as IEditorCommandsContext;
	}

	public hasContext(): boolean {
		return !!this.context;
	}

	public update(instant?: boolean): void {
		if (instant) {
			this.titleAreaUpdateScheduler.cancel();
			this.onSchedule();
		} else {
			this.titleAreaUpdateScheduler.schedule();
		}

		this.titleAreaToolbarUpdateScheduler.cancel(); // a title area update will always refresh the toolbar too
	}

	public refresh(instant?: boolean) {
		this.refreshScheduled = true;

		if (instant) {
			this.titleAreaUpdateScheduler.cancel();
			this.onSchedule();
		} else {
			this.titleAreaUpdateScheduler.schedule();
		}

		this.titleAreaToolbarUpdateScheduler.cancel(); // a title area update will always refresh the toolbar too
	}

	public create(parent: HTMLElement): void {
		this.parent = parent;
	}

	public getContainer(): HTMLElement {
		return this.parent;
	}

	protected abstract doRefresh(): void;

	protected doUpdate(): void {
		this.doRefresh();
	}

	public layout(dimension: Dimension): void {
		// Subclasses can opt in to react on layout
	}

	public allowDragging(element: HTMLElement): boolean {
		return !DOM.findParentWithClass(element, 'monaco-action-bar', 'one-editor-silo');
	}

	protected initActions(services: IInstantiationService): void {
		this.closeOneEditorAction = services.createInstance(CloseOneEditorAction, CloseOneEditorAction.ID, CloseOneEditorAction.LABEL);
		this.splitEditorAction = services.createInstance(SplitEditorAction, SplitEditorAction.ID, SplitEditorAction.LABEL);
	}

	protected createEditorActionsToolBar(container: HTMLElement): void {
		this.editorActionsToolbar = new ToolBar(container, this.contextMenuService, {
			actionItemProvider: (action: Action) => this.actionItemProvider(action),
			orientation: ActionsOrientation.HORIZONTAL,
			ariaLabel: nls.localize('araLabelEditorActions', "Editor actions"),
			getKeyBinding: (action) => this.getKeybinding(action)
		});

		// Action Run Handling
		this.toUnbind.push(this.editorActionsToolbar.actionRunner.onDidRun((e: IRunEvent) => {

			// Check for Error
			if (e.error && !errors.isPromiseCanceledError(e.error)) {
				this.notificationService.error(e.error);
			}

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
		if (!this.context) {
			return null;
		}

		const group = this.context;
		const position = this.stacks.positionOfGroup(group);
		const editor = this.editorService.getVisibleEditors()[position];

		let actionItem: IActionItem;

		// Check Active Editor
		if (editor instanceof BaseEditor) {
			actionItem = editor.getActionItem(action);
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
		const position = this.stacks.positionOfGroup(group);

		// Update the resource context
		this.resourceContext.set(group && toResource(group.activeEditor, { supportSideBySide: true }));

		// Editor actions require the editor control to be there, so we retrieve it via service
		const control = this.editorService.getVisibleEditors()[position];
		if (control instanceof BaseEditor && control.input && typeof control.position === 'number') {

			// Editor Control Actions
			let editorActions = this.mapActionsToEditors[control.getId()];
			if (!editorActions) {
				editorActions = { primary: control.getActions(), secondary: control.getSecondaryActions() };
				this.mapActionsToEditors[control.getId()] = editorActions;
			}
			primary.push(...editorActions.primary);
			secondary.push(...editorActions.secondary);

			// MenuItems
			// TODO This isn't very proper but needed as we have failed to
			// use the correct context key service per editor only once. Don't
			// take this code as sample of how to work with menus
			this.disposeOnEditorActions = dispose(this.disposeOnEditorActions);
			const widget = control.getControl();
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

	public updateEditorActionsToolbar(): void {
		const group = this.context;
		if (!group) {
			return;
		}

		const editor = group && group.activeEditor;
		const isActive = this.stacks.isActive(group);

		// Update Editor Actions Toolbar
		let primaryEditorActions: IAction[] = [];
		let secondaryEditorActions: IAction[] = [];

		const editorActions = this.getEditorActions({ group, editor });

		// Primary actions only for the active group
		if (isActive) {
			primaryEditorActions = prepareActions(editorActions.primary);
			if (editor instanceof EditorInput && editor.supportsSplitEditor()) {
				this.updateSplitActionEnablement();
				primaryEditorActions.push(this.splitEditorAction);
			}
		}

		secondaryEditorActions = prepareActions(editorActions.secondary);

		const tabOptions = this.editorGroupService.getTabOptions();

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

	protected onContextMenu(identifier: IEditorIdentifier, e: Event, node: HTMLElement): void {

		// Update the resource context
		const currentContext = this.resourceContext.get();
		this.resourceContext.set(toResource(identifier.editor, { supportSideBySide: true }));

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
			getActionsContext: () => ({ groupId: identifier.group.id, editorIndex: identifier.group.indexOf(identifier.editor) } as IEditorCommandsContext),
			getKeyBinding: (action) => this.getKeybinding(action),
			onHide: (cancel) => {

				// restore previous context
				this.resourceContext.set(currentContext);

				// restore focus to active editor if any
				const editor = this.editorService.getActiveEditor();
				if (editor) {
					editor.focus();
				}
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

	public dispose(): void {
		super.dispose();

		// Actions
		[
			this.splitEditorAction,
			this.closeOneEditorAction
		].forEach((action) => {
			action.dispose();
		});

		// Toolbar
		this.editorActionsToolbar.dispose();
	}
}
