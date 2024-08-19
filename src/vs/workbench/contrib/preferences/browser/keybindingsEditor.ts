/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/keybindingsEditor';
import { localize } from 'vs/nls';
import { Delayer } from 'vs/base/common/async';
import * as DOM from 'vs/base/browser/dom';
import { isIOS, OS } from 'vs/base/common/platform';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ToggleActionViewItem } from 'vs/base/browser/ui/toggle/toggle';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { IAction, Action, Separator } from 'vs/base/common/actions';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { KeybindingsEditorModel, KEYBINDING_ENTRY_TEMPLATE_ID } from 'vs/workbench/services/preferences/browser/keybindingsEditorModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService, IUserFriendlyKeybinding } from 'vs/platform/keybinding/common/keybinding';
import { DefineKeybindingWidget, KeybindingsSearchWidget } from 'vs/workbench/contrib/preferences/browser/keybindingWidgets';
import { CONTEXT_KEYBINDING_FOCUS, CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS, KEYBINDINGS_EDITOR_COMMAND_RECORD_SEARCH_KEYS, KEYBINDINGS_EDITOR_COMMAND_SORTBY_PRECEDENCE, KEYBINDINGS_EDITOR_COMMAND_DEFINE, KEYBINDINGS_EDITOR_COMMAND_REMOVE, KEYBINDINGS_EDITOR_COMMAND_RESET, KEYBINDINGS_EDITOR_COMMAND_COPY, KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND, KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, KEYBINDINGS_EDITOR_COMMAND_DEFINE_WHEN, KEYBINDINGS_EDITOR_COMMAND_SHOW_SIMILAR, KEYBINDINGS_EDITOR_COMMAND_ADD, KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND_TITLE, CONTEXT_WHEN_FOCUS } from 'vs/workbench/contrib/preferences/common/preferences';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingEditingService } from 'vs/workbench/services/keybinding/common/keybindingEditing';
import { IListContextMenuEvent } from 'vs/base/browser/ui/list/list';
import { IThemeService, registerThemingParticipant, IColorTheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { ThemeIcon } from 'vs/base/common/themables';
import { IContextKeyService, IContextKey, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { KeyCode } from 'vs/base/common/keyCodes';
import { badgeBackground, contrastBorder, badgeForeground, listActiveSelectionForeground, listInactiveSelectionForeground, listHoverForeground, listFocusForeground, editorBackground, foreground, listActiveSelectionBackground, listInactiveSelectionBackground, listFocusBackground, listHoverBackground, registerColor, tableOddRowsBackgroundColor, asCssVariable } from 'vs/platform/theme/common/colorRegistry';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { WorkbenchTable } from 'vs/platform/list/browser/listService';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Emitter, Event } from 'vs/base/common/event';
import { MenuRegistry, MenuId, isIMenuItem } from 'vs/platform/actions/common/actions';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { WORKBENCH_BACKGROUND } from 'vs/workbench/common/theme';
import { IKeybindingItemEntry, IKeybindingsEditorPane } from 'vs/workbench/services/preferences/common/preferences';
import { keybindingsRecordKeysIcon, keybindingsSortIcon, keybindingsAddIcon, preferencesClearInputIcon, keybindingsEditIcon } from 'vs/workbench/contrib/preferences/browser/preferencesIcons';
import { ITableRenderer, ITableVirtualDelegate } from 'vs/base/browser/ui/table/table';
import { KeybindingsEditorInput } from 'vs/workbench/services/preferences/browser/keybindingsEditorInput';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { defaultKeybindingLabelStyles, defaultToggleStyles, getInputBoxStyle } from 'vs/platform/theme/browser/defaultStyles';
import { IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { isString } from 'vs/base/common/types';
import { SuggestEnabledInput } from 'vs/workbench/contrib/codeEditor/browser/suggestEnabledInput/suggestEnabledInput';
import { CompletionItemKind } from 'vs/editor/common/languages';
import { settingsTextInputBorder } from 'vs/workbench/contrib/preferences/common/settingsEditorColorRegistry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { registerNavigableContainer } from 'vs/workbench/browser/actions/widgetNavigationCommands';
import { IActionViewItemOptions } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import type { IManagedHover } from 'vs/base/browser/ui/hover/hover';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';

const $ = DOM.$;

export class KeybindingsEditor extends EditorPane implements IKeybindingsEditorPane {

	static readonly ID: string = 'workbench.editor.keybindings';

	private _onDefineWhenExpression: Emitter<IKeybindingItemEntry> = this._register(new Emitter<IKeybindingItemEntry>());
	readonly onDefineWhenExpression: Event<IKeybindingItemEntry> = this._onDefineWhenExpression.event;

	private _onRejectWhenExpression = this._register(new Emitter<IKeybindingItemEntry>());
	readonly onRejectWhenExpression = this._onRejectWhenExpression.event;

	private _onAcceptWhenExpression = this._register(new Emitter<IKeybindingItemEntry>());
	readonly onAcceptWhenExpression = this._onAcceptWhenExpression.event;

	private _onLayout: Emitter<void> = this._register(new Emitter<void>());
	readonly onLayout: Event<void> = this._onLayout.event;

	private keybindingsEditorModel: KeybindingsEditorModel | null = null;

	private headerContainer!: HTMLElement;
	private actionsContainer!: HTMLElement;
	private searchWidget!: KeybindingsSearchWidget;
	private searchHistoryDelayer: Delayer<void>;

	private overlayContainer!: HTMLElement;
	private defineKeybindingWidget!: DefineKeybindingWidget;

	private unAssignedKeybindingItemToRevealAndFocus: IKeybindingItemEntry | null = null;
	private tableEntries: IKeybindingItemEntry[] = [];
	private keybindingsTableContainer!: HTMLElement;
	private keybindingsTable!: WorkbenchTable<IKeybindingItemEntry>;

	private dimension: DOM.Dimension | null = null;
	private delayedFiltering: Delayer<void>;
	private latestEmptyFilters: string[] = [];
	private keybindingsEditorContextKey: IContextKey<boolean>;
	private keybindingFocusContextKey: IContextKey<boolean>;
	private searchFocusContextKey: IContextKey<boolean>;

	private readonly sortByPrecedenceAction: Action;
	private readonly recordKeysAction: Action;

	private ariaLabelElement!: HTMLElement;
	readonly overflowWidgetsDomNode: HTMLElement;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IKeybindingService private readonly keybindingsService: IKeybindingService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IKeybindingEditingService private readonly keybindingEditingService: IKeybindingEditingService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@INotificationService private readonly notificationService: INotificationService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService
	) {
		super(KeybindingsEditor.ID, group, telemetryService, themeService, storageService);
		this.delayedFiltering = new Delayer<void>(300);
		this._register(keybindingsService.onDidUpdateKeybindings(() => this.render(!!this.keybindingFocusContextKey.get())));

		this.keybindingsEditorContextKey = CONTEXT_KEYBINDINGS_EDITOR.bindTo(this.contextKeyService);
		this.searchFocusContextKey = CONTEXT_KEYBINDINGS_SEARCH_FOCUS.bindTo(this.contextKeyService);
		this.keybindingFocusContextKey = CONTEXT_KEYBINDING_FOCUS.bindTo(this.contextKeyService);
		this.searchHistoryDelayer = new Delayer<void>(500);

		this.recordKeysAction = new Action(KEYBINDINGS_EDITOR_COMMAND_RECORD_SEARCH_KEYS, localize('recordKeysLabel', "Record Keys"), ThemeIcon.asClassName(keybindingsRecordKeysIcon));
		this.recordKeysAction.checked = false;

		this.sortByPrecedenceAction = new Action(KEYBINDINGS_EDITOR_COMMAND_SORTBY_PRECEDENCE, localize('sortByPrecedeneLabel', "Sort by Precedence (Highest first)"), ThemeIcon.asClassName(keybindingsSortIcon));
		this.sortByPrecedenceAction.checked = false;
		this.overflowWidgetsDomNode = $('.keybindings-overflow-widgets-container.monaco-editor');
	}

	override create(parent: HTMLElement): void {
		super.create(parent);
		this._register(registerNavigableContainer({
			name: 'keybindingsEditor',
			focusNotifiers: [this],
			focusNextWidget: () => {
				if (this.searchWidget.hasFocus()) {
					this.focusKeybindings();
				}
			},
			focusPreviousWidget: () => {
				if (!this.searchWidget.hasFocus()) {
					this.focusSearch();
				}
			}
		}));
	}

	protected createEditor(parent: HTMLElement): void {
		const keybindingsEditorElement = DOM.append(parent, $('div', { class: 'keybindings-editor' }));

		this.createAriaLabelElement(keybindingsEditorElement);
		this.createOverlayContainer(keybindingsEditorElement);
		this.createHeader(keybindingsEditorElement);
		this.createBody(keybindingsEditorElement);
	}

	override setInput(input: KeybindingsEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		this.keybindingsEditorContextKey.set(true);
		return super.setInput(input, options, context, token)
			.then(() => this.render(!!(options && options.preserveFocus)));
	}

	override clearInput(): void {
		super.clearInput();
		this.keybindingsEditorContextKey.reset();
		this.keybindingFocusContextKey.reset();
	}

	layout(dimension: DOM.Dimension): void {
		this.dimension = dimension;
		this.layoutSearchWidget(dimension);

		this.overlayContainer.style.width = dimension.width + 'px';
		this.overlayContainer.style.height = dimension.height + 'px';
		this.defineKeybindingWidget.layout(this.dimension);

		this.layoutKeybindingsTable();
		this._onLayout.fire();
	}

	override focus(): void {
		super.focus();

		const activeKeybindingEntry = this.activeKeybindingEntry;
		if (activeKeybindingEntry) {
			this.selectEntry(activeKeybindingEntry);
		} else if (!isIOS) {
			this.searchWidget.focus();
		}
	}

	get activeKeybindingEntry(): IKeybindingItemEntry | null {
		const focusedElement = this.keybindingsTable.getFocusedElements()[0];
		return focusedElement && focusedElement.templateId === KEYBINDING_ENTRY_TEMPLATE_ID ? <IKeybindingItemEntry>focusedElement : null;
	}

	async defineKeybinding(keybindingEntry: IKeybindingItemEntry, add: boolean): Promise<void> {
		this.selectEntry(keybindingEntry);
		this.showOverlayContainer();
		try {
			const key = await this.defineKeybindingWidget.define();
			if (key) {
				await this.updateKeybinding(keybindingEntry, key, keybindingEntry.keybindingItem.when, add);
			}
		} catch (error) {
			this.onKeybindingEditingError(error);
		} finally {
			this.hideOverlayContainer();
			this.selectEntry(keybindingEntry);
		}
	}

	defineWhenExpression(keybindingEntry: IKeybindingItemEntry): void {
		if (keybindingEntry.keybindingItem.keybinding) {
			this.selectEntry(keybindingEntry);
			this._onDefineWhenExpression.fire(keybindingEntry);
		}
	}

	rejectWhenExpression(keybindingEntry: IKeybindingItemEntry): void {
		this._onRejectWhenExpression.fire(keybindingEntry);
	}

	acceptWhenExpression(keybindingEntry: IKeybindingItemEntry): void {
		this._onAcceptWhenExpression.fire(keybindingEntry);
	}

	async updateKeybinding(keybindingEntry: IKeybindingItemEntry, key: string, when: string | undefined, add?: boolean): Promise<void> {
		const currentKey = keybindingEntry.keybindingItem.keybinding ? keybindingEntry.keybindingItem.keybinding.getUserSettingsLabel() : '';
		if (currentKey !== key || keybindingEntry.keybindingItem.when !== when) {
			if (add) {
				await this.keybindingEditingService.addKeybinding(keybindingEntry.keybindingItem.keybindingItem, key, when || undefined);
			} else {
				await this.keybindingEditingService.editKeybinding(keybindingEntry.keybindingItem.keybindingItem, key, when || undefined);
			}
			if (!keybindingEntry.keybindingItem.keybinding) { // reveal only if keybinding was added to unassinged. Because the entry will be placed in different position after rendering
				this.unAssignedKeybindingItemToRevealAndFocus = keybindingEntry;
			}
		}
	}

	async removeKeybinding(keybindingEntry: IKeybindingItemEntry): Promise<void> {
		this.selectEntry(keybindingEntry);
		if (keybindingEntry.keybindingItem.keybinding) { // This should be a pre-condition
			try {
				await this.keybindingEditingService.removeKeybinding(keybindingEntry.keybindingItem.keybindingItem);
				this.focus();
			} catch (error) {
				this.onKeybindingEditingError(error);
				this.selectEntry(keybindingEntry);
			}
		}
	}

	async resetKeybinding(keybindingEntry: IKeybindingItemEntry): Promise<void> {
		this.selectEntry(keybindingEntry);
		try {
			await this.keybindingEditingService.resetKeybinding(keybindingEntry.keybindingItem.keybindingItem);
			if (!keybindingEntry.keybindingItem.keybinding) { // reveal only if keybinding was added to unassinged. Because the entry will be placed in different position after rendering
				this.unAssignedKeybindingItemToRevealAndFocus = keybindingEntry;
			}
			this.selectEntry(keybindingEntry);
		} catch (error) {
			this.onKeybindingEditingError(error);
			this.selectEntry(keybindingEntry);
		}
	}

	async copyKeybinding(keybinding: IKeybindingItemEntry): Promise<void> {
		this.selectEntry(keybinding);
		const userFriendlyKeybinding: IUserFriendlyKeybinding = {
			key: keybinding.keybindingItem.keybinding ? keybinding.keybindingItem.keybinding.getUserSettingsLabel() || '' : '',
			command: keybinding.keybindingItem.command
		};
		if (keybinding.keybindingItem.when) {
			userFriendlyKeybinding.when = keybinding.keybindingItem.when;
		}
		await this.clipboardService.writeText(JSON.stringify(userFriendlyKeybinding, null, '  '));
	}

	async copyKeybindingCommand(keybinding: IKeybindingItemEntry): Promise<void> {
		this.selectEntry(keybinding);
		await this.clipboardService.writeText(keybinding.keybindingItem.command);
	}

	async copyKeybindingCommandTitle(keybinding: IKeybindingItemEntry): Promise<void> {
		this.selectEntry(keybinding);
		await this.clipboardService.writeText(keybinding.keybindingItem.commandLabel);
	}

	focusSearch(): void {
		this.searchWidget.focus();
	}

	search(filter: string): void {
		this.focusSearch();
		this.searchWidget.setValue(filter);
		this.selectEntry(0);
	}

	clearSearchResults(): void {
		this.searchWidget.clear();
	}

	showSimilarKeybindings(keybindingEntry: IKeybindingItemEntry): void {
		const value = `"${keybindingEntry.keybindingItem.keybinding.getAriaLabel()}"`;
		if (value !== this.searchWidget.getValue()) {
			this.searchWidget.setValue(value);
		}
	}

	private createAriaLabelElement(parent: HTMLElement): void {
		this.ariaLabelElement = DOM.append(parent, DOM.$(''));
		this.ariaLabelElement.setAttribute('id', 'keybindings-editor-aria-label-element');
		this.ariaLabelElement.setAttribute('aria-live', 'assertive');
	}

	private createOverlayContainer(parent: HTMLElement): void {
		this.overlayContainer = DOM.append(parent, $('.overlay-container'));
		this.overlayContainer.style.position = 'absolute';
		this.overlayContainer.style.zIndex = '40'; // has to greater than sash z-index which is 35
		this.defineKeybindingWidget = this._register(this.instantiationService.createInstance(DefineKeybindingWidget, this.overlayContainer));
		this._register(this.defineKeybindingWidget.onDidChange(keybindingStr => this.defineKeybindingWidget.printExisting(this.keybindingsEditorModel!.fetch(`"${keybindingStr}"`).length)));
		this._register(this.defineKeybindingWidget.onShowExistingKeybidings(keybindingStr => this.searchWidget.setValue(`"${keybindingStr}"`)));
		this.hideOverlayContainer();
	}

	private showOverlayContainer() {
		this.overlayContainer.style.display = 'block';
	}

	private hideOverlayContainer() {
		this.overlayContainer.style.display = 'none';
	}

	private createHeader(parent: HTMLElement): void {
		this.headerContainer = DOM.append(parent, $('.keybindings-header'));
		const fullTextSearchPlaceholder = localize('SearchKeybindings.FullTextSearchPlaceholder', "Type to search in keybindings");
		const keybindingsSearchPlaceholder = localize('SearchKeybindings.KeybindingsSearchPlaceholder', "Recording Keys. Press Escape to exit");

		const clearInputAction = new Action(KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, localize('clearInput', "Clear Keybindings Search Input"), ThemeIcon.asClassName(preferencesClearInputIcon), false, async () => this.clearSearchResults());

		const searchContainer = DOM.append(this.headerContainer, $('.search-container'));
		this.searchWidget = this._register(this.instantiationService.createInstance(KeybindingsSearchWidget, searchContainer, {
			ariaLabel: fullTextSearchPlaceholder,
			placeholder: fullTextSearchPlaceholder,
			focusKey: this.searchFocusContextKey,
			ariaLabelledBy: 'keybindings-editor-aria-label-element',
			recordEnter: true,
			quoteRecordedKeys: true,
			history: this.getMemento(StorageScope.PROFILE, StorageTarget.USER)['searchHistory'] || [],
			inputBoxStyles: getInputBoxStyle({
				inputBorder: settingsTextInputBorder
			})
		}));
		this._register(this.searchWidget.onDidChange(searchValue => {
			clearInputAction.enabled = !!searchValue;
			this.delayedFiltering.trigger(() => this.filterKeybindings());
			this.updateSearchOptions();
		}));
		this._register(this.searchWidget.onEscape(() => this.recordKeysAction.checked = false));

		this.actionsContainer = DOM.append(searchContainer, DOM.$('.keybindings-search-actions-container'));
		const recordingBadge = this.createRecordingBadge(this.actionsContainer);

		this._register(this.sortByPrecedenceAction.onDidChange(e => {
			if (e.checked !== undefined) {
				this.renderKeybindingsEntries(false);
			}
			this.updateSearchOptions();
		}));

		this._register(this.recordKeysAction.onDidChange(e => {
			if (e.checked !== undefined) {
				recordingBadge.classList.toggle('disabled', !e.checked);
				if (e.checked) {
					this.searchWidget.inputBox.setPlaceHolder(keybindingsSearchPlaceholder);
					this.searchWidget.inputBox.setAriaLabel(keybindingsSearchPlaceholder);
					this.searchWidget.startRecordingKeys();
					this.searchWidget.focus();
				} else {
					this.searchWidget.inputBox.setPlaceHolder(fullTextSearchPlaceholder);
					this.searchWidget.inputBox.setAriaLabel(fullTextSearchPlaceholder);
					this.searchWidget.stopRecordingKeys();
					this.searchWidget.focus();
				}
				this.updateSearchOptions();
			}
		}));

		const actions = [this.recordKeysAction, this.sortByPrecedenceAction, clearInputAction];
		const toolBar = this._register(new ToolBar(this.actionsContainer, this.contextMenuService, {
			actionViewItemProvider: (action: IAction, options: IActionViewItemOptions) => {
				if (action.id === this.sortByPrecedenceAction.id || action.id === this.recordKeysAction.id) {
					return new ToggleActionViewItem(null, action, { ...options, keybinding: this.keybindingsService.lookupKeybinding(action.id)?.getLabel(), toggleStyles: defaultToggleStyles });
				}
				return undefined;
			},
			getKeyBinding: action => this.keybindingsService.lookupKeybinding(action.id)
		}));
		toolBar.setActions(actions);
		this._register(this.keybindingsService.onDidUpdateKeybindings(() => toolBar.setActions(actions)));
	}

	private updateSearchOptions(): void {
		const keybindingsEditorInput = this.input as KeybindingsEditorInput;
		if (keybindingsEditorInput) {
			keybindingsEditorInput.searchOptions = {
				searchValue: this.searchWidget.getValue(),
				recordKeybindings: !!this.recordKeysAction.checked,
				sortByPrecedence: !!this.sortByPrecedenceAction.checked
			};
		}
	}

	private createRecordingBadge(container: HTMLElement): HTMLElement {
		const recordingBadge = DOM.append(container, DOM.$('.recording-badge.monaco-count-badge.long.disabled'));
		recordingBadge.textContent = localize('recording', "Recording Keys");

		recordingBadge.style.backgroundColor = asCssVariable(badgeBackground);
		recordingBadge.style.color = asCssVariable(badgeForeground);
		recordingBadge.style.border = `1px solid ${asCssVariable(contrastBorder)}`;

		return recordingBadge;
	}

	private layoutSearchWidget(dimension: DOM.Dimension): void {
		this.searchWidget.layout(dimension);
		this.headerContainer.classList.toggle('small', dimension.width < 400);
		this.searchWidget.inputBox.inputElement.style.paddingRight = `${DOM.getTotalWidth(this.actionsContainer) + 12}px`;
	}

	private createBody(parent: HTMLElement): void {
		const bodyContainer = DOM.append(parent, $('.keybindings-body'));
		this.createTable(bodyContainer);
	}

	private createTable(parent: HTMLElement): void {
		this.keybindingsTableContainer = DOM.append(parent, $('.keybindings-table-container'));
		this.keybindingsTable = this._register(this.instantiationService.createInstance(WorkbenchTable,
			'KeybindingsEditor',
			this.keybindingsTableContainer,
			new Delegate(),
			[
				{
					label: '',
					tooltip: '',
					weight: 0,
					minimumWidth: 40,
					maximumWidth: 40,
					templateId: ActionsColumnRenderer.TEMPLATE_ID,
					project(row: IKeybindingItemEntry): IKeybindingItemEntry { return row; }
				},
				{
					label: localize('command', "Command"),
					tooltip: '',
					weight: 0.3,
					templateId: CommandColumnRenderer.TEMPLATE_ID,
					project(row: IKeybindingItemEntry): IKeybindingItemEntry { return row; }
				},
				{
					label: localize('keybinding', "Keybinding"),
					tooltip: '',
					weight: 0.2,
					templateId: KeybindingColumnRenderer.TEMPLATE_ID,
					project(row: IKeybindingItemEntry): IKeybindingItemEntry { return row; }
				},
				{
					label: localize('when', "When"),
					tooltip: '',
					weight: 0.35,
					templateId: WhenColumnRenderer.TEMPLATE_ID,
					project(row: IKeybindingItemEntry): IKeybindingItemEntry { return row; }
				},
				{
					label: localize('source', "Source"),
					tooltip: '',
					weight: 0.15,
					templateId: SourceColumnRenderer.TEMPLATE_ID,
					project(row: IKeybindingItemEntry): IKeybindingItemEntry { return row; }
				},
			],
			[
				this.instantiationService.createInstance(ActionsColumnRenderer, this),
				this.instantiationService.createInstance(CommandColumnRenderer),
				this.instantiationService.createInstance(KeybindingColumnRenderer),
				this.instantiationService.createInstance(WhenColumnRenderer, this),
				this.instantiationService.createInstance(SourceColumnRenderer),
			],
			{
				identityProvider: { getId: (e: IKeybindingItemEntry) => e.id },
				horizontalScrolling: false,
				accessibilityProvider: new AccessibilityProvider(this.configurationService),
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e: IKeybindingItemEntry) => e.keybindingItem.commandLabel || e.keybindingItem.command },
				overrideStyles: {
					listBackground: editorBackground
				},
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				openOnSingleClick: false,
				transformOptimization: false // disable transform optimization as it causes the editor overflow widgets to be mispositioned
			}
		)) as WorkbenchTable<IKeybindingItemEntry>;

		this._register(this.keybindingsTable.onContextMenu(e => this.onContextMenu(e)));
		this._register(this.keybindingsTable.onDidChangeFocus(e => this.onFocusChange()));
		this._register(this.keybindingsTable.onDidFocus(() => {
			this.keybindingsTable.getHTMLElement().classList.add('focused');
			this.onFocusChange();
		}));
		this._register(this.keybindingsTable.onDidBlur(() => {
			this.keybindingsTable.getHTMLElement().classList.remove('focused');
			this.keybindingFocusContextKey.reset();
		}));
		this._register(this.keybindingsTable.onDidOpen((e) => {
			// stop double click action on the input #148493
			if (e.browserEvent?.defaultPrevented) {
				return;
			}
			const activeKeybindingEntry = this.activeKeybindingEntry;
			if (activeKeybindingEntry) {
				this.defineKeybinding(activeKeybindingEntry, false);
			}
		}));

		DOM.append(this.keybindingsTableContainer, this.overflowWidgetsDomNode);
	}

	private async render(preserveFocus: boolean): Promise<void> {
		if (this.input) {
			const input: KeybindingsEditorInput = this.input as KeybindingsEditorInput;
			this.keybindingsEditorModel = await input.resolve();
			await this.keybindingsEditorModel.resolve(this.getActionsLabels());
			this.renderKeybindingsEntries(false, preserveFocus);
			if (input.searchOptions) {
				this.recordKeysAction.checked = input.searchOptions.recordKeybindings;
				this.sortByPrecedenceAction.checked = input.searchOptions.sortByPrecedence;
				this.searchWidget.setValue(input.searchOptions.searchValue);
			} else {
				this.updateSearchOptions();
			}
		}
	}

	private getActionsLabels(): Map<string, string> {
		const actionsLabels: Map<string, string> = new Map<string, string>();
		for (const editorAction of EditorExtensionsRegistry.getEditorActions()) {
			actionsLabels.set(editorAction.id, editorAction.label);
		}
		for (const menuItem of MenuRegistry.getMenuItems(MenuId.CommandPalette)) {
			if (isIMenuItem(menuItem)) {
				const title = typeof menuItem.command.title === 'string' ? menuItem.command.title : menuItem.command.title.value;
				const category = menuItem.command.category ? typeof menuItem.command.category === 'string' ? menuItem.command.category : menuItem.command.category.value : undefined;
				actionsLabels.set(menuItem.command.id, category ? `${category}: ${title}` : title);
			}
		}
		return actionsLabels;
	}

	private filterKeybindings(): void {
		this.renderKeybindingsEntries(this.searchWidget.hasFocus());
		this.searchHistoryDelayer.trigger(() => {
			this.searchWidget.inputBox.addToHistory();
			this.getMemento(StorageScope.PROFILE, StorageTarget.USER)['searchHistory'] = this.searchWidget.inputBox.getHistory();
			this.saveState();
		});
	}

	public clearKeyboardShortcutSearchHistory(): void {
		this.searchWidget.inputBox.clearHistory();
		this.getMemento(StorageScope.PROFILE, StorageTarget.USER)['searchHistory'] = this.searchWidget.inputBox.getHistory();
		this.saveState();
	}

	private renderKeybindingsEntries(reset: boolean, preserveFocus?: boolean): void {
		if (this.keybindingsEditorModel) {
			const filter = this.searchWidget.getValue();
			const keybindingsEntries: IKeybindingItemEntry[] = this.keybindingsEditorModel.fetch(filter, this.sortByPrecedenceAction.checked);
			this.accessibilityService.alert(localize('foundResults', "{0} results", keybindingsEntries.length));
			this.ariaLabelElement.setAttribute('aria-label', this.getAriaLabel(keybindingsEntries));

			if (keybindingsEntries.length === 0) {
				this.latestEmptyFilters.push(filter);
			}
			const currentSelectedIndex = this.keybindingsTable.getSelection()[0];
			this.tableEntries = keybindingsEntries;
			this.keybindingsTable.splice(0, this.keybindingsTable.length, this.tableEntries);
			this.layoutKeybindingsTable();

			if (reset) {
				this.keybindingsTable.setSelection([]);
				this.keybindingsTable.setFocus([]);
			} else {
				if (this.unAssignedKeybindingItemToRevealAndFocus) {
					const index = this.getNewIndexOfUnassignedKeybinding(this.unAssignedKeybindingItemToRevealAndFocus);
					if (index !== -1) {
						this.keybindingsTable.reveal(index, 0.2);
						this.selectEntry(index);
					}
					this.unAssignedKeybindingItemToRevealAndFocus = null;
				} else if (currentSelectedIndex !== -1 && currentSelectedIndex < this.tableEntries.length) {
					this.selectEntry(currentSelectedIndex, preserveFocus);
				} else if (this.editorService.activeEditorPane === this && !preserveFocus) {
					this.focus();
				}
			}
		}
	}

	private getAriaLabel(keybindingsEntries: IKeybindingItemEntry[]): string {
		if (this.sortByPrecedenceAction.checked) {
			return localize('show sorted keybindings', "Showing {0} Keybindings in precedence order", keybindingsEntries.length);
		} else {
			return localize('show keybindings', "Showing {0} Keybindings in alphabetical order", keybindingsEntries.length);
		}
	}

	private layoutKeybindingsTable(): void {
		if (!this.dimension) {
			return;
		}

		const tableHeight = this.dimension.height - (DOM.getDomNodePagePosition(this.headerContainer).height + 12 /*padding*/);
		this.keybindingsTableContainer.style.height = `${tableHeight}px`;
		this.keybindingsTable.layout(tableHeight);
	}

	private getIndexOf(listEntry: IKeybindingItemEntry): number {
		const index = this.tableEntries.indexOf(listEntry);
		if (index === -1) {
			for (let i = 0; i < this.tableEntries.length; i++) {
				if (this.tableEntries[i].id === listEntry.id) {
					return i;
				}
			}
		}
		return index;
	}

	private getNewIndexOfUnassignedKeybinding(unassignedKeybinding: IKeybindingItemEntry): number {
		for (let index = 0; index < this.tableEntries.length; index++) {
			const entry = this.tableEntries[index];
			if (entry.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
				const keybindingItemEntry = (<IKeybindingItemEntry>entry);
				if (keybindingItemEntry.keybindingItem.command === unassignedKeybinding.keybindingItem.command) {
					return index;
				}
			}
		}
		return -1;
	}

	private selectEntry(keybindingItemEntry: IKeybindingItemEntry | number, focus: boolean = true): void {
		const index = typeof keybindingItemEntry === 'number' ? keybindingItemEntry : this.getIndexOf(keybindingItemEntry);
		if (index !== -1 && index < this.keybindingsTable.length) {
			if (focus) {
				this.keybindingsTable.domFocus();
				this.keybindingsTable.setFocus([index]);
			}
			this.keybindingsTable.setSelection([index]);
		}
	}

	focusKeybindings(): void {
		this.keybindingsTable.domFocus();
		const currentFocusIndices = this.keybindingsTable.getFocus();
		this.keybindingsTable.setFocus([currentFocusIndices.length ? currentFocusIndices[0] : 0]);
	}

	selectKeybinding(keybindingItemEntry: IKeybindingItemEntry): void {
		this.selectEntry(keybindingItemEntry);
	}

	recordSearchKeys(): void {
		this.recordKeysAction.checked = true;
	}

	toggleSortByPrecedence(): void {
		this.sortByPrecedenceAction.checked = !this.sortByPrecedenceAction.checked;
	}

	private onContextMenu(e: IListContextMenuEvent<IKeybindingItemEntry>): void {
		if (!e.element) {
			return;
		}

		if (e.element.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
			const keybindingItemEntry = <IKeybindingItemEntry>e.element;
			this.selectEntry(keybindingItemEntry);
			this.contextMenuService.showContextMenu({
				getAnchor: () => e.anchor,
				getActions: () => [
					this.createCopyAction(keybindingItemEntry),
					this.createCopyCommandAction(keybindingItemEntry),
					this.createCopyCommandTitleAction(keybindingItemEntry),
					new Separator(),
					...(keybindingItemEntry.keybindingItem.keybinding
						? [this.createDefineKeybindingAction(keybindingItemEntry), this.createAddKeybindingAction(keybindingItemEntry)]
						: [this.createDefineKeybindingAction(keybindingItemEntry)]),
					new Separator(),
					this.createRemoveAction(keybindingItemEntry),
					this.createResetAction(keybindingItemEntry),
					new Separator(),
					this.createDefineWhenExpressionAction(keybindingItemEntry),
					new Separator(),
					this.createShowConflictsAction(keybindingItemEntry)]
			});
		}
	}

	private onFocusChange(): void {
		this.keybindingFocusContextKey.reset();
		const element = this.keybindingsTable.getFocusedElements()[0];
		if (!element) {
			return;
		}
		if (element.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
			this.keybindingFocusContextKey.set(true);
		}
	}

	private createDefineKeybindingAction(keybindingItemEntry: IKeybindingItemEntry): IAction {
		return <IAction>{
			label: keybindingItemEntry.keybindingItem.keybinding ? localize('changeLabel', "Change Keybinding...") : localize('addLabel', "Add Keybinding..."),
			enabled: true,
			id: KEYBINDINGS_EDITOR_COMMAND_DEFINE,
			run: () => this.defineKeybinding(keybindingItemEntry, false)
		};
	}

	private createAddKeybindingAction(keybindingItemEntry: IKeybindingItemEntry): IAction {
		return <IAction>{
			label: localize('addLabel', "Add Keybinding..."),
			enabled: true,
			id: KEYBINDINGS_EDITOR_COMMAND_ADD,
			run: () => this.defineKeybinding(keybindingItemEntry, true)
		};
	}

	private createDefineWhenExpressionAction(keybindingItemEntry: IKeybindingItemEntry): IAction {
		return <IAction>{
			label: localize('editWhen', "Change When Expression"),
			enabled: !!keybindingItemEntry.keybindingItem.keybinding,
			id: KEYBINDINGS_EDITOR_COMMAND_DEFINE_WHEN,
			run: () => this.defineWhenExpression(keybindingItemEntry)
		};
	}

	private createRemoveAction(keybindingItem: IKeybindingItemEntry): IAction {
		return <IAction>{
			label: localize('removeLabel', "Remove Keybinding"),
			enabled: !!keybindingItem.keybindingItem.keybinding,
			id: KEYBINDINGS_EDITOR_COMMAND_REMOVE,
			run: () => this.removeKeybinding(keybindingItem)
		};
	}

	private createResetAction(keybindingItem: IKeybindingItemEntry): IAction {
		return <IAction>{
			label: localize('resetLabel', "Reset Keybinding"),
			enabled: !keybindingItem.keybindingItem.keybindingItem.isDefault,
			id: KEYBINDINGS_EDITOR_COMMAND_RESET,
			run: () => this.resetKeybinding(keybindingItem)
		};
	}

	private createShowConflictsAction(keybindingItem: IKeybindingItemEntry): IAction {
		return <IAction>{
			label: localize('showSameKeybindings', "Show Same Keybindings"),
			enabled: !!keybindingItem.keybindingItem.keybinding,
			id: KEYBINDINGS_EDITOR_COMMAND_SHOW_SIMILAR,
			run: () => this.showSimilarKeybindings(keybindingItem)
		};
	}

	private createCopyAction(keybindingItem: IKeybindingItemEntry): IAction {
		return <IAction>{
			label: localize('copyLabel', "Copy"),
			enabled: true,
			id: KEYBINDINGS_EDITOR_COMMAND_COPY,
			run: () => this.copyKeybinding(keybindingItem)
		};
	}

	private createCopyCommandAction(keybinding: IKeybindingItemEntry): IAction {
		return <IAction>{
			label: localize('copyCommandLabel', "Copy Command ID"),
			enabled: true,
			id: KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND,
			run: () => this.copyKeybindingCommand(keybinding)
		};
	}

	private createCopyCommandTitleAction(keybinding: IKeybindingItemEntry): IAction {
		return <IAction>{
			label: localize('copyCommandTitleLabel', "Copy Command Title"),
			enabled: !!keybinding.keybindingItem.commandLabel,
			id: KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND_TITLE,
			run: () => this.copyKeybindingCommandTitle(keybinding)
		};
	}

	private onKeybindingEditingError(error: any): void {
		this.notificationService.error(typeof error === 'string' ? error : localize('error', "Error '{0}' while editing the keybinding. Please open 'keybindings.json' file and check for errors.", `${error}`));
	}
}

