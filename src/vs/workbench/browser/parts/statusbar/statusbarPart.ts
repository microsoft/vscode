/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/statusbarpart';
import dom = require('vs/base/browser/dom');
import nls = require('vs/nls');
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { TPromise } from 'vs/base/common/winjs.base';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { Builder, $ } from 'vs/base/browser/builder';
import { OcticonLabel } from 'vs/base/browser/ui/octiconLabel/octiconLabel';
import { Registry } from 'vs/platform/registry/common/platform';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Part } from 'vs/workbench/browser/part';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { StatusbarAlignment, IStatusbarRegistry, Extensions, IStatusbarItem } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IStatusbarService, IStatusbarEntry } from 'vs/platform/statusbar/common/statusbar';
import { getCodeEditor } from 'vs/editor/common/services/codeEditorService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { Action } from 'vs/base/common/actions';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { STATUS_BAR_BACKGROUND, STATUS_BAR_FOREGROUND, STATUS_BAR_NO_FOLDER_BACKGROUND, STATUS_BAR_ITEM_HOVER_BACKGROUND, STATUS_BAR_ITEM_ACTIVE_BACKGROUND, STATUS_BAR_PROMINENT_ITEM_BACKGROUND, STATUS_BAR_PROMINENT_ITEM_HOVER_BACKGROUND, STATUS_BAR_BORDER, STATUS_BAR_NO_FOLDER_FOREGROUND, STATUS_BAR_NO_FOLDER_BORDER } from 'vs/workbench/common/theme';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { isThemeColor } from 'vs/editor/common/editorCommon';
import { Color } from 'vs/base/common/color';

export class StatusbarPart extends Part implements IStatusbarService {

	public _serviceBrand: any;

	private static PRIORITY_PROP = 'priority';
	private static ALIGNMENT_PROP = 'alignment';

	private statusItemsContainer: Builder;
	private statusMsgDispose: IDisposable;

	constructor(
		id: string,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(id, { hasTitle: false }, themeService);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toUnbind.push(this.contextService.onDidChangeWorkspaceRoots(() => this.updateStyles()));
	}

	public addEntry(entry: IStatusbarEntry, alignment: StatusbarAlignment, priority: number = 0): IDisposable {

		// Render entry in status bar
		const el = this.doCreateStatusItem(alignment, priority);
		const item = this.instantiationService.createInstance(StatusBarEntryItem, entry);
		const toDispose = item.render(el);

		// Insert according to priority
		const container = this.statusItemsContainer.getHTMLElement();
		const neighbours = this.getEntries(alignment);
		let inserted = false;
		for (let i = 0; i < neighbours.length; i++) {
			const neighbour = neighbours[i];
			const nPriority = $(neighbour).getProperty(StatusbarPart.PRIORITY_PROP);
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
			dispose: () => {
				$(el).destroy();

				if (toDispose) {
					toDispose.dispose();
				}
			}
		};
	}

	private getEntries(alignment: StatusbarAlignment): HTMLElement[] {
		const entries: HTMLElement[] = [];

		const container = this.statusItemsContainer.getHTMLElement();
		const children = container.children;
		for (let i = 0; i < children.length; i++) {
			const childElement = <HTMLElement>children.item(i);
			if ($(childElement).getProperty(StatusbarPart.ALIGNMENT_PROP) === alignment) {
				entries.push(childElement);
			}
		}

		return entries;
	}

	public createContentArea(parent: Builder): Builder {
		this.statusItemsContainer = $(parent);

		// Fill in initial items that were contributed from the registry
		const registry = Registry.as<IStatusbarRegistry>(Extensions.Statusbar);

		const leftDescriptors = registry.items.filter(d => d.alignment === StatusbarAlignment.LEFT).sort((a, b) => b.priority - a.priority);
		const rightDescriptors = registry.items.filter(d => d.alignment === StatusbarAlignment.RIGHT).sort((a, b) => a.priority - b.priority);

		const descriptors = rightDescriptors.concat(leftDescriptors); // right first because they float

		this.toUnbind.push(...descriptors.map(descriptor => {
			const item = this.instantiationService.createInstance(descriptor.syncDescriptor);
			const el = this.doCreateStatusItem(descriptor.alignment, descriptor.priority);

			const dispose = item.render(el);
			this.statusItemsContainer.append(el);

			return dispose;
		}));

		return this.statusItemsContainer;
	}

