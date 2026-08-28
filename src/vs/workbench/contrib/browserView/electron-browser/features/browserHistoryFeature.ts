/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { BrowserViewCommandId, BrowserViewStorageScope } from '../../../../../platform/browserView/common/browserView.js';
import { BrowserHistoryStore, IBrowserHistoryEntry } from '../../../../../platform/browserView/common/browserHistory.js';
import { workbenchConfigurationNodeBase } from '../../../../common/configuration.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { BrowserMaxHistoryEntriesSettingId } from '../browserViewWorkbenchService.js';
import {
	BROWSER_EDITOR_ACTIVE,
	BrowserActionCategory,
	BrowserActionGroup,
	BrowserEditor,
	BrowserEditorContribution,
	IBrowserUrlSuggestion,
	IBrowserUrlSuggestionAction,
	IBrowserUrlSuggestionProvider,
} from '../browserEditor.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { CONTEXT_BROWSER_STORAGE_SCOPE } from './browserDataStorageFeatures.js';

const MAX_RECENTS = 3;
const MAX_HISTORY = 6;

/**
 * Surfaces history from the active model's {@link BrowserHistoryStore} as
 * URL bar suggestions (deduped by host+path) and exposes a full history
 * management picker via the {@link BrowserViewCommandId.ShowHistory} action.
 */
export class BrowserHistoryFeature extends BrowserEditorContribution {

	private readonly _modelDisposables = this._register(new DisposableStore());
	private readonly _onDidChange = this._register(new Emitter<void>());

	private _model: IBrowserViewModel | undefined;
	private _history: BrowserHistoryStore | undefined;

	constructor(
		editor: BrowserEditor,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
	) {
		super(editor);
	}

	private readonly _recentsProvider: IBrowserUrlSuggestionProvider = {
		label: localize('browser.recents', "Recents"),
		order: 5,
		onDidChange: this._onDidChange.event,
		getSuggestions: async ({ input, text }) => this._buildRecents(input.url, text),
	};

	private readonly _historyProvider: IBrowserUrlSuggestionProvider = {
		label: localize('browser.history', "History"),
		order: 10,
		onDidChange: this._onDidChange.event,
		getSuggestions: async ({ input, text }) => this._buildHistory(input.url, text),
	};

	override get urlSuggestionProviders(): readonly IBrowserUrlSuggestionProvider[] {
		return [this._recentsProvider, this._historyProvider];
	}

	protected override onModelAttached(): void {
		this._modelDisposables.clear();
		this._model = this.editor.model!;
		this._history = this._model.history;
		this._modelDisposables.add(this._history.onDidChange(() => this._onDidChange.fire()));
		this._onDidChange.fire();
	}

	override onModelDetached(): void {
		this._modelDisposables.clear();
		this._model = undefined;
		this._history = undefined;
		this._onDidChange.fire();
	}

	showManagementPicker(): void {
		const model = this._model;
		const history = this._history;
		if (!model || !history) {
			return;
		}
		showHistoryPicker(this._quickInputService, model, history);
	}

	private _buildRecents(currentUrl: string | undefined, text: string): IBrowserUrlSuggestion[] {
		if (text.trim().length > 0) {
			return [];
		}
		return this._buildList(currentUrl, '', /* onlyUserInitiated */ true, MAX_RECENTS);
	}

	private _buildHistory(currentUrl: string | undefined, text: string): IBrowserUrlSuggestion[] {
		const needle = text.trim().toLowerCase();
		if (needle.length === 0) {
			return [];
		}
		return this._buildList(currentUrl, needle, /* onlyUserInitiated */ false, MAX_HISTORY);
	}

