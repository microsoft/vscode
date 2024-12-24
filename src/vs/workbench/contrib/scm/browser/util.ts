/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISCMHistoryItem, ISCMHistoryItemRef, SCMHistoryItemLoadMoreTreeElement, SCMHistoryItemViewModelTreeElement } from '../common/history.js';
import { ISCMResource, ISCMRepository, ISCMResourceGroup, ISCMInput, ISCMActionButton, ISCMViewService, ISCMProvider } from '../common/scm.js';
import { IMenu, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IActionViewItemProvider } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { Action, IAction } from '../../../../base/common/actions.js';
import { createActionViewItem, getActionBarActions, getContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { equals } from '../../../../base/common/arrays.js';
import { ActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { Command } from '../../../../editor/common/languages.js';
import { reset } from '../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IResourceNode, ResourceTree } from '../../../../base/common/resourceTree.js';

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

export function isSCMHistoryItemViewModelTreeElement(element: any): element is SCMHistoryItemViewModelTreeElement {
	return (element as SCMHistoryItemViewModelTreeElement).type === 'historyItemViewModel';
}

export function isSCMHistoryItemLoadMoreTreeElement(element: any): element is SCMHistoryItemLoadMoreTreeElement {
	return (element as SCMHistoryItemLoadMoreTreeElement).type === 'historyItemLoadMore';
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
		const { primary, secondary } = getActionBarActions(menu.getActions({ shouldForwardArgs: true }), primaryGroup);

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

export function collectContextMenuActions(menu: IMenu): IAction[] {
	return getContextMenuActions(menu.getActions({ shouldForwardArgs: true }), 'inline').secondary;
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

export function getHistoryItemEditorTitle(historyItem: ISCMHistoryItem, maxLength = 20): string {
	const title = historyItem.subject.length <= maxLength ?
		historyItem.subject : `${historyItem.subject.substring(0, maxLength)}\u2026`;

	return `${historyItem.displayId ?? historyItem.id} - ${title}`;
}

export function compareHistoryItemRefs(
	ref1: ISCMHistoryItemRef,
	ref2: ISCMHistoryItemRef,
	currentHistoryItemRef?: ISCMHistoryItemRef,
	currentHistoryItemRemoteRef?: ISCMHistoryItemRef,
	currentHistoryItemBaseRef?: ISCMHistoryItemRef
): number {
	const getHistoryItemRefOrder = (ref: ISCMHistoryItemRef) => {
		if (ref.id === currentHistoryItemRef?.id) {
			return 1;
		} else if (ref.id === currentHistoryItemRemoteRef?.id) {
			return 2;
		} else if (ref.id === currentHistoryItemBaseRef?.id) {
			return 3;
		} else if (ref.color !== undefined) {
			return 4;
		}

		return 99;
	};

	// Assign order (current > remote > base > color)
	const ref1Order = getHistoryItemRefOrder(ref1);
	const ref2Order = getHistoryItemRefOrder(ref2);

	return ref1Order - ref2Order;
}