	protected updateStyles(): void {
		super.updateStyles();

		const container = this.getContainer();

		container.style('color', this.getColor(this.contextService.hasWorkspace() ? STATUS_BAR_FOREGROUND : STATUS_BAR_NO_FOLDER_FOREGROUND));
		container.style('background-color', this.getColor(this.contextService.hasWorkspace() ? STATUS_BAR_BACKGROUND : STATUS_BAR_NO_FOLDER_BACKGROUND));

		const borderColor = this.getColor(this.contextService.hasWorkspace() ? STATUS_BAR_BORDER : STATUS_BAR_NO_FOLDER_BORDER) || this.getColor(contrastBorder);
		container.style('border-top-width', borderColor ? '1px' : null);
		container.style('border-top-style', borderColor ? 'solid' : null);
		container.style('border-top-color', borderColor);
	}

	private doCreateStatusItem(alignment: StatusbarAlignment, priority: number = 0): HTMLElement {
		const el = document.createElement('div');
		dom.addClass(el, 'statusbar-item');

		if (alignment === StatusbarAlignment.RIGHT) {
			dom.addClass(el, 'right');
		} else {
			dom.addClass(el, 'left');
		}

		$(el).setProperty(StatusbarPart.PRIORITY_PROP, priority);
		$(el).setProperty(StatusbarPart.ALIGNMENT_PROP, alignment);

		return el;
	}

	public setStatusMessage(message: string, autoDisposeAfter: number = -1, delayBy: number = 0): IDisposable {
		if (this.statusMsgDispose) {
			this.statusMsgDispose.dispose(); // dismiss any previous
		}

		// Create new
		let statusDispose: IDisposable;
		let showHandle = setTimeout(() => {
			statusDispose = this.addEntry({ text: message }, StatusbarAlignment.LEFT, -Number.MAX_VALUE /* far right on left hand side */);
			showHandle = null;
		}, delayBy);
		let hideHandle: number;

		// Dispose function takes care of timeouts and actual entry
		const dispose = {
			dispose: () => {
				if (showHandle) {
					clearTimeout(showHandle);
				}

				if (hideHandle) {
					clearTimeout(hideHandle);
				}

				if (statusDispose) {
					statusDispose.dispose();
				}
			}
		};
		this.statusMsgDispose = dispose;

		if (typeof autoDisposeAfter === 'number' && autoDisposeAfter > 0) {
			hideHandle = setTimeout(() => dispose.dispose(), autoDisposeAfter);
		}

		return dispose;
	}
}

let manageExtensionAction: ManageExtensionAction;
class StatusBarEntryItem implements IStatusbarItem {
	private entry: IStatusbarEntry;

	constructor(
		entry: IStatusbarEntry,
		@ICommandService private commandService: ICommandService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IThemeService private themeService: IThemeService
	) {
		this.entry = entry;

		if (!manageExtensionAction) {
			manageExtensionAction = this.instantiationService.createInstance(ManageExtensionAction);
		}
	}