class Delegate implements ITableVirtualDelegate<IKeybindingItemEntry> {

	readonly headerRowHeight = 30;

	getHeight(element: IKeybindingItemEntry) {
		if (element.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
			const commandIdMatched = (<IKeybindingItemEntry>element).keybindingItem.commandLabel && (<IKeybindingItemEntry>element).commandIdMatches;
			const commandDefaultLabelMatched = !!(<IKeybindingItemEntry>element).commandDefaultLabelMatches;
			const extensionIdMatched = !!(<IKeybindingItemEntry>element).extensionIdMatches;
			if (commandIdMatched && commandDefaultLabelMatched) {
				return 60;
			}
			if (extensionIdMatched || commandIdMatched || commandDefaultLabelMatched) {
				return 40;
			}
		}
		return 24;
	}

}

interface IActionsColumnTemplateData {
	readonly actionBar: ActionBar;
}

class ActionsColumnRenderer implements ITableRenderer<IKeybindingItemEntry, IActionsColumnTemplateData> {

	static readonly TEMPLATE_ID = 'actions';

	readonly templateId: string = ActionsColumnRenderer.TEMPLATE_ID;

	constructor(
		private readonly keybindingsEditor: KeybindingsEditor,
		@IKeybindingService private readonly keybindingsService: IKeybindingService
	) {
	}

