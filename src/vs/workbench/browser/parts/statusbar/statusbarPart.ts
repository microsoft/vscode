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
import { StatusbarAlignment, IStatusbarService, IStatusbarEntry, IStatusbarEntryAccessor } from 'vs/platform/statusbar/common/statusbar';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { Action } from 'vs/base/common/actions';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector, ThemeColor } from 'vs/platform/theme/common/themeService';
import { STATUS_BAR_BACKGROUND, STATUS_BAR_FOREGROUND, STATUS_BAR_NO_FOLDER_BACKGROUND, STATUS_BAR_ITEM_HOVER_BACKGROUND, STATUS_BAR_ITEM_ACTIVE_BACKGROUND, STATUS_BAR_PROMINENT_ITEM_FOREGROUND, STATUS_BAR_PROMINENT_ITEM_BACKGROUND, STATUS_BAR_PROMINENT_ITEM_HOVER_BACKGROUND, STATUS_BAR_BORDER, STATUS_BAR_NO_FOLDER_FOREGROUND, STATUS_BAR_NO_FOLDER_BORDER } from 'vs/workbench/common/theme';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { isThemeColor } from 'vs/editor/common/editorCommon';
import { Color } from 'vs/base/common/color';
import { addClass, EventHelper, createStyleSheet, addDisposableListener, addClasses, clearNode, removeClass } from 'vs/base/browser/dom';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Parts, IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { coalesce } from 'vs/base/common/arrays';

interface PendingEntry { entry: IStatusbarEntry; alignment: StatusbarAlignment; priority: number; accessor?: IStatusbarEntryAccessor; }

export class StatusbarPart extends Part implements IStatusbarService {

	_serviceBrand: ServiceIdentifier<any>;

	private static readonly PRIORITY_PROP = 'statusbar-entry-priority';
	private static readonly ALIGNMENT_PROP = 'statusbar-entry-alignment';

	//#region IView

	readonly minimumWidth: number = 0;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	readonly minimumHeight: number = 22;
	readonly maximumHeight: number = 22;

	//#endregion

	private statusMessageDispose: IDisposable;
	private styleElement: HTMLStyleElement;

