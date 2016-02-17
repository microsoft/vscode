/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import env = require('vs/base/common/platform');
import DOM = require('vs/base/browser/dom');
import {TPromise} from 'vs/base/common/winjs.base';
import {IAction, Action} from 'vs/base/common/actions';
import {Button} from 'vs/base/browser/ui/button/button';
import {$} from 'vs/base/browser/builder';
import {IActionItem} from 'vs/base/browser/ui/actionbar/actionbar';
import {CollapsibleView} from 'vs/base/browser/ui/splitview/splitview';
import {Registry} from 'vs/platform/platform';
import {IWorkbenchActionRegistry, Extensions} from 'vs/workbench/common/actionRegistry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {StructuredSelection} from 'vs/platform/selection/common/selection';

export class EmptyView extends CollapsibleView {

	constructor(@IInstantiationService private instantiationService: IInstantiationService) {
		super({
			minimumSize: 2 * 22,
			ariaHeaderLabel: nls.localize('explorerSection', "Files Explorer Section")
		});
	}

	public renderHeader(container: HTMLElement): void {
		let titleDiv = $('div.title').appendTo(container);
		$('span').text(nls.localize('noWorkspace', "No Folder Opened")).appendTo(titleDiv);
	}

	public renderBody(container: HTMLElement): void {
		DOM.addClass(container, 'explorer-empty-view');

		let titleDiv = $('div.section').appendTo(container);
		$('p').text(nls.localize('noWorkspaceHelp', "You have not yet opened a folder.")).appendTo(titleDiv);

		let section = $('div.section').appendTo(container);

		let button = new Button(section);
		button.label = nls.localize('openFolder', "Open Folder");
		button.on('click', () => {
			this.runWorkbenchAction(env.isMacintosh ? 'workbench.action.files.openFileFolder' : 'workbench.action.files.openFolder');
		});
	}

	private runWorkbenchAction(actionId: string): void {
		let actionRegistry = <IWorkbenchActionRegistry> Registry.as(Extensions.WorkbenchActions);
		let actionDescriptor = actionRegistry.getWorkbenchAction(actionId);

		let action = <Action> this.instantiationService.createInstance(actionDescriptor.syncDescriptor);

		return action.run().done(() => action.dispose());
	}

	public create(): TPromise<void> {
		return TPromise.as(null);
	}

	public refresh(focus: boolean, reveal: boolean, instantProgress?: boolean): TPromise<void> {
		return TPromise.as(null);
	}

	public setVisible(visible: boolean): TPromise<void> {
		return TPromise.as(null);
	}

	public focusBody(): void {
		// Ignore
	}

	public getSelection(): StructuredSelection {
		return new StructuredSelection([]);
	}

	protected reveal(element: any, relativeTop?: number): TPromise<void> {
		return TPromise.as(null);
	}

	public getActions(): IAction[] {
		return [];
	}

	public getSecondaryActions(): IAction[] {
		return [];
	}

	public getActionItem(action: IAction): IActionItem {
		return null;
	}

	public shutdown(): void {
		// Subclass to implement
	}
}