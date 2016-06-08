/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {Registry} from 'vs/platform/platform';
import {Scope, IActionBarRegistry, Extensions} from 'vs/workbench/browser/actionBarRegistry';
import {IAction, Action} from 'vs/base/common/actions';
import errors = require('vs/base/common/errors');
import {Builder} from 'vs/base/browser/builder';
import {BaseEditor, IEditorInputActionContext} from 'vs/workbench/browser/parts/editor/baseEditor';
import {RunOnceScheduler} from 'vs/base/common/async';
import {IEditorStacksModel, IEditorGroup} from 'vs/workbench/common/editor';
import {EventType as BaseEventType} from 'vs/base/common/events';
import {IActionItem, ActionsOrientation, Separator} from 'vs/base/browser/ui/actionbar/actionbar';
import {ToolBar} from 'vs/base/browser/ui/toolbar/toolbar';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {Position} from 'vs/platform/editor/common/editor';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {QuickOpenAction} from 'vs/workbench/browser/quickopen';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {ShowEditorsInLeftGroupAction, ShowAllEditorsAction, ShowEditorsInCenterGroupAction, ShowEditorsInRightGroupAction, CloseEditorsInGroupAction, MoveGroupLeftAction, MoveGroupRightAction, SplitEditorAction, CloseEditorAction} from 'vs/workbench/browser/parts/editor/editorActions';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';

export interface IToolbarActions {
	primary: IAction[];
	secondary: IAction[];
}

export interface ITitleAreaControl {
	setContext(group: IEditorGroup): void;
	create(parent: Builder): void;
	dispose(): void;
}

export abstract class TitleControl {
	protected stacks: IEditorStacksModel;
	protected context: IEditorGroup;

	protected closeEditorAction: CloseEditorAction;
	protected showEditorsOfLeftGroup: QuickOpenAction;
	protected showEditorsOfCenterGroup: QuickOpenAction;
	protected showEditorsOfRightGroup: QuickOpenAction;
	protected moveGroupLeftAction: MoveGroupLeftAction;
	protected moveGroupRightAction: MoveGroupRightAction;
	protected closeEditorsInGroupAction: CloseEditorsInGroupAction;
	protected splitEditorAction: SplitEditorAction;
	protected showAllEditorsAction: ShowAllEditorsAction;

	private mapActionsToEditors: { [editorId: string]: IToolbarActions; };

	private scheduler: RunOnceScheduler;
	protected toDispose: IDisposable[];

	constructor(
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IWorkbenchEditorService protected editorService: IWorkbenchEditorService,
		@IEditorGroupService protected editorGroupService: IEditorGroupService,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@ITelemetryService protected telemetryService: ITelemetryService,
		@IMessageService protected messageService: IMessageService
	) {
		this.toDispose = [];
		this.stacks = editorGroupService.getStacksModel();
		this.mapActionsToEditors = Object.create(null);

		this.scheduler = new RunOnceScheduler(() => this.redraw(), 0);
		this.toDispose.push(this.scheduler);

		this.initActions();
	}

	public setContext(group: IEditorGroup): void {
		this.context = group;

		this.scheduler.schedule();
	}

	protected abstract redraw();

	private initActions(): void {
		this.closeEditorAction = this.instantiationService.createInstance(CloseEditorAction, CloseEditorAction.ID, nls.localize('close', "Close"));
		this.showAllEditorsAction = this.instantiationService.createInstance(ShowAllEditorsAction, ShowAllEditorsAction.ID, nls.localize('showEditors', "Show Editors"));
		this.splitEditorAction = this.instantiationService.createInstance(SplitEditorAction, SplitEditorAction.ID, SplitEditorAction.LABEL);
		this.moveGroupLeftAction = this.instantiationService.createInstance(MoveGroupLeftAction, MoveGroupLeftAction.ID, nls.localize('moveLeft', "Move Left"));
		this.moveGroupRightAction = this.instantiationService.createInstance(MoveGroupRightAction, MoveGroupRightAction.ID, nls.localize('moveRight', "Move Right"));
		this.closeEditorsInGroupAction = this.instantiationService.createInstance(CloseEditorsInGroupAction, CloseEditorsInGroupAction.ID, nls.localize('closeAll', "Close All"));
		this.showEditorsOfLeftGroup = this.instantiationService.createInstance(ShowEditorsInLeftGroupAction, ShowEditorsInLeftGroupAction.ID, nls.localize('showEditors', "Show Editors"));
		this.showEditorsOfCenterGroup = this.instantiationService.createInstance(ShowEditorsInCenterGroupAction, ShowEditorsInCenterGroupAction.ID, nls.localize('showEditors', "Show Editors"));
		this.showEditorsOfRightGroup = this.instantiationService.createInstance(ShowEditorsInRightGroupAction, ShowEditorsInRightGroupAction.ID, nls.localize('showEditors', "Show Editors"));

		[this.showEditorsOfLeftGroup, this.showEditorsOfCenterGroup, this.showEditorsOfRightGroup, this.showAllEditorsAction].forEach(a => a.class = 'show-group-editors-action');
	}

