/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'vs/base/common/path';
import { SCMHistoryItemChangeTreeElement, SCMHistoryItemGroupTreeElement, SCMHistoryItemTreeElement, SCMHistoryItemViewModelTreeElement, SCMViewSeparatorElement } from 'vs/workbench/contrib/scm/common/history';
import { ISCMResource, ISCMRepository, ISCMResourceGroup, ISCMInput, ISCMActionButton, ISCMViewService, ISCMProvider } from 'vs/workbench/contrib/scm/common/scm';
import { IMenu, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ActionBar, IActionViewItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Action, IAction } from 'vs/base/common/actions';
import { createActionViewItem, createAndFillInActionBarActions, createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { equals } from 'vs/base/common/arrays';
import { ActionViewItem, IBaseActionViewItemOptions } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { Command } from 'vs/editor/common/languages';
import { reset } from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { IResourceNode, ResourceTree } from 'vs/base/common/resourceTree';

export function isSCMRepositoryArray(element: any): element is ISCMRepository[] {
	return Array.isArray(element) && element.every(r => isSCMRepository(r));
}

export function isSCMViewService(element: any): element is ISCMViewService {
	return Array.isArray((element as ISCMViewService).repositories) && Array.isArray((element as ISCMViewService).visibleRepositories);
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
	return !!(element as ISCMResourceGroup).provider && !!(element as ISCMResourceGroup).resources;
}

export function isSCMResource(element: any): element is ISCMResource {
	return !!(element as ISCMResource).sourceUri && isSCMResourceGroup((element as ISCMResource).resourceGroup);
}

export function isSCMResourceNode(element: any): element is IResourceNode<ISCMResource, ISCMResourceGroup> {
	return ResourceTree.isResourceNode(element) && isSCMResourceGroup(element.context);
}

export function isSCMHistoryItemGroupTreeElement(element: any): element is SCMHistoryItemGroupTreeElement {
	return (element as SCMHistoryItemGroupTreeElement).type === 'historyItemGroup';
}

export function isSCMHistoryItemTreeElement(element: any): element is SCMHistoryItemTreeElement {
	return (element as SCMHistoryItemTreeElement).type === 'allChanges' ||
		(element as SCMHistoryItemTreeElement).type === 'historyItem';
}

export function isSCMHistoryItemViewModelTreeElement(element: any): element is SCMHistoryItemViewModelTreeElement {
	return (element as SCMHistoryItemViewModelTreeElement).type === 'historyItem2';
}

export function isSCMHistoryItemChangeTreeElement(element: any): element is SCMHistoryItemChangeTreeElement {
	return (element as SCMHistoryItemChangeTreeElement).type === 'historyItemChange';
}

export function isSCMHistoryItemChangeNode(element: any): element is IResourceNode<SCMHistoryItemChangeTreeElement, SCMHistoryItemTreeElement> {
	return ResourceTree.isResourceNode(element) && isSCMHistoryItemTreeElement(element.context);
}

export function isSCMViewSeparator(element: any): element is SCMViewSeparatorElement {
	return (element as SCMViewSeparatorElement).type === 'separator';
}

export function toDiffEditorArguments(uri: URI, originalUri: URI, modifiedUri: URI): unknown[] {
	const basename = path.basename(uri.fsPath);
	const originalQuery = JSON.parse(originalUri.query) as { path: string; ref: string };
	const modifiedQuery = JSON.parse(modifiedUri.query) as { path: string; ref: string };

	const originalShortRef = originalQuery.ref.substring(0, 8).concat(originalQuery.ref.endsWith('^') ? '^' : '');
	const modifiedShortRef = modifiedQuery.ref.substring(0, 8).concat(modifiedQuery.ref.endsWith('^') ? '^' : '');

	return [originalUri, modifiedUri, `${basename} (${originalShortRef}) ↔ ${basename} (${modifiedShortRef})`, null];
}

const compareActions = (a: IAction, b: IAction) => {
	if (a instanceof MenuItemAction && b instanceof MenuItemAction) {
		return a.id === b.id && a.enabled === b.enabled && a.hideActions?.isHidden === b.hideActions?.isHidden;
	}

	return a.id === b.id && a.enabled === b.enabled;
};

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

	constructor(action: StatusBarAction, options: IBaseActionViewItemOptions) {
		super(null, action, { ...options, icon: false, label: true });
	}

	protected override updateLabel(): void {
		if (this.options.label && this.label) {
			reset(this.label, ...renderLabelWithIcons(this.action.label));
		}
	}
}

export function getActionViewItemProvider(instaService: IInstantiationService): IActionViewItemProvider {
	return (action, options) => {
		if (action instanceof StatusBarAction) {
			return new StatusBarActionViewItem(action, options);
		}

		return createActionViewItem(instaService, action, options);
	};
}

export function getProviderKey(provider: ISCMProvider): string {
	return `${provider.contextValue}:${provider.label}${provider.rootUri ? `:${provider.rootUri.toString()}` : ''}`;
}

export function getRepositoryResourceCount(provider: ISCMProvider): number {
	return provider.groups.reduce<number>((r, g) => r + g.resources.length, 0);
}
