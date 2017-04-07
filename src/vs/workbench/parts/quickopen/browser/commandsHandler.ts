/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/commandsHandler';
import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import arrays = require('vs/base/common/arrays');
import types = require('vs/base/common/types');
import { language, LANGUAGE_DEFAULT } from 'vs/base/common/platform';
import { IAction, Action } from 'vs/base/common/actions';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Mode, IEntryRunContext, IAutoFocus } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenEntryGroup, IHighlight, QuickOpenModel } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { SyncActionDescriptor, IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { Registry } from 'vs/platform/platform';
import { QuickOpenHandler, QuickOpenAction } from 'vs/workbench/browser/quickopen';
import { IEditorAction, IEditor, isCommonCodeEditor } from 'vs/editor/common/editorCommon';
import { matchesWords, matchesPrefix, matchesContiguousSubString, or } from 'vs/base/common/filters';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService, Severity, IMessageWithAction } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';

export const ALL_COMMANDS_PREFIX = '>';
export const EDITOR_COMMANDS_PREFIX = '$';

const wordFilter = or(matchesPrefix, matchesWords, matchesContiguousSubString);

export class ShowAllCommandsAction extends QuickOpenAction {

	public static ID = 'workbench.action.showCommands';
	public static LABEL = nls.localize('showTriggerActions', "Show All Commands");

	constructor(actionId: string, actionLabel: string, @IQuickOpenService quickOpenService: IQuickOpenService) {
		super(actionId, actionLabel, ALL_COMMANDS_PREFIX, quickOpenService);
	}
}

class BaseCommandEntry extends QuickOpenEntryGroup {
	private keyLabel: string;
	private keyAriaLabel: string;
	private label: string;
	private alias: string;

	constructor(
		keyLabel: string,
		keyAriaLabel: string,
		label: string,
		alias: string,
		labelHighlights: IHighlight[],
		aliasHighlights: IHighlight[],
		@IMessageService protected messageService: IMessageService,
		@ITelemetryService protected telemetryService: ITelemetryService
	) {
		super();

		this.keyLabel = keyLabel;
		this.keyAriaLabel = keyAriaLabel;
		this.label = label;

		if (label !== alias) {
			this.alias = alias;
		} else {
			aliasHighlights = null;
		}

		this.setHighlights(labelHighlights, null, aliasHighlights);
	}

	public getLabel(): string {
		return this.label;
	}

	public getDetail(): string {
		return this.alias;
	}

	public getAriaLabel(): string {
		if (this.keyAriaLabel) {
			return nls.localize('entryAriaLabelWithKey', "{0}, {1}, commands", this.getLabel(), this.keyAriaLabel);
		}

		return nls.localize('entryAriaLabel', "{0}, commands", this.getLabel());
	}

	public getGroupLabel(): string {
		return this.keyLabel;
	}

	protected onError(error?: Error): void;
	protected onError(messagesWithAction?: IMessageWithAction): void;
	protected onError(arg1?: any): void {
		const messagesWithAction: IMessageWithAction = arg1;
		if (messagesWithAction && typeof messagesWithAction.message === 'string' && Array.isArray(messagesWithAction.actions)) {
			this.messageService.show(Severity.Error, messagesWithAction);
		} else {
			this.messageService.show(Severity.Error, !arg1 ? nls.localize('canNotRun', "Command '{0}' can not be run from here.", this.label) : toErrorMessage(arg1));
		}
	}

	protected runAction(action: IAction): void {

		// Use a timeout to give the quick open widget a chance to close itself first
		TPromise.timeout(50).done(() => {
			if (action && action.enabled) {
				try {
					this.telemetryService.publicLog('workbenchActionExecuted', { id: action.id, from: 'quick open' });
					(action.run() || TPromise.as(null)).done(() => {
						action.dispose();
					}, (err) => this.onError(err));
				} catch (error) {
					this.onError(error);
				}
			} else {
				this.messageService.show(Severity.Info, nls.localize('actionNotEnabled', "Command '{0}' is not enabled in the current context.", this.getLabel()));
			}
		}, (err) => this.onError(err));
	}
}

class CommandEntry extends BaseCommandEntry {
	private actionDescriptor: SyncActionDescriptor;

