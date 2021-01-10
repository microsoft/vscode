/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/notificationsEditor';
import { localize } from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
import { dispose, Disposable, IDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { Checkbox, ICheckboxOpts } from 'vs/base/browser/ui/checkbox/checkbox';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { KEYBINDING_ENTRY_TEMPLATE_ID } from 'vs/workbench/services/preferences/browser/keybindingsEditorModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CONTEXT_KEYBINDINGS_EDITOR } from 'vs/workbench/contrib/preferences/common/preferences';
import { IListVirtualDelegate, IListRenderer, IListContextMenuEvent } from 'vs/base/browser/ui/list/list';
import { IThemeService, registerThemingParticipant, IColorTheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { listHighlightForeground, listActiveSelectionForeground, listInactiveSelectionForeground, listHoverForeground, listFocusForeground, editorBackground, foreground, listActiveSelectionBackground, listInactiveSelectionBackground, listFocusBackground, listHoverBackground } from 'vs/platform/theme/common/colorRegistry';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Emitter, Event } from 'vs/base/common/event';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { Color, RGBA } from 'vs/base/common/color';
import { WORKBENCH_BACKGROUND } from 'vs/workbench/common/theme';
import { INotificationItemEntry, INotificationsEditorPane, IListEntry, IKeybindingItemEntry } from 'vs/workbench/services/preferences/common/preferences';

const $ = DOM.$;

interface ColumnItem {
	column: HTMLElement;
	proportion?: number;
	width: number;
}

const oddRowBackgroundColor = new Color(new RGBA(130, 130, 130, 0.04));

export class NotificationsEditor extends EditorPane implements INotificationsEditorPane {

	static readonly ID: string = 'workbench.editor.notifications';

	private _onLayout: Emitter<void> = this._register(new Emitter<void>());
	readonly onLayout: Event<void> = this._onLayout.event;

	private headerContainer!: HTMLElement;

	private overlayContainer!: HTMLElement;

	private columnItems: ColumnItem[] = [];
	private notificationsListContainer!: HTMLElement;

	private listEntries: IListEntry[] = [];
	private notificationsList!: WorkbenchList<IListEntry>;

	private dimension: DOM.Dimension | null = null;

	private notificationsEditorContextKey: IContextKey<boolean>;

	private ariaLabelElement!: HTMLElement;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		// @INotificationService private readonly notificationService: INotificationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		// @IEditorService private readonly editorService: IEditorService,
		@IStorageService storageService: IStorageService
	) {
		super(NotificationsEditor.ID, telemetryService, themeService, storageService);
		this.notificationsEditorContextKey = CONTEXT_KEYBINDINGS_EDITOR.bindTo(this.contextKeyService);
	}
	onDefineWhenExpression!: Event<IKeybindingItemEntry>;
	search(filter: string): void {
		throw new Error('Method not implemented.');
	}
	focusSearch(): void {
		throw new Error('Method not implemented.');
	}
	clearSearchResults(): void {
		throw new Error('Method not implemented.');
	}
	showNotificationAgain(notificationEntry: INotificationItemEntry): void {
		throw new Error('Method not implemented.');
	}

	createEditor(parent: HTMLElement): void {
		const notificationsEditorElement = DOM.append(parent, $('div', { class: 'notifications-editor' }));

		this.createAriaLabelElement(notificationsEditorElement);
		this.createOverlayContainer(notificationsEditorElement);
		this.createHeader(notificationsEditorElement);
		this.createBody(notificationsEditorElement);
	}

	clearInput(): void {
		super.clearInput();
		this.notificationsEditorContextKey.reset();
	}

	layout(dimension: DOM.Dimension): void {
		this.dimension = dimension;

		this.overlayContainer.style.width = dimension.width + 'px';
		this.overlayContainer.style.height = dimension.height + 'px';

		this.columnItems.forEach(columnItem => {
			if (columnItem.proportion) {
				columnItem.width = 0;
			}
		});
		this.layoutNotificationsList();
		this._onLayout.fire();
	}

	layoutColumns(columns: HTMLElement[]): void {
		if (this.columnItems) {
			columns.forEach((column, index) => {
				column.style.paddingRight = `6px`;
				column.style.width = `${this.columnItems[index].width}px`;
			});
		}
	}

	focus(): void {
		const activeNotificationEntry = this.activeNotificationEntry;
		if (activeNotificationEntry) {
			this.selectEntry(activeNotificationEntry);
		} else {
			//this.searchWidget.focus();
		}
	}

	get activeNotificationEntry(): INotificationItemEntry | null {
		const focusedElement = this.notificationsList.getFocusedElements()[0];
		return focusedElement && focusedElement.templateId === KEYBINDING_ENTRY_TEMPLATE_ID ? <INotificationItemEntry>focusedElement : null;
	}

	private createAriaLabelElement(parent: HTMLElement): void {
		this.ariaLabelElement = DOM.append(parent, DOM.$(''));
		this.ariaLabelElement.setAttribute('id', 'notifications-editor-aria-label-element');
		this.ariaLabelElement.setAttribute('aria-live', 'assertive');
	}

	private createOverlayContainer(parent: HTMLElement): void {
		this.overlayContainer = DOM.append(parent, $('.overlay-container'));
		this.overlayContainer.style.position = 'absolute';
		this.overlayContainer.style.zIndex = '10';
		this.hideOverlayContainer();
	}


	private hideOverlayContainer() {
		this.overlayContainer.style.display = 'none';
	}

	private createHeader(parent: HTMLElement): void {
		this.headerContainer = DOM.append(parent, $('.notifications-header'));
	}

	private createBody(parent: HTMLElement): void {
		const bodyContainer = DOM.append(parent, $('.notifications-body'));
		this.createListHeader(bodyContainer);
		this.createList(bodyContainer);
	}

	private createListHeader(parent: HTMLElement): void {
		const notificationsListHeader = DOM.append(parent, $('.notifications-list-header'));
		notificationsListHeader.style.height = '30px';
		notificationsListHeader.style.lineHeight = '30px';

		this.columnItems = [];
		let column = $('.header.actions');
		this.columnItems.push({ column, width: 30 });

		column = $('.header.command', undefined, localize('command', "Command"));
		this.columnItems.push({ column, proportion: 0.3, width: 0 });

		column = $('.header.keybinding', undefined, localize('keybinding', "Notification"));
		this.columnItems.push({ column, proportion: 0.2, width: 0 });

		column = $('.header.when', undefined, localize('when', "When"));
		this.columnItems.push({ column, proportion: 0.4, width: 0 });

		column = $('.header.source', undefined, localize('source', "Source"));
		this.columnItems.push({ column, proportion: 0.1, width: 0 });

		DOM.append(notificationsListHeader, ...this.columnItems.map(({ column }) => column));
	}

	private createList(parent: HTMLElement): void {
		this.notificationsListContainer = DOM.append(parent, $('.notifications-list-container'));
		this.notificationsList = this._register(this.instantiationService.createInstance(WorkbenchList, 'NotificationsEditor', this.notificationsListContainer, new Delegate(), [new NotificationItemRenderer(this, this.instantiationService)], {
			identityProvider: { getId: (e: IListEntry) => e.id },
			setRowLineHeight: false,
			horizontalScrolling: false,
			accessibilityProvider: new AccessibilityProvider(),
			keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e: INotificationItemEntry) => e.notificationItem.notificationLabel },
			overrideStyles: {
				listBackground: editorBackground
			}
		})) as WorkbenchList<IListEntry>;

		this._register(this.notificationsList.onContextMenu(e => this.onContextMenu(e)));
		this._register(this.notificationsList.onDidFocus(() => {
			this.notificationsList.getHTMLElement().classList.add('focused');
		}));
	}

	private layoutNotificationsList(): void {
		if (!this.dimension) {
			return;
		}
		let width = this.dimension.width - 27;
		for (const columnItem of this.columnItems) {
			if (columnItem.width && !columnItem.proportion) {
				width = width - columnItem.width;
			}
		}
		for (const columnItem of this.columnItems) {
			if (columnItem.proportion && !columnItem.width) {
				columnItem.width = width * columnItem.proportion;
			}
		}

		this.layoutColumns(this.columnItems.map(({ column }) => column));
		const listHeight = this.dimension.height - (DOM.getDomNodePagePosition(this.headerContainer).height + 12 /*padding*/ + 30 /*list header*/);
		this.notificationsListContainer.style.height = `${listHeight}px`;
		this.notificationsList.layout(listHeight);
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

	private selectEntry(entry: INotificationItemEntry | number, focus: boolean = true): void {
		const index = typeof entry === 'number' ? entry : this.getIndexOf(entry);
		if (index !== -1) {
			if (focus) {
				this.notificationsList.getHTMLElement().focus();
				this.notificationsList.setFocus([index]);
			}
			this.notificationsList.setSelection([index]);
		}
	}

	focusNotifications(): void {
		this.notificationsList.getHTMLElement().focus();
		const currentFocusIndices = this.notificationsList.getFocus();
		this.notificationsList.setFocus([currentFocusIndices.length ? currentFocusIndices[0] : 0]);
	}

	selectNotification(entry: INotificationItemEntry): void {
		this.selectEntry(entry);
	}


	private onContextMenu(e: IListContextMenuEvent<IListEntry>): void {
		if (!e.element) {
			return;
		}

		if (e.element.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
			const entry = <INotificationItemEntry>e.element;
			this.selectEntry(entry);
		}
	}
}