	renderTemplate(container: HTMLElement): IActionsColumnTemplateData {
		const element = DOM.append(container, $('.actions'));
		const actionBar = new ActionBar(element);
		return { actionBar };
	}

	renderElement(keybindingItemEntry: IKeybindingItemEntry, index: number, templateData: IActionsColumnTemplateData, height: number | undefined): void {
		templateData.actionBar.clear();
		const actions: IAction[] = [];
		if (keybindingItemEntry.keybindingItem.keybinding) {
			actions.push(this.createEditAction(keybindingItemEntry));
		} else {
			actions.push(this.createAddAction(keybindingItemEntry));
		}
		templateData.actionBar.push(actions, { icon: true });
	}

	private createEditAction(keybindingItemEntry: IKeybindingItemEntry): IAction {
		const keybinding = this.keybindingsService.lookupKeybinding(KEYBINDINGS_EDITOR_COMMAND_DEFINE);
		return <IAction>{
			class: ThemeIcon.asClassName(keybindingsEditIcon),
			enabled: true,
			id: 'editKeybinding',
			tooltip: keybinding ? localize('editKeybindingLabelWithKey', "Change Keybinding {0}", `(${keybinding.getLabel()})`) : localize('editKeybindingLabel', "Change Keybinding"),
			run: () => this.keybindingsEditor.defineKeybinding(keybindingItemEntry, false)
		};
	}

