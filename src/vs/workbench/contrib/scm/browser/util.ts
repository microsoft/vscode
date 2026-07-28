/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISCMHistoryItem, SCMHistoryItemChangeViewModelTreeElement, SCMHistoryItemLoadMoreTreeElement, SCMHistoryItemViewModelTreeElement } from '../common/history.js';
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
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { SCMArtifactGroupTreeElement, SCMArtifactTreeElement } from '../common/artifact.js';

export function isSCMViewService(element: unknown): element is ISCMViewService {
	return Array.isArray((element as ISCMViewService).repositories) && Array.isArray((element as ISCMViewService).visibleRepositories);
}

export function isSCMRepository(element: unknown): element is ISCMRepository {
	return !!(element as ISCMRepository).provider && !!(element as ISCMRepository).input;
}

export function isSCMInput(element: unknown): element is ISCMInput {
	return !!(element as ISCMInput).validateInput && typeof (element as ISCMInput).value === 'string';
}

export function isSCMActionButton(element: unknown): element is ISCMActionButton {
	return (element as ISCMActionButton).type === 'actionButton';
}

export function isSCMResourceGroup(element: unknown): element is ISCMResourceGroup {
	return !!(element as ISCMResourceGroup).provider && !!(element as ISCMResourceGroup).resources;
}

export function isSCMResource(element: unknown): element is ISCMResource {
	return !!(element as ISCMResource).sourceUri && isSCMResourceGroup((element as ISCMResource).resourceGroup);
}

export function isSCMResourceNode(element: unknown): element is IResourceNode<ISCMResource, ISCMResourceGroup> {
	return ResourceTree.isResourceNode(element) && isSCMResourceGroup(element.context);
}

export function isSCMHistoryItemViewModelTreeElement(element: unknown): element is SCMHistoryItemViewModelTreeElement {
	return (element as SCMHistoryItemViewModelTreeElement).type === 'historyItemViewModel';
}

export function isSCMHistoryItemLoadMoreTreeElement(element: unknown): element is SCMHistoryItemLoadMoreTreeElement {
	return (element as SCMHistoryItemLoadMoreTreeElement).type === 'historyItemLoadMore';
}

export function isSCMHistoryItemChangeViewModelTreeElement(element: unknown): element is SCMHistoryItemChangeViewModelTreeElement {
	return (element as SCMHistoryItemChangeViewModelTreeElement).type === 'historyItemChangeViewModel';
}

export function isSCMHistoryItemChangeNode(element: unknown): element is IResourceNode<ISCMHistoryItem, SCMHistoryItemChangeViewModelTreeElement> {
	return ResourceTree.isResourceNode(element) && isSCMHistoryItemViewModelTreeElement(element.context);
}

export function isSCMArtifactGroupTreeElement(element: unknown): element is SCMArtifactGroupTreeElement {
	return (element as SCMArtifactGroupTreeElement).type === 'artifactGroup';
}

export function isSCMArtifactNode(element: unknown): element is IResourceNode<SCMArtifactTreeElement, SCMArtifactGroupTreeElement> {
	return ResourceTree.isResourceNode(element) && isSCMArtifactGroupTreeElement(element.context);
}

export function isSCMArtifactTreeElement(element: unknown): element is SCMArtifactTreeElement {
	return (element as SCMArtifactTreeElement).type === 'artifact';
}

const compareActions = (a: IAction, b: IAction) => {
	if (a instanceof MenuItemAction && b instanceof MenuItemAction) {
		return a.id === b.id && a.enabled === b.enabled && a.hideActions?.isHidden === b.hideActions?.isHidden;
	}

	return a.id === b.id && a.enabled === b.enabled;
};

export function connectPrimaryMenu(menu: IMenu, callback: (primary: IAction[], secondary: IAction[]) => void, primaryGroup?: string, arg?: unknown): IDisposable {
	let cachedPrimary: IAction[] = [];
	let cachedSecondary: IAction[] = [];

	const updateActions = () => {
		const { primary, secondary } = getActionBarActions(menu.getActions({ arg, shouldForwardArgs: true }), primaryGroup);

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

export function collectContextMenuActions(menu: IMenu, arg?: unknown): IAction[] {
	return getContextMenuActions(menu.getActions({ arg, shouldForwardArgs: true }), 'inline').secondary;
}

export class StatusBarAction extends Action {
	readonly commandTitle: string | undefined;

	constructor(
		private command: Command,
		private commandService: ICommandService
	) {
		super(`statusbaraction{${command.id}}`, getStatusBarCommandGenericName(command), '', true);

		this.commandTitle = command.title;
		this.tooltip = command.tooltip || '';
	}

	override run(): Promise<void> {
		return this.commandService.executeCommand(this.command.id, ...(this.command.arguments || []));
	}
}

class StatusBarActionViewItem extends ActionViewItem {
	private readonly _commandTitle: string | undefined;

	constructor(action: StatusBarAction, options: IBaseActionViewItemOptions) {
		super(null, action, { ...options, icon: false, label: true });
		this._commandTitle = action.commandTitle;
	}

	override render(container: HTMLElement): void {
		container.classList.add('scm-status-bar-action');
		super.render(container);
	}

	protected override updateLabel(): void {
		if (this.options.label && this.label) {
			// Convert text nodes to span elements to enable
			// text overflow on the left hand side of the label
			const elements = renderLabelWithIcons(this._commandTitle ?? this.action.label)
				.map(element => {
					if (typeof element === 'string') {
						const span = document.createElement('span');
						span.textContent = element;
						return span;
					}
					return element;
				});

			reset(this.label, ...elements);
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
	return `${provider.providerId}:${provider.label}${provider.rootUri ? `:${provider.rootUri.toString()}` : ''}`;
}

export function getRepositoryResourceCount(provider: ISCMProvider): number {
	return provider.groups.reduce<number>((r, g) => r + g.resources.length, 0);
}

export function getHistoryItemEditorTitle(historyItem: ISCMHistoryItem): string {
	return `${historyItem.displayId ?? historyItem.id} - ${historyItem.subject}`;
}

export function getSCMRepositoryIcon(
	activeRepository: { repository: ISCMRepository; pinned: boolean } | undefined,
	repository: ISCMRepository
): ThemeIcon {
	if (!ThemeIcon.isThemeIcon(repository.provider.iconPath)) {
		return Codicon.repo;
	}

	if (
		activeRepository?.pinned === true &&
		activeRepository?.repository.id === repository.id &&
		repository.provider.iconPath.id === Codicon.repo.id
	) {
		return Codicon.repoPinned;
	}

	return repository.provider.iconPath;
}

export function getStatusBarCommandGenericName(command: Command): string | undefined {
	let genericName: string | undefined = undefined;

	// Get a generic name for the status bar action, derive this from the first
	// command argument which is in the form of "<extension>.<command>/<number>"
	if (typeof command.arguments?.[0] === 'string') {
		const lastIndex = command.arguments[0].lastIndexOf('/');

		genericName = lastIndex !== -1
			? command.arguments[0].substring(0, lastIndex)
			: command.arguments[0];

		genericName = genericName
			.replace(/^(?:git\.|remoteHub\.)/, '')
			.trim();

		if (genericName.length === 0) {
			return undefined;
		}

		// Capitalize first letter
		genericName = genericName[0].toLocaleUpperCase() + genericName.slice(1);
	}

	return genericName;
}
