/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as arrays from 'vs/base/common/arrays';
import * as types from 'vs/base/common/types';
import { Language } from 'vs/base/common/platform';
import { Action, WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification } from 'vs/base/common/actions';
import { Mode, IEntryRunContext, IAutoFocus, IModel, IQuickNavigateConfiguration } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenEntryGroup, IHighlight, QuickOpenModel, QuickOpenEntry } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { QuickOpenHandler, IWorkbenchQuickOpenConfiguration } from 'vs/workbench/browser/quickopen';
import { IEditorAction } from 'vs/editor/common/editorCommon';
import { matchesWords, matchesPrefix, matchesContiguousSubString, or } from 'vs/base/common/filters';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { registerEditorAction, EditorAction } from 'vs/editor/browser/editorExtensions';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { LRUCache } from 'vs/base/common/map';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { isPromiseCanceledError } from 'vs/base/common/errors';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { Disposable, DisposableStore, IDisposable, toDisposable, dispose } from 'vs/base/common/lifecycle';
import { timeout } from 'vs/base/common/async';

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

class CommandsHistory extends Disposable {

	static readonly DEFAULT_COMMANDS_HISTORY_LENGTH = 50;

	private static readonly PREF_KEY_CACHE = 'commandPalette.mru.cache';
	private static readonly PREF_KEY_COUNTER = 'commandPalette.mru.counter';

	private commandHistoryLength: number;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		this.updateConfiguration();
		this.load();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => this.updateConfiguration()));
	}

	private updateConfiguration(): void {
		this.commandHistoryLength = resolveCommandHistory(this.configurationService);

		if (commandHistory && commandHistory.limit !== this.commandHistoryLength) {
			commandHistory.limit = this.commandHistoryLength;

			CommandsHistory.saveState(this.storageService);
		}
	}

	private load(): void {
		const raw = this.storageService.get(CommandsHistory.PREF_KEY_CACHE, StorageScope.GLOBAL);
		let serializedCache: ISerializedCommandHistory | undefined;
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

		commandCounter = this.storageService.getNumber(CommandsHistory.PREF_KEY_COUNTER, StorageScope.GLOBAL, commandCounter);
	}

	push(commandId: string): void {
		commandHistory.set(commandId, commandCounter++); // set counter to command

		CommandsHistory.saveState(this.storageService);
	}

	peek(commandId: string): number | undefined {
		return commandHistory.peek(commandId);
	}

	static saveState(storageService: IStorageService): void {
		const serializedCache: ISerializedCommandHistory = { usesLRU: true, entries: [] };
		commandHistory.forEach((value, key) => serializedCache.entries.push({ key, value }));

		storageService.store(CommandsHistory.PREF_KEY_CACHE, JSON.stringify(serializedCache), StorageScope.GLOBAL);
		storageService.store(CommandsHistory.PREF_KEY_COUNTER, commandCounter, StorageScope.GLOBAL);
	}
}

export class ShowAllCommandsAction extends Action {

	static readonly ID = 'workbench.action.showCommands';
	static readonly LABEL = nls.localize('showTriggerActions', "Show All Commands");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private readonly quickOpenService: IQuickOpenService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		const config = <IWorkbenchQuickOpenConfiguration>this.configurationService.getValue();
		const restoreInput = config.workbench && config.workbench.commandPalette && config.workbench.commandPalette.preserveInput === true;

		// Show with last command palette input if any and configured
		let value = ALL_COMMANDS_PREFIX;
		if (restoreInput && lastCommandPaletteInput) {
			value = `${value}${lastCommandPaletteInput}`;
		}

		this.quickOpenService.show(value, { inputSelection: lastCommandPaletteInput ? { start: 1 /* after prefix */, end: value.length } : undefined });

		return Promise.resolve(undefined);
	}
}

export class ClearCommandHistoryAction extends Action {

	static readonly ID = 'workbench.action.clearCommandHistory';
	static readonly LABEL = nls.localize('clearCommandHistory', "Clear Command History");

