/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/keybindingsEditor';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Delayer } from 'vs/base/common/async';
import * as DOM from 'vs/base/browser/dom';
import { OS } from 'vs/base/common/platform';
import { Checkbox } from 'vs/base/browser/ui/checkbox/checkbox';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { IAction } from 'vs/base/common/actions';
import { ActionBar, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorInput } from 'vs/workbench/common/editor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { KeybindingsEditorModel, IKeybindingItemEntry, IListEntry, KEYBINDING_ENTRY_TEMPLATE_ID, KEYBINDING_HEADER_TEMPLATE_ID } from 'vs/workbench/parts/preferences/common/keybindingsEditorModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService, IUserFriendlyKeybinding } from 'vs/platform/keybinding/common/keybinding';
import { SearchWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { DefineKeybindingWidget } from 'vs/workbench/parts/preferences/browser/keybindingWidgets';
import {
	IPreferencesService, IKeybindingsEditor, CONTEXT_KEYBINDING_FOCUS, CONTEXT_KEYBINDINGS_EDITOR, KEYBINDINGS_EDITOR_COMMAND_REMOVE, KEYBINDINGS_EDITOR_COMMAND_COPY,
	KEYBINDINGS_EDITOR_COMMAND_RESET, KEYBINDINGS_EDITOR_COMMAND_DEFINE, KEYBINDINGS_EDITOR_COMMAND_SHOW_CONFLICTS
} from 'vs/workbench/parts/preferences/common/preferences';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingEditingService } from 'vs/workbench/services/keybinding/common/keybindingEditing';
import { IListService } from 'vs/platform/list/browser/listService';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IDelegate, IRenderer, IListContextMenuEvent, IListEvent } from 'vs/base/browser/ui/list/list';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IChoiceService, IMessageService, Severity } from 'vs/platform/message/common/message';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode, ResolvedKeybinding } from 'vs/base/common/keyCodes';

let $ = DOM.$;

export class KeybindingsEditorInput extends EditorInput {

	public static ID: string = 'workbench.input.keybindings';
	public readonly keybindingsModel: KeybindingsEditorModel;

	constructor( @IInstantiationService private instantiationService: IInstantiationService) {
		super();
		this.keybindingsModel = instantiationService.createInstance(KeybindingsEditorModel, OS);
	}

	getTypeId(): string {
		return KeybindingsEditorInput.ID;
	}

	getName(): string {
		return localize('keybindingsInputName', "Keyboard Shortcuts");
	}

	resolve(refresh?: boolean): TPromise<KeybindingsEditorModel> {
		return TPromise.as(this.keybindingsModel);
	}

	matches(otherInput: any): boolean {
		return otherInput instanceof KeybindingsEditorInput;
	}
}

export class KeybindingsEditor extends BaseEditor implements IKeybindingsEditor {

	public static ID: string = 'workbench.editor.keybindings';

	private keybindingsEditorModel: KeybindingsEditorModel;

	private headerContainer: HTMLElement;
	private searchWidget: SearchWidget;

	private overlayContainer: HTMLElement;
	private defineKeybindingWidget: DefineKeybindingWidget;

	private keybindingsListContainer: HTMLElement;
	private unAssignedKeybindingItemToRevealAndFocus: IKeybindingItemEntry;
	private listEntries: IListEntry[];
	private keybindingsList: List<IListEntry>;

	private dimension: Dimension;
	private delayedFiltering: Delayer<void>;
	private latestEmptyFilters: string[] = [];
	private delayedFilterLogging: Delayer<void>;
	private keybindingsEditorContextKey: IContextKey<boolean>;
	private keybindingFocusContextKey: IContextKey<boolean>;
	private sortByPrecedence: Checkbox;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IKeybindingService private keybindingsService: IKeybindingService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IKeybindingEditingService private keybindingEditingService: IKeybindingEditingService,
		@IListService private listService: IListService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IChoiceService private choiceService: IChoiceService,
		@IMessageService private messageService: IMessageService,
		@IClipboardService private clipboardService: IClipboardService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(KeybindingsEditor.ID, telemetryService, themeService);
		this.delayedFiltering = new Delayer<void>(300);
		this._register(keybindingsService.onDidUpdateKeybindings(() => this.render()));