	public render(el: HTMLElement): IDisposable {
		let toDispose: IDisposable[] = [];
		dom.addClass(el, 'statusbar-entry');

		// Text Container
		let textContainer: HTMLElement;
		if (this.entry.command) {
			textContainer = document.createElement('a');

			$(textContainer).on('click', () => this.executeCommand(this.entry.command, this.entry.arguments), toDispose);
		} else {
			textContainer = document.createElement('span');
		}

		// Label
		new OcticonLabel(textContainer).text = this.entry.text;

		// Tooltip
		if (this.entry.tooltip) {
			$(textContainer).title(this.entry.tooltip);
		}

		// Color
		let color = this.entry.color;
		if (color) {
			if (isThemeColor(color)) {
				let colorId = color.id;
				color = (this.themeService.getTheme().getColor(colorId) || Color.transparent).toString();
				toDispose.push(this.themeService.onThemeChange(theme => {
					let colorValue = (this.themeService.getTheme().getColor(colorId) || Color.transparent).toString();
					$(textContainer).color(colorValue);
				}));
			}
			$(textContainer).color(color);
		}

		// Context Menu
		if (this.entry.extensionId) {
			$(textContainer).on('contextmenu', e => {
				dom.EventHelper.stop(e, true);

				this.contextMenuService.showContextMenu({
					getAnchor: () => el,
					getActionsContext: () => this.entry.extensionId,
					getActions: () => TPromise.as([manageExtensionAction])
				});
			}, toDispose);
		}

		el.appendChild(textContainer);

		return {
			dispose: () => {
				toDispose = dispose(toDispose);
			}
		};
	}

	private executeCommand(id: string, args?: any[]) {
		args = args || [];

		// Lookup built in commands
		const builtInActionDescriptor = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions).getWorkbenchAction(id);
		if (builtInActionDescriptor) {
			const action = this.instantiationService.createInstance(builtInActionDescriptor.syncDescriptor);

			if (action.enabled) {
				this.telemetryService.publicLog('workbenchActionExecuted', { id: action.id, from: 'status bar' });
				(action.run() || TPromise.as(null)).done(() => {
					action.dispose();
				}, (err) => this.messageService.show(Severity.Error, toErrorMessage(err)));
			} else {
				this.messageService.show(Severity.Warning, nls.localize('canNotRun', "Command '{0}' is currently not enabled and can not be run.", action.label || id));
			}

			return;
		}

		// Maintain old behaviour of always focusing the editor here
		const activeEditor = this.editorService.getActiveEditor();
		const codeEditor = getCodeEditor(activeEditor);
		if (codeEditor) {
			codeEditor.focus();
		}

		// Fallback to the command service for any other case
		this.commandService.executeCommand(id, ...args).done(undefined, err => this.messageService.show(Severity.Error, toErrorMessage(err)));
	}
}

class ManageExtensionAction extends Action {

	constructor(
		@ICommandService private commandService: ICommandService
	) {
		super('statusbar.manage.extension', nls.localize('manageExtension', "Manage Extension"));
	}

	public run(extensionId: string): TPromise<any> {
		return this.commandService.executeCommand('_extensions.manage', extensionId);
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const statusBarItemHoverBackground = theme.getColor(STATUS_BAR_ITEM_HOVER_BACKGROUND);
	if (statusBarItemHoverBackground) {
		collector.addRule(`.monaco-workbench > .part.statusbar > .statusbar-item a:hover:not([disabled]):not(.disabled) { background-color: ${statusBarItemHoverBackground}; }`);
	}

	const statusBarItemActiveBackground = theme.getColor(STATUS_BAR_ITEM_ACTIVE_BACKGROUND);
	if (statusBarItemActiveBackground) {
		collector.addRule(`.monaco-workbench > .part.statusbar > .statusbar-item a:active:not([disabled]):not(.disabled) { background-color: ${statusBarItemActiveBackground}; }`);
	}

	const statusBarProminentItemBackground = theme.getColor(STATUS_BAR_PROMINENT_ITEM_BACKGROUND);
	if (statusBarProminentItemBackground) {
		collector.addRule(`.monaco-workbench > .part.statusbar > .statusbar-item .status-bar-info { background-color: ${statusBarProminentItemBackground}; }`);
	}

	const statusBarProminentItemHoverBackground = theme.getColor(STATUS_BAR_PROMINENT_ITEM_HOVER_BACKGROUND);
	if (statusBarProminentItemHoverBackground) {
		collector.addRule(`.monaco-workbench > .part.statusbar > .statusbar-item a.status-bar-info:hover:not([disabled]):not(.disabled) { background-color: ${statusBarProminentItemHoverBackground}; }`);
	}
});