	constructor(
		id: string,
		label: string,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		const commandHistoryLength = resolveCommandHistory(this.configurationService);
		if (commandHistoryLength > 0) {
			commandHistory = new LRUCache<string, number>(commandHistoryLength);
			commandCounter = 1;

			CommandsHistory.saveState(this.storageService);
		}

		return Promise.resolve(undefined);
	}
}

class CommandPaletteEditorAction extends EditorAction {

	constructor() {
		super({
			id: ShowAllCommandsAction.ID,
			label: nls.localize('showCommands.label', "Command Palette..."),
			alias: 'Command Palette',
			precondition: undefined,
			menuOpts: {
				group: 'z_commands',
				order: 1
			}
		});
	}

	run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const quickOpenService = accessor.get(IQuickOpenService);

		// Show with prefix
		quickOpenService.show(ALL_COMMANDS_PREFIX);

		return Promise.resolve(undefined);
	}
}

abstract class BaseCommandEntry extends QuickOpenEntryGroup {
	private description: string;
	private alias: string;
	private labelLowercase: string;
	private readonly keybindingAriaLabel?: string;

	constructor(
		private commandId: string,
		private keybinding: ResolvedKeybinding,
		private label: string,
		alias: string,
		highlights: { label: IHighlight[], alias?: IHighlight[] },
		private onBeforeRun: (commandId: string) => void,
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService protected telemetryService: ITelemetryService
	) {
		super();

		this.labelLowercase = this.label.toLowerCase();
		this.keybindingAriaLabel = keybinding ? keybinding.getAriaLabel() || undefined : undefined;

		if (this.label !== alias) {
			this.alias = alias;
		} else {
			highlights.alias = undefined;
		}

		this.setHighlights(highlights.label, undefined, highlights.alias);
	}

	getCommandId(): string {
		return this.commandId;
	}

	getLabel(): string {
		return this.label;
	}

	getSortLabel(): string {
		return this.labelLowercase;
	}

	getDescription(): string {
		return this.description;
	}

	setDescription(description: string): void {
		this.description = description;
	}

	getKeybinding(): ResolvedKeybinding {
		return this.keybinding;
	}

	getDetail(): string {
		return this.alias;
	}

	getAriaLabel(): string {
		if (this.keybindingAriaLabel) {
			return nls.localize('entryAriaLabelWithKey', "{0}, {1}, commands", this.getLabel(), this.keybindingAriaLabel);
		}

		return nls.localize('entryAriaLabel', "{0}, commands", this.getLabel());
	}

	run(mode: Mode, context: IEntryRunContext): boolean {
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
		setTimeout(async () => {
			if (action && (!(action instanceof Action) || action.enabled)) {
				try {
					this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: action.id, from: 'quick open' });

					const promise = action.run();
					if (promise) {
						try {
							await promise;
						} finally {
							if (action instanceof Action) {
								action.dispose();
							}
						}
					}
				} catch (error) {
					this.onError(error);
				}
			} else {
				this.notificationService.info(nls.localize('actionNotEnabled', "Command '{0}' is not enabled in the current context.", this.getLabel()));
			}
		}, 50);
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

export class CommandsHandler extends QuickOpenHandler implements IDisposable {

	static readonly ID = 'workbench.picker.commands';

	private commandHistoryEnabled: boolean;
	private readonly commandsHistory: CommandsHistory;

	private readonly disposables = new DisposableStore();
	private readonly disposeOnClose = new DisposableStore();

