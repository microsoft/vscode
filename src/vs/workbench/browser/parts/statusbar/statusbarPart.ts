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
import { Registry } from 'vs/platform/platform';
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

export class StatusbarPart extends Part implements IStatusbarService {

	public _serviceBrand: any;

	private static PRIORITY_PROP = 'priority';
	private static ALIGNMENT_PROP = 'alignment';

	private toDispose: IDisposable[];
	private statusItemsContainer: Builder;
	private statusMsgDispose: IDisposable;

	constructor(
		id: string,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id);

		this.toDispose = [];
	}

	public addEntry(entry: IStatusbarEntry, alignment: StatusbarAlignment, priority: number = 0): IDisposable {

		// Render entry in status bar
		let el = this.doCreateStatusItem(alignment, priority);
		let item = this.instantiationService.createInstance(StatusBarEntryItem, entry);
		let toDispose = item.render(el);

		// Insert according to priority
		let container = this.statusItemsContainer.getHTMLElement();
		let neighbours = this.getEntries(alignment);
		let inserted = false;
		for (let i = 0; i < neighbours.length; i++) {
			let neighbour = neighbours[i];
			let nPriority = $(neighbour).getProperty(StatusbarPart.PRIORITY_PROP);
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
		let entries: HTMLElement[] = [];

		let container = this.statusItemsContainer.getHTMLElement();
		let children = container.children;
		for (let i = 0; i < children.length; i++) {
			let childElement = <HTMLElement>children.item(i);
			if ($(childElement).getProperty(StatusbarPart.ALIGNMENT_PROP) === alignment) {
				entries.push(childElement);
			}
		}

		return entries;
	}

	public createContentArea(parent: Builder): Builder {
		this.statusItemsContainer = $(parent);

		// Fill in initial items that were contributed from the registry
		let registry = (<IStatusbarRegistry>Registry.as(Extensions.Statusbar));

		let leftDescriptors = registry.items.filter(d => d.alignment === StatusbarAlignment.LEFT).sort((a, b) => b.priority - a.priority);
		let rightDescriptors = registry.items.filter(d => d.alignment === StatusbarAlignment.RIGHT).sort((a, b) => a.priority - b.priority);

		let descriptors = rightDescriptors.concat(leftDescriptors); // right first because they float

		this.toDispose.push(...descriptors.map(descriptor => {
			let item = this.instantiationService.createInstance(descriptor.syncDescriptor);
			let el = this.doCreateStatusItem(descriptor.alignment, descriptor.priority);

			let dispose = item.render(el);
			this.statusItemsContainer.append(el);

			return dispose;
		}));

		return this.statusItemsContainer;
	}

	private doCreateStatusItem(alignment: StatusbarAlignment, priority: number = 0): HTMLElement {
		let el = document.createElement('div');
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
			statusDispose = this.addEntry({ text: message }, StatusbarAlignment.LEFT, Number.MIN_VALUE);
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

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);

		super.dispose();
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
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
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

			$(textContainer).on('click', () => this.executeCommand(this.entry.command), toDispose);
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
		if (this.entry.color) {
			$(textContainer).color(this.entry.color);
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

	private executeCommand(id: string) {

		// Lookup built in commands
		let builtInActionDescriptor = (<IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions)).getWorkbenchAction(id);
		if (builtInActionDescriptor) {
			let action = this.instantiationService.createInstance(builtInActionDescriptor.syncDescriptor);

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
		let activeEditor = this.editorService.getActiveEditor();
		let codeEditor = getCodeEditor(activeEditor);
		if (codeEditor) {
			codeEditor.focus();
		}

		// Fallback to the command service for any other case
		this.commandService.executeCommand(id).done(undefined, err => this.messageService.show(Severity.Error, toErrorMessage(err)));
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