	private pendingEntries: PendingEntry[] = [];

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService
	) {
		super(Parts.STATUSBAR_PART, { hasTitle: false }, themeService, storageService, layoutService);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.contextService.onDidChangeWorkbenchState(() => this.updateStyles()));
	}

	addEntry(entry: IStatusbarEntry, alignment: StatusbarAlignment, priority: number = 0): IStatusbarEntryAccessor {

		// As long as we have not been created into a container yet, record all entries
		// that are pending so that they can get created at a later point
		if (!this.element) {
			const pendingEntry: PendingEntry = {
				entry, alignment, priority
			};
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

		// Render entry in status bar
		const el = this.doCreateStatusItem(alignment, priority, ...coalesce(['statusbar-entry', entry.showBeak ? 'has-beak' : undefined]));
		const item = this.instantiationService.createInstance(StatusBarEntryItem, el, entry);

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
				container.insertBefore(el, neighbour);
				inserted = true;
				break;
			}
		}

		if (!inserted) {
			container.appendChild(el);
		}

		return {
			update: entry => {

				// Update beak
				if (entry.showBeak) {
					addClass(el, 'has-beak');
				} else {
					removeClass(el, 'has-beak');
				}

				// Update entry
				item.update(entry);
			},
			dispose: () => {
				el.remove();
				dispose(item);
			}
		};
	}

	private getEntries(alignment: StatusbarAlignment): HTMLElement[] {
		const entries: HTMLElement[] = [];

		const container = this.element;
		const children = container.children;
		for (let i = 0; i < children.length; i++) {
			const childElement = <HTMLElement>children.item(i);
			if (Number(childElement.getAttribute(StatusbarPart.ALIGNMENT_PROP)) === alignment) {
				entries.push(childElement);
			}
		}

		return entries;
	}

	createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;

		// Fill in initial items that were contributed from the registry
		const registry = Registry.as<IStatusbarRegistry>(Extensions.Statusbar);

		const descriptors = registry.items.slice().sort((a, b) => {
			if (a.alignment === b.alignment) {
				if (a.alignment === StatusbarAlignment.LEFT) {
					return b.priority - a.priority;
				} else {
					return a.priority - b.priority;
				}
			} else if (a.alignment === StatusbarAlignment.LEFT) {
				return 1;
			} else if (a.alignment === StatusbarAlignment.RIGHT) {
				return -1;
			} else {
				return 0;
			}
		});

		for (const descriptor of descriptors) {
			const item = this.instantiationService.createInstance(descriptor.syncDescriptor);
			const el = this.doCreateStatusItem(descriptor.alignment, descriptor.priority);

			this._register(item.render(el));
			this.element.appendChild(el);
		}

		// Fill in pending entries if any
		while (this.pendingEntries.length) {
			const entry = this.pendingEntries.shift();
			if (entry) {
				entry.accessor = this.addEntry(entry.entry, entry.alignment, entry.priority);
			}
		}

		return this.element;
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

	private doCreateStatusItem(alignment: StatusbarAlignment, priority: number = 0, ...extraClasses: string[]): HTMLElement {
		const el = document.createElement('div');
		addClass(el, 'statusbar-item');
		if (extraClasses) {
			addClasses(el, ...extraClasses);
		}

		if (alignment === StatusbarAlignment.RIGHT) {
			addClass(el, 'right');
		} else {
			addClass(el, 'left');
		}

		el.setAttribute(StatusbarPart.PRIORITY_PROP, String(priority));
		el.setAttribute(StatusbarPart.ALIGNMENT_PROP, String(alignment));

		return el;
	}

	setStatusMessage(message: string, autoDisposeAfter: number = -1, delayBy: number = 0): IDisposable {

		// Dismiss any previous
		dispose(this.statusMessageDispose);

		// Create new
		let statusMessageEntry: IStatusbarEntryAccessor;
		let showHandle: any = setTimeout(() => {
			statusMessageEntry = this.addEntry({ text: message }, StatusbarAlignment.LEFT, -Number.MAX_VALUE /* far right on left hand side */);
			showHandle = null;
		}, delayBy);
		let hideHandle: any;

		// Dispose function takes care of timeouts and actual entry
		const statusMessageDispose = {
			dispose: () => {
				if (showHandle) {
					clearTimeout(showHandle);
				}

				if (hideHandle) {
					clearTimeout(hideHandle);
				}

				if (statusMessageEntry) {
					statusMessageEntry.dispose();
				}
			}
		};
		this.statusMessageDispose = statusMessageDispose;

		if (typeof autoDisposeAfter === 'number' && autoDisposeAfter > 0) {
			hideHandle = setTimeout(() => statusMessageDispose.dispose(), autoDisposeAfter);
		}

		return statusMessageDispose;
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

let manageExtensionAction: ManageExtensionAction;
class StatusBarEntryItem extends Disposable {
	private entryDisposables: IDisposable[] = [];

	constructor(
		private container: HTMLElement,
		entry: IStatusbarEntry,
		@ICommandService private readonly commandService: ICommandService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IEditorService private readonly editorService: IEditorService,
		@IThemeService private readonly themeService: IThemeService
	) {
		super();

		if (!manageExtensionAction) {
			manageExtensionAction = this.instantiationService.createInstance(ManageExtensionAction);
		}

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

		// Context Menu
		if (entry.extensionId) {
			this.entryDisposables.push((addDisposableListener(textContainer, 'contextmenu', e => {
				EventHelper.stop(e, true);

				this.contextMenuService.showContextMenu({
					getAnchor: () => this.container,
					getActionsContext: () => entry.extensionId!.value,
					getActions: () => [manageExtensionAction]
				});
			})));
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

class ManageExtensionAction extends Action {

	constructor(
		@ICommandService private readonly commandService: ICommandService
	) {
		super('statusbar.manage.extension', nls.localize('manageExtension', "Manage Extension"));
	}

	run(extensionId: string): Promise<any> {
		return this.commandService.executeCommand('_extensions.manage', extensionId);
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