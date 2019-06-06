/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/statusbarpart';
import * as nls from 'vs/nls';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { dispose, IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { OcticonLabel } from 'vs/base/browser/ui/octiconLabel/octiconLabel';
import { Registry } from 'vs/platform/registry/common/platform';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Part } from 'vs/workbench/browser/part';
import { IStatusbarRegistry, Extensions } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { IInstantiationService, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { StatusbarAlignment, IStatusbarService, IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarEntryCategory } from 'vs/platform/statusbar/common/statusbar';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { Action, IAction } from 'vs/base/common/actions';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector, ThemeColor } from 'vs/platform/theme/common/themeService';
import { STATUS_BAR_BACKGROUND, STATUS_BAR_FOREGROUND, STATUS_BAR_NO_FOLDER_BACKGROUND, STATUS_BAR_ITEM_HOVER_BACKGROUND, STATUS_BAR_ITEM_ACTIVE_BACKGROUND, STATUS_BAR_PROMINENT_ITEM_FOREGROUND, STATUS_BAR_PROMINENT_ITEM_BACKGROUND, STATUS_BAR_PROMINENT_ITEM_HOVER_BACKGROUND, STATUS_BAR_BORDER, STATUS_BAR_NO_FOLDER_FOREGROUND, STATUS_BAR_NO_FOLDER_BORDER } from 'vs/workbench/common/theme';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { isThemeColor } from 'vs/editor/common/editorCommon';
import { Color } from 'vs/base/common/color';
import { addClass, EventHelper, createStyleSheet, addDisposableListener, addClasses, clearNode, removeClass, EventType, hide, show } from 'vs/base/browser/dom';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IStorageService, StorageScope, IWorkspaceStorageChangeEvent } from 'vs/platform/storage/common/storage';
import { Parts, IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { coalesce } from 'vs/base/common/arrays';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { ToggleStatusbarVisibilityAction } from 'vs/workbench/browser/actions/layoutActions';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { Event, Emitter } from 'vs/base/common/event';
import { values } from 'vs/base/common/map';

interface IPendingStatusbarEntry {
	entry: IStatusbarEntry;
	alignment: StatusbarAlignment;
	priority: number;
	accessor?: IStatusbarEntryAccessor;
}

interface IStatusbarViewModelItem {
	category: IStatusbarEntryCategory;
	alignment: StatusbarAlignment;
	priority: number;
}

class StatusbarViewModel extends Disposable {

	private static readonly HIDDEN_CATEGORIES_KEY = 'workbench.statusbar.hidden';

	private readonly _items: IStatusbarViewModelItem[] = [];
	get items(): IStatusbarViewModelItem[] { return this._items; }

	private readonly _onDidCategoryVisibilityChange: Emitter<IStatusbarEntryCategory> = this._register(new Emitter());
	get onDidCategoryVisibilityChange(): Event<IStatusbarEntryCategory> { return this._onDidCategoryVisibilityChange.event; }

	private hiddenCategories: Set<string>;

	constructor(private storageService: IStorageService) {
		super();

		this.restoreState();
		this.registerListeners();
	}

	private restoreState(): void {
		const hiddenCategoriesRaw = this.storageService.get(StatusbarViewModel.HIDDEN_CATEGORIES_KEY, StorageScope.GLOBAL);
		if (hiddenCategoriesRaw) {
			try {
				const hiddenCategoriesArray: string[] = JSON.parse(hiddenCategoriesRaw);
				this.hiddenCategories = new Set(hiddenCategoriesArray);
			} catch (error) {
				// ignore parsing errors
			}
		}

		if (!this.hiddenCategories) {
			this.hiddenCategories = new Set<string>();
		}
	}

	private registerListeners(): void {
		this._register(this.storageService.onDidChangeStorage(e => this.onDidStorageChange(e)));
	}

	private onDidStorageChange(event: IWorkspaceStorageChangeEvent): void {
		if (event.key === StatusbarViewModel.HIDDEN_CATEGORIES_KEY && event.scope === StorageScope.GLOBAL) {

			// Keep current hidden categories
			const currentHiddenCategories = this.hiddenCategories;

			// Load latest state of hidden categories
			this.restoreState();

			const changedCategories = new Set<string>();

			// Check for each category that is now visible
			currentHiddenCategories.forEach(category => {
				if (!this.hiddenCategories.has(category)) {
					changedCategories.add(category);
				}
			});

			// Check for each category that is now hidden
			this.hiddenCategories.forEach(category => {
				if (!currentHiddenCategories.has(category)) {
					changedCategories.add(category);
				}
			});

			// Notify listeners that visibility for categories that changed
			this._items.forEach(item => {
				if (changedCategories.has(item.category.id)) {
					this._onDidCategoryVisibilityChange.fire(item.category);

					changedCategories.delete(item.category.id);
				}
			});
		}
	}

	add(item: IStatusbarViewModelItem): void {
		this._items.push(item);
		this.sort();
	}

	remove(item: IStatusbarViewModelItem): void {
		const index = this._items.indexOf(item);
		if (index >= 0) {
			this._items.splice(index, 1);
		}
	}

	isHidden(category: IStatusbarEntryCategory): boolean {
		return this.hiddenCategories.has(category.id);
	}

	hide(category: IStatusbarEntryCategory): void {
		if (!this.hiddenCategories.has(category.id)) {
			this.hiddenCategories.add(category.id);

			this._onDidCategoryVisibilityChange.fire(category);

			this.saveState();
		}
	}

	show(category: IStatusbarEntryCategory): void {
		if (this.hiddenCategories.has(category.id)) {
			this.hiddenCategories.delete(category.id);

			this._onDidCategoryVisibilityChange.fire(category);

			this.saveState();
		}
	}

	private saveState(): void {
		if (this.hiddenCategories.size > 0) {
			this.storageService.store(StatusbarViewModel.HIDDEN_CATEGORIES_KEY, JSON.stringify(values(this.hiddenCategories)), StorageScope.GLOBAL);
		} else {
			this.storageService.remove(StatusbarViewModel.HIDDEN_CATEGORIES_KEY, StorageScope.GLOBAL);
		}
	}

	private sort(): void {
		this._items.sort((itemA, itemB) => {
			if (itemA.alignment === itemB.alignment) {
				return itemB.priority - itemA.priority;
			}

			if (itemA.alignment === StatusbarAlignment.LEFT) {
				return -1;
			}

			if (itemB.alignment === StatusbarAlignment.LEFT) {
				return 1;
			}

			return 0;
		});
	}
}

class ToggleStatusCategoryVisibilityAction extends Action {

	constructor(private category: IStatusbarEntryCategory, private model: StatusbarViewModel) {
		super(category.id, category.label, undefined, true);

		this.checked = !model.isHidden(category);
	}

	run(): Promise<any> {
		if (this.model.isHidden(this.category)) {
			this.model.show(this.category);
		} else {
			this.model.hide(this.category);
		}

		return Promise.resolve(true);
	}
}

class HideStatusCategoryAction extends Action {

	constructor(private category: IStatusbarEntryCategory, private model: StatusbarViewModel) {
		super(category.id, nls.localize('hide', "Hide"), undefined, true);
	}

	run(): Promise<any> {
		this.model.hide(this.category);

		return Promise.resolve(true);
	}
}

export class StatusbarPart extends Part implements IStatusbarService {

	_serviceBrand: ServiceIdentifier<IStatusbarService>;

	private static readonly PRIORITY_PROP = 'statusbar-item-priority';
	private static readonly ALIGNMENT_PROP = 'statusbar-item-alignment';
	private static readonly CATEGORY_PROP = 'statusbar-item-category';

	//#region IView

	readonly minimumWidth: number = 0;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	readonly minimumHeight: number = 22;
	readonly maximumHeight: number = 22;

	//#endregion

	private styleElement: HTMLStyleElement;

	private pendingEntries: IPendingStatusbarEntry[] = [];

	private readonly viewModel: StatusbarViewModel;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextMenuService private contextMenuService: IContextMenuService
	) {
		super(Parts.STATUSBAR_PART, { hasTitle: false }, themeService, storageService, layoutService);

		this.viewModel = this._register(new StatusbarViewModel(storageService));

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.contextService.onDidChangeWorkbenchState(() => this.updateStyles()));
		this._register(this.viewModel.onDidCategoryVisibilityChange(category => this.onDidCategoryVisibilityChange(category)));
	}

	private onDidCategoryVisibilityChange(category: IStatusbarEntryCategory): void {
		const isHidden = this.viewModel.isHidden(category);

		const items = this.getEntries(category);
		items.forEach(item => {
			if (isHidden) {
				hide(item);
			} else {
				show(item);
			}
		});
	}

	addEntry(entry: IStatusbarEntry, alignment: StatusbarAlignment, priority: number = 0): IStatusbarEntryAccessor {

		// As long as we have not been created into a container yet, record all entries
		// that are pending so that they can get created at a later point
		if (!this.element) {
			return this.doAddPendingEntry(entry, alignment, priority);
		}

		// Otherwise add to view
		return this.doAddEntry(entry, alignment, priority);
	}

	private doAddPendingEntry(entry: IStatusbarEntry, alignment: StatusbarAlignment, priority: number): IStatusbarEntryAccessor {
		const pendingEntry: IPendingStatusbarEntry = { entry, alignment, priority };
		this.pendingEntries.push(pendingEntry);

		const accessor: IStatusbarEntryAccessor = {
			update: (entry: IStatusbarEntry) => {
				if (pendingEntry.accessor) {
					pendingEntry.accessor.update(entry);
				} else {
					pendingEntry.entry = entry;
				}
			},

			dispose: () => {
				if (pendingEntry.accessor) {
					pendingEntry.accessor.dispose();
				} else {
					this.pendingEntries = this.pendingEntries.filter(entry => entry !== pendingEntry);
				}
			}
		};

		return accessor;
	}

	private doAddEntry(entry: IStatusbarEntry, alignment: StatusbarAlignment, priority: number): IStatusbarEntryAccessor {

		// Add to view model
		const viewModelItem: IStatusbarViewModelItem = { category: entry.category, alignment, priority };
		this.viewModel.add(viewModelItem);

		// Render entry in status bar
		const itemContainer = this.doCreateStatusItem(entry.category, alignment, priority, ...coalesce(['statusbar-entry', entry.showBeak ? 'has-beak' : undefined]));
		const item = this.instantiationService.createInstance(StatusbarEntryItem, itemContainer, entry);

		// Insert according to priority
		const container = this.element;
		const neighbours = this.getEntries(alignment);
		let inserted = false;
		for (const neighbour of neighbours) {
			const nPriority = Number(neighbour.getAttribute(StatusbarPart.PRIORITY_PROP));
			if (
				alignment === StatusbarAlignment.LEFT && nPriority < priority ||
				alignment === StatusbarAlignment.RIGHT && nPriority > priority
			) {
				container.insertBefore(itemContainer, neighbour);
				inserted = true;
				break;
			}
		}

		if (!inserted) {
			container.appendChild(itemContainer);
		}

		return {
			update: entry => {

				// Update beak
				if (entry.showBeak) {
					addClass(itemContainer, 'has-beak');
				} else {
					removeClass(itemContainer, 'has-beak');
				}

				// Update entry
				item.update(entry);
			},
			dispose: () => {
				this.viewModel.remove(viewModelItem);
				itemContainer.remove();
				dispose(item);
			}
		};
	}

	private getEntries(scope: StatusbarAlignment | IStatusbarEntryCategory): HTMLElement[] {
		const entries: HTMLElement[] = [];

		const container = this.element;
		const children = container.children;
		for (let i = 0; i < children.length; i++) {
			const childElement = <HTMLElement>children.item(i);

			// By alignment
			if (typeof scope === 'number') {
				if (Number(childElement.getAttribute(StatusbarPart.ALIGNMENT_PROP)) === scope) {
					entries.push(childElement);
				}
			}

			// By category
			else {
				if (childElement.getAttribute(StatusbarPart.CATEGORY_PROP) === scope.id) {
					entries.push(childElement);
				}
			}
		}

		return entries;
	}

	createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;

		// Context menu support
		this._register(addDisposableListener(parent, EventType.CONTEXT_MENU, e => this.showContextMenu(e)));

		// Initial status bar entries
		this.createInitialStatusEntries();

		return this.element;
	}

	private createInitialStatusEntries(): void {
		const registry = Registry.as<IStatusbarRegistry>(Extensions.Statusbar);

		const descriptors = registry.items.slice().sort((itemA, itemB) => {
			if (itemA.alignment === itemB.alignment) {
				if (itemA.alignment === StatusbarAlignment.LEFT) {
					return itemB.priority - itemA.priority;
				}

				return itemA.priority - itemB.priority;
			}

			if (itemA.alignment === StatusbarAlignment.LEFT) {
				return 1;
			}

			if (itemA.alignment === StatusbarAlignment.RIGHT) {
				return -1;
			}

			return 0;
		});

		// Fill in initial items that were contributed from the registry
		for (const { category, alignment, priority, syncDescriptor } of descriptors) {

			// Add to view model
			const viewModelItem: IStatusbarViewModelItem = { category, alignment, priority };
			this.viewModel.add(viewModelItem);

			// Render
			const item = this.instantiationService.createInstance(syncDescriptor);
			const itemContainer = this.doCreateStatusItem(category, alignment, priority);

			this._register(item.render(itemContainer));
			this.element.appendChild(itemContainer);
		}

		// Fill in pending entries if any
		while (this.pendingEntries.length) {
			const entry = this.pendingEntries.shift();
			if (entry) {
				entry.accessor = this.addEntry(entry.entry, entry.alignment, entry.priority);
			}
		}
	}

	private showContextMenu(e: MouseEvent): void {
		EventHelper.stop(e, true);

		const event = new StandardMouseEvent(e);

		let actions: IAction[] | undefined = undefined;
		this.contextMenuService.showContextMenu({
			getAnchor: () => ({ x: event.posx, y: event.posy }),
			getActions: () => {
				actions = this.getContextMenuActions(event);

				return actions;
			},
			onHide: () => {
				if (actions) {
					dispose(actions);
				}
			}
		});
	}

	private getContextMenuActions(event: StandardMouseEvent): IAction[] {
		const actions: Action[] = [];

		// Figure out if mouse is over an entry
		let categoryUnderMouse: IStatusbarEntryCategory | undefined = undefined;
		for (let element: HTMLElement | null = event.target; element; element = element.parentElement) {
			if (element.hasAttribute(StatusbarPart.CATEGORY_PROP)) {
				categoryUnderMouse = { id: element.getAttribute(StatusbarPart.CATEGORY_PROP)!, label: element.title };
				break;
			}
		}

		if (categoryUnderMouse) {
			actions.push(new HideStatusCategoryAction(categoryUnderMouse, this.viewModel));
			actions.push(new Separator());
		}

		// Show an entry per known status item category
		const handledCategories = new Set<string>();
		this.viewModel.items.forEach(item => {
			if (!handledCategories.has(item.category.id)) {
				actions.push(new ToggleStatusCategoryVisibilityAction(item.category, this.viewModel));
			}
		});

		// Provide an action to hide the status bar at last
		actions.push(new Separator());
		actions.push(this.instantiationService.createInstance(ToggleStatusbarVisibilityAction, ToggleStatusbarVisibilityAction.ID, nls.localize('hideStatusBar', "Hide Status Bar")));

		return actions;
	}

	updateStyles(): void {
		super.updateStyles();

		const container = this.getContainer();

		// Background colors
		const backgroundColor = this.getColor(this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY ? STATUS_BAR_BACKGROUND : STATUS_BAR_NO_FOLDER_BACKGROUND);
		container.style.backgroundColor = backgroundColor;
		container.style.color = this.getColor(this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY ? STATUS_BAR_FOREGROUND : STATUS_BAR_NO_FOLDER_FOREGROUND);

		// Border color
		const borderColor = this.getColor(this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY ? STATUS_BAR_BORDER : STATUS_BAR_NO_FOLDER_BORDER) || this.getColor(contrastBorder);
		container.style.borderTopWidth = borderColor ? '1px' : null;
		container.style.borderTopStyle = borderColor ? 'solid' : null;
		container.style.borderTopColor = borderColor;

		// Notification Beak
		if (!this.styleElement) {
			this.styleElement = createStyleSheet(container);
		}

		this.styleElement.innerHTML = `.monaco-workbench .part.statusbar > .statusbar-item.has-beak:before { border-bottom-color: ${backgroundColor}; }`;
	}

	private doCreateStatusItem(category: IStatusbarEntryCategory, alignment: StatusbarAlignment, priority: number = 0, ...extraClasses: string[]): HTMLElement {
		const itemContainer = document.createElement('div');
		itemContainer.title = category.label;

		addClass(itemContainer, 'statusbar-item');
		if (extraClasses) {
			addClasses(itemContainer, ...extraClasses);
		}

		if (alignment === StatusbarAlignment.RIGHT) {
			addClass(itemContainer, 'right');
		} else {
			addClass(itemContainer, 'left');
		}

		itemContainer.setAttribute(StatusbarPart.PRIORITY_PROP, String(priority));
		itemContainer.setAttribute(StatusbarPart.ALIGNMENT_PROP, String(alignment));
		itemContainer.setAttribute(StatusbarPart.CATEGORY_PROP, category.id);

		if (this.viewModel.isHidden(category)) {
			hide(itemContainer);
		}

		return itemContainer;
	}

	layout(width: number, height: number): void {
		super.layoutContents(width, height);
	}

	toJSON(): object {
		return {
			type: Parts.STATUSBAR_PART
		};
	}
}