		this.keybindingsEditorContextKey = CONTEXT_KEYBINDINGS_EDITOR.bindTo(this.contextKeyService);
		this.keybindingFocusContextKey = CONTEXT_KEYBINDING_FOCUS.bindTo(this.contextKeyService);
		this.delayedFilterLogging = new Delayer<void>(1000);
	}

	createEditor(parent: Builder): void {
		const parentElement = parent.getHTMLElement();

		const keybindingsEditorElement = DOM.append(parentElement, $('div', { class: 'keybindings-editor' }));

		this.createOverlayContainer(keybindingsEditorElement);
		this.createHeader(keybindingsEditorElement);
		this.createBody(keybindingsEditorElement);

		const focusTracker = this._register(DOM.trackFocus(parentElement));
		this._register(focusTracker.addFocusListener(() => this.keybindingsEditorContextKey.set(true)));
		this._register(focusTracker.addBlurListener(() => this.keybindingsEditorContextKey.reset()));
	}

	setInput(input: KeybindingsEditorInput): TPromise<void> {
		const oldInput = this.input;
		return super.setInput(input)
			.then(() => {
				if (!input.matches(oldInput)) {
					this.render();
				}
			});
	}

	clearInput(): void {
		super.clearInput();
		this.searchWidget.clear();
		this.keybindingsEditorContextKey.reset();
		this.keybindingFocusContextKey.reset();
	}

	layout(dimension: Dimension): void {
		this.dimension = dimension;
		this.searchWidget.layout(dimension);

		this.overlayContainer.style.width = dimension.width + 'px';
		this.overlayContainer.style.height = dimension.height + 'px';
		this.defineKeybindingWidget.layout(this.dimension);

		this.layoutKebindingsList();
	}

	focus(): void {
		const activeKeybindingEntry = this.activeKeybindingEntry;
		if (activeKeybindingEntry) {
			this.selectEntry(activeKeybindingEntry);
		} else {
			this.searchWidget.focus();
		}
	}

	get activeKeybindingEntry(): IKeybindingItemEntry {
		const focusedElement = this.keybindingsList.getFocusedElements()[0];
		return focusedElement && focusedElement.templateId === KEYBINDING_ENTRY_TEMPLATE_ID ? <IKeybindingItemEntry>focusedElement : null;
	}

	defineKeybinding(keybindingEntry: IKeybindingItemEntry): TPromise<any> {
		this.selectEntry(keybindingEntry);
		this.showOverlayContainer();
		return this.defineKeybindingWidget.define().then(key => {
			this.reportKeybindingAction(KEYBINDINGS_EDITOR_COMMAND_DEFINE, keybindingEntry.keybindingItem.command, key);
			if (key) {
				return this.keybindingEditingService.editKeybinding(key, keybindingEntry.keybindingItem.keybindingItem)
					.then(() => {
						if (!keybindingEntry.keybindingItem.keybinding) { // reveal only if keybinding was added to unassinged. Because the entry will be placed in different position after rendering
							this.unAssignedKeybindingItemToRevealAndFocus = keybindingEntry;
						}
					});
			}
			return null;
		}).then(() => {
			this.hideOverlayContainer();
			this.selectEntry(keybindingEntry);
		}, error => {
			this.hideOverlayContainer();
			this.onKeybindingEditingError(error);
			this.selectEntry(keybindingEntry);
			return error;
		});
	}

	removeKeybinding(keybindingEntry: IKeybindingItemEntry): TPromise<any> {
		this.selectEntry(keybindingEntry);
		if (keybindingEntry.keybindingItem.keybinding) { // This should be a pre-condition
			this.reportKeybindingAction(KEYBINDINGS_EDITOR_COMMAND_REMOVE, keybindingEntry.keybindingItem.command, keybindingEntry.keybindingItem.keybinding);
			return this.keybindingEditingService.removeKeybinding(keybindingEntry.keybindingItem.keybindingItem)
				.then(() => this.focus(),
				error => {
					this.onKeybindingEditingError(error);
					this.selectEntry(keybindingEntry);
				});
		}
		return TPromise.as(null);
	}

	resetKeybinding(keybindingEntry: IKeybindingItemEntry): TPromise<any> {
		this.selectEntry(keybindingEntry);
		this.reportKeybindingAction(KEYBINDINGS_EDITOR_COMMAND_RESET, keybindingEntry.keybindingItem.command, keybindingEntry.keybindingItem.keybinding);
		return this.keybindingEditingService.resetKeybinding(keybindingEntry.keybindingItem.keybindingItem)
			.then(() => {
				if (!keybindingEntry.keybindingItem.keybinding) { // reveal only if keybinding was added to unassinged. Because the entry will be placed in different position after rendering
					this.unAssignedKeybindingItemToRevealAndFocus = keybindingEntry;
				}
				this.selectEntry(keybindingEntry);
			},
			error => {
				this.onKeybindingEditingError(error);
				this.selectEntry(keybindingEntry);
			});
	}

	copyKeybinding(keybinding: IKeybindingItemEntry): TPromise<any> {
		this.selectEntry(keybinding);
		this.reportKeybindingAction(KEYBINDINGS_EDITOR_COMMAND_COPY, keybinding.keybindingItem.command, keybinding.keybindingItem.keybinding);
		const userFriendlyKeybinding: IUserFriendlyKeybinding = {
			command: keybinding.keybindingItem.command,
			key: keybinding.keybindingItem.keybinding ? keybinding.keybindingItem.keybinding.getUserSettingsLabel() : ''
		};
		if (keybinding.keybindingItem.when) {
			userFriendlyKeybinding.when = keybinding.keybindingItem.when;
		}
		this.clipboardService.writeText(JSON.stringify(userFriendlyKeybinding, null, '  '));
		return TPromise.as(null);
	}

	search(filter: string): void {
		this.searchWidget.focus();
	}

	showConflicts(keybindingEntry: IKeybindingItemEntry): TPromise<any> {
		const value = `"${keybindingEntry.keybindingItem.keybinding.getAriaLabel()}"`;
		if (value !== this.searchWidget.getValue()) {
			this.searchWidget.setValue(value);
		}
		return TPromise.as(null);
	}

	private createOverlayContainer(parent: HTMLElement): void {
		this.overlayContainer = DOM.append(parent, $('.overlay-container'));
		this.overlayContainer.style.position = 'absolute';
		this.overlayContainer.style.zIndex = '10';
		this.defineKeybindingWidget = this._register(this.instantiationService.createInstance(DefineKeybindingWidget, this.overlayContainer));
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

		const searchContainer = DOM.append(this.headerContainer, $('.search-container'));
		this.searchWidget = this._register(this.instantiationService.createInstance(SearchWidget, searchContainer, {
			ariaLabel: localize('SearchKeybindings.AriaLabel', "Search keybindings"),
			placeholder: localize('SearchKeybindings.Placeholder', "Search keybindings"),
			navigateByArrows: true
		}));
		this._register(this.searchWidget.onDidChange(searchValue => this.delayedFiltering.trigger(() => this.filterKeybindings())));
		this._register(this.searchWidget.onNavigate(back => this._onNavigate(back)));

		this.sortByPrecedence = this._register(new Checkbox({
			actionClassName: 'sort-by-precedence',
			isChecked: false,
			onChange: () => this.renderKeybindingsEntries(false),
			title: localize('sortByPrecedene', "Sort by Precedence")
		}));
		searchContainer.appendChild(this.sortByPrecedence.domNode);

		this.createOpenKeybindingsElement(this.headerContainer);
	}

	private createOpenKeybindingsElement(parent: HTMLElement): void {
		const openKeybindingsContainer = DOM.append(parent, $('.open-keybindings-container'));
		DOM.append(openKeybindingsContainer, $('', null, localize('header-message', "For advanced customizations open and edit")));
		const fileElement = DOM.append(openKeybindingsContainer, $('.file-name', null, localize('keybindings-file-name', "keybindings.json")));
		fileElement.tabIndex = 0;

		this._register(DOM.addDisposableListener(fileElement, DOM.EventType.CLICK, () => this.preferencesService.openGlobalKeybindingSettings(true)));
		this._register(DOM.addDisposableListener(fileElement, DOM.EventType.KEY_UP, e => {
			let keyboardEvent = new StandardKeyboardEvent(e);
			switch (keyboardEvent.keyCode) {
				case KeyCode.Enter:
					this.preferencesService.openGlobalKeybindingSettings(true);
					keyboardEvent.preventDefault();
					keyboardEvent.stopPropagation();
					return;
			}
		}));
	}

	private createBody(parent: HTMLElement): void {
		const bodyContainer = DOM.append(parent, $('.keybindings-body'));
		this.createList(bodyContainer);
	}

	private createList(parent: HTMLElement): void {
		this.keybindingsListContainer = DOM.append(parent, $('.keybindings-list-container'));

		this.keybindingsList = this._register(new List<IListEntry>(this.keybindingsListContainer, new Delegate(), [new KeybindingHeaderRenderer(), new KeybindingItemRenderer(this, this.keybindingsService)],
			{ identityProvider: e => e.id, keyboardSupport: false, mouseSupport: true, ariaLabel: localize('keybindingsLabel', "Keybindings") }));
		this._register(this.keybindingsList.onContextMenu(e => this.onContextMenu(e)));
		this._register(this.keybindingsList.onFocusChange(e => this.onFocusChange(e)));
		this._register(this.keybindingsList.onDOMFocus(() => {
			DOM.addClass(this.keybindingsList.getHTMLElement(), 'focused');
		}));
		this._register(this.keybindingsList.onDOMBlur(() => {
			DOM.removeClass(this.keybindingsList.getHTMLElement(), 'focused');
			this.keybindingFocusContextKey.reset();
		}));

		this._register(this.listService.register(this.keybindingsList));
	}

	private render(): TPromise<any> {
		if (this.input) {
			return this.input.resolve()
				.then((keybindingsModel: KeybindingsEditorModel) => this.keybindingsEditorModel = keybindingsModel)
				.then(() => this.keybindingsEditorModel.resolve())
				.then(() => this.renderKeybindingsEntries(false));
		}
		return TPromise.as(null);
	}

	private filterKeybindings(): void {
		this.renderKeybindingsEntries(this.searchWidget.hasFocus());
		this.delayedFilterLogging.trigger(() => this.reportFilteringUsed(this.searchWidget.getValue()));
	}

	private renderKeybindingsEntries(reset: boolean): void {
		if (this.keybindingsEditorModel) {
			const filter = this.searchWidget.getValue();
			const keybindingsEntries: IKeybindingItemEntry[] = this.keybindingsEditorModel.fetch(filter, this.sortByPrecedence.checked);
			if (keybindingsEntries.length === 0) {
				this.latestEmptyFilters.push(filter);
			}
			const currentSelectedIndex = this.keybindingsList.getSelection()[0];
			this.listEntries = [{ id: 'keybinding-header-entry', templateId: KEYBINDING_HEADER_TEMPLATE_ID }, ...keybindingsEntries];
			this.keybindingsList.splice(0, this.keybindingsList.length, this.listEntries);
			this.layoutKebindingsList();

			if (reset) {
				this.keybindingsList.setSelection([]);
				this.keybindingsList.setFocus([]);
			} else {
				if (this.unAssignedKeybindingItemToRevealAndFocus) {
					const index = this.getNewIndexOfUnassignedKeybinding(this.unAssignedKeybindingItemToRevealAndFocus);
					if (index !== -1) {
						this.keybindingsList.reveal(index, 0.2);
						this.selectEntry(index);
					}
					this.unAssignedKeybindingItemToRevealAndFocus = null;
				} else if (currentSelectedIndex !== -1 && currentSelectedIndex < this.listEntries.length) {
					this.selectEntry(currentSelectedIndex);
				} else {
					this.focus();
				}
			}
		}
	}

	private layoutKebindingsList(): void {
		const listHeight = this.dimension.height - (DOM.getDomNodePagePosition(this.headerContainer).height + 12 /*padding*/);
		this.keybindingsListContainer.style.height = `${listHeight}px`;
		this.keybindingsList.layout(listHeight);
	}

	private getIndexOf(listEntry: IListEntry): number {
		const index = this.listEntries.indexOf(listEntry);
		if (index === -1) {
			for (let i = 0; i < this.listEntries.length; i++) {
				if (this.listEntries[i].id === listEntry.id) {
					return i;
				}
			}
		}
		return index;
	}

	private getNewIndexOfUnassignedKeybinding(unassignedKeybinding: IKeybindingItemEntry): number {
		for (let index = 0; index < this.listEntries.length; index++) {
			const entry = this.listEntries[index];
			if (entry.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
				const keybindingItemEntry = (<IKeybindingItemEntry>entry);
				if (keybindingItemEntry.keybindingItem.command === unassignedKeybinding.keybindingItem.command) {
					return index;
				}
			}
		}
		return -1;
	}

	private selectEntry(keybindingItemEntry: IKeybindingItemEntry | number): void {
		const index = typeof keybindingItemEntry === 'number' ? keybindingItemEntry : this.getIndexOf(keybindingItemEntry);
		if (index !== -1) {
			this.keybindingsList.getHTMLElement().focus();
			this.keybindingsList.setFocus([index]);
			this.keybindingsList.setSelection([index]);
		}
	}

	private _onNavigate(back: boolean): void {
		if (!back) {
			this.keybindingsList.getHTMLElement().focus();
			const currentFocusIndices = this.keybindingsList.getFocus();
			this.keybindingsList.setFocus([currentFocusIndices.length ? currentFocusIndices[0] : 0]);
		}
	}

	private onContextMenu(e: IListContextMenuEvent<IListEntry>): void {
		if (e.element.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
			this.selectEntry(<IKeybindingItemEntry>e.element);
			this.contextMenuService.showContextMenu({
				getAnchor: () => e.anchor,
				getActions: () => TPromise.as([
					this.createCopyAction(<IKeybindingItemEntry>e.element),
					new Separator(),
					this.createDefineAction(<IKeybindingItemEntry>e.element),
					this.createRemoveAction(<IKeybindingItemEntry>e.element),
					this.createResetAction(<IKeybindingItemEntry>e.element),
					new Separator(),
					this.createShowConflictsAction(<IKeybindingItemEntry>e.element)]),
				getKeyBinding: (action) => this.keybindingsService.lookupKeybinding(action.id)
			});
		}
	}

	private onFocusChange(e: IListEvent<IListEntry>): void {
		this.keybindingFocusContextKey.reset();
		const element = e.elements[0];
		if (!element) {
			return;
		}
		if (element.templateId === KEYBINDING_HEADER_TEMPLATE_ID) {
			this.keybindingsList.focusNext();
			return;
		}
		if (element.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
			this.keybindingFocusContextKey.set(true);
		}
	}

	private createDefineAction(keybindingItemEntry: IKeybindingItemEntry): IAction {
		return <IAction>{
			label: keybindingItemEntry.keybindingItem.keybinding ? localize('changeLabel', "Change Keybinding") : localize('addLabel', "Add Keybinding"),
			enabled: true,
			id: KEYBINDINGS_EDITOR_COMMAND_DEFINE,
			run: () => this.defineKeybinding(keybindingItemEntry)
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
			label: localize('showConflictsLabel', "Show Conflicts"),
			enabled: !!keybindingItem.keybindingItem.keybinding,
			id: KEYBINDINGS_EDITOR_COMMAND_SHOW_CONFLICTS,
			run: () => this.showConflicts(keybindingItem)
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

	private reportFilteringUsed(filter: string): void {
		if (filter) {
			let data = {
				filter,
				emptyFilters: this.getLatestEmptyFiltersForTelemetry()
			};
			this.latestEmptyFilters = [];
			this.telemetryService.publicLog('keybindings.filter', data);
		}
	}

	/**
	 * Put a rough limit on the size of the telemetry data, since otherwise it could be an unbounded large amount
	 * of data. 8192 is the max size of a property value. This is rough since that probably includes ""s, etc.
	 */
	private getLatestEmptyFiltersForTelemetry(): string[] {
		let cumulativeSize = 0;
		return this.latestEmptyFilters.filter(filterText => (cumulativeSize += filterText.length) <= 8192);
	}

	private reportKeybindingAction(action: string, command: string, keybinding: ResolvedKeybinding | string): void {
		this.telemetryService.publicLog(action, { command, keybinding: keybinding ? (typeof keybinding === 'string' ? keybinding : keybinding.getUserSettingsLabel()) : '' });
	}

	private onKeybindingEditingError(error: any): void {
		this.messageService.show(Severity.Error, typeof error === 'string' ? error : localize('error', "Error '{0}' while editing keybinding. Please open 'keybindings.json' file and check.", `${error}`));
	}
}

class Delegate implements IDelegate<IListEntry> {

	getHeight(element: IListEntry) {
		if (element.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
			const commandIdMatched = (<IKeybindingItemEntry>element).keybindingItem.commandLabel && (<IKeybindingItemEntry>element).commandIdMatches;
			const commandDefaultLabelMatched = !!(<IKeybindingItemEntry>element).commandDefaultLabelMatches;
			if (commandIdMatched && commandDefaultLabelMatched) {
				return 60;
			}
			if (commandIdMatched || commandDefaultLabelMatched) {
				return 40;
			}
		}
		if (element.templateId === KEYBINDING_HEADER_TEMPLATE_ID) {
			return 30;
		}
		return 24;
	}

	getTemplateId(element: IListEntry) {
		return element.templateId;
	}
}

interface KeybindingItemTemplate {
	parent: HTMLElement;
	actions: ActionsColumn;
	command: CommandColumn;
	keybinding: KeybindingColumn;
	source: SourceColumn;
	when: WhenColumn;
}

class KeybindingHeaderRenderer implements IRenderer<IListEntry, any> {

	get templateId(): string { return KEYBINDING_HEADER_TEMPLATE_ID; }

	constructor() { }

	renderTemplate(container: HTMLElement): any {
		DOM.addClass(container, 'keybindings-list-header');
		DOM.append(container,
			$('.header.actions'),
			$('.header.command', null, localize('command', "Command")),
			$('.header.keybinding', null, localize('keybinding', "Keybinding")),
			$('.header.source', null, localize('source', "Source")),
			$('.header.when', null, localize('when', "When")));
		return {};
	}

	renderElement(entry: IListEntry, index: number, template: any): void {
	}

	disposeTemplate(template: any): void {
	}
}

class KeybindingItemRenderer implements IRenderer<IKeybindingItemEntry, KeybindingItemTemplate> {

	get templateId(): string { return KEYBINDING_ENTRY_TEMPLATE_ID; }

	constructor(private keybindingsEditor: IKeybindingsEditor, private keybindingsService: IKeybindingService) { }

	renderTemplate(container: HTMLElement): KeybindingItemTemplate {
		DOM.addClass(container, 'keybinding-item');
		const actions = new ActionsColumn(container, this.keybindingsEditor, this.keybindingsService);
		const command = new CommandColumn(container, this.keybindingsEditor);
		const keybinding = new KeybindingColumn(container, this.keybindingsEditor);
		const source = new SourceColumn(container, this.keybindingsEditor);
		const when = new WhenColumn(container, this.keybindingsEditor);
		container.setAttribute('aria-labelledby', [command.id, keybinding.id, source.id, when.id].join(' '));
		return {
			parent: container,
			actions,
			command,
			keybinding,
			source,
			when
		};
	}

	renderElement(keybindingEntry: IKeybindingItemEntry, index: number, template: KeybindingItemTemplate): void {
		DOM.toggleClass(template.parent, 'even', index % 2 === 0);
		template.actions.render(keybindingEntry);
		template.command.render(keybindingEntry);
		template.keybinding.render(keybindingEntry);
		template.source.render(keybindingEntry);
		template.when.render(keybindingEntry);
	}

	disposeTemplate(template: KeybindingItemTemplate): void {
	}
}

abstract class Column {

	static COUNTER = 0;

	protected element: HTMLElement;
	readonly id: string;

	constructor(protected parent: HTMLElement, protected keybindingsEditor: IKeybindingsEditor) {
		this.element = this.create(parent);
		this.id = this.element.getAttribute('id');
	}

	abstract create(parent: HTMLElement): HTMLElement;
}

class ActionsColumn extends Column {

	private actionBar: ActionBar;

	constructor(parent: HTMLElement, keybindingsEditor: IKeybindingsEditor, private keybindingsService: IKeybindingService) {
		super(parent, keybindingsEditor);
	}

	create(parent: HTMLElement): HTMLElement {
		const actionsContainer = DOM.append(parent, $('.column.actions', { id: 'actions_' + ++Column.COUNTER }));
		this.actionBar = new ActionBar(actionsContainer, { animated: false });
		return actionsContainer;
	}

	render(keybindingItemEntry: IKeybindingItemEntry): void {
		this.actionBar.clear();
		const actions = [];
		if (keybindingItemEntry.keybindingItem.keybinding) {
			actions.push(this.createEditAction(keybindingItemEntry));
		} else {
			actions.push(this.createAddAction(keybindingItemEntry));
		}
		this.actionBar.push(actions, { icon: true });
	}

	private createEditAction(keybindingItemEntry: IKeybindingItemEntry): IAction {
		const keybinding = this.keybindingsService.lookupKeybinding(KEYBINDINGS_EDITOR_COMMAND_DEFINE);
		return <IAction>{
			class: 'edit',
			enabled: true,
			id: 'editKeybinding',
			tooltip: keybinding ? localize('editKeybindingLabelWithKey', "Change Keybinding {0}", `(${keybinding.getLabel()})`) : localize('editKeybindingLabel', "Change Keybinding"),
			run: () => this.keybindingsEditor.defineKeybinding(keybindingItemEntry)
		};
	}

	private createAddAction(keybindingItemEntry: IKeybindingItemEntry): IAction {
		const keybinding = this.keybindingsService.lookupKeybinding(KEYBINDINGS_EDITOR_COMMAND_DEFINE);
		return <IAction>{
			class: 'add',
			enabled: true,
			id: 'addKeybinding',
			tooltip: keybinding ? localize('addKeybindingLabelWithKey', "Add Keybinding {0}", `(${keybinding.getLabel()})`) : localize('addKeybindingLabel', "Add Keybinding"),
			run: () => this.keybindingsEditor.defineKeybinding(keybindingItemEntry)
		};
	}
}

class CommandColumn extends Column {

	private commandColumn: HTMLElement;

	create(parent: HTMLElement): HTMLElement {
		this.commandColumn = DOM.append(parent, $('.column.command', { id: 'command_' + ++Column.COUNTER }));
		return this.commandColumn;
	}

	render(keybindingItemEntry: IKeybindingItemEntry): void {
		DOM.clearNode(this.commandColumn);
		const keybindingItem = keybindingItemEntry.keybindingItem;
		const commandIdMatched = !!(keybindingItem.commandLabel && keybindingItemEntry.commandIdMatches);
		const commandDefaultLabelMatched = !!keybindingItemEntry.commandDefaultLabelMatches;
		DOM.toggleClass(this.commandColumn, 'vertical-align-column', commandIdMatched || commandDefaultLabelMatched);
		this.commandColumn.setAttribute('aria-label', this.getAriaLabel(keybindingItemEntry));
		if (keybindingItem.commandLabel) {
			const commandLabel = new HighlightedLabel(this.commandColumn);
			commandLabel.set(keybindingItem.commandLabel, keybindingItemEntry.commandLabelMatches);
			commandLabel.element.title = keybindingItem.command;
		}
		if (keybindingItemEntry.commandDefaultLabelMatches) {
			new HighlightedLabel(DOM.append(this.commandColumn, $('.command-default-label'))).set(keybindingItem.commandDefaultLabel, keybindingItemEntry.commandDefaultLabelMatches);
		}
		if (keybindingItemEntry.commandIdMatches || !keybindingItem.commandLabel) {
			new HighlightedLabel(DOM.append(this.commandColumn, $('.code'))).set(keybindingItem.command, keybindingItemEntry.commandIdMatches);
		}
	}

	private getAriaLabel(keybindingItemEntry: IKeybindingItemEntry): string {
		return localize('commandAriaLabel', "Command is {0}.", keybindingItemEntry.keybindingItem.commandLabel ? keybindingItemEntry.keybindingItem.commandLabel : keybindingItemEntry.keybindingItem.command);
	}
}

class KeybindingColumn extends Column {

	private keybindingColumn: HTMLElement;

	create(parent: HTMLElement): HTMLElement {
		this.keybindingColumn = DOM.append(parent, $('.column.keybinding', { id: 'keybinding_' + ++Column.COUNTER }));
		return this.keybindingColumn;
	}

	render(keybindingItemEntry: IKeybindingItemEntry): void {
		DOM.clearNode(this.keybindingColumn);
		this.keybindingColumn.setAttribute('aria-label', this.getAriaLabel(keybindingItemEntry));
		if (keybindingItemEntry.keybindingItem.keybinding) {
			new KeybindingLabel(this.keybindingColumn, OS).set(keybindingItemEntry.keybindingItem.keybinding, keybindingItemEntry.keybindingMatches);
		}
	}

	private getAriaLabel(keybindingItemEntry: IKeybindingItemEntry): string {
		return keybindingItemEntry.keybindingItem.keybinding ? localize('keybindingAriaLabel', "Keybinding is {0}.", keybindingItemEntry.keybindingItem.keybinding.getAriaLabel()) : localize('noKeybinding', "No Keybinding assigned.");
	}
}

class SourceColumn extends Column {

	private sourceColumn: HTMLElement;

	create(parent: HTMLElement): HTMLElement {
		this.sourceColumn = DOM.append(parent, $('.column.source', { id: 'source_' + ++Column.COUNTER }));
		return this.sourceColumn;
	}

	render(keybindingItemEntry: IKeybindingItemEntry): void {
		DOM.clearNode(this.sourceColumn);
		this.sourceColumn.setAttribute('aria-label', this.getAriaLabel(keybindingItemEntry));
		new HighlightedLabel(this.sourceColumn).set(keybindingItemEntry.keybindingItem.source, keybindingItemEntry.sourceMatches);
	}

	private getAriaLabel(keybindingItemEntry: IKeybindingItemEntry): string {
		return localize('sourceAriaLabel', "Source is {0}.", keybindingItemEntry.keybindingItem.source);
	}
}

class WhenColumn extends Column {

	private whenColumn: HTMLElement;

	create(parent: HTMLElement): HTMLElement {
		const column = DOM.append(parent, $('.column.when'));
		this.whenColumn = DOM.append(column, $('div', { id: 'when_' + ++Column.COUNTER }));
		return this.whenColumn;
	}

	render(keybindingItemEntry: IKeybindingItemEntry): void {
		DOM.clearNode(this.whenColumn);
		this.whenColumn.setAttribute('aria-label', this.getAriaLabel(keybindingItemEntry));
		DOM.toggleClass(this.whenColumn, 'code', !!keybindingItemEntry.keybindingItem.when);
		DOM.toggleClass(this.whenColumn, 'empty', !keybindingItemEntry.keybindingItem.when);
		if (keybindingItemEntry.keybindingItem.when) {
			new HighlightedLabel(this.whenColumn).set(keybindingItemEntry.keybindingItem.when, keybindingItemEntry.whenMatches);
			this.whenColumn.title = keybindingItemEntry.keybindingItem.when;
		} else {
			this.whenColumn.textContent = '—';
		}
	}

	private getAriaLabel(keybindingItemEntry: IKeybindingItemEntry): string {
		return keybindingItemEntry.keybindingItem.when ? localize('whenAriaLabel', "When is {0}.", keybindingItemEntry.keybindingItem.when) : localize('noWhen', "No when context.");
	}
}