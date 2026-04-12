/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IAgentPluginRepositoryService } from '../../common/plugins/agentPluginRepositoryService.js';
import { IPluginInstallService } from '../../common/plugins/pluginInstallService.js';
import { parseMarketplaceReference, parseMarketplaceReferences } from '../../common/plugins/pluginMarketplaceService.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { InstalledAgentPluginsViewId } from '../agentPluginsView.js';
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from './chatActions.js';
export class ManagePluginsAction extends Action2 {
    static { this.ID = 'workbench.action.chat.managePlugins'; }
    constructor() {
        super({
            id: ManagePluginsAction.ID,
            title: localize2('plugins', 'Plugins'),
            category: CHAT_CATEGORY,
            precondition: ChatContextKeys.enabled,
            menu: [{
                    id: CHAT_CONFIG_MENU_ID,
                    group: '2_plugins',
                }],
            f1: true
        });
    }
    async run(accessor) {
        accessor.get(IExtensionsWorkbenchService).openSearch('@agentPlugins ');
    }
}
class InstallFromSourceAction extends Action2 {
    static { this.ID = 'workbench.action.chat.installPluginFromSource'; }
    constructor() {
        super({
            id: InstallFromSourceAction.ID,
            title: localize2('installPluginFromSource', 'Install Plugin from Source'),
            category: CHAT_CATEGORY,
            icon: Codicon.add,
            precondition: ChatContextKeys.enabled,
            f1: true,
            menu: [{
                    id: MenuId.ViewTitle,
                    when: ContextKeyExpr.and(ContextKeyExpr.equals('view', InstalledAgentPluginsViewId), ChatContextKeys.Setup.hidden.negate()),
                    group: 'navigation',
                    order: 1,
                }],
        });
    }
    async run(accessor) {
        const quickInputService = accessor.get(IQuickInputService);
        const pluginInstallService = accessor.get(IPluginInstallService);
        const store = new DisposableStore();
        const inputBox = store.add(quickInputService.createInputBox());
        inputBox.placeholder = localize('pluginSourcePlaceholder', "owner/repo or git clone URL");
        inputBox.prompt = localize('pluginSourcePrompt', "Enter a GitHub repository or git URL to install a plugin from");
        inputBox.show();
        store.add(inputBox.onDidChangeValue(() => {
            inputBox.validationMessage = undefined;
        }));
        store.add(inputBox.onDidHide(() => {
            store.dispose();
        }));
        store.add(inputBox.onDidAccept(async () => {
            const source = inputBox.value.trim();
            if (!source) {
                return;
            }
            // Quick format validation keeps the input box open for correction.
            const validationError = pluginInstallService.validatePluginSource(source);
            if (validationError) {
                inputBox.validationMessage = validationError;
                return;
            }
            // Show busy state and prevent concurrent installs.
            inputBox.busy = true;
            inputBox.enabled = false;
            try {
                // Hide the input box so it doesn't conflict with trust/progress dialogs.
                inputBox.hide();
                const result = await pluginInstallService.installPluginFromValidatedSource(source);
                if (!result.success) {
                    if (result.message) {
                        // Re-open with the error so the user can correct their input.
                        inputBox.validationMessage = result.message;
                    }
                    inputBox.show();
                }
                else {
                    const ref = parseMarketplaceReference(source);
                    if (ref) {
                        accessor.get(IExtensionsWorkbenchService).openSearch(`@agentPlugins ${ref.displayLabel}`);
                    }
                }
            }
            finally {
                inputBox.busy = false;
                inputBox.enabled = true;
            }
        }));
    }
}
class ManagePluginMarketplacesAction extends Action2 {
    static { this.ID = 'workbench.action.chat.managePluginMarketplaces'; }
    constructor() {
        super({
            id: ManagePluginMarketplacesAction.ID,
            title: localize2('managePluginMarketplaces', 'Manage Plugin Marketplaces'),
            icon: Codicon.globe,
            category: CHAT_CATEGORY,
            precondition: ChatContextKeys.enabled,
            f1: true,
            menu: [{
                    id: MenuId.ViewTitle,
                    when: ContextKeyExpr.and(ContextKeyExpr.equals('view', InstalledAgentPluginsViewId), ChatContextKeys.Setup.hidden.negate()),
                    group: 'navigation',
                    order: 2,
                }],
        });
    }
    async run(accessor) {
        const quickInputService = accessor.get(IQuickInputService);
        const configurationService = accessor.get(IConfigurationService);
        const pluginRepositoryService = accessor.get(IAgentPluginRepositoryService);
        const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const commandService = accessor.get(ICommandService);
        const fileService = accessor.get(IFileService);
        const configuredRefs = configurationService.getValue(ChatConfiguration.PluginMarketplaces) ?? [];
        const refs = parseMarketplaceReferences(configuredRefs);
        if (refs.length === 0) {
            quickInputService.pick([], { placeHolder: localize('noMarketplaces', "No plugin marketplaces configured") });
            return;
        }
        // Step 1: pick a marketplace
        const items = refs.map(ref => ({
            label: ref.displayLabel,
            description: ref.kind === "localFileUri" /* MarketplaceReferenceKind.LocalFileUri */
                ? localize('localMarketplace', "Local")
                : ref.cloneUrl,
            reference: ref,
        }));
        const selected = await quickInputService.pick(items, {
            placeHolder: localize('selectMarketplace', "Select a plugin marketplace"),
        });
        if (!selected) {
            return;
        }
        const ref = selected.reference;
        // Step 2: pick an action for the selected marketplace
        const actionItems = [
            { id: 'showPlugins', label: localize('showPlugins', "Show Plugins") },
        ];
        // "Open Folder" only for cloned/local repos
        const repoUri = pluginRepositoryService.getRepositoryUri(ref);
        const repoExists = await fileService.exists(repoUri);
        if (repoExists) {
            actionItems.push({ id: 'openDirectory', label: localize('openMarketplaceDirectory', "Open Folder") });
        }
        actionItems.push({ id: 'removeMarketplace', label: localize('removeMarketplace', "Remove Marketplace") });
        const action = await quickInputService.pick(actionItems, {
            placeHolder: localize('selectMarketplaceAction', "Select an action for '{0}'", ref.displayLabel),
        });
        if (!action) {
            return;
        }
        switch (action.id) {
            case 'showPlugins':
                extensionsWorkbenchService.openSearch(`@agentPlugins ${ref.displayLabel}`);
                break;
            case 'openDirectory':
                await commandService.executeCommand('revealFileInOS', repoUri);
                break;
            case 'removeMarketplace': {
                const currentValues = configurationService.getValue(ChatConfiguration.PluginMarketplaces) ?? [];
                const updated = currentValues.filter(v => typeof v === 'string' && v.trim() !== ref.rawValue);
                await configurationService.updateValue(ChatConfiguration.PluginMarketplaces, updated);
                break;
            }
        }
    }
}
export function registerChatPluginActions() {
    registerAction2(ManagePluginsAction);
    registerAction2(InstallFromSourceAction);
    registerAction2(ManagePluginMarketplacesAction);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFBsdWdpbkFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWN0aW9ucy9jaGF0UGx1Z2luQWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDckcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFN0UsT0FBTyxFQUFFLGtCQUFrQixFQUFrQixNQUFNLHlEQUF5RCxDQUFDO0FBQzdHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUM5RCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNyRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNyRixPQUFPLEVBQXdELHlCQUF5QixFQUFFLDBCQUEwQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDL0ssT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1B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