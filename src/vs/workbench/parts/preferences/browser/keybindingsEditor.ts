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
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorInput } from 'vs/workbench/common/editor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { KeybindingsEditorModel, IKeybindingItemEntry, IKeybindingItem, IListEntry, KEYBINDING_ENTRY_TEMPLATE_ID, KEYBINDING_HEADER_TEMPLATE_ID } from 'vs/workbench/parts/preferences/common/keybindingsEditorModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService, IKeybindingItem2, KeybindingSource } from 'vs/platform/keybinding/common/keybinding';
import { SearchWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { DefineKeybindingWidget } from 'vs/workbench/parts/preferences/browser/keybindingWidgets';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { renderHtml } from 'vs/base/browser/htmlContentRenderer';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IKeybindingEditingService } from 'vs/workbench/services/keybinding/common/keybindingEditing';
import { IListService } from 'vs/platform/list/browser/listService';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IDelegate, IRenderer, IListContextMenuEvent, IListEvent } from 'vs/base/browser/ui/list/list';
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
	private searchWidget: SearchWidget;
	private defineKeybindingWidget: DefineKeybindingWidget;
	private overlayContainer: HTMLElement;
	private headerContainer: HTMLElement;
	private dimension: Dimension;

	private delayedFiltering: Delayer<void>;
	private keybindingsListContainer: HTMLElement;
	private keybindingsList: List<IListEntry>;

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
		this.searchWidget.clear();
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
			placeholder: localize('SearchKeybindings.Placeholder', "Search keybindings")
		}));
		this._register(this.searchWidget.onDidChange(searchValue => this.delayedFiltering.trigger(() => this.render())));
		this._register(this.searchWidget.onDidChange(searchValue => this.delayedFiltering.trigger(() => this.render())));

		const openKeybindingsContainer = DOM.append(this.headerContainer, $('.open-keybindings-container'));
		DOM.append(openKeybindingsContainer, $('span', null, localize('header-message', "For advanced customizations open and edit ")));
		const fileElement = DOM.append(openKeybindingsContainer, $('span.file-name', null, localize('keybindings-file-name', "keybindings.json")));
		this._register(DOM.addDisposableListener(fileElement, DOM.EventType.CLICK, () => this.editorService.openEditor({ resource: URI.file(this.environmentService.appKeybindingsPath), options: { pinned: true } })));
	}

	private createBody(parent: HTMLElement): void {
		const bodyContainer = DOM.append(parent, $('.keybindings-body'));
		this.createList(bodyContainer);
	}

	private createList(parent: HTMLElement): void {
		const delegate = new Delegate();
		this.keybindingsListContainer = DOM.append(parent, $('.keybindings-list-container'));
		this.keybindingsList = this._register(new List<IListEntry>(this.keybindingsListContainer, delegate, [new KeybindingHeaderRenderer(), new KeybindingItemRenderer(this)], { identityProvider: e => e.id }));
		this._register(this.keybindingsList.onContextMenu(e => this.onContextMenu(e)));
		this._register(this.keybindingsList.onFocusChange(e => this.onFocusChange(e)));
		this._register(this.keybindingsList.onDOMFocus(() => this.keybindingsList.focusNext()));
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

	private onContextMenu(e: IListContextMenuEvent<IListEntry>): void {
		if (e.element.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
			this.contextMenuService.showContextMenu({
				getAnchor: () => e.anchor,
				getActions: () => TPromise.as([this.createRemoveAction((<IKeybindingItemEntry>e.element).keybindingItem)])
			});
		}
	}

	private onFocusChange(e: IListEvent<IListEntry>): void {
		if (e.elements[0] && e.elements[0].templateId === KEYBINDING_HEADER_TEMPLATE_ID) {
			this.keybindingsList.focusNext();
		}
	}

	private createRemoveAction(keybinding: IKeybindingItem): IAction {
		return <IAction>{
			label: localize('removeLabel', "Remove Keybinding"),
			enabled: !!keybinding.keybinding,
			id: 'removeKeybinding',
			run: () => this.keybindingEditingService.removeKeybinding(keybinding)
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
			new HighlightedLabel(this.keybindingColumn).set(keybindingItemEntry.keybindingItem.keybinding.getAriaLabel(), keybindingItemEntry.keybindingMatches);
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