/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/keybindingsEditor';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Delayer } from 'vs/base/common/async';
import * as DOM from 'vs/base/browser/dom';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { IAction } from 'vs/base/common/actions';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorInput } from 'vs/workbench/common/editor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { KeybindingsEditorModel, IKeybindingItemEntry, IListEntry, KEYBINDING_ENTRY_TEMPLATE_ID, KEYBINDING_HEADER_TEMPLATE_ID } from 'vs/workbench/parts/preferences/common/keybindingsEditorModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService, KeybindingSource } from 'vs/platform/keybinding/common/keybinding';
import { SearchWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { DefineKeybindingWidget } from 'vs/workbench/parts/preferences/browser/keybindingWidgets';
import { IPreferencesService, IKeybindingsEditor, CONTEXT_KEYBINDING_FOCUS, KEYBINDINGS_EDITOR_ID, CONTEXT_KEYBINDINGS_EDITOR, KEYBINDINGS_EDITOR_COMMAND_REMOVE } from 'vs/workbench/parts/preferences/common/preferences';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { renderHtml } from 'vs/base/browser/htmlContentRenderer';
import { IKeybindingEditingService } from 'vs/workbench/services/keybinding/common/keybindingEditing';
import { IListService } from 'vs/platform/list/browser/listService';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IDelegate, IRenderer, IListContextMenuEvent, IListEvent } from 'vs/base/browser/ui/list/list';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IChoiceService, Severity } from 'vs/platform/message/common/message';

let $ = DOM.$;

export class KeybindingsEditorInput extends EditorInput {

	public static ID: string = 'worknench.input.keybindings';
	public readonly keybindingsModel: KeybindingsEditorModel;

	constructor( @IInstantiationService private instantiationService: IInstantiationService) {
		super();
		this.keybindingsModel = instantiationService.createInstance(KeybindingsEditorModel);
	}

	getTypeId(): string {
		return KeybindingsEditorInput.ID;
	}

	getName(): string {
		return localize('keybindingsInputName', "Keybindings");
	}

	resolve(refresh?: boolean): TPromise<KeybindingsEditorModel> {
		return TPromise.as(this.keybindingsModel);
	}

	matches(otherInput: any): boolean {
		return otherInput instanceof KeybindingsEditorInput;
	}
}

export class KeybindingsEditor extends BaseEditor implements IKeybindingsEditor {

	public static ID: string = KEYBINDINGS_EDITOR_ID;
	private headerContainer: HTMLElement;
	private searchWidget: SearchWidget;

	private overlayContainer: HTMLElement;
	private defineKeybindingWidget: DefineKeybindingWidget;

	private keybindingsListContainer: HTMLElement;
	private keybindingsList: List<IListEntry>;

	private dimension: Dimension;
	private delayedFiltering: Delayer<void>;
	private keybindingsEditorContextKey: IContextKey<boolean>;
	private keybindingFocusContextKey: IContextKey<boolean>;

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
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(KeybindingsEditor.ID, telemetryService, themeService);
		this.delayedFiltering = new Delayer<void>(300);
		this._register(keybindingsService.onDidUpdateKeybindings(() => this.render()));

		this.keybindingsEditorContextKey = CONTEXT_KEYBINDINGS_EDITOR.bindTo(this.contextKeyService);
		this.keybindingFocusContextKey = CONTEXT_KEYBINDING_FOCUS.bindTo(this.contextKeyService);
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

