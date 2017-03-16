/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/keybindingsEditor';
import { localize } from 'vs/nls';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Delayer } from 'vs/base/common/async';
import * as DOM from 'vs/base/browser/dom';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { IAction } from 'vs/base/common/actions';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorInput } from 'vs/workbench/common/editor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { KeybindingsEditorModel, IKeybindingItemEntry, IKeybindingItem } from 'vs/workbench/parts/preferences/common/keybindingsEditorModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService, IKeybindingItem2, KeybindingSource } from 'vs/platform/keybinding/common/keybinding';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { SearchWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { DefineKeybindingWidget } from 'vs/workbench/parts/preferences/browser/keybindingWidgets';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { renderHtml } from 'vs/base/browser/htmlContentRenderer';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IKeybindingEditingService } from 'vs/workbench/services/keybinding/common/keybindingEditing';
import { IListService } from 'vs/platform/list/browser/listService';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import { IThemeService } from 'vs/platform/theme/common/themeService';

let $ = DOM.$;

export interface IKeybindingsEditor {

	defineKeybinding(keybindingItem: IKeybindingItem);

}

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

	public static ID: string = 'workbench.editor.keybindings';
	private keybindingsContentElement: HTMLElement;
	private scrollableElement: DomScrollableElement;
	private searchWidget: SearchWidget;
	private defineKeybindingWidget: DefineKeybindingWidget;
	private overlayContainer: HTMLElement;
	private dimension: Dimension;

	private activeKeybindingData: IKeybindingItemEntry;
	private activeKeybindingRow: HTMLElement;

	private delayedFiltering: Delayer<void>;
	private keybindingsList: List<IKeybindingItemEntry>;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IKeybindingService private keybindingsService: IKeybindingService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IKeybindingEditingService private keybindingEditingService: IKeybindingEditingService,
		@IListService private listService: IListService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(KeybindingsEditor.ID, telemetryService, themeService);
		this.delayedFiltering = new Delayer<void>(300);
		this._register(keybindingsService.onDidUpdateKeybindings(() => this.render()));
	}

	createEditor(parent: Builder): void {
		const parentElement = parent.getHTMLElement();

		const keybindingsEditorElement = DOM.append(parentElement, $('div', { class: 'keybindings-editor' }));

		this.createOverlayContainer(keybindingsEditorElement);
		this.createHeader(keybindingsEditorElement);
		this.createBody(keybindingsEditorElement);
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
		this.keybindingsContentElement.removeChild(this.keybindingsContentElement.children.item(0));
		this.searchWidget.clear();
	}

	layout(dimension: Dimension): void {
		this.dimension = dimension;
		this.searchWidget.layout(dimension);

		this.overlayContainer.style.width = dimension.width + 'px';
		this.overlayContainer.style.height = dimension.height + 'px';
		if (this.scrollableElement) {
			this.scrollableElement.scanDomNode();
		}
		this.defineKeybindingWidget.layout(this.dimension);
		if (this.keybindingsList) {
			this.keybindingsList.layout(dimension.height);
		}
	}

	focus(): void {
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
		const headerContainer = DOM.append(parent, $('.keybindings-header'));
		this.searchWidget = this._register(this.instantiationService.createInstance(SearchWidget, DOM.append(headerContainer, $('.search-container')), {
			ariaLabel: localize('SearchKeybindings.AriaLabel', "Search keybindings"),
			placeholder: localize('SearchKeybindings.Placeholder', "Search keybindings")
		}));
		this._register(this.searchWidget.onDidChange(searchValue => this.delayedFiltering.trigger(() => this.render())));
	}

	private createBody(parent: HTMLElement): void {
		const bodyContainer = DOM.append(parent, $('.keybindings-body'));

		const scrollContainer = $('.keybindings-scroll-container');
		this.scrollableElement = new DomScrollableElement(scrollContainer, { canUseTranslate3d: false });
		this.scrollableElement.scanDomNode();
		DOM.append(bodyContainer, this.scrollableElement.getDomNode());

		const openKeybindingsContainer = DOM.append(scrollContainer, $('.open-keybindings-container'));
		DOM.append(openKeybindingsContainer, $('span', null, localize('header-message', "For advanced customizations open and edit ")));
		const fileElement = DOM.append(openKeybindingsContainer, $('span.file-name', null, localize('keybindings-file-name', "keybindings.json")));
		this._register(DOM.addDisposableListener(fileElement, DOM.EventType.CLICK, () => this.editorService.openEditor({ resource: URI.file(this.environmentService.appKeybindingsPath), options: { pinned: true } })));

		this.keybindingsContentElement = DOM.append(scrollContainer, $('.content'));
	}

	/*private createBody(parent: HTMLElement): void {
		const bodyContainer = DOM.append(parent, $('.keybindings-body'));

		const openKeybindingsContainer = DOM.append(bodyContainer, $('.open-keybindings-container'));
		DOM.append(openKeybindingsContainer, $('span', null, localize('header-message', "For advanced customizations open and edit ")));
		const fileElement = DOM.append(openKeybindingsContainer, $('span.file-name', null, localize('keybindings-file-name', "keybindings.json")));
		this._register(DOM.addDisposableListener(fileElement, DOM.EventType.CLICK, () => this.editorService.openEditor({ resource: URI.file(this.environmentService.appKeybindingsPath), options: { pinned: true } })));

		this.createList(bodyContainer);
	}

	private createList(parent: HTMLElement): void {
		const delegate = new Delegate();
		this.createListHeader(parent);
		const keybindingListContainer = DOM.append(parent, $('.keybindings-list-container'));
		this.keybindingsList = this._register(new List<IKeybindingItemEntry>(keybindingListContainer, delegate, [new KeybindingItemRenderer(this)], { identityProvider: e => e.id }));
		this._register(this.listService.register(this.keybindingsList));
	}

	private createListHeader(parent: HTMLElement): void {
		DOM.append(parent, $('.keybindings-list-header', null,
			$('.header.actions'),
			$('.header.command', null, localize('command', "Command")),
			$('.header.keybinding', null, localize('keybinding', "Keybinding")),
			$('.header.source', null, localize('source', "Source")),
			$('.header.when', null, localize('when', "When"))));
	}*/

	private render(): TPromise<any> {
		if (this.input) {
			return this.input.resolve()
				.then((keybindingsModel: KeybindingsEditorModel) => keybindingsModel.resolve()
					.then(() => this.renderKeybindingsData(keybindingsModel.fetch(this.searchWidget.value()))));
		}
		return TPromise.as(null);
	}

	private renderKeybindingsData(keybindingsData: IKeybindingItemEntry[]): void {
		if (this.keybindingsList) {
			this.keybindingsList.splice(0, this.keybindingsList.length, keybindingsData);
		} else {
			if (this.keybindingsContentElement.children.item(0)) {
				this.keybindingsContentElement.removeChild(this.keybindingsContentElement.children.item(0));
			}
			DOM.append(this.keybindingsContentElement, $('div', null, this.renderKeybindingsGroup('', keybindingsData)));
			this.scrollableElement.scanDomNode();
		}
	}

	private renderKeybindingsGroup(groupName: string, keybindingsEntries: IKeybindingItemEntry[]): HTMLElement {
		if (keybindingsEntries.length === 0) {
			return null;
		}

		return $('table', null,
			$('tr', null,
				$('th.actions'),
				$('th.command', null, localize('command', "Command")),
				$('th.keybinding', null, localize('keybinding', "Keybinding")),
				$('th.source', null, localize('source', "Source")),
				$('th.when', null, localize('when', "When")),
			),
			...keybindingsEntries.map(keybindingData => this.renderKeybindingEntry(keybindingData)));
	}

	private renderKeybindingEntry(keybindingData: IKeybindingItemEntry): HTMLElement {
		const keybindingEntryRow = $('tr', { 'tabindex': '0' });

		const actionsColumn = DOM.append(keybindingEntryRow, this.renderActionsColumn(keybindingData.keybindingItem));
		DOM.append(keybindingEntryRow, this.renderCommandColumn(keybindingData));
		DOM.append(keybindingEntryRow, this.renderKeybindingColumn(keybindingData));
		DOM.append(keybindingEntryRow, this.renderSourceColumn(keybindingData.keybindingItem));
		DOM.append(keybindingEntryRow, this.renderWhenColumn(keybindingData.keybindingItem));

		const focusTracker = this._register(DOM.trackFocus(keybindingEntryRow));
		this._register(focusTracker.addFocusListener(() => this.onKeybindingRowFocussed(keybindingEntryRow, keybindingData)));
		this._register(focusTracker.addBlurListener(() => this.onKeybindingRowBlurred(keybindingEntryRow)));

		this._register(DOM.addDisposableListener(keybindingEntryRow, DOM.EventType.KEY_DOWN, e => this.onkeydown(new StandardKeyboardEvent(e), keybindingEntryRow)));
		this._register(DOM.addDisposableListener(keybindingEntryRow, DOM.EventType.MOUSE_MOVE, e => this.activeKeybindingRow ? DOM.removeClass(this.activeKeybindingRow, 'focussed') : null));
		this._register(DOM.addDisposableListener(keybindingEntryRow, DOM.EventType.CONTEXT_MENU, (e) => this.renderContextMenu(e, actionsColumn, keybindingData.keybindingItem)));

		return keybindingEntryRow;
	}

	private onKeybindingRowFocussed(keybindingRow: HTMLElement, keybindingData: IKeybindingItemEntry): void {
		DOM.addClass(keybindingRow, 'focussed');
		this.activeKeybindingRow = keybindingRow;
		this.activeKeybindingData = keybindingData;
	}

	private onKeybindingRowBlurred(keybindingRow: HTMLElement): void {
		if (keybindingRow === this.activeKeybindingRow) {
			this.activeKeybindingData = null;
			this.activeKeybindingRow = null;
		}
		DOM.removeClass(keybindingRow, 'focussed');
	}

	private onkeydown(keyboardEvent: StandardKeyboardEvent, rowElement: HTMLElement): void {
		let handled = false;
		switch (keyboardEvent.keyCode) {
			case KeyCode.DownArrow:
				handled = this.focusKeybindingRowSibling(rowElement, true);
				break;
			case KeyCode.UpArrow:
				handled = this.focusKeybindingRowSibling(rowElement, false);
				break;
			case KeyCode.Tab:
				if (keyboardEvent.shiftKey) {
					handled = this.focusKeybindingRowSibling(rowElement, false);
				} else {
					handled = this.focusKeybindingRowSibling(rowElement, true);
				}
				break;
		}
		if (handled) {
			keyboardEvent.preventDefault();
			keyboardEvent.stopPropagation();
		}
	}

	private focusKeybindingRowSibling(element: HTMLElement, next: boolean): boolean {
		const elementToFocus = <HTMLElement>(next ? element.nextSibling : element.previousSibling);
		if (elementToFocus && element.parentNode.firstChild !== elementToFocus) {
			elementToFocus.focus();
			return true;
		}
		return false;
	}

	private renderContextMenu(e: any, element: HTMLElement, keybindingItem: IKeybindingItem): void {
		let anchor: HTMLElement | { x: number, y: number } = element;
		if (event instanceof MouseEvent) {
			const event = new StandardMouseEvent(e);
			anchor = { x: event.posx, y: event.posy };
		}
		const actions = [this.createRemoveAction(keybindingItem)];
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => TPromise.wrap(actions)
		});
	}

	private renderActionsColumn(keybindingEntry: IKeybindingItem): HTMLElement {
		const actionsContainer = $('td.actions');
		const actionbar = new ActionBar(actionsContainer, { animated: false });
		const actions = [];
		if (keybindingEntry.keybinding) {
			actions.push(this.createEditAction(keybindingEntry));
		} else {
			actions.push(this.createAddAction(keybindingEntry));
		}
		actionbar.push(actions, { icon: true });
		return actionsContainer;
	}

	private renderCommandColumn(keybindingData: IKeybindingItemEntry): HTMLElement {
		const commandColumn = $('td.command', null);
		const keybindingItem = keybindingData.keybindingItem;
		if (keybindingItem.commandLabel) {
			new HighlightedLabel(commandColumn).set(keybindingItem.commandLabel, keybindingData.commandLabelMatches);
		}
		new HighlightedLabel(DOM.append(commandColumn, $('.code.strong'))).set(keybindingItem.command, keybindingData.commandIdMatches);
		return commandColumn;
	}

	private renderKeybindingColumn(keybindingData: IKeybindingItemEntry): HTMLElement {
		const keybindingColumn = $('td.keybinding');
		if (keybindingData.keybindingItem.keybinding) {
			const htmlkbELement = DOM.append(keybindingColumn, $('.htmlkb'));
			let htmlkb = keybindingData.keybindingItem.keybinding.getHTMLLabel();
			htmlkb.forEach(item => htmlkbELement.appendChild(renderHtml(item)));
			new HighlightedLabel(DOM.append(keybindingColumn, $('.code'))).set(keybindingData.keybindingItem.keybinding.getAriaLabel(), keybindingData.keybindingMatches);
		} else {
			DOM.append(keybindingColumn, $('.empty', null, '—'));
		}
		return keybindingColumn;
	}

	private renderSourceColumn(keybindingItem: IKeybindingItem): HTMLElement {
		return $('td.source', null, keybindingItem.source === KeybindingSource.User ? localize('user', "User") : localize('default', "Default"));
	}

	private renderWhenColumn(keybindingItem: IKeybindingItem): HTMLElement {
		return $('td.when', null, keybindingItem.when ? $('.code', null, keybindingItem.when.serialize()) : $('.empty', null, '—'));
	}

	private createEditAction(keybinding: IKeybindingItem): IAction {
		return <IAction>{
			class: 'edit',
			enabled: true,
			id: 'editKeybinding',
			tooltip: localize('change', "Change Keybinding"),
			run: () => this.defineKeybinding(keybinding)
		};
	}

	private createRemoveAction(keybinding: IKeybindingItem): IAction {
		return <IAction>{
			label: localize('removeLabel', "Remove Keybinding"),
			enabled: !!keybinding.keybinding,
			id: 'removeKeybinding',
			run: () => this.keybindingEditingService.removeKeybinding(keybinding)
		};
	}

	private createAddAction(keybinding: IKeybindingItem): IAction {
		return <IAction>{
			class: 'add',
			enabled: true,
			id: 'addKeybinding',
			tooltip: localize('add', "Add Keybinding"),
			run: () => this.defineKeybinding(keybinding)
		};
	}

	defineKeybinding(keybindingItem: IKeybindingItem2): void {
		this.overlayContainer.style.display = 'block';
		this.defineKeybindingWidget.define().then(key => {
			this.overlayContainer.style.display = 'none';
			if (key) {
				this.keybindingEditingService.editKeybinding(key, keybindingItem);
			}
		}, () => {
			this.overlayContainer.style.display = 'none';
			this.focus();
		});
	}
}

