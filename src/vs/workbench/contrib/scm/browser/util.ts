/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISCMResource, ISCMRepository, ISCMResourceGroup, ISCMInput, ISCMActionButton } from 'vs/workbench/contrib/scm/common/scm';
import { IMenu } from 'vs/platform/actions/common/actions';
import { ActionBar, IActionViewItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Action, IAction } from 'vs/base/common/actions';
import { createActionViewItem, createAndFillInActionBarActions, createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { equals } from 'vs/base/common/arrays';
import { ActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { Command } from 'vs/editor/common/languages';
import { reset } from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export function isSCMRepositoryArray(element: any): element is ISCMRepository[] {
	return Array.isArray(element) && element.every(r => isSCMRepository(r));
}

export function isSCMRepository(element: any): element is ISCMRepository {
	return !!(element as ISCMRepository).provider && !!(element as ISCMRepository).input;
}

export function isSCMInput(element: any): element is ISCMInput {
	return !!(element as ISCMInput).validateInput && typeof (element as ISCMInput).value === 'string';
}

export function isSCMActionButton(element: any): element is ISCMActionButton {
	return (element as ISCMActionButton).type === 'actionButton';
}

export function isSCMResourceGroup(element: any): element is ISCMResourceGroup {
	return !!(element as ISCMResourceGroup).provider && !!(element as ISCMResourceGroup).elements;
}

export function isSCMResource(element: any): element is ISCMResource {
	return !!(element as ISCMResource).sourceUri && isSCMResourceGroup((element as ISCMResource).resourceGroup);
}

const compareActions = (a: IAction, b: IAction) => a.id === b.id && a.enabled === b.enabled;

export function connectPrimaryMenu(menu: IMenu, callback: (primary: IAction[], secondary: IAction[]) => void, primaryGroup?: string): IDisposable {
	let cachedPrimary: IAction[] = [];
	let cachedSecondary: IAction[] = [];

	const updateActions = () => {
		const primary: IAction[] = [];
		const secondary: IAction[] = [];

		createAndFillInActionBarActions(menu, { shouldForwardArgs: true }, { primary, secondary }, primaryGroup);

		if (equals(cachedPrimary, primary, compareActions) && equals(cachedSecondary, secondary, compareActions)) {
			return;
		}

		cachedPrimary = primary;
		cachedSecondary = secondary;

		callback(primary, secondary);
	};

	updateActions();

	return menu.onDidChange(updateActions);
}

export function connectPrimaryMenuToInlineActionBar(menu: IMenu, actionBar: ActionBar): IDisposable {
	return connectPrimaryMenu(menu, (primary) => {
		actionBar.clear();
		actionBar.push(primary, { icon: true, label: false });
	}, 'inline');
}

export function collectContextMenuActions(menu: IMenu): IAction[] {
	const primary: IAction[] = [];
	const actions: IAction[] = [];
	createAndFillInContextMenuActions(menu, { shouldForwardArgs: true }, { primary, secondary: actions }, 'inline');
	return actions;
}

export class StatusBarAction extends Action {

	constructor(
		private command: Command,
		private commandService: ICommandService
	) {
		super(`statusbaraction{${command.id}}`, command.title, '', true);
		this.tooltip = command.tooltip || '';
	}

	override run(): Promise<void> {
		return this.commandService.executeCommand(this.command.id, ...(this.command.arguments || []));
	}
}

class StatusBarActionViewItem extends ActionViewItem {

	constructor(action: StatusBarAction) {
		super(null, action, {});
	}

	protected override updateLabel(): void {
		if (this.options.label && this.label) {
			reset(this.label, ...renderLabelWithIcons(this.action.label));
		}
	}
}

export function getActionViewItemProvider(instaService: IInstantiationService): IActionViewItemProvider {
	return action => {
		if (action instanceof StatusBarAction) {
			return new StatusBarActionViewItem(action);
		}

		return createActionViewItem(instaService, action);
	};
}
