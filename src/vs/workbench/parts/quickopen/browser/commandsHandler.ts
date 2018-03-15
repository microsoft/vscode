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
import { Mode, IEntryRunContext, IAutoFocus, IModel, IQuickNavigateConfiguration } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenEntryGroup, IHighlight, QuickOpenModel, QuickOpenEntry } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { QuickOpenHandler, IWorkbenchQuickOpenConfiguration } from 'vs/workbench/browser/quickopen';
import { IEditorAction, IEditor } from 'vs/editor/common/editorCommon';
import { matchesWords, matchesPrefix, matchesContiguousSubString, or } from 'vs/base/common/filters';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { registerEditorAction, EditorAction, IEditorCommandMenuOptions } from 'vs/editor/browser/editorExtensions';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { once } from 'vs/base/common/event';
import { LRUCache } from 'vs/base/common/map';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { isPromiseCanceledError } from 'vs/base/common/errors';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { INotificationService } from 'vs/platform/notification/common/notification';

export const ALL_COMMANDS_PREFIX = '>';

let lastCommandPaletteInput: string;
let commandHistory: LRUCache<string, number>;
let commandCounter = 1;

interface ISerializedCommandHistory {
	usesLRU?: boolean;
	entries: { key: string; value: number }[];
}

function resolveCommandHistory(configurationService: IConfigurationService): number {
	const config = <IWorkbenchQuickOpenConfiguration>configurationService.getValue();

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
			commandHistory.limit = this.commandHistoryLength;
		}
	}

	private load(): void {
		const raw = this.storageService.get(CommandsHistory.PREF_KEY_CACHE);
		let serializedCache: ISerializedCommandHistory;
		if (raw) {
			try {
				serializedCache = JSON.parse(raw);
			} catch (error) {
				// invalid data
			}
		}

		commandHistory = new LRUCache<string, number>(this.commandHistoryLength, 1);
		if (serializedCache) {
			let entries: { key: string; value: number }[];
			if (serializedCache.usesLRU) {
				entries = serializedCache.entries;
			} else {
				entries = serializedCache.entries.sort((a, b) => a.value - b.value);
			}
			entries.forEach(entry => commandHistory.set(entry.key, entry.value));
		}
		commandCounter = this.storageService.getInteger(CommandsHistory.PREF_KEY_COUNTER, void 0, commandCounter);
	}

	private registerListeners(): void {
		this.configurationService.onDidChangeConfiguration(e => this.updateConfiguration());
		once(this.lifecycleService.onShutdown)(reason => this.save());
	}

	private save(): void {
		let serializedCache: ISerializedCommandHistory = { usesLRU: true, entries: [] };
		commandHistory.forEach((value, key) => serializedCache.entries.push({ key, value }));
		this.storageService.store(CommandsHistory.PREF_KEY_CACHE, JSON.stringify(serializedCache));
		this.storageService.store(CommandsHistory.PREF_KEY_COUNTER, commandCounter);
	}

	public push(commandId: string): void {
		// set counter to command
		commandHistory.set(commandId, commandCounter++);
	}

	public peek(commandId: string): number {
		return commandHistory.peek(commandId);
	}
}

export class ShowAllCommandsAction extends Action {

	public static readonly ID = 'workbench.action.showCommands';
	public static readonly LABEL = nls.localize('showTriggerActions', "Show All Commands");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(id, label);
	}

	public run(context?: any): TPromise<void> {
		const config = <IWorkbenchQuickOpenConfiguration>this.configurationService.getValue();
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

	public static readonly ID = 'workbench.action.clearCommandHistory';
	public static readonly LABEL = nls.localize('clearCommandHistory', "Clear Command History");

	constructor(
		id: string,
		label: string,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(id, label);
	}

	public run(context?: any): TPromise<void> {
		const commandHistoryLength = resolveCommandHistory(this.configurationService);
		if (commandHistoryLength > 0) {
			commandHistory = new LRUCache<string, number>(commandHistoryLength);
			commandCounter = 1;
		}

		return TPromise.as(null);
	}
}

class CommandPaletteEditorAction extends EditorAction {

