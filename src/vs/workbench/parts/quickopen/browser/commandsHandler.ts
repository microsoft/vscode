/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import arrays = require('vs/base/common/arrays');
import types = require('vs/base/common/types');
import { language, LANGUAGE_DEFAULT } from 'vs/base/common/platform';
import { Action } from 'vs/base/common/actions';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Mode, IEntryRunContext, IAutoFocus, IModel, IQuickNavigateConfiguration } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenEntryGroup, IHighlight, QuickOpenModel, QuickOpenEntry } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { SyncActionDescriptor, IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { QuickOpenHandler, IWorkbenchQuickOpenConfiguration } from 'vs/workbench/browser/quickopen';
import { IEditorAction, IEditor, isCommonCodeEditor, ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { matchesWords, matchesPrefix, matchesContiguousSubString, or } from 'vs/base/common/filters';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService, Severity, IMessageWithAction } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { editorAction, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { once } from 'vs/base/common/event';
import { BoundedMap, ISerializedBoundedLinkedMap } from 'vs/base/common/map';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';

export const ALL_COMMANDS_PREFIX = '>';

let lastCommandPaletteInput: string;
let commandHistory: BoundedMap<number>;
let commandCounter = 1;

function resolveCommandHistory(configurationService: IConfigurationService): number {
	const config = <IWorkbenchQuickOpenConfiguration>configurationService.getConfiguration();

	let commandHistory = config.workbench && config.workbench.commandPalette && config.workbench.commandPalette.history;
	if (typeof commandHistory !== 'number') {
		commandHistory = CommandsHistory.DEFAULT_COMMANDS_HISTORY_LENGTH;
	}

	return commandHistory;
}

class CommandsHistory {

	public static readonly DEFAULT_COMMANDS_HISTORY_LENGTH = 50;

	private static readonly PREF_KEY_CACHE = 'commandPalette.mru.cache';
	private static readonly PREF_KEY_COUNTER = 'commandPalette.mru.counter';

	private commandHistoryLength: number;

	constructor(
		@IStorageService private storageService: IStorageService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		this.updateConfiguration();
		this.load();

		this.registerListeners();
	}

	private updateConfiguration(): void {
		this.commandHistoryLength = resolveCommandHistory(this.configurationService);

		if (commandHistory) {
			commandHistory.setLimit(this.commandHistoryLength);
		}
	}

	private load(): void {
		const raw = this.storageService.get(CommandsHistory.PREF_KEY_CACHE);
		let deserializedCache: ISerializedBoundedLinkedMap<number>;
		if (raw) {
			try {
				deserializedCache = JSON.parse(raw);
			} catch (error) {
				// invalid data
			}
		}

		commandHistory = new BoundedMap<number>(this.commandHistoryLength, 1, deserializedCache);
		commandCounter = this.storageService.getInteger(CommandsHistory.PREF_KEY_COUNTER, void 0, commandCounter);
	}

	private registerListeners(): void {
		this.configurationService.onDidUpdateConfiguration(e => this.updateConfiguration());
		once(this.lifecycleService.onShutdown)(reason => this.save());
	}

	private save(): void {
		this.storageService.store(CommandsHistory.PREF_KEY_CACHE, JSON.stringify(commandHistory.serialize()));
		this.storageService.store(CommandsHistory.PREF_KEY_COUNTER, commandCounter);
	}

	public push(commandId: string): void {

		// make MRU by deleting it first
		commandHistory.delete(commandId);

		// set counter to command
		commandHistory.set(commandId, commandCounter++);
	}

	public get(commandId: string): number {
		return commandHistory.get(commandId);
	}
}

export class ShowAllCommandsAction extends Action {

	public static ID = 'workbench.action.showCommands';
	public static LABEL = nls.localize('showTriggerActions', "Show All Commands");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(id, label);
	}

	public run(context?: any): TPromise<void> {
		const config = <IWorkbenchQuickOpenConfiguration>this.configurationService.getConfiguration();
		const restoreInput = config.workbench && config.workbench.commandPalette && config.workbench.commandPalette.preserveInput === true;

		// Show with last command palette input if any and configured
		let value = ALL_COMMANDS_PREFIX;
		if (restoreInput && lastCommandPaletteInput) {
			value = `${value}${lastCommandPaletteInput}`;
		}

		this.quickOpenService.show(value, { inputSelection: lastCommandPaletteInput ? { start: 1 /* after prefix */, end: value.length } : void 0 });

		return TPromise.as(null);
	}
}

export class ClearCommandHistoryAction extends Action {

	public static ID = 'workbench.action.clearCommandHistory';
	public static LABEL = nls.localize('clearCommandHistory', "Clear Command History");

	constructor(
		id: string,
		label: string,
		@IStorageService private storageService: IStorageService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(id, label);
	}

	public run(context?: any): TPromise<void> {
		const commandHistoryLength = resolveCommandHistory(this.configurationService);
		if (commandHistoryLength > 0) {
			commandHistory = new BoundedMap<number>(commandHistoryLength);
			commandCounter = 1;
		}

		return TPromise.as(null);
	}
}

@editorAction
class CommandPaletteEditorAction extends EditorAction {

	constructor() {
		super({
			id: ShowAllCommandsAction.ID,
			label: nls.localize('showCommands.label', "Command Palette..."),
			alias: 'Command Palette',
			precondition: null,
			menuOpts: {
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<void> {
		const quickOpenService = accessor.get(IQuickOpenService);

		// Show with prefix
		quickOpenService.show(ALL_COMMANDS_PREFIX);

		return TPromise.as(null);
	}
}

abstract class BaseCommandEntry extends QuickOpenEntryGroup {
	private description: string;
	private alias: string;
	private labelLowercase: string;
	private keybindingAriaLabel: string;

	constructor(
		private commandId: string,
		private keybinding: ResolvedKeybinding,
		private label: string,
		alias: string,
		highlights: { label: IHighlight[], alias: IHighlight[] },
		private onBeforeRun: (commandId: string) => void,
		@IMessageService protected messageService: IMessageService,
		@ITelemetryService protected telemetryService: ITelemetryService
	) {
		super();

		this.labelLowercase = this.label.toLowerCase();
		this.keybindingAriaLabel = keybinding ? keybinding.getAriaLabel() : void 0;

		if (this.label !== alias) {
			this.alias = alias;
		} else {
			highlights.alias = null;
		}

		this.setHighlights(highlights.label, null, highlights.alias);
	}

	public getCommandId(): string {
		return this.commandId;
	}

	public getLabel(): string {
		return this.label;
	}

	public getSortLabel(): string {
		return this.labelLowercase;
	}

	public getDescription(): string {
		return this.description;
	}

	public setDescription(description: string): void {
		this.description = description;
	}

	public getKeybinding(): ResolvedKeybinding {
		return this.keybinding;
	}

	public getDetail(): string {
		return this.alias;
	}

	public getAriaLabel(): string {
		if (this.keybindingAriaLabel) {
			return nls.localize('entryAriaLabelWithKey', "{0}, {1}, commands", this.getLabel(), this.keybindingAriaLabel);
		}

		return nls.localize('entryAriaLabel', "{0}, commands", this.getLabel());
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

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			this.runAction(this.getAction());

			return true;
		}

		return false;
	}

	protected abstract getAction(): Action | IEditorAction;

	protected runAction(action: Action | IEditorAction): void {

		// Indicate onBeforeRun
		this.onBeforeRun(this.commandId);

		// Use a timeout to give the quick open widget a chance to close itself first
		TPromise.timeout(50).done(() => {
			if (action && (!(action instanceof Action) || action.enabled)) {
				try {
					this.telemetryService.publicLog('workbenchActionExecuted', { id: action.id, from: 'quick open' });
					(action.run() || TPromise.as(null)).done(() => {
						if (action instanceof Action) {
							action.dispose();
						}
					}, err => this.onError(err));
				} catch (error) {
					this.onError(error);
				}
			} else {
				this.messageService.show(Severity.Info, nls.localize('actionNotEnabled', "Command '{0}' is not enabled in the current context.", this.getLabel()));
			}
		}, err => this.onError(err));
	}
}

class CommandEntry extends BaseCommandEntry {

	constructor(
		commandId: string,
		keybinding: ResolvedKeybinding,
		label: string,
		meta: string,
		highlights: { label: IHighlight[], alias: IHighlight[] },
		private actionDescriptor: SyncActionDescriptor,
		onBeforeRun: (commandId: string) => void,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IMessageService messageService: IMessageService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(commandId, keybinding, label, meta, highlights, onBeforeRun, messageService, telemetryService);
	}

	protected getAction(): Action | IEditorAction {
		return <Action>this.instantiationService.createInstance(this.actionDescriptor.syncDescriptor);
	}
}

class EditorActionCommandEntry extends BaseCommandEntry {

	constructor(
		commandId: string,
		keybinding: ResolvedKeybinding,
		label: string,
		meta: string,
		highlights: { label: IHighlight[], alias: IHighlight[] },
		private action: IEditorAction,
		onBeforeRun: (commandId: string) => void,
		@IMessageService messageService: IMessageService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(commandId, keybinding, label, meta, highlights, onBeforeRun, messageService, telemetryService);
	}

	protected getAction(): Action | IEditorAction {
		return this.action;
	}
}

class ActionCommandEntry extends BaseCommandEntry {

	constructor(
		commandId: string,
		keybinding: ResolvedKeybinding,
		label: string,
		alias: string,
		highlights: { label: IHighlight[], alias: IHighlight[] },
		private action: Action,
		onBeforeRun: (commandId: string) => void,
		@IMessageService messageService: IMessageService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(commandId, keybinding, label, alias, highlights, onBeforeRun, messageService, telemetryService);
	}

	protected getAction(): Action | IEditorAction {
		return this.action;
	}
}

const wordFilter = or(matchesPrefix, matchesWords, matchesContiguousSubString);

export class CommandsHandler extends QuickOpenHandler {
	private lastSearchValue: string;
	private commandHistoryEnabled: boolean;
	private commandsHistory: CommandsHistory;

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IMenuService private menuService: IMenuService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super();

		this.commandsHistory = this.instantiationService.createInstance(CommandsHistory);

		this.configurationService.onDidUpdateConfiguration(e => this.updateConfiguration());
		this.updateConfiguration();
	}

	private updateConfiguration(): void {
		this.commandHistoryEnabled = resolveCommandHistory(this.configurationService) > 0;
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();
		this.lastSearchValue = searchValue;

		// Workbench Actions
		let workbenchEntries: CommandEntry[] = [];
		const workbenchActions = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions).getWorkbenchActions();
		workbenchEntries = this.actionDescriptorsToEntries(workbenchActions, searchValue);

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
		entries = arrays.distinct(entries, entry => `${entry.getLabel()}${entry.getGroupLabel()}${entry.getCommandId()}`);

		// Handle label clashes
		const commandLabels = new Set<string>();
		entries.forEach(entry => {
			const commandLabel = `${entry.getLabel()}${entry.getGroupLabel()}`;
			if (commandLabels.has(commandLabel)) {
				entry.setDescription(entry.getCommandId());
			} else {
				commandLabels.add(commandLabel);
			}
		});

		// Sort by MRU order and fallback to name otherwie
		entries = entries.sort((elementA, elementB) => {
			const counterA = this.commandsHistory.get(elementA.getCommandId());
			const counterB = this.commandsHistory.get(elementB.getCommandId());

			if (counterA && counterB) {
				return counterA > counterB ? -1 : 1; // use more recently used command before older
			}

			if (counterA) {
				return -1; // first command was used, so it wins over the non used one
			}

			if (counterB) {
				return 1; // other command was used so it wins over the command
			}

			// both commands were never used, so we sort by name
			return elementA.getSortLabel().localeCompare(elementB.getSortLabel());
		});

		// Introduce group marker border between recently used and others
		// only if we have recently used commands in the result set
		const firstEntry = entries[0];
		if (firstEntry && this.commandsHistory.get(firstEntry.getCommandId())) {
			firstEntry.setGroupLabel(nls.localize('recentlyUsed', "recently used"));
			for (let i = 1; i < entries.length; i++) {
				const entry = entries[i];
				if (!this.commandsHistory.get(entry.getCommandId())) {
					entry.setShowBorder(true);
					entry.setGroupLabel(nls.localize('morecCommands', "other commands"));
					break;
				}
			}
		}

		return TPromise.as(new QuickOpenModel(entries));
	}

	private actionDescriptorsToEntries(actionDescriptors: SyncActionDescriptor[], searchValue: string): CommandEntry[] {
		const entries: CommandEntry[] = [];
		const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

		for (let i = 0; i < actionDescriptors.length; i++) {
			const actionDescriptor = actionDescriptors[i];
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
					entries.push(this.instantiationService.createInstance(CommandEntry, actionDescriptor.id, this.keybindingService.lookupKeybinding(actionDescriptor.id), label, alias, { label: labelHighlights, alias: aliasHighlights }, actionDescriptor, id => this.onBeforeRunCommand(id)));
				}
			}
		}

		return entries;
	}

	private editorActionsToEntries(actions: IEditorAction[], searchValue: string): EditorActionCommandEntry[] {
		const entries: EditorActionCommandEntry[] = [];

		for (let i = 0; i < actions.length; i++) {
			const action = actions[i];
			if (action.id === ShowAllCommandsAction.ID) {
				continue; // avoid duplicates
			}

			const label = action.label;
			if (label) {

				// Alias for non default languages
				const alias = (language !== LANGUAGE_DEFAULT) ? action.alias : null;
				const labelHighlights = wordFilter(searchValue, label);
				const aliasHighlights = alias ? wordFilter(searchValue, alias) : null;

				if (labelHighlights || aliasHighlights) {
					entries.push(this.instantiationService.createInstance(EditorActionCommandEntry, action.id, this.keybindingService.lookupKeybinding(action.id), label, alias, { label: labelHighlights, alias: aliasHighlights }, action, id => this.onBeforeRunCommand(id)));
				}
			}
		}

		return entries;
	}

	private onBeforeRunCommand(commandId: string): void {

		// Remember as last command palette input
		lastCommandPaletteInput = this.lastSearchValue;

		// Remember in commands history
		this.commandsHistory.push(commandId);
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
					entries.push(this.instantiationService.createInstance(ActionCommandEntry, action.id, this.keybindingService.lookupKeybinding(action.item.id), label, alias, { label: labelHighlights, alias: aliasHighlights }, action, id => this.onBeforeRunCommand(id)));
				}
			}
		}

		return entries;
	}

	public getAutoFocus(searchValue: string, context: { model: IModel<QuickOpenEntry>, quickNavigateConfiguration?: IQuickNavigateConfiguration }): IAutoFocus {
		let autoFocusPrefixMatch = searchValue.trim();

		if (autoFocusPrefixMatch && this.commandHistoryEnabled) {
			const firstEntry = context.model && context.model.entries[0];
			if (firstEntry instanceof BaseCommandEntry && this.commandsHistory.get(firstEntry.getCommandId())) {
				autoFocusPrefixMatch = void 0; // keep focus on MRU element if we have history elements
			}
		}

		return {
			autoFocusFirstEntry: true,
			autoFocusPrefixMatch
		};
	}

	public getEmptyLabel(searchString: string): string {
		return nls.localize('noCommandsMatching', "No commands matching");
	}

	public onClose(canceled: boolean): void {
		if (canceled) {
			lastCommandPaletteInput = void 0; // clear last input when user canceled quick open
		}
	}
}