	private createAddAction(keybindingItemEntry: IKeybindingItemEntry): IAction {
		const keybinding = this.keybindingsService.lookupKeybinding(KEYBINDINGS_EDITOR_COMMAND_DEFINE);
		return <IAction>{
			class: ThemeIcon.asClassName(keybindingsAddIcon),
			enabled: true,
			id: 'addKeybinding',
			tooltip: keybinding ? localize('addKeybindingLabelWithKey', "Add Keybinding {0}", `(${keybinding.getLabel()})`) : localize('addKeybindingLabel', "Add Keybinding"),
			run: () => this.keybindingsEditor.defineKeybinding(keybindingItemEntry, false)
		};
	}

	disposeTemplate(templateData: IActionsColumnTemplateData): void {
		templateData.actionBar.dispose();
	}

}

interface ICommandColumnTemplateData {
	commandColumn: HTMLElement;
	commandColumnHover: IManagedHover;
	commandLabelContainer: HTMLElement;
	commandLabel: HighlightedLabel;
	commandDefaultLabelContainer: HTMLElement;
	commandDefaultLabel: HighlightedLabel;
	commandIdLabelContainer: HTMLElement;
	commandIdLabel: HighlightedLabel;
}

class CommandColumnRenderer implements ITableRenderer<IKeybindingItemEntry, ICommandColumnTemplateData> {