class StatusbarEntryItem extends Disposable {
	private entryDisposables: IDisposable[] = [];

	constructor(
		private container: HTMLElement,
		entry: IStatusbarEntry,
		@ICommandService private readonly commandService: ICommandService,
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IEditorService private readonly editorService: IEditorService,
		@IThemeService private readonly themeService: IThemeService
	) {
		super();

		this.render(entry);
	}

	update(entry: IStatusbarEntry): void {
		clearNode(this.container);
		this.entryDisposables = dispose(this.entryDisposables);

		this.render(entry);
	}

	private render(entry: IStatusbarEntry): void {

		// Text Container
		let textContainer: HTMLElement;
		if (entry.command) {
			textContainer = document.createElement('a');

			this.entryDisposables.push((addDisposableListener(textContainer, 'click', () => this.executeCommand(entry.command!, entry.arguments))));
		} else {
			textContainer = document.createElement('span');
		}

		// Label
		new OcticonLabel(textContainer).text = entry.text;

		// Tooltip
		if (entry.tooltip) {
			textContainer.title = entry.tooltip;
		}

		// Color (only applies to text container)
		this.applyColor(textContainer, entry.color);

		// Background Color (applies to parent element to fully fill container)
		if (entry.backgroundColor) {
			this.applyColor(this.container, entry.backgroundColor, true);
			addClass(this.container, 'has-background-color');
		}

		this.container.appendChild(textContainer);
	}