	private _buildList(currentUrl: string | undefined, needle: string, onlyUserInitiated: boolean, max: number): IBrowserUrlSuggestion[] {
		const history = this._history;
		const model = this._model;
		if (!history || !model) {
			return [];
		}
		const entries = history.entries.items;
		if (entries.length === 0) {
			return [];
		}

		const seen = new Set<string>();
		if (currentUrl) {
			seen.add(dedupKey(currentUrl));
		}

		// Walk newest-first; the persisted list is append-ordered. Dedup by
		// host+path so e.g. ?foo=1 and ?foo=2 collapse into a single entry
		// (newest wins because we walk in reverse).
		const out: IBrowserUrlSuggestion[] = [];
		for (let i = entries.length - 1; i >= 0 && out.length < max; i--) {
			const entry = entries[i];
			if (onlyUserInitiated && !entry.explicit) {
				continue;
			}
			const key = dedupKey(entry.url);
			if (seen.has(key)) {
				continue;
			}
			if (needle && !matches(entry, needle)) {
				continue;
			}
			seen.add(key);
			out.push(toSuggestion(model, history, entry));
		}
		return out;
	}
}

BrowserEditor.registerContribution(BrowserHistoryFeature);

// -- Suggestion helpers ----------------------------------------------

function toSuggestion(model: IBrowserViewModel, history: BrowserHistoryStore, entry: IBrowserHistoryEntry): IBrowserUrlSuggestion {
	const label = entry.title || entry.url;
	const description = entry.title ? entry.url : undefined;
	const faviconUri = entry.icon ? resolveFavicon(history, entry.icon) : undefined;
	const deleteAction: IBrowserUrlSuggestionAction = {
		id: 'browser.history.delete',
		iconClass: ThemeIcon.asClassName(Codicon.close),
		tooltip: localize('browser.removeFromHistory', "Remove from History"),
		run: () => model.deleteHistory([entry.id]),
	};
	return {
		id: 'history:' + entry.id,
		label,
		description,
		icon: faviconUri ? undefined : Codicon.globe,
		iconPath: faviconUri ? { dark: faviconUri } : undefined,
		apply: input => input.navigate(entry.url),
		actions: [deleteAction],
	};
}

function dedupKey(url: string): string {
	const parsed = URL.parse(url);
	if (!parsed) {
		return url;
	}
	return parsed.host + parsed.pathname;
}

function matches(entry: IBrowserHistoryEntry, needle: string): boolean {
	return entry.url.toLowerCase().includes(needle)
		|| entry.title.toLowerCase().includes(needle);
}

function resolveFavicon(history: BrowserHistoryStore, hash: string): URI | undefined {
	const dataUri = history.favicons.get(hash);
	if (!dataUri) {
		return undefined;
	}
	try {
		return URI.parse(dataUri);
	} catch {
		return undefined;
	}
}

// -- Management picker -----------------------------------------------

interface HistoryQuickPickItem extends IQuickPickItem {
	readonly entryId: number;
	readonly entryUrl: string;
}

interface HistorySeparator extends IQuickPickSeparator {
	readonly entryIds: readonly number[];
}

function showHistoryPicker(quickInputService: IQuickInputService, model: IBrowserViewModel, history: BrowserHistoryStore): void {
	const disposables = new DisposableStore();
	const picker = disposables.add(quickInputService.createQuickPick<HistoryQuickPickItem>({ useSeparators: true }));
	picker.title = localize('browser.history.title', "Browser History");
	picker.placeholder = localize('browser.history.placeholder', "Filter browser history");
	picker.matchOnDescription = true;
	picker.matchOnDetail = true;

	const clearAllButton: IQuickInputButton = {
		iconClass: ThemeIcon.asClassName(Codicon.trash),
		tooltip: localize('browser.history.clearAll', "Clear All History"),
	};
	const clearDayButton: IQuickInputButton = {
		iconClass: ThemeIcon.asClassName(Codicon.trash),
		tooltip: localize('browser.history.clearDay', "Clear Entries for This Day"),
	};
	const removeEntryButton: IQuickInputButton = {
		iconClass: ThemeIcon.asClassName(Codicon.close),
		tooltip: localize('browser.removeFromHistory', "Remove from History"),
	};
	picker.buttons = [clearAllButton];

	const rebuild = () => {
		picker.items = buildPickerItems(history, clearDayButton, removeEntryButton);
	};
	rebuild();
	disposables.add(history.onDidChange(rebuild));

	disposables.add(picker.onDidTriggerButton(button => {
		if (button === clearAllButton) {
			void model.deleteHistory();
		}
	}));

	disposables.add(picker.onDidTriggerSeparatorButton(({ button, separator }) => {
		if (button === clearDayButton) {
			void model.deleteHistory((separator as HistorySeparator).entryIds);
		}
	}));

	disposables.add(picker.onDidTriggerItemButton(({ button, item }) => {
		if (button === removeEntryButton) {
			void model.deleteHistory([item.entryId]);
		}
	}));

	disposables.add(picker.onDidAccept(() => {
		const selected = picker.selectedItems[0];
		if (selected) {
			void model.loadURL(selected.entryUrl);
		}
		picker.hide();
	}));

	disposables.add(picker.onDidHide(() => disposables.dispose()));
	picker.show();
}