		const listHeight = dimension.height - (DOM.getDomNodePagePosition(this.headerContainer).height + 11 /*padding*/);
		this.keybindingsListContainer.style.height = `${listHeight}px`;
		this.keybindingsList.layout(listHeight);
	}

	focus(): void {
		this.searchWidget.focus();
	}

	get activeKeybindingEntry(): IKeybindingItemEntry {
		const focusedElement = this.keybindingsList.getFocusedElements()[0];
		return focusedElement && focusedElement.templateId === KEYBINDING_ENTRY_TEMPLATE_ID ? <IKeybindingItemEntry>focusedElement : null;
	}

	defineKeybinding(keybindingEntry: IKeybindingItemEntry): TPromise<any> {
		this.overlayContainer.style.display = 'block';
		return this.defineKeybindingWidget.define().then(key => {
			if (key) {
				return this.keybindingEditingService.editKeybinding(key, keybindingEntry.keybindingItem);
			}
			return null;
		}).then(() => {
			this.overlayContainer.style.display = 'none';
			this.focus();
		});
	}

	removeKeybinding(keybindingEntry: IKeybindingItemEntry): TPromise<any> {
		if (keybindingEntry.keybindingItem.keybinding) { // This should be a pre-condition
			const options: string[] = [localize('ok', "Ok"), localize('cancel', "Cancel")];
			return this.choiceService.choose(Severity.Info, localize('confirmRemove', "Remove keybinding '{0}' from command '{1}'", keybindingEntry.keybindingItem.keybinding.getAriaLabel(), keybindingEntry.keybindingItem.commandLabel || keybindingEntry.keybindingItem.commandLabel), options, true)
				.then(option => {
					if (option === 0) {
						return this.keybindingEditingService.removeKeybinding(keybindingEntry.keybindingItem);
					}
					return null;
				})
				.then(() => this.focus());
		}
		return TPromise.as(null);
	}

	search(filter: string): void {
		this.searchWidget.focus();
	}

	private createOverlayContainer(parent: HTMLElement): void {
		this.overlayContainer = DOM.append(parent, $('.overlay-container'));
		this.overlayContainer.style.position = 'absolute';
		this.overlayContainer.style.display = 'none';
		this.overlayContainer.style.zIndex = '10';
		this.defineKeybindingWidget = this._register(this.instantiationService.createInstance(DefineKeybindingWidget, this.overlayContainer));
	}

	private createHeader(parent: HTMLElement): void {
		this.headerContainer = DOM.append(parent, $('.keybindings-header'));
		this.searchWidget = this._register(this.instantiationService.createInstance(SearchWidget, DOM.append(this.headerContainer, $('.search-container')), {
			ariaLabel: localize('SearchKeybindings.AriaLabel', "Search keybindings"),
			placeholder: localize('SearchKeybindings.Placeholder', "Search keybindings"),
			navigateByArrows: true
		}));
		this._register(this.searchWidget.onDidChange(searchValue => this.delayedFiltering.trigger(() => this.render())));
		this._register(this.searchWidget.onNavigate(back => this._onNavigate(back)));

		const openKeybindingsContainer = DOM.append(this.headerContainer, $('.open-keybindings-container'));
		DOM.append(openKeybindingsContainer, $('span', null, localize('header-message', "For advanced customizations open and edit ")));
		const fileElement = DOM.append(openKeybindingsContainer, $('span.file-name', null, localize('keybindings-file-name', "keybindings.json")));
		this._register(DOM.addDisposableListener(fileElement, DOM.EventType.CLICK, () => this.preferencesService.openGlobalKeybindingSettings(true)));
	}

	private createBody(parent: HTMLElement): void {
		const bodyContainer = DOM.append(parent, $('.keybindings-body'));
		this.createList(bodyContainer);
	}

	private createList(parent: HTMLElement): void {
		this.keybindingsListContainer = DOM.append(parent, $('.keybindings-list-container'));

		this.keybindingsList = this._register(new List<IListEntry>(this.keybindingsListContainer, new Delegate(), [new KeybindingHeaderRenderer(), new KeybindingItemRenderer(this)], { identityProvider: e => e.id }));
		this._register(this.keybindingsList.onContextMenu(e => this.onContextMenu(e)));
		this._register(this.keybindingsList.onFocusChange(e => this.onFocusChange(e)));
		this._register(this.keybindingsList.onDOMFocus(() => this.keybindingsList.focusNext()));
		this._register(this.keybindingsList.onDOMBlur(() => this.keybindingFocusContextKey.reset()));

		this._register(this.listService.register(this.keybindingsList));
	}

	private render(): TPromise<any> {
		if (this.input) {
			return this.input.resolve()
				.then((keybindingsModel: KeybindingsEditorModel) => keybindingsModel.resolve()
					.then(() => this.renderKeybindingsData(keybindingsModel.fetch(this.searchWidget.value()))));
		}
		return TPromise.as(null);
	}

	private renderKeybindingsData(keybindingsData: IKeybindingItemEntry[]): void {
		this.keybindingsList.splice(0, this.keybindingsList.length, [{ id: 'keybinding-header-entry', templateId: KEYBINDING_HEADER_TEMPLATE_ID }, ...keybindingsData]);
		this.keybindingsList.layout(this.dimension.height - DOM.getDomNodePagePosition(this.headerContainer).height);
	}

	private _onNavigate(back: boolean): void {
		if (!back) {
			this.keybindingsList.getHTMLElement().focus();
			this.keybindingsList.setFocus([0]);
		}
	}

	private onContextMenu(e: IListContextMenuEvent<IListEntry>): void {
		if (e.element.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
			this.contextMenuService.showContextMenu({
				getAnchor: () => e.anchor,
				getActions: () => TPromise.as([this.createRemoveAction(<IKeybindingItemEntry>e.element)]),
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

	private createRemoveAction(keybindingItem: IKeybindingItemEntry): IAction {
		return <IAction>{
			label: localize('removeLabel', "Remove Keybinding"),
			enabled: !!keybindingItem.keybindingItem.keybinding,
			id: KEYBINDINGS_EDITOR_COMMAND_REMOVE,
			run: () => this.removeKeybinding(keybindingItem)
		};
	}
}

class Delegate implements IDelegate<IListEntry> {

	getHeight(element: IListEntry) {
		if (element.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
			if ((<IKeybindingItemEntry>element).keybindingItem.commandLabel && (<IKeybindingItemEntry>element).commandIdMatches) {
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

	constructor(private keybindingsEditor: IKeybindingsEditor) { }

	renderTemplate(container: HTMLElement): KeybindingItemTemplate {
		DOM.addClass(container, 'keybinding-item');
		return {
			parent: container,
			actions: new ActionsColumn(container, this.keybindingsEditor),
			command: new CommandColumn(container, this.keybindingsEditor),
			keybinding: new KeybindingColumn(container, this.keybindingsEditor),
			source: new SourceColumn(container, this.keybindingsEditor),
			when: new WhenColumn(container, this.keybindingsEditor)
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

class Column {
	constructor(protected parent: HTMLElement, protected keybindingsEditor: IKeybindingsEditor) {
		this.create(parent);
	}
	create(parent: HTMLElement) { }
}

class ActionsColumn extends Column {

	private actionBar: ActionBar;

	create(parent: HTMLElement) {
		const actionsContainer = DOM.append(parent, $('.column.actions'));
		this.actionBar = new ActionBar(actionsContainer, { animated: false });
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
		return <IAction>{
			class: 'edit',
			enabled: true,
			id: 'editKeybinding',
			tooltip: localize('change', "Change Keybinding"),
			run: () => this.keybindingsEditor.defineKeybinding(keybindingItemEntry)
		};
	}

	private createAddAction(keybindingItemEntry: IKeybindingItemEntry): IAction {
		return <IAction>{
			class: 'add',
			enabled: true,
			id: 'addKeybinding',
			tooltip: localize('add', "Add Keybinding"),
			run: () => this.keybindingsEditor.defineKeybinding(keybindingItemEntry)
		};
	}
}

class CommandColumn extends Column {

	private commandColumn: HTMLElement;

	create(parent: HTMLElement) {
		this.commandColumn = DOM.append(parent, $('.column.command'));
	}

	render(keybindingItemEntry: IKeybindingItemEntry): void {
		DOM.clearNode(this.commandColumn);
		const keybindingItem = keybindingItemEntry.keybindingItem;
		DOM.toggleClass(this.commandColumn, 'command-id-label', !!keybindingItem.commandLabel && !!keybindingItemEntry.commandIdMatches);
		if (keybindingItem.commandLabel) {
			const commandLabel = new HighlightedLabel(this.commandColumn);
			commandLabel.set(keybindingItem.commandLabel, keybindingItemEntry.commandLabelMatches);
			commandLabel.element.title = keybindingItem.command;
		}
		if (keybindingItemEntry.commandIdMatches || !keybindingItem.commandLabel) {
			new HighlightedLabel(DOM.append(this.commandColumn, $('.code'))).set(keybindingItem.command, keybindingItemEntry.commandIdMatches);
		}
	}
}

class KeybindingColumn extends Column {

	private keybindingColumn: HTMLElement;

	create(parent: HTMLElement) {
		this.keybindingColumn = DOM.append(parent, $('.column.keybinding'));
	}

	render(keybindingItemEntry: IKeybindingItemEntry): void {
		DOM.clearNode(this.keybindingColumn);
		if (keybindingItemEntry.keybindingItem.keybinding) {
			let keybinding = DOM.append(this.keybindingColumn, $('.htmlkb'));
			let htmlkb = keybindingItemEntry.keybindingItem.keybinding.getHTMLLabel();
			htmlkb.forEach(item => keybinding.appendChild(renderHtml(item)));
			keybinding.title = keybindingItemEntry.keybindingItem.keybinding.getAriaLabel();
		}
	}
}

class SourceColumn extends Column {

	private sourceColumn: HTMLElement;

	create(parent: HTMLElement) {
		this.sourceColumn = DOM.append(parent, $('.column.source'));
	}

	render(keybindingItemEntry: IKeybindingItemEntry): void {
		this.sourceColumn.textContent = keybindingItemEntry.keybindingItem.source === KeybindingSource.User ? localize('user', "User") : localize('default', "Default");
	}
}

class WhenColumn extends Column {

	private whenColumn: HTMLElement;

	create(parent: HTMLElement) {
		const column = DOM.append(parent, $('.column.when'));
		this.whenColumn = DOM.append(column, $('div'));
	}

	render(keybindingItemEntry: IKeybindingItemEntry): void {
		DOM.toggleClass(this.whenColumn, 'code', !!keybindingItemEntry.keybindingItem.when);
		DOM.toggleClass(this.whenColumn, 'empty', !keybindingItemEntry.keybindingItem.when);
		if (keybindingItemEntry.keybindingItem.when) {
			const when = keybindingItemEntry.keybindingItem.when.serialize();
			this.whenColumn.textContent = when;
			this.whenColumn.title = when;
		} else {
			this.whenColumn.textContent = '—';
		}
	}
}