	static readonly TEMPLATE_ID = 'commands';

	readonly templateId: string = CommandColumnRenderer.TEMPLATE_ID;

	constructor(
		@IHoverService private readonly _hoverService: IHoverService
	) {
	}

	renderTemplate(container: HTMLElement): ICommandColumnTemplateData {
		const commandColumn = DOM.append(container, $('.command'));
		const commandColumnHover = this._hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), commandColumn, '');
		const commandLabelContainer = DOM.append(commandColumn, $('.command-label'));
		const commandLabel = new HighlightedLabel(commandLabelContainer);
		const commandDefaultLabelContainer = DOM.append(commandColumn, $('.command-default-label'));
		const commandDefaultLabel = new HighlightedLabel(commandDefaultLabelContainer);
		const commandIdLabelContainer = DOM.append(commandColumn, $('.command-id.code'));
		const commandIdLabel = new HighlightedLabel(commandIdLabelContainer);
		return { commandColumn, commandColumnHover, commandLabelContainer, commandLabel, commandDefaultLabelContainer, commandDefaultLabel, commandIdLabelContainer, commandIdLabel };
	}

	renderElement(keybindingItemEntry: IKeybindingItemEntry, index: number, templateData: ICommandColumnTemplateData, height: number | undefined): void {
		const keybindingItem = keybindingItemEntry.keybindingItem;
		const commandIdMatched = !!(keybindingItem.commandLabel && keybindingItemEntry.commandIdMatches);
		const commandDefaultLabelMatched = !!keybindingItemEntry.commandDefaultLabelMatches;

		templateData.commandColumn.classList.toggle('vertical-align-column', commandIdMatched || commandDefaultLabelMatched);
		const title = keybindingItem.commandLabel ? localize('title', "{0} ({1})", keybindingItem.commandLabel, keybindingItem.command) : keybindingItem.command;
		templateData.commandColumn.setAttribute('aria-label', title);
		templateData.commandColumnHover.update(title);

		if (keybindingItem.commandLabel) {
			templateData.commandLabelContainer.classList.remove('hide');
			templateData.commandLabel.set(keybindingItem.commandLabel, keybindingItemEntry.commandLabelMatches);
		} else {
			templateData.commandLabelContainer.classList.add('hide');
			templateData.commandLabel.set(undefined);
		}

		if (keybindingItemEntry.commandDefaultLabelMatches) {
			templateData.commandDefaultLabelContainer.classList.remove('hide');
			templateData.commandDefaultLabel.set(keybindingItem.commandDefaultLabel, keybindingItemEntry.commandDefaultLabelMatches);
		} else {
			templateData.commandDefaultLabelContainer.classList.add('hide');
			templateData.commandDefaultLabel.set(undefined);
		}

		if (keybindingItemEntry.commandIdMatches || !keybindingItem.commandLabel) {
			templateData.commandIdLabelContainer.classList.remove('hide');
			templateData.commandIdLabel.set(keybindingItem.command, keybindingItemEntry.commandIdMatches);
		} else {
			templateData.commandIdLabelContainer.classList.add('hide');
			templateData.commandIdLabel.set(undefined);
		}
	}

	disposeTemplate(templateData: ICommandColumnTemplateData): void {
		templateData.commandColumnHover.dispose();
		templateData.commandDefaultLabel.dispose();
		templateData.commandIdLabel.dispose();
		templateData.commandLabel.dispose();
	}
}