function buildPickerItems(history: BrowserHistoryStore, clearDayButton: IQuickInputButton, removeEntryButton: IQuickInputButton): (HistoryQuickPickItem | HistorySeparator)[] {
	// Group by calendar day, newest-first within each day and across days.
	const sorted = [...history.entries.items].sort((a, b) => b.time - a.time);
	const groups = new Map<string, { label: string; entries: IBrowserHistoryEntry[] }>();
	const orderedKeys: string[] = [];
	const now = new Date();
	for (const entry of sorted) {
		const key = dayKey(entry.time);
		let group = groups.get(key);
		if (!group) {
			group = { label: dayLabel(entry.time, now), entries: [] };
			groups.set(key, group);
			orderedKeys.push(key);
		}
		group.entries.push(entry);
	}

	const out: (HistoryQuickPickItem | HistorySeparator)[] = [];
	for (const key of orderedKeys) {
		const group = groups.get(key)!;
		out.push({
			type: 'separator',
			id: key,
			label: group.label,
			buttons: [clearDayButton],
			entryIds: group.entries.map(e => e.id),
		});
		for (const entry of group.entries) {
			const faviconUri = entry.icon ? resolveFavicon(history, entry.icon) : undefined;
			out.push({
				label: entry.title || entry.url,
				description: entry.title ? entry.url : undefined,
				iconPath: faviconUri ? { dark: faviconUri } : undefined,
				iconClass: faviconUri ? undefined : ThemeIcon.asClassName(Codicon.globe),
				buttons: [removeEntryButton],
				entryId: entry.id,
				entryUrl: entry.url,
			});
		}
	}
	return out;
}

function dayKey(ts: number): string {
	const d = new Date(ts);
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(ts: number, now: Date): string {
	const d = new Date(ts);
	if (isSameDay(d, now)) {
		return localize('browser.history.today', "Today");
	}
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	if (isSameDay(d, yesterday)) {
		return localize('browser.history.yesterday', "Yesterday");
	}
	return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function isSameDay(a: Date, b: Date): boolean {
	return a.getFullYear() === b.getFullYear()
		&& a.getMonth() === b.getMonth()
		&& a.getDate() === b.getDate();
}

// -- Actions ----------------------------------------------------------

class ShowBrowserHistoryAction extends Action2 {
	static readonly ID = BrowserViewCommandId.ShowHistory;

	constructor() {
		const when = ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, ContextKeyExpr.equals(CONTEXT_BROWSER_STORAGE_SCOPE.key, BrowserViewStorageScope.Ephemeral).negate());
		super({
			id: ShowBrowserHistoryAction.ID,
			title: localize2('browser.showHistory', 'History'),
			category: BrowserActionCategory,
			icon: Codicon.history,
			f1: true,
			precondition: when,
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Data,
				order: 1,
				when,
				isHiddenByDefault: true,
			},
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.KeyH,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyY },
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			browserEditor.getContribution(BrowserHistoryFeature)?.showManagementPicker();
		}
	}
}

registerAction2(ShowBrowserHistoryAction);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		[BrowserMaxHistoryEntriesSettingId]: {
			type: 'integer',
			default: 200,
			minimum: 0,
			maximum: 10000,
			scope: ConfigurationScope.APPLICATION,
			description: localize('browser.maxHistoryEntries', "Maximum number of history items kept per session scope. Older entries are evicted first."),
			order: 110
		}
	}
});