class Delegate implements IDelegate<IKeybindingItemEntry> {

	getHeight() { return 24; }

	getTemplateId(element: IKeybindingItemEntry) {
		return KeybindingItemRenderer.TEMPLATE_ID;
	}
}

interface KeybindingItemTemplate {
	actions: ActionsColumn;
	command: CommandColumn;
	keybinding: KeybindingColumn;
	source: SourceColumn;
	when: WhenColumn;
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
			actions.push(this.createEditAction(keybindingItemEntry.keybindingItem));
		} else {
			actions.push(this.createAddAction(keybindingItemEntry.keybindingItem));
		}
		this.actionBar.push(actions, { icon: true });
	}

	private createEditAction(keybinding: IKeybindingItem): IAction {
		return <IAction>{
			class: 'edit',
			enabled: true,
			id: 'editKeybinding',
			tooltip: localize('change', "Change Keybinding"),
			run: () => this.keybindingsEditor.defineKeybinding(keybinding)
		};
	}

	private createAddAction(keybinding: IKeybindingItem): IAction {
		return <IAction>{
			class: 'add',
			enabled: true,
			id: 'addKeybinding',
			tooltip: localize('add', "Add Keybinding"),
			run: () => this.keybindingsEditor.defineKeybinding(keybinding)
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
		if (keybindingItem.commandLabel) {
			new HighlightedLabel(this.commandColumn).set(keybindingItem.commandLabel, keybindingItemEntry.commandLabelMatches);
		}
		new HighlightedLabel(DOM.append(this.commandColumn, $('.code.strong'))).set(keybindingItem.command, keybindingItemEntry.commandIdMatches);
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
			new HighlightedLabel(DOM.append(this.keybindingColumn, $('.code'))).set(keybindingItemEntry.keybindingItem.keybinding.getAriaLabel(), keybindingItemEntry.keybindingMatches);
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
		this.whenColumn.textContent = keybindingItemEntry.keybindingItem.when ? keybindingItemEntry.keybindingItem.when.serialize() : '—';
	}
}

class KeybindingItemRenderer implements IRenderer<IKeybindingItemEntry, KeybindingItemTemplate> {

	static TEMPLATE_ID = 'keybinding_item_template';
	get templateId(): string { return KeybindingItemRenderer.TEMPLATE_ID; }

	constructor(private keybindingsEditor: IKeybindingsEditor) { }

	renderTemplate(container: HTMLElement): KeybindingItemTemplate {
		return {
			actions: new ActionsColumn(container, this.keybindingsEditor),
			command: new CommandColumn(container, this.keybindingsEditor),
			keybinding: new KeybindingColumn(container, this.keybindingsEditor),
			source: new SourceColumn(container, this.keybindingsEditor),
			when: new WhenColumn(container, this.keybindingsEditor)
		};
	}

	renderElement(keybindingEntry: IKeybindingItemEntry, index: number, template: KeybindingItemTemplate): void {

		template.actions.render(keybindingEntry);
		template.command.render(keybindingEntry);
		template.keybinding.render(keybindingEntry);
		template.source.render(keybindingEntry);
		template.when.render(keybindingEntry);
	}

	disposeTemplate(template: KeybindingItemTemplate): void {
	}
}