	constructor(
		keyLabel: string,
		keyAriaLabel: string,
		label: string,
		meta: string,
		labelHighlights: IHighlight[],
		aliasHighlights: IHighlight[],
		actionDescriptor: SyncActionDescriptor,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IMessageService messageService: IMessageService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(keyLabel, keyAriaLabel, label, meta, labelHighlights, aliasHighlights, messageService, telemetryService);

		this.actionDescriptor = actionDescriptor;
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			const action = <Action>this.instantiationService.createInstance(this.actionDescriptor.syncDescriptor);
			this.runAction(action);

			return true;
		}

		return false;
	}
}

class EditorActionCommandEntry extends BaseCommandEntry {
	private action: IEditorAction;

	constructor(
		keyLabel: string,
		keyAriaLabel: string,
		label: string,
		meta: string,
		labelHighlights: IHighlight[],
		aliasHighlights: IHighlight[],
		action: IEditorAction,
		@IMessageService messageService: IMessageService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(keyLabel, keyAriaLabel, label, meta, labelHighlights, aliasHighlights, messageService, telemetryService);

		this.action = action;
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			// Use a timeout to give the quick open widget a chance to close itself first
			TPromise.timeout(50).done(() => {
				if (this.action) {
					try {
						this.telemetryService.publicLog('workbenchActionExecuted', { id: this.action.id, from: 'quick open' });
						(this.action.run() || TPromise.as(null)).done(null, (err) => this.onError(err));
					} catch (error) {
						this.onError(error);
					}
				} else {
					this.messageService.show(Severity.Info, nls.localize('actionNotEnabled', "Command '{0}' is not enabled in the current context.", this.getLabel()));
				}
			}, (err) => this.onError(err));

			return true;
		}

		return false;
	}
}


class ActionCommandEntry extends BaseCommandEntry {
	private action: IAction;

	constructor(
		keyLabel: string,
		keyAriaLabel: string,
		label: string,
		alias: string,
		labelHighlights: IHighlight[],
		aliasHighlights: IHighlight[],
		action: IAction,
		@IMessageService messageService: IMessageService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(keyLabel, keyAriaLabel, label, alias, labelHighlights, aliasHighlights, messageService, telemetryService);

		this.action = action;
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			this.runAction(this.action);

			return true;
		}

		return false;
	}
}