	protected doCreateToolbar(container: Builder): ToolBar {
		const toolbar = new ToolBar(container.getHTMLElement(), this.contextMenuService, {
			actionItemProvider: (action: Action) => this.actionItemProvider(action),
			orientation: ActionsOrientation.HORIZONTAL,
			ariaLabel: nls.localize('araLabelEditorActions', "Editor actions"),
			getKeyBinding: (action) => {
				const opts = this.keybindingService.lookupKeybindings(action.id);
				if (opts.length > 0) {
					return opts[0]; // only take the first one
				}

				return null;
			}
		});

		// Action Run Handling
		this.toDispose.push(toolbar.actionRunner.addListener2(BaseEventType.RUN, (e: any) => {

			// Check for Error
			if (e.error && !errors.isPromiseCanceledError(e.error)) {
				this.messageService.show(Severity.Error, e.error);
			}

			// Log in telemetry
			if (this.telemetryService) {
				this.telemetryService.publicLog('workbenchActionExecuted', { id: e.action.id, from: 'editorPart' });
			}
		}));

		return toolbar;
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

		// Check Registry
		if (!actionItem) {
			let actionBarRegistry = <IActionBarRegistry>Registry.as(Extensions.Actionbar);
			actionItem = actionBarRegistry.getActionItemForContext(Scope.EDITOR, { input: editor && editor.input, editor, position }, action);
		}

		return actionItem;
	}

	protected getEditorActions(group: IEditorGroup): IToolbarActions {
		const position = this.stacks.positionOfGroup(group);
		const isActive = this.stacks.isActive(group);
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const editor = this.editorService.getVisibleEditors()[position];

		if (isActive && editor instanceof BaseEditor) {
			let editorActions = this.mapActionsToEditors[editor.getId()];
			if (!editorActions) {
				editorActions = this.getEditorActionsForContext(editor);
				this.mapActionsToEditors[editor.getId()] = editorActions;
			}

			primary.push(...editorActions.primary);
			secondary.push(...editorActions.secondary);

			// Handle Editor Input Actions
			let editorInputActions = this.getEditorActionsForContext({ input: editor.input, editor, position: editor.position });

			primary.push(...editorInputActions.primary);
			secondary.push(...editorInputActions.secondary);
		}

		return { primary, secondary };
	}

	protected getEditorActionsForContext(context: BaseEditor): IToolbarActions;
	protected getEditorActionsForContext(context: IEditorInputActionContext): IToolbarActions;
	protected getEditorActionsForContext(context: any): IToolbarActions {
		let primaryActions: IAction[] = [];
		let secondaryActions: IAction[] = [];

		// From Editor
		if (context instanceof BaseEditor) {
			primaryActions.push(...(<BaseEditor>context).getActions());
			secondaryActions.push(...(<BaseEditor>context).getSecondaryActions());
		}

		// From Contributions
		let actionBarRegistry = <IActionBarRegistry>Registry.as(Extensions.Actionbar);
		primaryActions.push(...actionBarRegistry.getActionBarActionsForContext(Scope.EDITOR, context));
		secondaryActions.push(...actionBarRegistry.getSecondaryActionBarActionsForContext(Scope.EDITOR, context));

		return {
			primary: primaryActions,
			secondary: secondaryActions
		};
	}

	protected getGroupActions(group: IEditorGroup): IToolbarActions {
		const position = this.stacks.positionOfGroup(group);
		const editor = this.editorService.getVisibleEditors()[position];
		const primary: IAction[] = [];

		const isOverflowing = group.count > 1;
		const groupCount = this.stacks.groups.length;

		// Overflow
		if (isOverflowing) {
			let overflowAction: Action;

			if (groupCount === 1) {
				overflowAction = this.showAllEditorsAction;
			} else {
				switch (this.stacks.positionOfGroup(group)) {
					case Position.LEFT:
						overflowAction = this.showEditorsOfLeftGroup;
						break;

					case Position.CENTER:
						overflowAction = (groupCount === 2) ? this.showEditorsOfRightGroup : this.showEditorsOfCenterGroup;
						break;

					case Position.RIGHT:
						overflowAction = this.showEditorsOfRightGroup;
						break;
				}
			}

			primary.push(overflowAction);
		}

		// Splitting
		if (editor && editor instanceof BaseEditor && editor.supportsSplitEditor()) {
			primary.push(this.splitEditorAction);
		}

		// Make sure enablement is good
		switch (this.stacks.positionOfGroup(group)) {
			case Position.LEFT:
				this.moveGroupLeftAction.enabled = false;
				this.moveGroupRightAction.enabled = this.stacks.groups.length > 1;
				break;

			case Position.CENTER:
				this.moveGroupRightAction.enabled = this.stacks.groups.length > 2;
				break;

			case Position.RIGHT:
				this.moveGroupRightAction.enabled = false;
				break;
		}

		// Return actions
		const secondary = [
			this.moveGroupLeftAction,
			this.moveGroupRightAction,
			new Separator(),
			this.closeEditorsInGroupAction
		];

		return { primary, secondary };
	}

	public dispose(): void {
		dispose(this.toDispose);

		// Actions
		[
			this.splitEditorAction,
			this.showAllEditorsAction,
			this.showEditorsOfLeftGroup,
			this.showEditorsOfCenterGroup,
			this.showEditorsOfRightGroup,
			this.closeEditorAction,
			this.moveGroupLeftAction,
			this.moveGroupRightAction,
			this.closeEditorsInGroupAction
		].forEach((action) => {
			action.dispose();
		});
	}
}