	private applyColor(container: HTMLElement, color: string | ThemeColor | undefined, isBackground?: boolean): void {
		if (color) {
			if (isThemeColor(color)) {
				const colorId = color.id;
				color = (this.themeService.getTheme().getColor(colorId) || Color.transparent).toString();
				this.entryDisposables.push(((this.themeService.onThemeChange(theme => {
					const colorValue = (theme.getColor(colorId) || Color.transparent).toString();
					isBackground ? container.style.backgroundColor = colorValue : container.style.color = colorValue;
				}))));
			}

			isBackground ? container.style.backgroundColor = color : container.style.color = color;
		}
	}

	private async executeCommand(id: string, args?: unknown[]): Promise<void> {
		args = args || [];

		// Maintain old behaviour of always focusing the editor here
		const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
		if (activeTextEditorWidget) {
			activeTextEditorWidget.focus();
		}

		/* __GDPR__
			"workbenchActionExecuted" : {
				"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this.telemetryService.publicLog('workbenchActionExecuted', { id, from: 'status bar' });
		try {
			await this.commandService.executeCommand(id, ...args);
		} catch (error) {
			this.notificationService.error(toErrorMessage(error));
		}
	}

	dispose(): void {
		super.dispose();

		this.entryDisposables = dispose(this.entryDisposables);
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const statusBarItemHoverBackground = theme.getColor(STATUS_BAR_ITEM_HOVER_BACKGROUND);
	if (statusBarItemHoverBackground) {
		collector.addRule(`.monaco-workbench .part.statusbar > .statusbar-item a:hover { background-color: ${statusBarItemHoverBackground}; }`);
	}

	const statusBarItemActiveBackground = theme.getColor(STATUS_BAR_ITEM_ACTIVE_BACKGROUND);
	if (statusBarItemActiveBackground) {
		collector.addRule(`.monaco-workbench .part.statusbar > .statusbar-item a:active { background-color: ${statusBarItemActiveBackground}; }`);
	}

	const statusBarProminentItemForeground = theme.getColor(STATUS_BAR_PROMINENT_ITEM_FOREGROUND);
	if (statusBarProminentItemForeground) {
		collector.addRule(`.monaco-workbench .part.statusbar > .statusbar-item .status-bar-info { color: ${statusBarProminentItemForeground}; }`);
	}

	const statusBarProminentItemBackground = theme.getColor(STATUS_BAR_PROMINENT_ITEM_BACKGROUND);
	if (statusBarProminentItemBackground) {
		collector.addRule(`.monaco-workbench .part.statusbar > .statusbar-item .status-bar-info { background-color: ${statusBarProminentItemBackground}; }`);
	}

	const statusBarProminentItemHoverBackground = theme.getColor(STATUS_BAR_PROMINENT_ITEM_HOVER_BACKGROUND);
	if (statusBarProminentItemHoverBackground) {
		collector.addRule(`.monaco-workbench .part.statusbar > .statusbar-item a.status-bar-info:hover { background-color: ${statusBarProminentItemHoverBackground}; }`);
	}
});

registerSingleton(IStatusbarService, StatusbarPart);