	private waitedForExtensionsRegistered: boolean;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IMenuService private readonly menuService: IMenuService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionService private readonly extensionService: IExtensionService
	) {
		super();

		this.commandsHistory = this.disposables.add(this.instantiationService.createInstance(CommandsHistory));

		this.extensionService.whenInstalledExtensionsRegistered().then(() => this.waitedForExtensionsRegistered = true);

		this.configurationService.onDidChangeConfiguration(e => this.updateConfiguration());
		this.updateConfiguration();
	}

	private updateConfiguration(): void {
		this.commandHistoryEnabled = resolveCommandHistory(this.configurationService) > 0;
	}

	async getResults(searchValue: string, token: CancellationToken): Promise<QuickOpenModel> {
		if (this.waitedForExtensionsRegistered) {
			return this.doGetResults(searchValue, token);
		}

		// If extensions are not yet registered, we wait for a little moment to give them
		// a chance to register so that the complete set of commands shows up as result
		// We do not want to delay functionality beyond that time though to keep the commands
		// functional.
		await Promise.race([timeout(800).then(), this.extensionService.whenInstalledExtensionsRegistered()]);
		this.waitedForExtensionsRegistered = true;

		return this.doGetResults(searchValue, token);
	}

	private doGetResults(searchValue: string, token: CancellationToken): Promise<QuickOpenModel> {
		if (token.isCancellationRequested) {
			return Promise.resolve(new QuickOpenModel([]));
		}

		searchValue = searchValue.trim();

		// Remember as last command palette input
		lastCommandPaletteInput = searchValue;

		// Editor Actions
		const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
		let editorActions: IEditorAction[] = [];
		if (activeTextEditorWidget && types.isFunction(activeTextEditorWidget.getSupportedActions)) {
			editorActions = activeTextEditorWidget.getSupportedActions();
		}

		const editorEntries = this.editorActionsToEntries(editorActions, searchValue);

		// Other Actions
		const menu = this.editorService.invokeWithinEditorContext(accessor => this.menuService.createMenu(MenuId.CommandPalette, accessor.get(IContextKeyService)));
		const menuActions = menu.getActions().reduce((r, [, actions]) => [...r, ...actions], <MenuItemAction[]>[]).filter(action => action instanceof MenuItemAction) as MenuItemAction[];
		const commandEntries = this.menuItemActionsToEntries(menuActions, searchValue);
		menu.dispose();
		this.disposeOnClose.add(toDisposable(() => dispose(menuActions)));

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

		return Promise.resolve(new QuickOpenModel(entries));
	}

	private editorActionsToEntries(actions: IEditorAction[], searchValue: string): EditorActionCommandEntry[] {
		const entries: EditorActionCommandEntry[] = [];

		for (const action of actions) {
			if (action.id === ShowAllCommandsAction.ID) {
				continue; // avoid duplicates
			}

			const label = action.label;
			if (label) {

				// Alias for non default languages
				const alias = !Language.isDefaultVariant() ? action.alias : null;
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
				const aliasTitle = (!Language.isDefaultVariant() && typeof action.item.title !== 'string') ? action.item.title.original : null;
				const aliasCategory = (!Language.isDefaultVariant() && category && action.item.category && typeof action.item.category !== 'string') ? action.item.category.original : null;
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

	getAutoFocus(searchValue: string, context: { model: IModel<QuickOpenEntry>, quickNavigateConfiguration?: IQuickNavigateConfiguration }): IAutoFocus {
		let autoFocusPrefixMatch: string | undefined = searchValue.trim();

		if (autoFocusPrefixMatch && this.commandHistoryEnabled) {
			const firstEntry = context.model && context.model.entries[0];
			if (firstEntry instanceof BaseCommandEntry && this.commandsHistory.peek(firstEntry.getCommandId())) {
				autoFocusPrefixMatch = undefined; // keep focus on MRU element if we have history elements
			}
		}

		return {
			autoFocusFirstEntry: true,
			autoFocusPrefixMatch
		};
	}

	getEmptyLabel(searchString: string): string {
		return nls.localize('noCommandsMatching', "No commands matching");
	}

	onClose(canceled: boolean): void {
		super.onClose(canceled);

		this.disposeOnClose.clear();
	}

	dispose() {
		this.disposables.dispose();
		this.disposeOnClose.dispose();
	}
}

registerEditorAction(CommandPaletteEditorAction);