interface IKeybindingColumnTemplateData {
	keybindingLabel: KeybindingLabel;
}

class KeybindingColumnRenderer implements ITableRenderer<IKeybindingItemEntry, IKeybindingColumnTemplateData> {

	static readonly TEMPLATE_ID = 'keybindings';

	readonly templateId: string = KeybindingColumnRenderer.TEMPLATE_ID;

	constructor() { }

	renderTemplate(container: HTMLElement): IKeybindingColumnTemplateData {
		const element = DOM.append(container, $('.keybinding'));
		const keybindingLabel = new KeybindingLabel(DOM.append(element, $('div.keybinding-label')), OS, defaultKeybindingLabelStyles);
		return { keybindingLabel };
	}

	renderElement(keybindingItemEntry: IKeybindingItemEntry, index: number, templateData: IKeybindingColumnTemplateData, height: number | undefined): void {
		if (keybindingItemEntry.keybindingItem.keybinding) {
			templateData.keybindingLabel.set(keybindingItemEntry.keybindingItem.keybinding, keybindingItemEntry.keybindingMatches);
		} else {
			templateData.keybindingLabel.set(undefined, undefined);
		}
	}

	disposeTemplate(templateData: IKeybindingColumnTemplateData): void {
		templateData.keybindingLabel.dispose();
	}
}