export class CommandsHandler extends QuickOpenHandler {

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IMenuService private menuService: IMenuService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super();
	}

	protected includeWorkbenchCommands(): boolean {
		return true;
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();

		// Workbench Actions (if prefix asks for all commands)
		let workbenchEntries: CommandEntry[] = [];
		if (this.includeWorkbenchCommands()) {
			const workbenchActions = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions).getWorkbenchActions();
			workbenchEntries = this.actionDescriptorsToEntries(workbenchActions, searchValue);
		}

		// Editor Actions
		const activeEditor = this.editorService.getActiveEditor();
		const activeEditorControl = activeEditor ? activeEditor.getControl() : null;

		let editorActions: IEditorAction[] = [];
		if (activeEditorControl) {
			const editor = <IEditor>activeEditorControl;
			if (types.isFunction(editor.getSupportedActions)) {
				editorActions = editor.getSupportedActions();
			}
		}

		const editorEntries = this.editorActionsToEntries(editorActions, searchValue);

		// Other Actions
		const menu = isCommonCodeEditor(activeEditorControl)
			? activeEditorControl.invokeWithinContext(accessor => this.menuService.createMenu(MenuId.CommandPalette, accessor.get(IContextKeyService)))
			: this.menuService.createMenu(MenuId.CommandPalette, this.contextKeyService);

		const menuActions = menu.getActions().reduce((r, [, actions]) => [...r, ...actions], <MenuItemAction[]>[]);
		const commandEntries = this.menuItemActionsToEntries(menuActions, searchValue);

		// Concat
		let entries = [...workbenchEntries, ...editorEntries, ...commandEntries];

		// Remove duplicates
		entries = arrays.distinct(entries, (entry) => entry.getLabel() + entry.getGroupLabel());

		// Sort by name
		entries = entries.sort((elementA, elementB) => elementA.getLabel().toLowerCase().localeCompare(elementB.getLabel().toLowerCase()));

		return TPromise.as(new QuickOpenModel(entries));
	}

	private actionDescriptorsToEntries(actionDescriptors: SyncActionDescriptor[], searchValue: string): CommandEntry[] {
		const entries: CommandEntry[] = [];
		const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

		for (let i = 0; i < actionDescriptors.length; i++) {
			const actionDescriptor = actionDescriptors[i];
			const keybinding = this.keybindingService.lookupKeybinding(actionDescriptor.id);
			const keyLabel = keybinding ? keybinding.getLabel() : '';
			const keyAriaLabel = keybinding ? keybinding.getAriaLabel() : '';

			if (actionDescriptor.label) {

				// Label (with optional category)
				let label = actionDescriptor.label;
				const category = registry.getCategory(actionDescriptor.id);
				if (category) {
					label = nls.localize('commandLabel', "{0}: {1}", category, label);
				}

				// Alias for non default languages
				const alias = (language !== LANGUAGE_DEFAULT) ? registry.getAlias(actionDescriptor.id) : null;
				const labelHighlights = wordFilter(searchValue, label);
				const aliasHighlights = alias ? wordFilter(searchValue, alias) : null;
				if (labelHighlights || aliasHighlights) {
					entries.push(this.instantiationService.createInstance(CommandEntry, keyLabel, keyAriaLabel, label, alias, labelHighlights, aliasHighlights, actionDescriptor));
				}
			}
		}

		return entries;
	}

	private editorActionsToEntries(actions: IEditorAction[], searchValue: string): EditorActionCommandEntry[] {
		const entries: EditorActionCommandEntry[] = [];

		for (let i = 0; i < actions.length; i++) {
			const action = actions[i];

			const keybinding = this.keybindingService.lookupKeybinding(action.id);
			const keyLabel = keybinding ? keybinding.getLabel() : '';
			const keyAriaLabel = keybinding ? keybinding.getAriaLabel() : '';
			const label = action.label;

			if (label) {

				// Alias for non default languages
				const alias = (language !== LANGUAGE_DEFAULT) ? action.alias : null;
				const labelHighlights = wordFilter(searchValue, label);
				const aliasHighlights = alias ? wordFilter(searchValue, alias) : null;
				if (labelHighlights || aliasHighlights) {
					entries.push(this.instantiationService.createInstance(EditorActionCommandEntry, keyLabel, keyAriaLabel, label, alias, labelHighlights, aliasHighlights, action));
				}
			}
		}

		return entries;
	}

	private menuItemActionsToEntries(actions: MenuItemAction[], searchValue: string): ActionCommandEntry[] {
		const entries: ActionCommandEntry[] = [];

		for (let action of actions) {
			const title = typeof action.item.title === 'string' ? action.item.title : action.item.title.value;
			let category, label = title;
			if (action.item.category) {
				category = typeof action.item.category === 'string' ? action.item.category : action.item.category.value;
				label = nls.localize('cat.title', "{0}: {1}", category, title);
			}

			if (label) {
				const labelHighlights = wordFilter(searchValue, label);
				const keybinding = this.keybindingService.lookupKeybinding(action.item.id);
				const keyLabel = keybinding ? keybinding.getLabel() : '';
				const keyAriaLabel = keybinding ? keybinding.getAriaLabel() : '';
				// Add an 'alias' in original language when running in different locale
				const aliasTitle = (language !== LANGUAGE_DEFAULT && typeof action.item.title !== 'string') ? action.item.title.original : null;
				const aliasCategory = (language !== LANGUAGE_DEFAULT && category && typeof action.item.category !== 'string') ? action.item.category.original : null;
				let alias;
				if (aliasTitle && category) {
					alias = aliasCategory ? `${aliasCategory}: ${aliasTitle}` : `${category}: ${aliasTitle}`;
				} else if (aliasTitle) {
					alias = aliasTitle;
				}
				const aliasHighlights = alias ? wordFilter(searchValue, alias) : null;
				if (labelHighlights || aliasHighlights) {
					entries.push(this.instantiationService.createInstance(ActionCommandEntry, keyLabel, keyAriaLabel, label, alias, labelHighlights, aliasHighlights, action));
				}
			}
		}

		return entries;
	}

	public getAutoFocus(searchValue: string): IAutoFocus {
		return {
			autoFocusFirstEntry: true,
			autoFocusPrefixMatch: searchValue.trim()
		};
	}

	public getClass(): string {
		return 'commands-handler';
	}

	public getEmptyLabel(searchString: string): string {
		return nls.localize('noCommandsMatching', "No commands matching");
	}
}

export class EditorCommandsHandler extends CommandsHandler {

	protected includeWorkbenchCommands(): boolean {
		return false;
	}
}