class Delegate implements IListVirtualDelegate<IListEntry> {

	getHeight(element: IListEntry) {
		return 24;
	}

	getTemplateId(element: IListEntry) {
		return element.templateId;
	}
}

interface NotificationItemTemplate {
	parent: HTMLElement;
	columns: Column[];
	disposable: IDisposable;
}

class NotificationItemRenderer implements IListRenderer<INotificationItemEntry, NotificationItemTemplate> {

	get templateId(): string { return KEYBINDING_ENTRY_TEMPLATE_ID; }

	constructor(
		private notificationsEditor: NotificationsEditor,
		private instantiationService: IInstantiationService
	) { }


	renderTemplate(parent: HTMLElement): NotificationItemTemplate {
		parent.classList.add('keybinding-item');

		const neverShowAgain: ActionsColumn = this.instantiationService.createInstance(ActionsColumn, parent, this.notificationsEditor);
		const label: LabelColumn = this.instantiationService.createInstance(LabelColumn, parent, this.notificationsEditor);
		const description: NotificationColumn = this.instantiationService.createInstance(NotificationColumn, parent, this.notificationsEditor);

		const columns: Column[] = [neverShowAgain, label, description];
		const disposables = combinedDisposable(...columns);
		const elements = columns.map(({ element }) => element);

		this.notificationsEditor.layoutColumns(elements);
		this.notificationsEditor.onLayout(() => this.notificationsEditor.layoutColumns(elements));

		return {
			parent,
			columns,
			disposable: disposables
		};
	}