interface ISourceColumnTemplateData {
	sourceColumn: HTMLElement;
	sourceColumnHover: IManagedHover;
	sourceLabel: HighlightedLabel;
	extensionContainer: HTMLElement;
	extensionLabel: HTMLAnchorElement;
	extensionId: HighlightedLabel;
	disposables: DisposableStore;
}

function onClick(element: HTMLElement, callback: () => void): IDisposable {
	const disposables = new DisposableStore();
	disposables.add(DOM.addDisposableListener(element, DOM.EventType.CLICK, DOM.finalHandler(callback)));
	disposables.add(DOM.addDisposableListener(element, DOM.EventType.KEY_UP, e => {
		const keyboardEvent = new StandardKeyboardEvent(e);
		if (keyboardEvent.equals(KeyCode.Space) || keyboardEvent.equals(KeyCode.Enter)) {
			e.preventDefault();
			e.stopPropagation();
			callback();
		}
	}));
	return disposables;
}

class SourceColumnRenderer implements ITableRenderer<IKeybindingItemEntry, ISourceColumnTemplateData> {

	static readonly TEMPLATE_ID = 'source';

	readonly templateId: string = SourceColumnRenderer.TEMPLATE_ID;

	constructor(
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IHoverService private readonly hoverService: IHoverService,
	) { }

	renderTemplate(container: HTMLElement): ISourceColumnTemplateData {
		const sourceColumn = DOM.append(container, $('.source'));
		const sourceColumnHover = this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), sourceColumn, '');
		const sourceLabel = new HighlightedLabel(DOM.append(sourceColumn, $('.source-label')));
		const extensionContainer = DOM.append(sourceColumn, $('.extension-container'));
		const extensionLabel = DOM.append<HTMLAnchorElement>(extensionContainer, $('a.extension-label', { tabindex: 0 }));
		const extensionId = new HighlightedLabel(DOM.append(extensionContainer, $('.extension-id-container.code')));
		return { sourceColumn, sourceColumnHover, sourceLabel, extensionLabel, extensionContainer, extensionId, disposables: new DisposableStore() };
	}

	renderElement(keybindingItemEntry: IKeybindingItemEntry, index: number, templateData: ISourceColumnTemplateData, height: number | undefined): void {
		templateData.disposables.clear();
		if (isString(keybindingItemEntry.keybindingItem.source)) {
			templateData.extensionContainer.classList.add('hide');
			templateData.sourceLabel.element.classList.remove('hide');
			templateData.sourceColumnHover.update('');
			templateData.sourceLabel.set(keybindingItemEntry.keybindingItem.source || '-', keybindingItemEntry.sourceMatches);
		} else {
			templateData.extensionContainer.classList.remove('hide');
			templateData.sourceLabel.element.classList.add('hide');
			const extension = keybindingItemEntry.keybindingItem.source;
			const extensionLabel = extension.displayName ?? extension.identifier.value;
			templateData.sourceColumnHover.update(localize('extension label', "Extension ({0})", extensionLabel));
			templateData.extensionLabel.textContent = extensionLabel;
			templateData.disposables.add(onClick(templateData.extensionLabel, () => {
				this.extensionsWorkbenchService.open(extension.identifier.value);
			}));
			if (keybindingItemEntry.extensionIdMatches) {
				templateData.extensionId.element.classList.remove('hide');
				templateData.extensionId.set(extension.identifier.value, keybindingItemEntry.extensionIdMatches);
			} else {
				templateData.extensionId.element.classList.add('hide');
				templateData.extensionId.set(undefined);
			}
		}
	}

	disposeTemplate(templateData: ISourceColumnTemplateData): void {
		templateData.sourceColumnHover.dispose();
		templateData.disposables.dispose();
		templateData.sourceLabel.dispose();
		templateData.extensionId.dispose();
	}
}

class WhenInputWidget extends Disposable {

	private readonly input: SuggestEnabledInput;

	private readonly _onDidAccept = this._register(new Emitter<string>());
	readonly onDidAccept = this._onDidAccept.event;

	private readonly _onDidReject = this._register(new Emitter<void>());
	readonly onDidReject = this._onDidReject.event;

	constructor(
		parent: HTMLElement,
		keybindingsEditor: KeybindingsEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		const focusContextKey = CONTEXT_WHEN_FOCUS.bindTo(contextKeyService);
		this.input = this._register(instantiationService.createInstance(SuggestEnabledInput, 'keyboardshortcutseditor#wheninput', parent, {
			provideResults: () => {
				const result = [];
				for (const contextKey of RawContextKey.all()) {
					result.push({ label: contextKey.key, documentation: contextKey.description, detail: contextKey.type, kind: CompletionItemKind.Constant });
				}
				return result;
			},
			triggerCharacters: ['!', ' '],
			wordDefinition: /[a-zA-Z.]+/,
			alwaysShowSuggestions: true,
		}, '', `keyboardshortcutseditor#wheninput`, { focusContextKey, overflowWidgetsDomNode: keybindingsEditor.overflowWidgetsDomNode }));

		this._register((DOM.addDisposableListener(this.input.element, DOM.EventType.DBLCLICK, e => DOM.EventHelper.stop(e))));
		this._register(toDisposable(() => focusContextKey.reset()));

		this._register(keybindingsEditor.onAcceptWhenExpression(() => this._onDidAccept.fire(this.input.getValue())));
		this._register(Event.any(keybindingsEditor.onRejectWhenExpression, this.input.onDidBlur)(() => this._onDidReject.fire()));
	}

	layout(dimension: DOM.Dimension): void {
		this.input.layout(dimension);
	}

	show(value: string): void {
		this.input.setValue(value);
		this.input.focus(true);
	}

}

interface IWhenColumnTemplateData {
	readonly element: HTMLElement;
	readonly whenLabelContainer: HTMLElement;
	readonly whenInputContainer: HTMLElement;
	readonly whenLabel: HighlightedLabel;
	readonly disposables: DisposableStore;
}