	constructor() {
		super({
			id: ShowAllCommandsAction.ID,
			label: nls.localize('showCommands.label', "Command Palette..."),
			alias: 'Command Palette',
			precondition: null,
			menuOpts: {
				group: 'z_commands',
				order: 1
			} as IEditorCommandMenuOptions
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): TPromise<void> {
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
		@INotificationService private notificationService: INotificationService,
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
					/* __GDPR__
						"workbenchActionExecuted" : {
							"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
							"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
						}
					*/
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
				this.notificationService.info(nls.localize('actionNotEnabled', "Command '{0}' is not enabled in the current context.", this.getLabel()));
			}
		}, err => this.onError(err));
	}

	private onError(error?: Error): void {
		if (isPromiseCanceledError(error)) {
			return;
		}

		this.notificationService.error(error || nls.localize('canNotRun', "Command '{0}' resulted in an error.", this.label));
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
		@INotificationService notificationService: INotificationService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(commandId, keybinding, label, meta, highlights, onBeforeRun, notificationService, telemetryService);
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
		@INotificationService notificationService: INotificationService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(commandId, keybinding, label, alias, highlights, onBeforeRun, notificationService, telemetryService);
	}

	protected getAction(): Action | IEditorAction {
		return this.action;
	}
}

const wordFilter = or(matchesPrefix, matchesWords, matchesContiguousSubString);

export class CommandsHandler extends QuickOpenHandler {

	public static readonly ID = 'workbench.picker.commands';

	private lastSearchValue: string;
	private commandHistoryEnabled: boolean;
	private commandsHistory: CommandsHistory;

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IMenuService private menuService: IMenuService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super();

		this.commandsHistory = this.instantiationService.createInstance(CommandsHistory);

		this.configurationService.onDidChangeConfiguration(e => this.updateConfiguration());
		this.updateConfiguration();
	}

	private updateConfiguration(): void {
		this.commandHistoryEnabled = resolveCommandHistory(this.configurationService) > 0;
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();
		this.lastSearchValue = searchValue;

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
		const menu = this.editorGroupService.invokeWithinEditorContext(accessor => this.menuService.createMenu(MenuId.CommandPalette, accessor.get(IContextKeyService)));
		const menuActions = menu.getActions().reduce((r, [, actions]) => [...r, ...actions], <MenuItemAction[]>[]);
		const commandEntries = this.menuItemActionsToEntries(menuActions, searchValue);

		// Concat
		let entries = [...editorEntries, ...commandEntries];

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
			const counterA = this.commandsHistory.peek(elementA.getCommandId());
			const counterB = this.commandsHistory.peek(elementB.getCommandId());

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
		if (firstEntry && this.commandsHistory.peek(firstEntry.getCommandId())) {
			firstEntry.setGroupLabel(nls.localize('recentlyUsed', "recently used"));
			for (let i = 1; i < entries.length; i++) {
				const entry = entries[i];
				if (!this.commandsHistory.peek(entry.getCommandId())) {
					entry.setShowBorder(true);
					entry.setGroupLabel(nls.localize('morecCommands', "other commands"));
					break;
				}
			}
		}

		return TPromise.as(new QuickOpenModel(entries));
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
					entries.push(this.instantiationService.createInstance(EditorActionCommandEntry, action.id, this.keybindingService.lookupKeybinding(action.id), label, alias, { label: labelHighlights, alias: aliasHighlights }, action, (id: string) => this.onBeforeRunCommand(id)));
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
					entries.push(this.instantiationService.createInstance(ActionCommandEntry, action.id, this.keybindingService.lookupKeybinding(action.item.id), label, alias, { label: labelHighlights, alias: aliasHighlights }, action, (id: string) => this.onBeforeRunCommand(id)));
				}
			}
		}

		return entries;
	}

	public getAutoFocus(searchValue: string, context: { model: IModel<QuickOpenEntry>, quickNavigateConfiguration?: IQuickNavigateConfiguration }): IAutoFocus {
		let autoFocusPrefixMatch = searchValue.trim();

		if (autoFocusPrefixMatch && this.commandHistoryEnabled) {
			const firstEntry = context.model && context.model.entries[0];
			if (firstEntry instanceof BaseCommandEntry && this.commandsHistory.peek(firstEntry.getCommandId())) {
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

registerEditorAction(CommandPaletteEditorAction);