	renderElement(notificationEntry: INotificationItemEntry, index: number, template: NotificationItemTemplate): void {
		template.parent.classList.toggle('odd', index % 2 === 1);
		for (const column of template.columns) {
			column.render(notificationEntry);
		}
	}

	disposeTemplate(template: NotificationItemTemplate): void {
		template.disposable.dispose();
	}
}

abstract class Column extends Disposable {
	static COUNTER = 0;

	abstract readonly element: HTMLElement;
	abstract render(entry: INotificationItemEntry): void;

	constructor(protected notificationsEditor: INotificationsEditorPane) {
		super();
	}
}

class ActionsColumn extends Column {
	render(entry: INotificationItemEntry): void {
		throw new Error('Method not implemented.');
	}

	private readonly checkbox: Checkbox;
	readonly element: HTMLElement;

	constructor(
		parent: HTMLElement,
		notificationsEditor: INotificationsEditorPane,
		//@INotificationService private notificationsService: INotificationService
	) {
		super(notificationsEditor);
		this.element = DOM.append(parent, $('.column.actions', { id: 'actions_' + ++Column.COUNTER }));
		const opts: ICheckboxOpts = { title: 'Never Show Again', isChecked: true };
		this.checkbox = new Checkbox(opts);
		// this.checkbox.onChange(e => notificationsService.update(parent.))
	}

	dispose(): void {
		super.dispose();
		dispose(this.checkbox);
	}
}

class LabelColumn extends Column {

	private readonly column: HTMLElement;
	readonly element: HTMLElement;

	constructor(
		parent: HTMLElement,
		notificationsEditor: INotificationsEditorPane,
	) {
		super(notificationsEditor);
		this.element = this.column = DOM.append(parent, $('.column.command', { id: 'command_' + ++Column.COUNTER }));
	}

	render(entry: INotificationItemEntry): void {
		DOM.clearNode(this.column);
		this.column.classList.toggle('vertical-align-column');
		DOM.append(this.column);
	}
}

class NotificationColumn extends Column {

	private readonly notificationLabel: HTMLElement;
	readonly element: HTMLElement;

	constructor(
		parent: HTMLElement,
		notificationsEditor: INotificationsEditorPane,
	) {
		super(notificationsEditor);

		this.element = DOM.append(parent, $('.column.notification', { id: 'notification_' + ++Column.COUNTER }));
		this.notificationLabel = DOM.append(this.element, $('div.notification-label'));
	}

	render(entry: INotificationItemEntry): void {
		DOM.clearNode(this.notificationLabel);
		this.notificationLabel.prepend(entry.notificationItem.notificationLabel);
		DOM.append(this.notificationLabel);
	}
}


class AccessibilityProvider implements IListAccessibilityProvider<INotificationItemEntry> {

	getWidgetAriaLabel(): string {
		return localize('notificationsLabel', "Notifications");
	}

	getAriaLabel(entry: INotificationItemEntry): string {
		let ariaLabel = entry.notificationItem.neverShowAgain
			+ ', ' + entry.notificationItem.notificationLabel
			+ ', ' + entry.notificationItem.notificationDescription;
		return ariaLabel;
	}
}

registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
	collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-header { background-color: ${oddRowBackgroundColor}; }`);
	collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list-row.odd:not(.focused):not(.selected):not(:hover) { background-color: ${oddRowBackgroundColor}; }`);
	collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list:not(:focus) .monaco-list-row.focused.odd:not(.selected):not(:hover) { background-color: ${oddRowBackgroundColor}; }`);
	collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list:not(.focused) .monaco-list-row.focused.odd:not(.selected):not(:hover) { background-color: ${oddRowBackgroundColor}; }`);

	const foregroundColor = theme.getColor(foreground);
	if (foregroundColor) {
		const whenForegroundColor = foregroundColor.transparent(.8).makeOpaque(WORKBENCH_BACKGROUND(theme));
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list-row > .column > .code { color: ${whenForegroundColor}; }`);
		const whenForegroundColorForOddRow = foregroundColor.transparent(.8).makeOpaque(oddRowBackgroundColor);
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list-row.odd > .column > .code { color: ${whenForegroundColorForOddRow}; }`);
	}

	const listActiveSelectionForegroundColor = theme.getColor(listActiveSelectionForeground);
	const listActiveSelectionBackgroundColor = theme.getColor(listActiveSelectionBackground);
	if (listActiveSelectionForegroundColor && listActiveSelectionBackgroundColor) {
		const whenForegroundColor = listActiveSelectionForegroundColor.transparent(.8).makeOpaque(listActiveSelectionBackgroundColor);
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list:focus .monaco-list-row.selected > .column > .code { color: ${whenForegroundColor}; }`);
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list:focus .monaco-list-row.odd.selected > .column > .code { color: ${whenForegroundColor}; }`);
	}

	const listInactiveSelectionForegroundColor = theme.getColor(listInactiveSelectionForeground);
	const listInactiveSelectionBackgroundColor = theme.getColor(listInactiveSelectionBackground);
	if (listInactiveSelectionForegroundColor && listInactiveSelectionBackgroundColor) {
		const whenForegroundColor = listInactiveSelectionForegroundColor.transparent(.8).makeOpaque(listInactiveSelectionBackgroundColor);
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list .monaco-list-row.selected > .column > .code { color: ${whenForegroundColor}; }`);
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list .monaco-list-row.odd.selected > .column > .code { color: ${whenForegroundColor}; }`);
	}

	const listFocusForegroundColor = theme.getColor(listFocusForeground);
	const listFocusBackgroundColor = theme.getColor(listFocusBackground);
	if (listFocusForegroundColor && listFocusBackgroundColor) {
		const whenForegroundColor = listFocusForegroundColor.transparent(.8).makeOpaque(listFocusBackgroundColor);
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list:focus .monaco-list-row.focused > .column > .code { color: ${whenForegroundColor}; }`);
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list:focus .monaco-list-row.odd.focused > .column > .code { color: ${whenForegroundColor}; }`);
	}

	const listHoverForegroundColor = theme.getColor(listHoverForeground);
	const listHoverBackgroundColor = theme.getColor(listHoverBackground);
	if (listHoverForegroundColor && listHoverBackgroundColor) {
		const whenForegroundColor = listHoverForegroundColor.transparent(.8).makeOpaque(listHoverBackgroundColor);
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list:focus .monaco-list-row:hover:not(.focused):not(.selected) > .column > .code { color: ${whenForegroundColor}; }`);
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list:focus .monaco-list-row.odd:hover:not(.focused):not(.selected) > .column > .code { color: ${whenForegroundColor}; }`);
	}

	const listHighlightForegroundColor = theme.getColor(listHighlightForeground);
	if (listHighlightForegroundColor) {
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list-row > .column .highlight { color: ${listHighlightForegroundColor}; }`);
	}

	if (listActiveSelectionForegroundColor) {
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list:focus .monaco-list-row.selected.focused > .column .monaco-keybinding-key { color: ${listActiveSelectionForegroundColor}; }`);
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list:focus .monaco-list-row.selected > .column .monaco-keybinding-key { color: ${listActiveSelectionForegroundColor}; }`);
	}
	const listInactiveFocusAndSelectionForegroundColor = theme.getColor(listInactiveSelectionForeground);
	if (listInactiveFocusAndSelectionForegroundColor) {
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list .monaco-list-row.selected > .column .monaco-keybinding-key { color: ${listInactiveFocusAndSelectionForegroundColor}; }`);
	}
	if (listHoverForegroundColor) {
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list .monaco-list-row:hover:not(.selected):not(.focused) > .column .monaco-keybinding-key { color: ${listHoverForegroundColor}; }`);
	}
	if (listFocusForegroundColor) {
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list .monaco-list-row.focused > .column .monaco-keybinding-key { color: ${listFocusForegroundColor}; }`);
	}
});