class WhenColumnRenderer implements ITableRenderer<IKeybindingItemEntry, IWhenColumnTemplateData> {

	static readonly TEMPLATE_ID = 'when';

	readonly templateId: string = WhenColumnRenderer.TEMPLATE_ID;

	constructor(
		private readonly keybindingsEditor: KeybindingsEditor,
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	renderTemplate(container: HTMLElement): IWhenColumnTemplateData {
		const element = DOM.append(container, $('.when'));

		const whenLabelContainer = DOM.append(element, $('div.when-label'));
		const whenLabel = new HighlightedLabel(whenLabelContainer);

		const whenInputContainer = DOM.append(element, $('div.when-input-container'));

		return {
			element,
			whenLabelContainer,
			whenLabel,
			whenInputContainer,
			disposables: new DisposableStore(),
		};
	}

	renderElement(keybindingItemEntry: IKeybindingItemEntry, index: number, templateData: IWhenColumnTemplateData, height: number | undefined): void {
		templateData.disposables.clear();
		const whenInputDisposables = templateData.disposables.add(new DisposableStore());
		templateData.disposables.add(this.keybindingsEditor.onDefineWhenExpression(e => {
			if (keybindingItemEntry === e) {
				templateData.element.classList.add('input-mode');

				const inputWidget = whenInputDisposables.add(this.instantiationService.createInstance(WhenInputWidget, templateData.whenInputContainer, this.keybindingsEditor));
				inputWidget.layout(new DOM.Dimension(templateData.element.parentElement!.clientWidth, 18));
				inputWidget.show(keybindingItemEntry.keybindingItem.when || '');

				const hideInputWidget = () => {
					whenInputDisposables.clear();
					templateData.element.classList.remove('input-mode');
					templateData.element.parentElement!.style.paddingLeft = '10px';
					DOM.clearNode(templateData.whenInputContainer);
				};

				whenInputDisposables.add(inputWidget.onDidAccept(value => {
					hideInputWidget();
					this.keybindingsEditor.updateKeybinding(keybindingItemEntry, keybindingItemEntry.keybindingItem.keybinding ? keybindingItemEntry.keybindingItem.keybinding.getUserSettingsLabel() || '' : '', value);
					this.keybindingsEditor.selectKeybinding(keybindingItemEntry);
				}));

				whenInputDisposables.add(inputWidget.onDidReject(() => {
					hideInputWidget();
					this.keybindingsEditor.selectKeybinding(keybindingItemEntry);
				}));

				templateData.element.parentElement!.style.paddingLeft = '0px';
			}
		}));

		templateData.whenLabelContainer.classList.toggle('code', !!keybindingItemEntry.keybindingItem.when);
		templateData.whenLabelContainer.classList.toggle('empty', !keybindingItemEntry.keybindingItem.when);

		if (keybindingItemEntry.keybindingItem.when) {
			templateData.whenLabel.set(keybindingItemEntry.keybindingItem.when, keybindingItemEntry.whenMatches, keybindingItemEntry.keybindingItem.when);
			templateData.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), templateData.element, keybindingItemEntry.keybindingItem.when));
		} else {
			templateData.whenLabel.set('-');
		}
	}

	disposeTemplate(templateData: IWhenColumnTemplateData): void {
		templateData.disposables.dispose();
		templateData.whenLabel.dispose();
	}
}

class AccessibilityProvider implements IListAccessibilityProvider<IKeybindingItemEntry> {

	constructor(private readonly configurationService: IConfigurationService) { }

	getWidgetAriaLabel(): string {
		return localize('keybindingsLabel', "Keybindings");
	}

	getAriaLabel({ keybindingItem }: IKeybindingItemEntry): string {
		const ariaLabel = [
			keybindingItem.commandLabel ? keybindingItem.commandLabel : keybindingItem.command,
			keybindingItem.keybinding?.getAriaLabel() || localize('noKeybinding', "No keybinding assigned"),
			keybindingItem.when ? keybindingItem.when : localize('noWhen', "No when context"),
			isString(keybindingItem.source) ? keybindingItem.source : keybindingItem.source.description ?? keybindingItem.source.identifier.value,
		];
		if (this.configurationService.getValue(AccessibilityVerbositySettingId.KeybindingsEditor)) {
			const kbEditorAriaLabel = localize('keyboard shortcuts aria label', "use space or enter to change the keybinding.");
			ariaLabel.push(kbEditorAriaLabel);
		}
		return ariaLabel.join(', ');
	}
}

registerColor('keybindingTable.headerBackground', tableOddRowsBackgroundColor, 'Background color for the keyboard shortcuts table header.');
registerColor('keybindingTable.rowsBackground', tableOddRowsBackgroundColor, 'Background color for the keyboard shortcuts table alternating rows.');

registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
	const foregroundColor = theme.getColor(foreground);
	if (foregroundColor) {
		const whenForegroundColor = foregroundColor.transparent(.8).makeOpaque(WORKBENCH_BACKGROUND(theme));
		collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-table-container .monaco-table .monaco-table-tr .monaco-table-td .code { color: ${whenForegroundColor}; }`);
	}

	const listActiveSelectionForegroundColor = theme.getColor(listActiveSelectionForeground);
	const listActiveSelectionBackgroundColor = theme.getColor(listActiveSelectionBackground);
	if (listActiveSelectionForegroundColor && listActiveSelectionBackgroundColor) {
		const whenForegroundColor = listActiveSelectionForegroundColor.transparent(.8).makeOpaque(listActiveSelectionBackgroundColor);
		collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-table-container .monaco-table.focused .monaco-list-row.selected .monaco-table-tr .monaco-table-td .code { color: ${whenForegroundColor}; }`);
	}

	const listInactiveSelectionForegroundColor = theme.getColor(listInactiveSelectionForeground);
	const listInactiveSelectionBackgroundColor = theme.getColor(listInactiveSelectionBackground);
	if (listInactiveSelectionForegroundColor && listInactiveSelectionBackgroundColor) {
		const whenForegroundColor = listInactiveSelectionForegroundColor.transparent(.8).makeOpaque(listInactiveSelectionBackgroundColor);
		collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-table-container .monaco-table .monaco-list-row.selected .monaco-table-tr .monaco-table-td .code { color: ${whenForegroundColor}; }`);
	}

	const listFocusForegroundColor = theme.getColor(listFocusForeground);
	const listFocusBackgroundColor = theme.getColor(listFocusBackground);
	if (listFocusForegroundColor && listFocusBackgroundColor) {
		const whenForegroundColor = listFocusForegroundColor.transparent(.8).makeOpaque(listFocusBackgroundColor);
		collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-table-container .monaco-table.focused .monaco-list-row.focused .monaco-table-tr .monaco-table-td .code { color: ${whenForegroundColor}; }`);
	}

	const listHoverForegroundColor = theme.getColor(listHoverForeground);
	const listHoverBackgroundColor = theme.getColor(listHoverBackground);
	if (listHoverForegroundColor && listHoverBackgroundColor) {
		const whenForegroundColor = listHoverForegroundColor.transparent(.8).makeOpaque(listHoverBackgroundColor);
		collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-table-container .monaco-table.focused .monaco-list-row:hover:not(.focused):not(.selected) .monaco-table-tr .monaco-table-td .code { color: ${whenForegroundColor}; }`);
	}
});
