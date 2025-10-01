/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import * as platform from '../../../../base/common/platform.js';
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
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IManagedHoverTooltipMarkdownString } from '../../../../base/browser/ui/hover/hover.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { fromNow, safeIntl } from '../../../../base/common/date.js';
import { historyItemHoverAdditionsForeground, historyItemHoverDefaultLabelBackground, historyItemHoverDefaultLabelForeground, historyItemHoverDeletionsForeground, historyItemHoverLabelForeground } from './scmHistory.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';

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

export function isSCMHistoryItemChangeViewModelTreeElement(element: any): element is SCMHistoryItemChangeViewModelTreeElement {
	return (element as SCMHistoryItemChangeViewModelTreeElement).type === 'historyItemChangeViewModel';
}

export function isSCMHistoryItemChangeNode(element: any): element is IResourceNode<ISCMHistoryItem, SCMHistoryItemChangeViewModelTreeElement> {
	return ResourceTree.isResourceNode(element) && isSCMHistoryItemViewModelTreeElement(element.context);
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
	return `${provider.providerId}:${provider.label}${provider.rootUri ? `:${provider.rootUri.toString()}` : ''}`;
}

export function getRepositoryResourceCount(provider: ISCMProvider): number {
	return provider.groups.reduce<number>((r, g) => r + g.resources.length, 0);
}

export function getHistoryItemEditorTitle(historyItem: ISCMHistoryItem): string {
	return `${historyItem.displayId ?? historyItem.id} - ${historyItem.subject}`;
}

export function getHistoryItemHoverContent(themeService: IThemeService, historyItem: ISCMHistoryItem): IManagedHoverTooltipMarkdownString {
	const colorTheme = themeService.getColorTheme();
	const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });

	if (historyItem.author) {
		const icon = URI.isUri(historyItem.authorIcon)
			? `![${historyItem.author}](${historyItem.authorIcon.toString()}|width=20,height=20)`
			: ThemeIcon.isThemeIcon(historyItem.authorIcon)
				? `$(${historyItem.authorIcon.id})`
				: '$(account)';

		if (historyItem.authorEmail) {
			const emailTitle = localize('emailLinkTitle', "Email");
			markdown.appendMarkdown(`${icon} [**${historyItem.author}**](mailto:${historyItem.authorEmail} "${emailTitle} ${historyItem.author}")`);
		} else {
			markdown.appendMarkdown(`${icon} **${historyItem.author}**`);
		}

		if (historyItem.timestamp) {
			const dateFormatter = safeIntl.DateTimeFormat(platform.language, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' }).value;
			markdown.appendMarkdown(`, $(history) ${fromNow(historyItem.timestamp, true, true)} (${dateFormatter.format(historyItem.timestamp)})`);
		}

		markdown.appendMarkdown('\n\n');
	}

	markdown.appendMarkdown(`${historyItem.message.replace(/\r\n|\r|\n/g, '\n\n')}\n\n`);

	if (historyItem.statistics) {
		markdown.appendMarkdown(`---\n\n`);

		markdown.appendMarkdown(`<span>${historyItem.statistics.files === 1 ?
			localize('fileChanged', "{0} file changed", historyItem.statistics.files) :
			localize('filesChanged', "{0} files changed", historyItem.statistics.files)}</span>`);

		if (historyItem.statistics.insertions) {
			const additionsForegroundColor = colorTheme.getColor(historyItemHoverAdditionsForeground);
			markdown.appendMarkdown(`,&nbsp;<span style="color:${additionsForegroundColor};">${historyItem.statistics.insertions === 1 ?
				localize('insertion', "{0} insertion{1}", historyItem.statistics.insertions, '(+)') :
				localize('insertions', "{0} insertions{1}", historyItem.statistics.insertions, '(+)')}</span>`);
		}

		if (historyItem.statistics.deletions) {
			const deletionsForegroundColor = colorTheme.getColor(historyItemHoverDeletionsForeground);
			markdown.appendMarkdown(`,&nbsp;<span style="color:${deletionsForegroundColor};">${historyItem.statistics.deletions === 1 ?
				localize('deletion', "{0} deletion{1}", historyItem.statistics.deletions, '(-)') :
				localize('deletions', "{0} deletions{1}", historyItem.statistics.deletions, '(-)')}</span>`);
		}
	}

	if ((historyItem.references ?? []).length > 0) {
		markdown.appendMarkdown(`\n\n---\n\n`);
		markdown.appendMarkdown((historyItem.references ?? []).map(ref => {
			const labelIconId = ThemeIcon.isThemeIcon(ref.icon) ? ref.icon.id : '';

			const labelBackgroundColor = ref.color ? asCssVariable(ref.color) : asCssVariable(historyItemHoverDefaultLabelBackground);
			const labelForegroundColor = ref.color ? asCssVariable(historyItemHoverLabelForeground) : asCssVariable(historyItemHoverDefaultLabelForeground);

			return `<span style="color:${labelForegroundColor};background-color:${labelBackgroundColor};border-radius:10px;">&nbsp;$(${labelIconId})&nbsp;${ref.name}&nbsp;&nbsp;</span>`;
		}).join('&nbsp;&nbsp;'));
	}

	return { markdown, markdownNotSupportedFallback: historyItem.message };
}
