/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { Action } from '../../../../base/common/actions.js';
import { createActionViewItem, getActionBarActions, getContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { equals } from '../../../../base/common/arrays.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { reset } from '../../../../base/browser/dom.js';
import { ResourceTree } from '../../../../base/common/resourceTree.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
export function isSCMViewService(element) {
    return Array.isArray(element.repositories) && Array.isArray(element.visibleRepositories);
}
export function isSCMRepository(element) {
    return !!element.provider && !!element.input;
}
export function isSCMInput(element) {
    return !!element.validateInput && typeof element.value === 'string';
}
export function isSCMActionButton(element) {
    return element.type === 'actionButton';
}
export function isSCMResourceGroup(element) {
    return !!element.provider && !!element.resources;
}
export function isSCMResource(element) {
    return !!element.sourceUri && isSCMResourceGroup(element.resourceGroup);
}
export function isSCMResourceNode(element) {
    return ResourceTree.isResourceNode(element) && isSCMResourceGroup(element.context);
}
export function isSCMHistoryItemViewModelTreeElement(element) {
    return element.type === 'historyItemViewModel';
}
export function isSCMHistoryItemLoadMoreTreeElement(element) {
    return element.type === 'historyItemLoadMore';
}
export function isSCMHistoryItemChangeViewModelTreeElement(element) {
    return element.type === 'historyItemChangeViewModel';
}
export function isSCMHistoryItemChangeNode(element) {
    return ResourceTree.isResourceNode(element) && isSCMHistoryItemViewModelTreeElement(element.context);
}
export function isSCMArtifactGroupTreeElement(element) {
    return element.type === 'artifactGroup';
}
export function isSCMArtifactNode(element) {
    return ResourceTree.isResourceNode(element) && isSCMArtifactGroupTreeElement(element.context);
}
export function isSCMArtifactTreeElement(element) {
    return element.type === 'artifact';
}
const compareActions = (a, b) => {
    if (a instanceof MenuItemAction && b instanceof MenuItemAction) {
        return a.id === b.id && a.enabled === b.enabled && a.hideActions?.isHidden === b.hideActions?.isHidden;
    }
    return a.id === b.id && a.enabled === b.enabled;
};
export function connectPrimaryMenu(menu, callback, primaryGroup, arg) {
    let cachedPrimary = [];
    let cachedSecondary = [];
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
export function collectContextMenuActions(menu, arg) {
    return getContextMenuActions(menu.getActions({ arg, shouldForwardArgs: true }), 'inline').secondary;
}
export class StatusBarAction extends Action {
    constructor(command, commandService) {
        super(`statusbaraction{${command.id}}`, getStatusBarCommandGenericName(command), '', true);
        this.command = command;
        this.commandService = commandService;
        this.commandTitle = command.title;
        this.tooltip = command.tooltip || '';
    }
    run() {
        return this.commandService.executeCommand(this.command.id, ...(this.command.arguments || []));
    }
}
class StatusBarActionViewItem extends ActionViewItem {
    constructor(action, options) {
        super(null, action, { ...options, icon: false, label: true });
        this._commandTitle = action.commandTitle;
    }
    render(container) {
        container.classList.add('scm-status-bar-action');
        super.render(container);
    }
    updateLabel() {
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
export function getActionViewItemProvider(instaService) {
    return (action, options) => {
        if (action instanceof StatusBarAction) {
            return new StatusBarActionViewItem(action, options);
        }
        return createActionViewItem(instaService, action, options);
    };
}
export function getProviderKey(provider) {
    return `${provider.providerId}:${provider.label}${provider.rootUri ? `:${provider.rootUri.toString()}` : ''}`;
}
export function getRepositoryResourceCount(provider) {
    return provider.groups.reduce((r, g) => r + g.resources.length, 0);
}
export function getHistoryItemEditorTitle(historyItem) {
    return `${historyItem.displayId ?? historyItem.id} - ${historyItem.subject}`;
}
export function getSCMRepositoryIcon(activeRepository, repository) {
    if (!ThemeIcon.isThemeIcon(repository.provider.iconPath)) {
        return Codicon.repo;
    }
    if (activeRepository?.pinned === true &&
        activeRepository?.repository.id === repository.id &&
        repository.provider.iconPath.id === Codicon.repo.id) {
        return Codicon.repoPinned;
    }
    return repository.provider.iconPath;
}
export function getStatusBarCommandGenericName(command) {
    let genericName = undefined;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NjbS9icm93c2VyL3V0aWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFTLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBR3ZGLE9BQU8sRUFBRSxNQUFNLEVBQVcsTUFBTSxvQ0FBb0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsbUJBQW1CLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUNuSixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDM0QsT0FBTyxFQUFFLGNBQWMsRUFBOEIsTUFBTSwwREFBMEQsQ0FBQztBQUN0SCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUczRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFeEQsT0FBTyxFQUFpQixZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRzlELE1BQU0sVUFBVSxnQkFBZ0IsQ0FBQyxPQUFnQjtJQUNoRCxPQUFPLEtBQUssQ0FBQyxPQUFPLENBQUUsT0FBMkIsQ0FBQyxZQUFZLENBQUMsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFFLE9BQTJCLENBQUMsbUJBQW1CLENBQUMsQ0FBQztBQUNwSSxDQUFDO0FBRUQsTUFBTSxVQUFVLGVBQWUsQ0FBQyxPQUFnQjtJQUMvQyxPQUFPLENBQUMsQ0FBRSxPQUEwQixDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUUsT0FBMEIsQ0FBQyxLQUFLLENBQUM7QUFDdEYsQ0FB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