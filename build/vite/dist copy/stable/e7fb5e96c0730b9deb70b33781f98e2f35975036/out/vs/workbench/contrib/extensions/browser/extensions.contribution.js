/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { mnemonicButtonLabel } from '../../../../base/common/labels.js';
import { Disposable, DisposableStore, isDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isNative, isWeb } from '../../../../base/common/platform.js';
import { PolicyCategory } from '../../../../base/common/policy.js';
import { URI } from '../../../../base/common/uri.js';
import { CopyAction, CutAction, PasteAction } from '../../../../editor/contrib/clipboard/browser/clipboard.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ExtensionGalleryServiceUrlConfigKey, getExtensionGalleryManifestResourceUri, IExtensionGalleryManifestService } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { EXTENSION_INSTALL_SOURCE_CONTEXT, ExtensionRequestsTimeoutConfigKey, ExtensionsLocalizedLabel, IExtensionGalleryService, IExtensionManagementService, PreferencesLocalizedLabel, VerifyExtensionSignatureConfigKey } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { areSameExtensions, getIdAndVersion } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { ExtensionStorageService } from '../../../../platform/extensionManagement/common/extensionStorage.js';
import { IExtensionRecommendationNotificationService } from '../../../../platform/extensionRecommendations/common/extensionRecommendations.js';
import { EXTENSION_CATEGORIES } from '../../../../platform/extensions/common/extensions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import * as jsonContributionRegistry from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import product from '../../../../platform/product/common/product.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Extensions } from '../../../../platform/quickinput/common/quickAccess.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { EditorPaneDescriptor } from '../../../browser/editor.js';
import { Extensions as ConfigurationMigrationExtensions } from '../../../common/configuration.js';
import { IsSessionsWindowContext, ResourceContextKey, WorkbenchStateContext } from '../../../common/contextkeys.js';
import { registerWorkbenchContribution2, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { EditorExtensions } from '../../../common/editor.js';
import { Extensions as ViewContainerExtensions } from '../../../common/views.js';
import { DEFAULT_ACCOUNT_SIGN_IN_COMMAND } from '../../../services/accounts/browser/defaultAccount.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionManagementServerService, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionIgnoredRecommendationsService, IExtensionRecommendationsService } from '../../../services/extensionRecommendations/common/extensionRecommendations.js';
import { IWorkspaceExtensionsConfigService } from '../../../services/extensionRecommendations/common/workspaceExtensionsConfig.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { CONTEXT_SYNC_ENABLEMENT } from '../../../services/userDataSync/common/userDataSync.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { WORKSPACE_TRUST_EXTENSION_SUPPORT } from '../../../services/workspaces/common/workspaceTrust.js';
import { IPluginInstallService } from '../../chat/common/plugins/pluginInstallService.js';
import { ILanguageModelToolsService } from '../../chat/common/tools/languageModelToolsService.js';
import { CONTEXT_KEYBINDINGS_EDITOR } from '../../preferences/common/preferences.js';
import { Query } from '../common/extensionQuery.js';
import { AutoRestartConfigurationKey, AutoUpdateConfigurationKey, CONTEXT_EXTENSIONS_GALLERY_STATUS, CONTEXT_HAS_GALLERY, DefaultViewsContext, EXTENSIONS_CATEGORY, extensionsFilterSubMenu, extensionsSearchActionsMenu, HasOutdatedExtensionsContext, IExtensionsWorkbenchService, INSTALL_ACTIONS_GROUP, INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID, LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID, OUTDATED_EXTENSIONS_VIEW_ID, SELECT_INSTALL_VSIX_EXTENSION_COMMAND_ID, THEME_ACTIONS_GROUP, TOGGLE_IGNORE_EXTENSION_ACTION_ID, UPDATE_ACTIONS_GROUP, VIEWLET_ID, WORKSPACE_RECOMMENDATIONS_VIEW_ID } from '../common/extensions.js';
import { ExtensionsConfigurationSchema, ExtensionsConfigurationSchemaId } from '../common/extensionsFileTemplate.js';
import { ExtensionsInput } from '../common/extensionsInput.js';
import { KeymapExtensions } from '../common/extensionsUtils.js';
import { SearchExtensionsTool, SearchExtensionsToolData } from '../common/searchExtensionsTool.js';
import { ShowRuntimeExtensionsAction } from './abstractRuntimeExtensionsEditor.js';
import { ExtensionEditor } from './extensionEditor.js';
import { ExtensionEnablementWorkspaceTrustTransitionParticipant } from './extensionEnablementWorkspaceTrustTransitionParticipant.js';
import { ExtensionRecommendationNotificationService } from './extensionRecommendationNotificationService.js';
import { ExtensionRecommendationsService } from './extensionRecommendationsService.js';
import { ClearLanguageAction, ConfigureWorkspaceFolderRecommendedExtensionsAction, ConfigureWorkspaceRecommendedExtensionsAction, InstallAction, InstallAnotherVersionAction, InstallSpecificVersionOfExtensionAction, SetColorThemeAction, SetFileIconThemeAction, SetProductIconThemeAction, ToggleAutoUpdateForExtensionAction, ToggleAutoUpdatesForPublisherAction, TogglePreReleaseExtensionAction } from './extensionsActions.js';
import { ExtensionActivationProgress } from './extensionsActivationProgress.js';
import { ExtensionsCompletionItemsProvider } from './extensionsCompletionItemsProvider.js';
import { ExtensionDependencyChecker } from './extensionsDependencyChecker.js';
import { clearSearchResultsIcon, configureRecommendedIcon, extensionsViewIcon, filterIcon, installWorkspaceRecommendedIcon, refreshIcon } from './extensionsIcons.js';
import { InstallExtensionQuickAccessProvider, ManageExtensionsQuickAccessProvider } from './extensionsQuickAccess.js';
import { BuiltInExtensionsContext, ExtensionMarketplaceStatusUpdater, ExtensionsSearchValueContext, ExtensionsSortByContext, ExtensionsViewletViewsContribution, ExtensionsViewPaneContainer, MaliciousExtensionChecker, RecommendedExtensionsContext, SearchHasTextContext, SearchMarketplaceExtensionsContext, StatusUpdater } from './extensionsViewlet.js';
import { ExtensionsWorkbenchService } from './extensionsWorkbenchService.js';
import './media/extensionManagement.css';
import { UnsupportedExtensionsMigrationContrib } from './unsupportedExtensionsMigrationContribution.js';
// Singletons
registerSingleton(IExtensionsWorkbenchService, ExtensionsWorkbenchService, 0 /* InstantiationType.Eager */);
registerSingleton(IExtensionRecommendationNotificationService, ExtensionRecommendationNotificationService, 1 /* InstantiationType.Delayed */);
registerSingleton(IExtensionRecommendationsService, ExtensionRecommendationsService, 0 /* InstantiationType.Eager */);
// Quick Access
Registry.as(Extensions.Quickaccess).registerQuickAccessProvider({
    ctor: ManageExtensionsQuickAccessProvider,
    prefix: ManageExtensionsQuickAccessProvider.PREFIX,
    placeholder: localize('manageExtensionsQuickAccessPlaceholder', "Press Enter to manage extensions."),
    helpEntries: [{ description: localize('manageExtensionsHelp', "Manage Extensions") }]
});
// Editor
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(ExtensionEditor, ExtensionEditor.ID, localize('extension', "Extension")), [
    new SyncDescriptor(ExtensionsInput)
]);
export const VIEW_CONTAINER = Registry.as(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
    id: VIEWLET_ID,
    title: localize2('extensions', "Extensions"),
    openCommandActionDescriptor: {
        id: VIEWLET_ID,
        mnemonicTitle: localize({ key: 'miViewExtensions', comment: ['&& denotes a mnemonic'] }, "E&&xtensions"),
        keybindings: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 54 /* KeyCode.KeyX */ },
        order: 4,
    },
    ctorDescriptor: new SyncDescriptor(ExtensionsViewPaneContainer),
    icon: extensionsViewIcon,
    order: 4,
    rejectAddedViews: true,
    alwaysUseContainerInfo: true,
}, 0 /* ViewContainerLocation.Sidebar */);
Registry.as(ConfigurationExtensions.Configuration)
    .registerConfiguration({
    id: 'extensions',
    order: 30,
    title: localize('extensionsConfigurationTitle', "Extensions"),
    type: 'object',
    properties: {
        'extensions.autoUpdate': {
            enum: [true, 'onlyEnabledExtensions', false,],
            enumItemLabels: [
                localize('all', "All Extensions"),
                localize('enabled', "Only Enabled Extensions"),
                localize('none', "None"),
            ],
            enumDescriptions: [
                localize('extensions.autoUpdate.true', 'Download and install updates automatically for all extensions.'),
                localize('extensions.autoUpdate.enabled', 'Download and install updates automatically only for enabled extensions.'),
                localize('extensions.autoUpdate.false', 'Extensions are not automatically updated.'),
            ],
            description: localize('extensions.autoUpdate', "Controls the automatic update behavior of extensions. The updates are fetched from a Microsoft online service."),
            default: true,
            scope: 1 /* ConfigurationScope.APPLICATION */,
            tags: ['usesOnlineServices']
        },
        'extensions.autoCheckUpdates': {
            type: 'boolean',
            description: localize('extensionsCheckUpdates', "When enabled, automatically checks extensions for updates. If an extension has an update, it is marked as outdated in the Extensions view. The updates are fetched from a Microsoft online service."),
            default: true,
            scope: 1 /* ConfigurationScope.APPLICATION */,
            tags: ['usesOnlineServices']
        },
        'extensions.ignoreRecommendations': {
            type: 'boolean',
            description: localize('extensionsIgnoreRecommendations', "When enabled, the notifications for extension recommendations will not be shown."),
            default: false
        },
        'extensions.showRecommendationsOnlyOnDemand': {
            type: 'boolean',
            deprecationMessage: localize('extensionsShowRecommendationsOnlyOnDemand_Deprecated', "This setting is deprecated. Use extensions.ignoreRecommendations setting to control recommendation notifications. Use Extensions view's visibility actions to hide Recommended view by default."),
            default: false,
            tags: ['usesOnlineServices']
        },
        'extensions.closeExtensionDetailsOnViewChange': {
            type: 'boolean',
            description: localize('extensionsCloseExtensionDetailsOnViewChange', "When enabled, editors with extension details will be automatically closed upon navigating away from the Extensions View."),
            default: false
        },
        'extensions.confirmedUriHandlerExtensionIds': {
            type: 'array',
            items: {
                type: 'string'
            },
            description: localize('handleUriConfirmedExtensions', "When an extension is listed here, a confirmation prompt will not be shown when that extension handles a URI."),
            default: [],
            scope: 1 /* ConfigurationScope.APPLICATION */
        },
        'extensions.webWorker': {
            type: ['boolean', 'string'],
            enum: [true, false, 'auto'],
            enumDescriptions: [
                localize('extensionsWebWorker.true', "The Web Worker Extension Host will always be launched."),
                localize('extensionsWebWorker.false', "The Web Worker Extension Host will never be launched."),
                localize('extensionsWebWorker.auto', "The Web Worker Extension Host will be launched when a web extension needs it."),
            ],
            description: localize('extensionsWebWorker', "Enable web worker extension host."),
            default: 'auto'
        },
        'extensions.supportVirtualWorkspaces': {
            type: 'object',
            markdownDescription: localize('extensions.supportVirtualWorkspaces', "Override the virtual workspaces support of an extension."),
            patternProperties: {
                '([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$': {
                    type: 'boolean',
                    default: false
                }
            },
            additionalProperties: false,
            default: {},
            defaultSnippets: [{
                    'body': {
                        'pub.name': false
                    }
                }]
        },
        'extensions.experimental.affinity': {
            type: 'object',
            markdownDescription: localize('extensions.affinity', "Configure an extension to execute in a different extension host process."),
            patternProperties: {
                '([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$': {
                    type: 'integer',
                    default: 1
                }
            },
            additionalProperties: false,
            default: {},
            defaultSnippets: [{
                    'body': {
                        'pub.name': 1
                    }
                }]
        },
        [WORKSPACE_TRUST_EXTENSION_SUPPORT]: {
            type: 'object',
            scope: 1 /* ConfigurationScope.APPLICATION */,
            markdownDescription: localize('extensions.supportUntrustedWorkspaces', "Override the untrusted workspace support of an extension. Extensions using `true` will always be enabled. Extensions using `limited` will always be enabled, and the extension will hide functionality that requires trust. Extensions using `false` will only be enabled only when the workspace is trusted."),
            patternProperties: {
                '([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$': {
                    type: 'object',
                    properties: {
                        'supported': {
                            type: ['boolean', 'string'],
                            enum: [true, false, 'limited'],
                            enumDescriptions: [
                                localize('extensions.supportUntrustedWorkspaces.true', "Extension will always be enabled."),
                                localize('extensions.supportUntrustedWorkspaces.false', "Extension will only be enabled only when the workspace is trusted."),
                                localize('extensions.supportUntrustedWorkspaces.limited', "Extension will always be enabled, and the extension will hide functionality requiring trust."),
                            ],
                            description: localize('extensions.supportUntrustedWorkspaces.supported', "Defines the untrusted workspace support setting for the extension."),
                        },
                        'version': {
                            type: 'string',
                            description: localize('extensions.supportUntrustedWorkspaces.version', "Defines the version of the extension for which the override should be applied. If not specified, the override will be applied independent of the extension version."),
                        }
                    }
                }
            }
        },
        'extensions.experimental.deferredStartupFinishedActivation': {
            type: 'boolean',
            description: localize('extensionsDeferredStartupFinishedActivation', "When enabled, extensions which declare the `onStartupFinished` activation event will be activated after a timeout."),
            default: false
        },
        'extensions.experimental.issueQuickAccess': {
            type: 'boolean',
            description: localize('extensionsInQuickAccess', "When enabled, extensions can be searched for via Quick Access and report issues from there."),
            default: true
        },
        'extensions.allowOpenInModalEditor': {
            type: 'boolean',
            description: localize('extensions.allowOpenInModalEditor', "Controls whether extensions and MCP servers open in a modal editor overlay."),
            default: false, // TODO@bpasero figure out the default for stable and retire this setting
            tags: ['experimental'],
            experiment: {
                mode: 'auto'
            }
        },
        [VerifyExtensionSignatureConfigKey]: {
            type: 'boolean',
            description: localize('extensions.verifySignature', "When enabled, extensions are verified to be signed before getting installed."),
            default: true,
            scope: 1 /* ConfigurationScope.APPLICATION */,
            included: isNative
        },
        [AutoRestartConfigurationKey]: {
            type: 'boolean',
            description: localize('autoRestart', "If activated, extensions will automatically restart following an update if the window is not in focus. There can be a data loss if you have open Notebooks or Custom Editors."),
            default: false,
            included: product.quality !== 'stable'
        },
        [ExtensionGalleryServiceUrlConfigKey]: {
            type: 'string',
            description: localize('extensions.gallery.serviceUrl', "Configure the Marketplace service URL to connect to"),
            default: '',
            scope: 1 /* ConfigurationScope.APPLICATION */,
            tags: ['usesOnlineServices'],
            included: false,
            policy: {
                name: 'ExtensionGalleryServiceUrl',
                category: PolicyCategory.Extensions,
                minimumVersion: '1.99',
                localization: {
                    description: {
                        key: 'extensions.gallery.serviceUrl',
                        value: localize('extensions.gallery.serviceUrl', "Configure the Marketplace service URL to connect to"),
                    }
                }
            },
        },
        'extensions.supportNodeGlobalNavigator': {
            type: 'boolean',
            description: localize('extensionsSupportNodeGlobalNavigator', "When enabled, Node.js navigator object is exposed on the global scope."),
            default: false,
        },
        [ExtensionRequestsTimeoutConfigKey]: {
            type: 'number',
            description: localize('extensionsRequestTimeout', "Controls the timeout in milliseconds for HTTP requests made when fetching extensions from the Marketplace"),
            default: 60_000,
            scope: 1 /* ConfigurationScope.APPLICATION */,
            tags: ['advanced', 'usesOnlineServices']
        },
    }
});
const jsonRegistry = Registry.as(jsonContributionRegistry.Extensions.JSONContribution);
jsonRegistry.registerSchema(ExtensionsConfigurationSchemaId, ExtensionsConfigurationSchema);
// Register Commands
CommandsRegistry.registerCommand('_extensions.manage', (accessor, extensionId, tab, preserveFocus, feature) => {
    const extensionService = accessor.get(IExtensionsWorkbenchService);
    const extension = extensionService.local.find(e => areSameExtensions(e.identifier, { id: extensionId }));
    if (extension) {
        extensionService.open(extension, { tab, preserveFocus, feature });
    }
    else {
        throw new Error(localize('notFound', "Extension '{0}' not found.", extensionId));
    }
});
CommandsRegistry.registerCommand('extension.open', async (accessor, extensionId, tab, preserveFocus, feature, sideByside) => {
    const extensionService = accessor.get(IExtensionsWorkbenchService);
    const commandService = accessor.get(ICommandService);
    const [extension] = await extensionService.getExtensions([{ id: extensionId }], CancellationToken.None);
    if (extension) {
        return extensionService.open(extension, { tab, preserveFocus, feature, sideByside });
    }
    return commandService.executeCommand('_extensions.manage', extensionId, tab, preserveFocus, feature);
});
CommandsRegistry.registerCommand({
    id: 'workbench.extensions.installExtension',
    metadata: {
        description: localize('workbench.extensions.installExtension.description', "Install the given extension"),
        args: [
            {
                name: 'extensionIdOrVSIXUri',
                description: localize('workbench.extensions.installExtension.arg.decription', "Extension id or VSIX resource uri"),
                constraint: (value) => typeof value === 'string' || value instanceof URI,
            },
            {
                name: 'options',
                description: '(optional) Options for installing the extension. Object with the following properties: ' +
                    '`installOnlyNewlyAddedFromExtensionPackVSIX`: When enabled, VS Code installs only newly added extensions from the extension pack VSIX. This option is considered only when installing VSIX. ',
                isOptional: true,
                schema: {
                    'type': 'object',
                    'properties': {
                        'installOnlyNewlyAddedFromExtensionPackVSIX': {
                            'type': 'boolean',
                            'description': localize('workbench.extensions.installExtension.option.installOnlyNewlyAddedFromExtensionPackVSIX', "When enabled, VS Code installs only newly added extensions from the extension pack VSIX. This option is considered only while installing a VSIX."),
                            default: false
                        },
                        'installPreReleaseVersion': {
                            'type': 'boolean',
                            'description': localize('workbench.extensions.installExtension.option.installPreReleaseVersion', "When enabled, VS Code installs the pre-release version of the extension if available."),
                            default: false
                        },
                        'donotSync': {
                            'type': 'boolean',
                            'description': localize('workbench.extensions.installExtension.option.donotSync', "When enabled, VS Code do not sync this extension when Settings Sync is on."),
                            default: false
                        },
                        'justification': {
                            'type': ['string', 'object'],
                            'description': localize('workbench.extensions.installExtension.option.justification', "Justification for installing the extension. This is a string or an object that can be used to pass any information to the installation handlers. i.e. `{reason: 'This extension wants to open a URI', action: 'Open URI'}` will show a message box with the reason and action upon install."),
                        },
                        'enable': {
                            'type': 'boolean',
                            'description': localize('workbench.extensions.installExtension.option.enable', "When enabled, the extension will be enabled if it is installed but disabled. If the extension is already enabled, this has no effect."),
                            default: false
                        },
                        'context': {
                            'type': 'object',
                            'description': localize('workbench.extensions.installExtension.option.context', "Context for the installation. This is a JSON object that can be used to pass any information to the installation handlers. i.e. `{skipWalkthrough: true}` will skip opening the walkthrough upon install."),
                        }
                    }
                }
            }
        ]
    },
    handler: async (accessor, arg, options) => {
        const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const extensionManagementService = accessor.get(IWorkbenchExtensionManagementService);
        const extensionGalleryService = accessor.get(IExtensionGalleryService);
        try {
            if (typeof arg === 'string') {
                const [id, version] = getIdAndVersion(arg);
                const extension = extensionsWorkbenchService.local.find(e => areSameExtensions(e.identifier, { id, uuid: version }));
                if (extension?.enablementState === 1 /* EnablementState.DisabledByExtensionKind */) {
                    const [gallery] = await extensionGalleryService.getExtensions([{ id, preRelease: options?.installPreReleaseVersion }], CancellationToken.None);
                    if (!gallery) {
                        throw new Error(localize('notFound', "Extension '{0}' not found.", arg));
                    }
                    await extensionManagementService.installFromGallery(gallery, {
                        isMachineScoped: options?.donotSync ? true : undefined, /* do not allow syncing extensions automatically while installing through the command */
                        installPreReleaseVersion: options?.installPreReleaseVersion,
                        installGivenVersion: !!version,
                        context: { ...options?.context, [EXTENSION_INSTALL_SOURCE_CONTEXT]: "command" /* ExtensionInstallSource.COMMAND */ },
                    });
                }
                else {
                    await extensionsWorkbenchService.install(id, {
                        version,
                        installPreReleaseVersion: options?.installPreReleaseVersion,
                        context: { ...options?.context, [EXTENSION_INSTALL_SOURCE_CONTEXT]: "command" /* ExtensionInstallSource.COMMAND */ },
                        justification: options?.justification,
                        enable: options?.enable,
                        isMachineScoped: options?.donotSync ? true : undefined, /* do not allow syncing extensions automatically while installing through the command */
                    }, 15 /* ProgressLocation.Notification */);
                }
            }
            else {
                const vsix = URI.revive(arg);
                await extensionsWorkbenchService.install(vsix, { installGivenVersion: true });
            }
        }
        catch (e) {
            onUnexpectedError(e);
            throw e;
        }
    }
});
CommandsRegistry.registerCommand({
    id: 'workbench.extensions.uninstallExtension',
    metadata: {
        description: localize('workbench.extensions.uninstallExtension.description', "Uninstall the given extension"),
        args: [
            {
                name: localize('workbench.extensions.uninstallExtension.arg.name', "Id of the extension to uninstall"),
                schema: {
                    'type': 'string'
                }
            }
        ]
    },
    handler: async (accessor, id) => {
        if (!id) {
            throw new Error(localize('id required', "Extension id required."));
        }
        const extensionManagementService = accessor.get(IExtensionManagementService);
        const installed = await extensionManagementService.getInstalled();
        const [extensionToUninstall] = installed.filter(e => areSameExtensions(e.identifier, { id }));
        if (!extensionToUninstall) {
            throw new Error(localize('notInstalled', "Extension '{0}' is not installed. Make sure you use the full extension ID, including the publisher, e.g.: ms-dotnettools.csharp.", id));
        }
        if (extensionToUninstall.isBuiltin) {
            throw new Error(localize('builtin', "Extension '{0}' is a Built-in extension and cannot be uninstalled", id));
        }
        try {
            await extensionManagementService.uninstall(extensionToUninstall);
        }
        catch (e) {
            onUnexpectedError(e);
            throw e;
        }
    }
});
CommandsRegistry.registerCommand({
    id: 'workbench.extensions.search',
    metadata: {
        description: localize('workbench.extensions.search.description', "Search for a specific extension"),
        args: [
            {
                name: localize('workbench.extensions.search.arg.name', "Query to use in search"),
                schema: { 'type': 'string' }
            }
        ]
    },
    handler: async (accessor, query = '') => {
        return accessor.get(IExtensionsWorkbenchService).openSearch(query);
    }
});
function overrideActionForActiveExtensionEditorWebview(command, f) {
    command?.addImplementation(105, 'extensions-editor', (accessor) => {
        const editorService = accessor.get(IEditorService);
        const editor = editorService.activeEditorPane;
        if (editor instanceof ExtensionEditor) {
            if (editor.activeWebview?.isFocused) {
                f(editor.activeWebview);
                return true;
            }
        }
        return false;
    });
}
overrideActionForActiveExtensionEditorWebview(CopyAction, webview => webview.copy());
overrideActionForActiveExtensionEditorWebview(CutAction, webview => webview.cut());
overrideActionForActiveExtensionEditorWebview(PasteAction, webview => webview.paste());
// Contexts
export const CONTEXT_HAS_LOCAL_SERVER = new RawContextKey('hasLocalServer', false);
export const CONTEXT_HAS_REMOTE_SERVER = new RawContextKey('hasRemoteServer', false);
export const CONTEXT_HAS_WEB_SERVER = new RawContextKey('hasWebServer', false);
const CONTEXT_GALLERY_SORT_CAPABILITIES = new RawContextKey('gallerySortCapabilities', '');
const CONTEXT_GALLERY_FILTER_CAPABILITIES = new RawContextKey('galleryFilterCapabilities', '');
const CONTEXT_GALLERY_ALL_PUBLIC_REPOSITORY_SIGNED = new RawContextKey('galleryAllPublicRepositorySigned', false);
const CONTEXT_GALLERY_ALL_PRIVATE_REPOSITORY_SIGNED = new RawContextKey('galleryAllPrivateRepositorySigned', false);
const CONTEXT_GALLERY_HAS_EXTENSION_LINK = new RawContextKey('galleryHasExtensionLink', false);
async function runAction(action) {
    try {
        await action.run();
    }
    finally {
        if (isDisposable(action)) {
            action.dispose();
        }
    }
}
let ExtensionsContributions = class ExtensionsContributions extends Disposable {
    constructor(extensionManagementService, extensionManagementServerService, extensionGalleryManifestService, contextKeyService, viewsService, extensionsWorkbenchService, extensionEnablementService, instantiationService, dialogService, commandService, productService, pluginInstallService) {
        super();
        this.extensionManagementService = extensionManagementService;
        this.extensionManagementServerService = extensionManagementServerService;
        this.extensionGalleryManifestService = extensionGalleryManifestService;
        this.contextKeyService = contextKeyService;
        this.viewsService = viewsService;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.extensionEnablementService = extensionEnablementService;
        this.instantiationService = instantiationService;
        this.dialogService = dialogService;
        this.commandService = commandService;
        this.productService = productService;
        this.pluginInstallService = pluginInstallService;
        const hasLocalServerContext = CONTEXT_HAS_LOCAL_SERVER.bindTo(contextKeyService);
        if (this.extensionManagementServerService.localExtensionManagementServer) {
            hasLocalServerContext.set(true);
        }
        const hasRemoteServerContext = CONTEXT_HAS_REMOTE_SERVER.bindTo(contextKeyService);
        if (this.extensionManagementServerService.remoteExtensionManagementServer) {
            hasRemoteServerContext.set(true);
        }
        const hasWebServerContext = CONTEXT_HAS_WEB_SERVER.bindTo(contextKeyService);
        if (this.extensionManagementServerService.webExtensionManagementServer) {
            hasWebServerContext.set(true);
        }
        this.updateExtensionGalleryStatusContexts();
        this._register(extensionGalleryManifestService.onDidChangeExtensionGalleryManifestStatus(() => this.updateExtensionGalleryStatusContexts()));
        extensionGalleryManifestService.getExtensionGalleryManifest()
            .then(extensionGalleryManifest => {
            this.updateGalleryCapabilitiesContexts(extensionGalleryManifest);
            this._register(extensionGalleryManifestService.onDidChangeExtensionGalleryManifest(extensionGalleryManifest => this.updateGalleryCapabilitiesContexts(extensionGalleryManifest)));
        });
        this.registerGlobalActions();
        this.registerContextMenuActions();
        this.registerQuickAccessProvider();
    }
    async updateExtensionGalleryStatusContexts() {
        CONTEXT_HAS_GALLERY.bindTo(this.contextKeyService).set(this.extensionGalleryManifestService.extensionGalleryManifestStatus === "available" /* ExtensionGalleryManifestStatus.Available */);
        CONTEXT_EXTENSIONS_GALLERY_STATUS.bindTo(this.contextKeyService).set(this.extensionGalleryManifestService.extensionGalleryManifestStatus);
    }
    async updateGalleryCapabilitiesContexts(extensionGalleryManifest) {
        CONTEXT_GALLERY_SORT_CAPABILITIES.bindTo(this.contextKeyService).set(`_${extensionGalleryManifest?.capabilities.extensionQuery.sorting?.map(s => s.name)?.join('_')}_UpdateDate_`);
        CONTEXT_GALLERY_FILTER_CAPABILITIES.bindTo(this.contextKeyService).set(`_${extensionGalleryManifest?.capabilities.extensionQuery.filtering?.map(s => s.name)?.join('_')}_`);
        CONTEXT_GALLERY_ALL_PUBLIC_REPOSITORY_SIGNED.bindTo(this.contextKeyService).set(!!extensionGalleryManifest?.capabilities?.signing?.allPublicRepositorySigned);
        CONTEXT_GALLERY_ALL_PRIVATE_REPOSITORY_SIGNED.bindTo(this.contextKeyService).set(!!extensionGalleryManifest?.capabilities?.signing?.allPrivateRepositorySigned);
        CONTEXT_GALLERY_HAS_EXTENSION_LINK.bindTo(this.contextKeyService).set(!!(extensionGalleryManifest && getExtensionGalleryManifestResourceUri(extensionGalleryManifest, "ExtensionDetailsViewUriTemplate" /* ExtensionGalleryResourceType.ExtensionDetailsViewUri */)));
    }
    registerQuickAccessProvider() {
        if (this.extensionManagementServerService.localExtensionManagementServer
            || this.extensionManagementServerService.remoteExtensionManagementServer
            || this.extensionManagementServerService.webExtensionManagementServer) {
            Registry.as(Extensions.Quickaccess).registerQuickAccessProvider({
                ctor: InstallExtensionQuickAccessProvider,
                prefix: InstallExtensionQuickAccessProvider.PREFIX,
                placeholder: localize('installExtensionQuickAccessPlaceholder', "Type the name of an extension to install or search."),
                helpEntries: [{ description: localize('installExtensionQuickAccessHelp', "Install or Search Extensions") }]
            });
        }
    }
    // Global actions
    registerGlobalActions() {
        this._register(MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
            command: {
                id: VIEWLET_ID,
                title: localize({ key: 'miPreferencesExtensions', comment: ['&& denotes a mnemonic'] }, "&&Extensions")
            },
            group: '2_configuration',
            order: 3,
            when: IsSessionsWindowContext.negate()
        }));
        this._register(MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
            command: {
                id: VIEWLET_ID,
                title: localize('showExtensions', "Extensions")
            },
            group: '2_configuration',
            order: 3
        }));
        this.registerExtensionAction({
            id: 'workbench.extensions.action.focusExtensionsView',
            title: localize2('focusExtensions', 'Focus on Extensions View'),
            category: ExtensionsLocalizedLabel,
            f1: true,
            run: async (accessor) => {
                await accessor.get(IExtensionsWorkbenchService).openSearch('');
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.installExtensions',
            title: localize2('installExtensions', 'Install Extensions'),
            category: ExtensionsLocalizedLabel,
            menu: {
                id: MenuId.CommandPalette,
                when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER))
            },
            run: async (accessor) => {
                accessor.get(IViewsService).openViewContainer(VIEWLET_ID, true);
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.showRecommendedKeymapExtensions',
            title: localize2('showRecommendedKeymapExtensionsShort', 'Keymaps'),
            category: PreferencesLocalizedLabel,
            menu: [{
                    id: MenuId.CommandPalette,
                    when: CONTEXT_HAS_GALLERY
                }, {
                    id: MenuId.EditorTitle,
                    when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_HAS_GALLERY),
                    group: '2_keyboard_discover_actions'
                }],
            menuTitles: {
                [MenuId.EditorTitle.id]: localize('importKeyboardShortcutsFroms', "Migrate Keyboard Shortcuts from...")
            },
            run: () => this.extensionsWorkbenchService.openSearch('@recommended:keymaps ')
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.showLanguageExtensions',
            title: localize2('showLanguageExtensionsShort', 'Language Extensions'),
            category: PreferencesLocalizedLabel,
            menu: {
                id: MenuId.CommandPalette,
                when: CONTEXT_HAS_GALLERY
            },
            run: () => this.extensionsWorkbenchService.openSearch('@recommended:languages ')
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.checkForUpdates',
            title: localize2('checkForUpdates', 'Check for Extension Updates'),
            category: ExtensionsLocalizedLabel,
            menu: [{
                    id: MenuId.CommandPalette,
                    when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER))
                }, {
                    id: MenuId.ViewContainerTitle,
                    when: ContextKeyExpr.and(ContextKeyExpr.equals('viewContainer', VIEWLET_ID), CONTEXT_HAS_GALLERY),
                    group: '1_updates',
                    order: 1
                }],
            run: async () => {
                const [, pluginResult] = await Promise.all([
                    this.extensionsWorkbenchService.checkForUpdates(),
                    this.pluginInstallService.updateAllPlugins({ silent: true }, CancellationToken.None),
                ]);
                const outdated = this.extensionsWorkbenchService.outdated;
                if (outdated.length) {
                    return this.extensionsWorkbenchService.openSearch('@outdated ');
                }
                else if (pluginResult.updatedNames.length === 0 && pluginResult.failedNames.length === 0) {
                    return this.dialogService.info(localize('noUpdatesAvailable', "All extensions are up to date."));
                }
            }
        });
        const enableAutoUpdateWhenCondition = ContextKeyExpr.equals(`config.${AutoUpdateConfigurationKey}`, false);
        this.registerExtensionAction({
            id: 'workbench.extensions.action.enableAutoUpdate',
            title: localize2('enableAutoUpdate', 'Enable Auto Update for All Extensions'),
            category: ExtensionsLocalizedLabel,
            precondition: enableAutoUpdateWhenCondition,
            menu: [{
                    id: MenuId.ViewContainerTitle,
                    order: 5,
                    group: '1_updates',
                    when: ContextKeyExpr.and(ContextKeyExpr.equals('viewContainer', VIEWLET_ID), enableAutoUpdateWhenCondition)
                }, {
                    id: MenuId.CommandPalette,
                }],
            run: (accessor) => accessor.get(IExtensionsWorkbenchService).updateAutoUpdateForAllExtensions(true)
        });
        const disableAutoUpdateWhenCondition = ContextKeyExpr.notEquals(`config.${AutoUpdateConfigurationKey}`, false);
        this.registerExtensionAction({
            id: 'workbench.extensions.action.disableAutoUpdate',
            title: localize2('disableAutoUpdate', 'Disable Auto Update for All Extensions'),
            precondition: disableAutoUpdateWhenCondition,
            category: ExtensionsLocalizedLabel,
            menu: [{
                    id: MenuId.ViewContainerTitle,
                    order: 5,
                    group: '1_updates',
                    when: ContextKeyExpr.and(ContextKeyExpr.equals('viewContainer', VIEWLET_ID), disableAutoUpdateWhenCondition)
                }, {
                    id: MenuId.CommandPalette,
                }],
            run: (accessor) => accessor.get(IExtensionsWorkbenchService).updateAutoUpdateForAllExtensions(false)
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.updateAllExtensions',
            title: localize2('updateAll', 'Update All Extensions'),
            category: ExtensionsLocalizedLabel,
            precondition: HasOutdatedExtensionsContext,
            menu: [
                {
                    id: MenuId.CommandPalette,
                    when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER))
                }, {
                    id: MenuId.ViewContainerTitle,
                    when: ContextKeyExpr.and(ContextKeyExpr.equals('viewContainer', VIEWLET_ID), ContextKeyExpr.or(ContextKeyExpr.has(`config.${AutoUpdateConfigurationKey}`).negate(), ContextKeyExpr.equals(`config.${AutoUpdateConfigurationKey}`, 'onlyEnabledExtensions'))),
                    group: '1_updates',
                    order: 2
                }, {
                    id: MenuId.ViewTitle,
                    when: ContextKeyExpr.equals('view', OUTDATED_EXTENSIONS_VIEW_ID),
                    group: 'navigation',
                    order: 1
                }
            ],
            icon: installWorkspaceRecommendedIcon,
            run: async () => {
                await this.extensionsWorkbenchService.updateAll();
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.enableAll',
            title: localize2('enableAll', 'Enable All Extensions'),
            category: ExtensionsLocalizedLabel,
            menu: [{
                    id: MenuId.CommandPalette,
                    when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER)
                }, {
                    id: MenuId.ViewContainerTitle,
                    when: ContextKeyExpr.equals('viewContainer', VIEWLET_ID),
                    group: '2_enablement',
                    order: 1
                }],
            run: async () => {
                const extensionsToEnable = this.extensionsWorkbenchService.local.filter(e => !!e.local && this.extensionEnablementService.canChangeEnablement(e.local) && !this.extensionEnablementService.isEnabled(e.local));
                if (extensionsToEnable.length) {
                    await this.extensionsWorkbenchService.setEnablement(extensionsToEnable, 12 /* EnablementState.EnabledGlobally */);
                }
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.enableAllWorkspace',
            title: localize2('enableAllWorkspace', 'Enable All Extensions for this Workspace'),
            category: ExtensionsLocalizedLabel,
            menu: {
                id: MenuId.CommandPalette,
                when: ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo('empty'), ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER))
            },
            run: async () => {
                const extensionsToEnable = this.extensionsWorkbenchService.local.filter(e => !!e.local && this.extensionEnablementService.canChangeEnablement(e.local) && !this.extensionEnablementService.isEnabled(e.local));
                if (extensionsToEnable.length) {
                    await this.extensionsWorkbenchService.setEnablement(extensionsToEnable, 13 /* EnablementState.EnabledWorkspace */);
                }
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.disableAll',
            title: localize2('disableAll', 'Disable All Installed Extensions'),
            category: ExtensionsLocalizedLabel,
            menu: [{
                    id: MenuId.CommandPalette,
                    when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER)
                }, {
                    id: MenuId.ViewContainerTitle,
                    when: ContextKeyExpr.equals('viewContainer', VIEWLET_ID),
                    group: '2_enablement',
                    order: 2
                }],
            run: async () => {
                const extensionsToDisable = this.extensionsWorkbenchService.local.filter(e => !e.isBuiltin && !!e.local && this.extensionEnablementService.isEnabled(e.local) && this.extensionEnablementService.canChangeEnablement(e.local));
                if (extensionsToDisable.length) {
                    await this.extensionsWorkbenchService.setEnablement(extensionsToDisable, 10 /* EnablementState.DisabledGlobally */);
                }
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.disableAllWorkspace',
            title: localize2('disableAllWorkspace', 'Disable All Installed Extensions for this Workspace'),
            category: ExtensionsLocalizedLabel,
            menu: {
                id: MenuId.CommandPalette,
                when: ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo('empty'), ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER))
            },
            run: async () => {
                const extensionsToDisable = this.extensionsWorkbenchService.local.filter(e => !e.isBuiltin && !!e.local && this.extensionEnablementService.isEnabled(e.local) && this.extensionEnablementService.canChangeEnablement(e.local));
                if (extensionsToDisable.length) {
                    await this.extensionsWorkbenchService.setEnablement(extensionsToDisable, 11 /* EnablementState.DisabledWorkspace */);
                }
            }
        });
        this.registerExtensionAction({
            id: SELECT_INSTALL_VSIX_EXTENSION_COMMAND_ID,
            title: localize2('InstallFromVSIX', 'Install from VSIX...'),
            category: ExtensionsLocalizedLabel,
            menu: [{
                    id: MenuId.CommandPalette,
                    when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER)
                }, {
                    id: MenuId.ViewContainerTitle,
                    when: ContextKeyExpr.and(ContextKeyExpr.equals('viewContainer', VIEWLET_ID), ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER)),
                    group: '3_install',
                    order: 1
                }],
            run: async (accessor) => {
                const fileDialogService = accessor.get(IFileDialogService);
                const commandService = accessor.get(ICommandService);
                const vsixPaths = await fileDialogService.showOpenDialog({
                    title: localize('installFromVSIX', "Install from VSIX"),
                    filters: [{ name: 'VSIX Extensions', extensions: ['vsix'] }],
                    canSelectFiles: true,
                    canSelectMany: true,
                    openLabel: mnemonicButtonLabel(localize({ key: 'installButton', comment: ['&& denotes a mnemonic'] }, "&&Install"))
                });
                if (vsixPaths) {
                    await commandService.executeCommand(INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID, vsixPaths);
                }
            }
        });
        this.registerExtensionAction({
            id: INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID,
            title: localize('installVSIX', "Install Extension VSIX"),
            menu: [{
                    id: MenuId.ExplorerContext,
                    group: 'extensions',
                    when: ContextKeyExpr.and(ResourceContextKey.Extension.isEqualTo('.vsix'), ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER)),
                }],
            run: async (accessor, resources) => {
                const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
                const hostService = accessor.get(IHostService);
                const notificationService = accessor.get(INotificationService);
                const vsixs = Array.isArray(resources) ? resources : [resources];
                const result = await Promise.allSettled(vsixs.map(async (vsix) => await extensionsWorkbenchService.install(vsix, { installGivenVersion: true })));
                let error, requireReload = false, requireRestart = false;
                for (const r of result) {
                    if (r.status === 'rejected') {
                        error = new Error(r.reason);
                        break;
                    }
                    requireReload = requireReload || r.value.runtimeState?.action === "reloadWindow" /* ExtensionRuntimeActionType.ReloadWindow */;
                    requireRestart = requireRestart || r.value.runtimeState?.action === "restartExtensions" /* ExtensionRuntimeActionType.RestartExtensions */;
                }
                if (error) {
                    throw error;
                }
                if (requireReload) {
                    notificationService.prompt(Severity.Info, vsixs.length > 1 ? localize('InstallVSIXs.successReload', "Completed installing extensions. Please reload Visual Studio Code to enable them.")
                        : localize('InstallVSIXAction.successReload', "Completed installing extension. Please reload Visual Studio Code to enable it."), [{
                            label: localize('InstallVSIXAction.reloadNow', "Reload Now"),
                            run: () => hostService.reload()
                        }]);
                }
                else if (requireRestart) {
                    notificationService.prompt(Severity.Info, vsixs.length > 1 ? localize('InstallVSIXs.successRestart', "Completed installing extensions. Please restart extensions to enable them.")
                        : localize('InstallVSIXAction.successRestart', "Completed installing extension. Please restart extensions to enable it."), [{
                            label: localize('InstallVSIXAction.restartExtensions', "Restart Extensions"),
                            run: () => extensionsWorkbenchService.updateRunningExtensions()
                        }]);
                }
                else {
                    notificationService.prompt(Severity.Info, vsixs.length > 1 ? localize('InstallVSIXs.successNoReload', "Completed installing extensions.") : localize('InstallVSIXAction.successNoReload', "Completed installing extension."), []);
                }
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.installExtensionFromLocation',
            title: localize2('installExtensionFromLocation', 'Install Extension from Location...'),
            category: Categories.Developer,
            menu: [{
                    id: MenuId.CommandPalette,
                    when: ContextKeyExpr.or(CONTEXT_HAS_WEB_SERVER, CONTEXT_HAS_LOCAL_SERVER)
                }],
            run: async (accessor) => {
                const extensionManagementService = accessor.get(IWorkbenchExtensionManagementService);
                if (isWeb) {
                    return new Promise((c, e) => {
                        const quickInputService = accessor.get(IQuickInputService);
                        const disposables = new DisposableStore();
                        const quickPick = disposables.add(quickInputService.createQuickPick());
                        quickPick.title = localize('installFromLocation', "Install Extension from Location");
                        quickPick.customButton = true;
                        quickPick.customLabel = localize('install button', "Install");
                        quickPick.placeholder = localize('installFromLocationPlaceHolder', "Location of the web extension");
                        quickPick.ignoreFocusOut = true;
                        disposables.add(Event.any(quickPick.onDidAccept, quickPick.onDidCustom)(async () => {
                            quickPick.hide();
                            if (quickPick.value) {
                                try {
                                    await extensionManagementService.installFromLocation(URI.parse(quickPick.value));
                                }
                                catch (error) {
                                    e(error);
                                    return;
                                }
                            }
                            c();
                        }));
                        disposables.add(quickPick.onDidHide(() => disposables.dispose()));
                        quickPick.show();
                    });
                }
                else {
                    const fileDialogService = accessor.get(IFileDialogService);
                    const extensionLocation = await fileDialogService.showOpenDialog({
                        canSelectFolders: true,
                        canSelectFiles: false,
                        canSelectMany: false,
                        title: localize('installFromLocation', "Install Extension from Location"),
                    });
                    if (extensionLocation?.[0]) {
                        await extensionManagementService.installFromLocation(extensionLocation[0]);
                    }
                }
            }
        });
        MenuRegistry.appendMenuItem(extensionsSearchActionsMenu, {
            submenu: extensionsFilterSubMenu,
            title: localize('filterExtensions', "Filter Extensions..."),
            group: 'navigation',
            order: 2,
            icon: filterIcon,
        });
        const showFeaturedExtensionsId = 'extensions.filter.featured';
        const featuresExtensionsWhenContext = ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.regex(CONTEXT_GALLERY_FILTER_CAPABILITIES.key, new RegExp(`_${"Featured" /* FilterType.Featured */}_`)));
        this.registerExtensionAction({
            id: showFeaturedExtensionsId,
            title: localize2('showFeaturedExtensions', 'Show Featured Extensions'),
            category: ExtensionsLocalizedLabel,
            menu: [{
                    id: MenuId.CommandPalette,
                    when: featuresExtensionsWhenContext
                }, {
                    id: extensionsFilterSubMenu,
                    when: featuresExtensionsWhenContext,
                    group: '1_predefined',
                    order: 1,
                }],
            menuTitles: {
                [extensionsFilterSubMenu.id]: localize('featured filter', "Featured")
            },
            run: () => this.extensionsWorkbenchService.openSearch('@featured ')
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.showPopularExtensions',
            title: localize2('showPopularExtensions', 'Show Popular Extensions'),
            category: ExtensionsLocalizedLabel,
            menu: [{
                    id: MenuId.CommandPalette,
                    when: CONTEXT_HAS_GALLERY
                }, {
                    id: extensionsFilterSubMenu,
                    when: CONTEXT_HAS_GALLERY,
                    group: '1_predefined',
                    order: 2,
                }],
            menuTitles: {
                [extensionsFilterSubMenu.id]: localize('most popular filter', "Most Popular")
            },
            run: () => this.extensionsWorkbenchService.openSearch('@popular ')
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.showRecommendedExtensions',
            title: localize2('showRecommendedExtensions', 'Show Recommended Extensions'),
            category: ExtensionsLocalizedLabel,
            menu: [{
                    id: MenuId.CommandPalette,
                    when: CONTEXT_HAS_GALLERY
                }, {
                    id: extensionsFilterSubMenu,
                    when: CONTEXT_HAS_GALLERY,
                    group: '1_predefined',
                    order: 2,
                }],
            menuTitles: {
                [extensionsFilterSubMenu.id]: localize('most popular recommended', "Recommended")
            },
            run: () => this.extensionsWorkbenchService.openSearch('@recommended ')
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.recentlyPublishedExtensions',
            title: localize2('recentlyPublishedExtensions', 'Show Recently Published Extensions'),
            category: ExtensionsLocalizedLabel,
            menu: [{
                    id: MenuId.CommandPalette,
                    when: CONTEXT_HAS_GALLERY
                }, {
                    id: extensionsFilterSubMenu,
                    when: CONTEXT_HAS_GALLERY,
                    group: '1_predefined',
                    order: 2,
                }],
            menuTitles: {
                [extensionsFilterSubMenu.id]: localize('recently published filter', "Recently Published")
            },
            run: () => this.extensionsWorkbenchService.openSearch('@recentlyPublished ')
        });
        const extensionsCategoryFilterSubMenu = new MenuId('extensionsCategoryFilterSubMenu');
        MenuRegistry.appendMenuItem(extensionsFilterSubMenu, {
            submenu: extensionsCategoryFilterSubMenu,
            title: localize('filter by category', "Category"),
            when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.regex(CONTEXT_GALLERY_FILTER_CAPABILITIES.key, new RegExp(`_${"Category" /* FilterType.Category */}_`))),
            group: '2_categories',
            order: 1,
        });
        EXTENSION_CATEGORIES.forEach((category, index) => {
            this.registerExtensionAction({
                id: `extensions.actions.searchByCategory.${category}`,
                title: category,
                menu: [{
                        id: extensionsCategoryFilterSubMenu,
                        when: CONTEXT_HAS_GALLERY,
                        order: index,
                    }],
                run: () => this.extensionsWorkbenchService.openSearch(`@category:"${category.toLowerCase()}"`)
            });
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.installedExtensions',
            title: localize2('installedExtensions', 'Show Installed Extensions'),
            category: ExtensionsLocalizedLabel,
            f1: true,
            menu: [{
                    id: extensionsFilterSubMenu,
                    group: '3_installed',
                    order: 1,
                }],
            menuTitles: {
                [extensionsFilterSubMenu.id]: localize('installed filter', "Installed")
            },
            run: () => this.extensionsWorkbenchService.openSearch('@installed ')
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.listBuiltInExtensions',
            title: localize2('showBuiltInExtensions', 'Show Built-in Extensions'),
            category: ExtensionsLocalizedLabel,
            menu: [{
                    id: MenuId.CommandPalette,
                    when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER)
                }, {
                    id: extensionsFilterSubMenu,
                    group: '3_installed',
                    order: 3,
                }],
            menuTitles: {
                [extensionsFilterSubMenu.id]: localize('builtin filter', "Built-in")
            },
            run: () => this.extensionsWorkbenchService.openSearch('@builtin ')
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.extensionUpdates',
            title: localize2('extensionUpdates', 'Show Extension Updates'),
            category: ExtensionsLocalizedLabel,
            precondition: CONTEXT_HAS_GALLERY,
            f1: true,
            menu: [{
                    id: extensionsFilterSubMenu,
                    group: '3_installed',
                    when: CONTEXT_HAS_GALLERY,
                    order: 2,
                }],
            menuTitles: {
                [extensionsFilterSubMenu.id]: localize('extension updates filter', "Updates")
            },
            run: () => this.extensionsWorkbenchService.openSearch('@updates')
        });
        this.registerExtensionAction({
            id: LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID,
            title: localize2('showWorkspaceUnsupportedExtensions', 'Show Extensions Unsupported By Workspace'),
            category: ExtensionsLocalizedLabel,
            menu: [{
                    id: MenuId.CommandPalette,
                    when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER),
                }, {
                    id: extensionsFilterSubMenu,
                    group: '3_installed',
                    order: 6,
                    when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER),
                }],
            menuTitles: {
                [extensionsFilterSubMenu.id]: localize('workspace unsupported filter', "Workspace Unsupported")
            },
            run: () => this.extensionsWorkbenchService.openSearch('@workspaceUnsupported')
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.showEnabledExtensions',
            title: localize2('showEnabledExtensions', 'Show Enabled Extensions'),
            category: ExtensionsLocalizedLabel,
            menu: [{
                    id: MenuId.CommandPalette,
                    when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER)
                }, {
                    id: extensionsFilterSubMenu,
                    group: '3_installed',
                    order: 4,
                }],
            menuTitles: {
                [extensionsFilterSubMenu.id]: localize('enabled filter', "Enabled")
            },
            run: () => this.extensionsWorkbenchService.openSearch('@enabled ')
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.showDisabledExtensions',
            title: localize2('showDisabledExtensions', 'Show Disabled Extensions'),
            category: ExtensionsLocalizedLabel,
            menu: [{
                    id: MenuId.CommandPalette,
                    when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER)
                }, {
                    id: extensionsFilterSubMenu,
                    group: '3_installed',
                    order: 5,
                }],
            menuTitles: {
                [extensionsFilterSubMenu.id]: localize('disabled filter', "Disabled")
            },
            run: () => this.extensionsWorkbenchService.openSearch('@disabled ')
        });
        const extensionsSortSubMenu = new MenuId('extensionsSortSubMenu');
        MenuRegistry.appendMenuItem(extensionsFilterSubMenu, {
            submenu: extensionsSortSubMenu,
            title: localize('sorty by', "Sort By"),
            when: ContextKeyExpr.and(ContextKeyExpr.or(CONTEXT_HAS_GALLERY, DefaultViewsContext)),
            group: '4_sort',
            order: 1,
        });
        [
            { id: 'installs', title: localize('sort by installs', "Install Count"), precondition: BuiltInExtensionsContext.negate(), sortCapability: "InstallCount" /* SortBy.InstallCount */ },
            { id: 'rating', title: localize('sort by rating', "Rating"), precondition: BuiltInExtensionsContext.negate(), sortCapability: "WeightedRating" /* SortBy.WeightedRating */ },
            { id: 'name', title: localize('sort by name', "Name"), precondition: BuiltInExtensionsContext.negate(), sortCapability: "Title" /* SortBy.Title */ },
            { id: 'publishedDate', title: localize('sort by published date', "Published Date"), precondition: BuiltInExtensionsContext.negate(), sortCapability: "PublishedDate" /* SortBy.PublishedDate */ },
            { id: 'updateDate', title: localize('sort by update date', "Updated Date"), precondition: ContextKeyExpr.and(SearchMarketplaceExtensionsContext.negate(), RecommendedExtensionsContext.negate(), BuiltInExtensionsContext.negate()), sortCapability: 'UpdateDate' },
        ].map(({ id, title, precondition, sortCapability }, index) => {
            const sortCapabilityContext = ContextKeyExpr.regex(CONTEXT_GALLERY_SORT_CAPABILITIES.key, new RegExp(`_${sortCapability}_`));
            this.registerExtensionAction({
                id: `extensions.sort.${id}`,
                title,
                precondition: ContextKeyExpr.and(precondition, ContextKeyExpr.regex(ExtensionsSearchValueContext.key, /^@contribute:/).negate(), sortCapabilityContext),
                menu: [{
                        id: extensionsSortSubMenu,
                        when: ContextKeyExpr.and(ContextKeyExpr.or(CONTEXT_HAS_GALLERY, DefaultViewsContext), sortCapabilityContext),
                        order: index,
                    }],
                toggled: ExtensionsSortByContext.isEqualTo(id),
                run: async () => {
                    const extensionsViewPaneContainer = ((await this.viewsService.openViewContainer(VIEWLET_ID, true))?.getViewPaneContainer());
                    const currentQuery = Query.parse(extensionsViewPaneContainer?.searchValue ?? '');
                    extensionsViewPaneContainer?.search(new Query(currentQuery.value, id).toString());
                    extensionsViewPaneContainer?.focus();
                }
            });
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.clearExtensionsSearchResults',
            title: localize2('clearExtensionsSearchResults', 'Clear Extensions Search Results'),
            category: ExtensionsLocalizedLabel,
            icon: clearSearchResultsIcon,
            f1: true,
            precondition: SearchHasTextContext,
            menu: {
                id: extensionsSearchActionsMenu,
                group: 'navigation',
                order: 1,
            },
            run: async (accessor) => {
                const viewPaneContainer = accessor.get(IViewsService).getActiveViewPaneContainerWithId(VIEWLET_ID);
                if (viewPaneContainer) {
                    const extensionsViewPaneContainer = viewPaneContainer;
                    extensionsViewPaneContainer.search('');
                    extensionsViewPaneContainer.focus();
                }
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.refreshExtension',
            title: localize2('refreshExtension', 'Refresh'),
            category: ExtensionsLocalizedLabel,
            icon: refreshIcon,
            f1: true,
            menu: {
                id: MenuId.ViewContainerTitle,
                when: ContextKeyExpr.equals('viewContainer', VIEWLET_ID),
                group: 'navigation',
                order: 2
            },
            run: async (accessor) => {
                const viewPaneContainer = accessor.get(IViewsService).getActiveViewPaneContainerWithId(VIEWLET_ID);
                if (viewPaneContainer) {
                    await viewPaneContainer.refresh();
                }
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.installWorkspaceRecommendedExtensions',
            title: localize('installWorkspaceRecommendedExtensions', "Install Workspace Recommended Extensions"),
            icon: installWorkspaceRecommendedIcon,
            menu: {
                id: MenuId.ViewTitle,
                when: ContextKeyExpr.equals('view', WORKSPACE_RECOMMENDATIONS_VIEW_ID),
                group: 'navigation',
                order: 1
            },
            run: async (accessor) => {
                const view = accessor.get(IViewsService).getActiveViewWithId(WORKSPACE_RECOMMENDATIONS_VIEW_ID);
                return view.installWorkspaceRecommendations();
            }
        });
        this.registerExtensionAction({
            id: ConfigureWorkspaceFolderRecommendedExtensionsAction.ID,
            title: ConfigureWorkspaceFolderRecommendedExtensionsAction.LABEL,
            icon: configureRecommendedIcon,
            menu: [{
                    id: MenuId.CommandPalette,
                    when: WorkbenchStateContext.notEqualsTo('empty'),
                }, {
                    id: MenuId.ViewTitle,
                    when: ContextKeyExpr.equals('view', WORKSPACE_RECOMMENDATIONS_VIEW_ID),
                    group: 'navigation',
                    order: 2
                }],
            run: () => runAction(this.instantiationService.createInstance(ConfigureWorkspaceFolderRecommendedExtensionsAction, ConfigureWorkspaceFolderRecommendedExtensionsAction.ID, ConfigureWorkspaceFolderRecommendedExtensionsAction.LABEL))
        });
        this.registerExtensionAction({
            id: InstallSpecificVersionOfExtensionAction.ID,
            title: { value: InstallSpecificVersionOfExtensionAction.LABEL, original: 'Install Specific Version of Extension...' },
            category: ExtensionsLocalizedLabel,
            menu: {
                id: MenuId.CommandPalette,
                when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER))
            },
            run: () => runAction(this.instantiationService.createInstance(InstallSpecificVersionOfExtensionAction, InstallSpecificVersionOfExtensionAction.ID, InstallSpecificVersionOfExtensionAction.LABEL))
        });
    }
    // Extension Context Menu
    registerContextMenuActions() {
        this.registerExtensionAction({
            id: SetColorThemeAction.ID,
            title: SetColorThemeAction.TITLE,
            menu: {
                id: MenuId.ExtensionContext,
                group: THEME_ACTIONS_GROUP,
                order: 0,
                when: ContextKeyExpr.and(ContextKeyExpr.not('inExtensionEditor'), ContextKeyExpr.equals('extensionStatus', 'installed'), ContextKeyExpr.has('extensionHasColorThemes'))
            },
            run: async (accessor, extensionId) => {
                const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
                const instantiationService = accessor.get(IInstantiationService);
                const extension = extensionWorkbenchService.local.find(e => areSameExtensions(e.identifier, { id: extensionId }));
                if (extension) {
                    const action = instantiationService.createInstance(SetColorThemeAction);
                    action.extension = extension;
                    return action.run();
                }
            }
        });
        this.registerExtensionAction({
            id: SetFileIconThemeAction.ID,
            title: SetFileIconThemeAction.TITLE,
            menu: {
                id: MenuId.ExtensionContext,
                group: THEME_ACTIONS_GROUP,
                order: 0,
                when: ContextKeyExpr.and(ContextKeyExpr.not('inExtensionEditor'), ContextKeyExpr.equals('extensionStatus', 'installed'), ContextKeyExpr.has('extensionHasFileIconThemes'))
            },
            run: async (accessor, extensionId) => {
                const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
                const instantiationService = accessor.get(IInstantiationService);
                const extension = extensionWorkbenchService.local.find(e => areSameExtensions(e.identifier, { id: extensionId }));
                if (extension) {
                    const action = instantiationService.createInstance(SetFileIconThemeAction);
                    action.extension = extension;
                    return action.run();
                }
            }
        });
        this.registerExtensionAction({
            id: SetProductIconThemeAction.ID,
            title: SetProductIconThemeAction.TITLE,
            menu: {
                id: MenuId.ExtensionContext,
                group: THEME_ACTIONS_GROUP,
                order: 0,
                when: ContextKeyExpr.and(ContextKeyExpr.not('inExtensionEditor'), ContextKeyExpr.equals('extensionStatus', 'installed'), ContextKeyExpr.has('extensionHasProductIconThemes'))
            },
            run: async (accessor, extensionId) => {
                const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
                const instantiationService = accessor.get(IInstantiationService);
                const extension = extensionWorkbenchService.local.find(e => areSameExtensions(e.identifier, { id: extensionId }));
                if (extension) {
                    const action = instantiationService.createInstance(SetProductIconThemeAction);
                    action.extension = extension;
                    return action.run();
                }
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.showPreReleaseVersion',
            title: localize2('show pre-release version', 'Show Pre-Release Version'),
            menu: {
                id: MenuId.ExtensionContext,
                group: INSTALL_ACTIONS_GROUP,
                order: 0,
                when: ContextKeyExpr.and(ContextKeyExpr.has('inExtensionEditor'), ContextKeyExpr.has('galleryExtensionHasPreReleaseVersion'), ContextKeyExpr.has('isPreReleaseExtensionAllowed'), ContextKeyExpr.not('showPreReleaseVersion'), ContextKeyExpr.not('isBuiltinExtension'))
            },
            run: async (accessor, extensionId) => {
                const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
                const extension = (await extensionWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
                extensionWorkbenchService.open(extension, { showPreReleaseVersion: true });
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.showReleasedVersion',
            title: localize2('show released version', 'Show Release Version'),
            menu: {
                id: MenuId.ExtensionContext,
                group: INSTALL_ACTIONS_GROUP,
                order: 1,
                when: ContextKeyExpr.and(ContextKeyExpr.has('inExtensionEditor'), ContextKeyExpr.has('galleryExtensionHasPreReleaseVersion'), ContextKeyExpr.has('extensionHasReleaseVersion'), ContextKeyExpr.has('showPreReleaseVersion'), ContextKeyExpr.not('isBuiltinExtension'))
            },
            run: async (accessor, extensionId) => {
                const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
                const extension = (await extensionWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
                extensionWorkbenchService.open(extension, { showPreReleaseVersion: false });
            }
        });
        this.registerExtensionAction({
            id: ToggleAutoUpdateForExtensionAction.ID,
            title: ToggleAutoUpdateForExtensionAction.LABEL,
            category: ExtensionsLocalizedLabel,
            precondition: ContextKeyExpr.and(ContextKeyExpr.or(ContextKeyExpr.notEquals(`config.${AutoUpdateConfigurationKey}`, 'onlyEnabledExtensions'), ContextKeyExpr.equals('isExtensionEnabled', true)), ContextKeyExpr.not('extensionDisallowInstall'), ContextKeyExpr.has('isExtensionAllowed')),
            menu: {
                id: MenuId.ExtensionContext,
                group: UPDATE_ACTIONS_GROUP,
                order: 1,
                when: ContextKeyExpr.and(ContextKeyExpr.not('inExtensionEditor'), ContextKeyExpr.equals('extensionStatus', 'installed'), ContextKeyExpr.not('isBuiltinExtension'))
            },
            run: async (accessor, id) => {
                const instantiationService = accessor.get(IInstantiationService);
                const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
                const extension = extensionWorkbenchService.local.find(e => areSameExtensions(e.identifier, { id }));
                if (extension) {
                    const action = instantiationService.createInstance(ToggleAutoUpdateForExtensionAction);
                    action.extension = extension;
                    return action.run();
                }
            }
        });
        this.registerExtensionAction({
            id: ToggleAutoUpdatesForPublisherAction.ID,
            title: { value: ToggleAutoUpdatesForPublisherAction.LABEL, original: 'Auto Update (Publisher)' },
            category: ExtensionsLocalizedLabel,
            precondition: ContextKeyExpr.equals(`config.${AutoUpdateConfigurationKey}`, false),
            menu: {
                id: MenuId.ExtensionContext,
                group: UPDATE_ACTIONS_GROUP,
                order: 2,
                when: ContextKeyExpr.and(ContextKeyExpr.equals('extensionStatus', 'installed'), ContextKeyExpr.not('isBuiltinExtension'))
            },
            run: async (accessor, id) => {
                const instantiationService = accessor.get(IInstantiationService);
                const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
                const extension = extensionWorkbenchService.local.find(e => areSameExtensions(e.identifier, { id }));
                if (extension) {
                    const action = instantiationService.createInstance(ToggleAutoUpdatesForPublisherAction);
                    action.extension = extension;
                    return action.run();
                }
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.switchToPreRlease',
            title: localize('enablePreRleaseLabel', "Switch to Pre-Release Version"),
            category: ExtensionsLocalizedLabel,
            menu: {
                id: MenuId.ExtensionContext,
                group: INSTALL_ACTIONS_GROUP,
                order: 2,
                when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.has('galleryExtensionHasPreReleaseVersion'), ContextKeyExpr.has('isPreReleaseExtensionAllowed'), ContextKeyExpr.not('installedExtensionIsOptedToPreRelease'), ContextKeyExpr.not('inExtensionEditor'), ContextKeyExpr.equals('extensionStatus', 'installed'), ContextKeyExpr.not('isBuiltinExtension'))
            },
            run: async (accessor, id) => {
                const instantiationService = accessor.get(IInstantiationService);
                const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
                const extension = extensionWorkbenchService.local.find(e => areSameExtensions(e.identifier, { id }));
                if (extension) {
                    const action = instantiationService.createInstance(TogglePreReleaseExtensionAction);
                    action.extension = extension;
                    return action.run();
                }
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.switchToRelease',
            title: localize('disablePreRleaseLabel', "Switch to Release Version"),
            category: ExtensionsLocalizedLabel,
            menu: {
                id: MenuId.ExtensionContext,
                group: INSTALL_ACTIONS_GROUP,
                order: 2,
                when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.has('galleryExtensionHasPreReleaseVersion'), ContextKeyExpr.has('isExtensionAllowed'), ContextKeyExpr.has('installedExtensionIsOptedToPreRelease'), ContextKeyExpr.not('inExtensionEditor'), ContextKeyExpr.equals('extensionStatus', 'installed'), ContextKeyExpr.not('isBuiltinExtension'))
            },
            run: async (accessor, id) => {
                const instantiationService = accessor.get(IInstantiationService);
                const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
                const extension = extensionWorkbenchService.local.find(e => areSameExtensions(e.identifier, { id }));
                if (extension) {
                    const action = instantiationService.createInstance(TogglePreReleaseExtensionAction);
                    action.extension = extension;
                    return action.run();
                }
            }
        });
        this.registerExtensionAction({
            id: ClearLanguageAction.ID,
            title: ClearLanguageAction.TITLE,
            menu: {
                id: MenuId.ExtensionContext,
                group: INSTALL_ACTIONS_GROUP,
                order: 0,
                when: ContextKeyExpr.and(ContextKeyExpr.not('inExtensionEditor'), ContextKeyExpr.has('canSetLanguage'), ContextKeyExpr.has('isActiveLanguagePackExtension'))
            },
            run: async (accessor, extensionId) => {
                const instantiationService = accessor.get(IInstantiationService);
                const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
                const extension = (await extensionsWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
                const action = instantiationService.createInstance(ClearLanguageAction);
                action.extension = extension;
                return action.run();
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.installUnsigned',
            title: localize('install', "Install"),
            menu: {
                id: MenuId.ExtensionContext,
                group: '0_install',
                when: ContextKeyExpr.and(ContextKeyExpr.equals('extensionStatus', 'uninstalled'), ContextKeyExpr.has('isGalleryExtension'), ContextKeyExpr.not('extensionDisallowInstall'), ContextKeyExpr.has('extensionIsUnsigned'), ContextKeyExpr.or(ContextKeyExpr.and(CONTEXT_GALLERY_ALL_PUBLIC_REPOSITORY_SIGNED, ContextKeyExpr.not('extensionIsPrivate')), ContextKeyExpr.and(CONTEXT_GALLERY_ALL_PRIVATE_REPOSITORY_SIGNED, ContextKeyExpr.has('extensionIsPrivate')))),
                order: 1
            },
            run: async (accessor, extensionId) => {
                const instantiationService = accessor.get(IInstantiationService);
                const extension = this.extensionsWorkbenchService.local.filter(e => areSameExtensions(e.identifier, { id: extensionId }))[0]
                    || (await this.extensionsWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
                if (extension) {
                    const action = instantiationService.createInstance(InstallAction, { installPreReleaseVersion: this.extensionManagementService.preferPreReleases });
                    action.extension = extension;
                    return action.run();
                }
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.installAndDonotSync',
            title: localize('install installAndDonotSync', "Install (Do not Sync)"),
            menu: {
                id: MenuId.ExtensionContext,
                group: '0_install',
                when: ContextKeyExpr.and(ContextKeyExpr.equals('extensionStatus', 'uninstalled'), ContextKeyExpr.has('isGalleryExtension'), ContextKeyExpr.has('isExtensionAllowed'), ContextKeyExpr.not('extensionDisallowInstall'), CONTEXT_SYNC_ENABLEMENT),
                order: 1
            },
            run: async (accessor, extensionId) => {
                const instantiationService = accessor.get(IInstantiationService);
                const extension = this.extensionsWorkbenchService.local.filter(e => areSameExtensions(e.identifier, { id: extensionId }))[0]
                    || (await this.extensionsWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
                if (extension) {
                    const action = instantiationService.createInstance(InstallAction, {
                        installPreReleaseVersion: this.extensionManagementService.preferPreReleases,
                        isMachineScoped: true,
                    });
                    action.extension = extension;
                    return action.run();
                }
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.installPrereleaseAndDonotSync',
            title: localize('installPrereleaseAndDonotSync', "Install Pre-Release (Do not Sync)"),
            menu: {
                id: MenuId.ExtensionContext,
                group: '0_install',
                when: ContextKeyExpr.and(ContextKeyExpr.equals('extensionStatus', 'uninstalled'), ContextKeyExpr.has('isGalleryExtension'), ContextKeyExpr.has('extensionHasPreReleaseVersion'), ContextKeyExpr.has('isPreReleaseExtensionAllowed'), ContextKeyExpr.not('extensionDisallowInstall'), CONTEXT_SYNC_ENABLEMENT),
                order: 2
            },
            run: async (accessor, extensionId) => {
                const instantiationService = accessor.get(IInstantiationService);
                const extension = this.extensionsWorkbenchService.local.filter(e => areSameExtensions(e.identifier, { id: extensionId }))[0]
                    || (await this.extensionsWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
                if (extension) {
                    const action = instantiationService.createInstance(InstallAction, {
                        isMachineScoped: true,
                        preRelease: true
                    });
                    action.extension = extension;
                    return action.run();
                }
            }
        });
        this.registerExtensionAction({
            id: InstallAnotherVersionAction.ID,
            title: InstallAnotherVersionAction.LABEL,
            menu: {
                id: MenuId.ExtensionContext,
                group: '0_install',
                when: ContextKeyExpr.and(ContextKeyExpr.equals('extensionStatus', 'uninstalled'), ContextKeyExpr.has('isGalleryExtension'), ContextKeyExpr.has('isExtensionAllowed'), ContextKeyExpr.not('extensionDisallowInstall')),
                order: 3
            },
            run: async (accessor, extensionId) => {
                const instantiationService = accessor.get(IInstantiationService);
                const extension = this.extensionsWorkbenchService.local.filter(e => areSameExtensions(e.identifier, { id: extensionId }))[0]
                    || (await this.extensionsWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
                if (extension) {
                    return instantiationService.createInstance(InstallAnotherVersionAction, extension, false).run();
                }
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.copyExtension',
            title: localize2('workbench.extensions.action.copyExtension', 'Copy'),
            menu: {
                id: MenuId.ExtensionContext,
                group: '1_copy'
            },
            run: async (accessor, extensionId) => {
                const clipboardService = accessor.get(IClipboardService);
                const extension = this.extensionsWorkbenchService.local.filter(e => areSameExtensions(e.identifier, { id: extensionId }))[0]
                    || (await this.extensionsWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
                if (extension) {
                    const name = localize('extensionInfoName', 'Name: {0}', extension.displayName);
                    const id = localize('extensionInfoId', 'Id: {0}', extensionId);
                    const description = localize('extensionInfoDescription', 'Description: {0}', extension.description);
                    const verision = localize('extensionInfoVersion', 'Version: {0}', extension.version);
                    const publisher = localize('extensionInfoPublisher', 'Publisher: {0}', extension.publisherDisplayName);
                    const link = extension.url ? localize('extensionInfoVSMarketplaceLink', 'VS Marketplace Link: {0}', `${extension.url}`) : null;
                    const clipboardStr = `${name}\n${id}\n${description}\n${verision}\n${publisher}${link ? '\n' + link : ''}`;
                    await clipboardService.writeText(clipboardStr);
                }
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.copyExtensionId',
            title: localize2('workbench.extensions.action.copyExtensionId', 'Copy Extension ID'),
            menu: {
                id: MenuId.ExtensionContext,
                group: '1_copy'
            },
            run: async (accessor, id) => accessor.get(IClipboardService).writeText(id)
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.copyLink',
            title: localize2('workbench.extensions.action.copyLink', 'Copy Link'),
            menu: {
                id: MenuId.ExtensionContext,
                group: '1_copy',
                when: ContextKeyExpr.and(ContextKeyExpr.has('isGalleryExtension'), CONTEXT_GALLERY_HAS_EXTENSION_LINK),
            },
            run: async (accessor, _, extension) => {
                const clipboardService = accessor.get(IClipboardService);
                if (extension.galleryLink) {
                    await clipboardService.writeText(extension.galleryLink);
                }
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.configure',
            title: localize2('workbench.extensions.action.configure', 'Settings'),
            menu: {
                id: MenuId.ExtensionContext,
                group: '2_configure',
                when: ContextKeyExpr.and(ContextKeyExpr.equals('extensionStatus', 'installed'), ContextKeyExpr.has('extensionHasConfiguration')),
                order: 1
            },
            run: async (accessor, id) => accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: `@ext:${id}` })
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.download',
            title: localize('download VSIX', "Download VSIX"),
            menu: {
                id: MenuId.ExtensionContext,
                when: ContextKeyExpr.and(ContextKeyExpr.not('extensionDisallowInstall'), ContextKeyExpr.has('isGalleryExtension')),
                order: this.productService.quality === 'stable' ? 0 : 1
            },
            run: async (accessor, extensionId) => {
                accessor.get(IExtensionsWorkbenchService).downloadVSIX(extensionId, 'release');
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.downloadPreRelease',
            title: localize('download pre-release', "Download Pre-Release VSIX"),
            menu: {
                id: MenuId.ExtensionContext,
                when: ContextKeyExpr.and(ContextKeyExpr.not('extensionDisallowInstall'), ContextKeyExpr.has('isGalleryExtension'), ContextKeyExpr.has('extensionHasPreReleaseVersion')),
                order: this.productService.quality === 'stable' ? 1 : 0
            },
            run: async (accessor, extensionId) => {
                accessor.get(IExtensionsWorkbenchService).downloadVSIX(extensionId, 'prerelease');
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.downloadSpecificVersion',
            title: localize('download specific version', "Download Specific Version VSIX..."),
            menu: {
                id: MenuId.ExtensionContext,
                when: ContextKeyExpr.and(ContextKeyExpr.not('extensionDisallowInstall'), ContextKeyExpr.has('isGalleryExtension')),
                order: 2
            },
            run: async (accessor, extensionId) => {
                accessor.get(IExtensionsWorkbenchService).downloadVSIX(extensionId, 'any');
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.manageAccountPreferences',
            title: localize2('workbench.extensions.action.changeAccountPreference', "Account Preferences"),
            menu: {
                id: MenuId.ExtensionContext,
                group: '2_configure',
                when: ContextKeyExpr.and(ContextKeyExpr.equals('extensionStatus', 'installed'), ContextKeyExpr.has('extensionHasAccountPreferences')),
                order: 2,
            },
            run: (accessor, id) => accessor.get(ICommandService).executeCommand('_manageAccountPreferencesForExtension', id)
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.configureKeybindings',
            title: localize2('workbench.extensions.action.configureKeybindings', 'Keyboard Shortcuts'),
            menu: {
                id: MenuId.ExtensionContext,
                group: '2_configure',
                when: ContextKeyExpr.and(ContextKeyExpr.equals('extensionStatus', 'installed'), ContextKeyExpr.has('extensionHasKeybindings')),
                order: 2
            },
            run: async (accessor, id) => accessor.get(IPreferencesService).openGlobalKeybindingSettings(false, { query: `@ext:${id}` })
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.toggleApplyToAllProfiles',
            title: localize2('workbench.extensions.action.toggleApplyToAllProfiles', "Apply Extension to all Profiles"),
            toggled: ContextKeyExpr.has('isApplicationScopedExtension'),
            menu: {
                id: MenuId.ExtensionContext,
                group: '2_configure',
                when: ContextKeyExpr.and(ContextKeyExpr.equals('extensionStatus', 'installed'), ContextKeyExpr.has('isDefaultApplicationScopedExtension').negate(), ContextKeyExpr.has('isBuiltinExtension').negate(), ContextKeyExpr.equals('isWorkspaceScopedExtension', false)),
                order: 3
            },
            run: async (accessor, _, extensionArg) => {
                const uriIdentityService = accessor.get(IUriIdentityService);
                const extension = extensionArg.location ? this.extensionsWorkbenchService.installed.find(e => uriIdentityService.extUri.isEqual(e.local?.location, extensionArg.location)) : undefined;
                if (extension) {
                    return this.extensionsWorkbenchService.toggleApplyExtensionToAllProfiles(extension);
                }
            }
        });
        this.registerExtensionAction({
            id: TOGGLE_IGNORE_EXTENSION_ACTION_ID,
            title: localize2('workbench.extensions.action.toggleIgnoreExtension', "Sync This Extension"),
            menu: {
                id: MenuId.ExtensionContext,
                group: '2_configure',
                when: ContextKeyExpr.and(ContextKeyExpr.equals('extensionStatus', 'installed'), CONTEXT_SYNC_ENABLEMENT, ContextKeyExpr.equals('isWorkspaceScopedExtension', false)),
                order: 4
            },
            run: async (accessor, id) => {
                const extension = this.extensionsWorkbenchService.local.find(e => areSameExtensions({ id }, e.identifier));
                if (extension) {
                    return this.extensionsWorkbenchService.toggleExtensionIgnoredToSync(extension);
                }
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.ignoreRecommendation',
            title: localize2('workbench.extensions.action.ignoreRecommendation', "Ignore Recommendation"),
            menu: {
                id: MenuId.ExtensionContext,
                group: '3_recommendations',
                when: ContextKeyExpr.has('isExtensionRecommended'),
                order: 1
            },
            run: async (accessor, id) => accessor.get(IExtensionIgnoredRecommendationsService).toggleGlobalIgnoredRecommendation(id, true)
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.undoIgnoredRecommendation',
            title: localize2('workbench.extensions.action.undoIgnoredRecommendation', "Undo Ignored Recommendation"),
            menu: {
                id: MenuId.ExtensionContext,
                group: '3_recommendations',
                when: ContextKeyExpr.has('isUserIgnoredRecommendation'),
                order: 1
            },
            run: async (accessor, id) => accessor.get(IExtensionIgnoredRecommendationsService).toggleGlobalIgnoredRecommendation(id, false)
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.addExtensionToWorkspaceRecommendations',
            title: localize2('workbench.extensions.action.addExtensionToWorkspaceRecommendations', "Add to Workspace Recommendations"),
            menu: {
                id: MenuId.ExtensionContext,
                group: '3_recommendations',
                when: ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo('empty'), ContextKeyExpr.has('isBuiltinExtension').negate(), ContextKeyExpr.has('isExtensionWorkspaceRecommended').negate(), ContextKeyExpr.has('isUserIgnoredRecommendation').negate(), ContextKeyExpr.notEquals('extensionSource', 'resource')),
                order: 2
            },
            run: (accessor, id) => accessor.get(IWorkspaceExtensionsConfigService).toggleRecommendation(id)
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.removeExtensionFromWorkspaceRecommendations',
            title: localize2('workbench.extensions.action.removeExtensionFromWorkspaceRecommendations', "Remove from Workspace Recommendations"),
            menu: {
                id: MenuId.ExtensionContext,
                group: '3_recommendations',
                when: ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo('empty'), ContextKeyExpr.has('isBuiltinExtension').negate(), ContextKeyExpr.has('isExtensionWorkspaceRecommended')),
                order: 2
            },
            run: (accessor, id) => accessor.get(IWorkspaceExtensionsConfigService).toggleRecommendation(id)
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.addToWorkspaceRecommendations',
            title: localize2('workbench.extensions.action.addToWorkspaceRecommendations', "Add Extension to Workspace Recommendations"),
            category: EXTENSIONS_CATEGORY,
            menu: {
                id: MenuId.CommandPalette,
                when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo('workspace'), ContextKeyExpr.equals('resourceScheme', Schemas.extension)),
            },
            async run(accessor) {
                const editorService = accessor.get(IEditorService);
                const workspaceExtensionsConfigService = accessor.get(IWorkspaceExtensionsConfigService);
                if (!(editorService.activeEditor instanceof ExtensionsInput)) {
                    return;
                }
                const extensionId = editorService.activeEditor.extension.identifier.id.toLowerCase();
                const recommendations = await workspaceExtensionsConfigService.getRecommendations();
                if (recommendations.includes(extensionId)) {
                    return;
                }
                await workspaceExtensionsConfigService.toggleRecommendation(extensionId);
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.addToWorkspaceFolderRecommendations',
            title: localize2('workbench.extensions.action.addToWorkspaceFolderRecommendations', "Add Extension to Workspace Folder Recommendations"),
            category: EXTENSIONS_CATEGORY,
            menu: {
                id: MenuId.CommandPalette,
                when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo('folder'), ContextKeyExpr.equals('resourceScheme', Schemas.extension)),
            },
            run: () => this.commandService.executeCommand('workbench.extensions.action.addToWorkspaceRecommendations')
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.addToWorkspaceIgnoredRecommendations',
            title: localize2('workbench.extensions.action.addToWorkspaceIgnoredRecommendations', "Add Extension to Workspace Ignored Recommendations"),
            category: EXTENSIONS_CATEGORY,
            menu: {
                id: MenuId.CommandPalette,
                when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo('workspace'), ContextKeyExpr.equals('resourceScheme', Schemas.extension)),
            },
            async run(accessor) {
                const editorService = accessor.get(IEditorService);
                const workspaceExtensionsConfigService = accessor.get(IWorkspaceExtensionsConfigService);
                if (!(editorService.activeEditor instanceof ExtensionsInput)) {
                    return;
                }
                const extensionId = editorService.activeEditor.extension.identifier.id.toLowerCase();
                const unwantedRecommendations = await workspaceExtensionsConfigService.getUnwantedRecommendations();
                if (unwantedRecommendations.includes(extensionId)) {
                    return;
                }
                await workspaceExtensionsConfigService.toggleUnwantedRecommendation(extensionId);
            }
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.addToWorkspaceFolderIgnoredRecommendations',
            title: localize2('workbench.extensions.action.addToWorkspaceFolderIgnoredRecommendations', "Add Extension to Workspace Folder Ignored Recommendations"),
            category: EXTENSIONS_CATEGORY,
            menu: {
                id: MenuId.CommandPalette,
                when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo('folder'), ContextKeyExpr.equals('resourceScheme', Schemas.extension)),
            },
            run: () => this.commandService.executeCommand('workbench.extensions.action.addToWorkspaceIgnoredRecommendations')
        });
        this.registerExtensionAction({
            id: ConfigureWorkspaceRecommendedExtensionsAction.ID,
            title: { value: ConfigureWorkspaceRecommendedExtensionsAction.LABEL, original: 'Configure Recommended Extensions (Workspace)' },
            category: EXTENSIONS_CATEGORY,
            menu: {
                id: MenuId.CommandPalette,
                when: WorkbenchStateContext.isEqualTo('workspace'),
            },
            run: () => runAction(this.instantiationService.createInstance(ConfigureWorkspaceRecommendedExtensionsAction, ConfigureWorkspaceRecommendedExtensionsAction.ID, ConfigureWorkspaceRecommendedExtensionsAction.LABEL))
        });
        this.registerExtensionAction({
            id: 'workbench.extensions.action.manageTrustedPublishers',
            title: localize2('workbench.extensions.action.manageTrustedPublishers', "Manage Trusted Extension Publishers"),
            category: EXTENSIONS_CATEGORY,
            f1: true,
            run: async (accessor) => {
                const quickInputService = accessor.get(IQuickInputService);
                const extensionManagementService = accessor.get(IWorkbenchExtensionManagementService);
                const trustedPublishers = extensionManagementService.getTrustedPublishers();
                const trustedPublisherItems = trustedPublishers.map(publisher => ({
                    id: publisher.publisher,
                    label: publisher.publisherDisplayName,
                    description: publisher.publisher,
                    picked: true,
                })).sort((a, b) => a.label.localeCompare(b.label));
                const result = await quickInputService.pick(trustedPublisherItems, {
                    canPickMany: true,
                    title: localize('trustedPublishers', "Manage Trusted Extension Publishers"),
                    placeHolder: localize('trustedPublishersPlaceholder', "Choose which publishers to trust"),
                });
                if (result) {
                    const untrustedPublishers = [];
                    for (const { publisher } of trustedPublishers) {
                        if (!result.some(r => r.id === publisher)) {
                            untrustedPublishers.push(publisher);
                        }
                    }
                    trustedPublishers.filter(publisher => !result.some(r => r.id === publisher.publisher));
                    extensionManagementService.untrustPublishers(...untrustedPublishers);
                }
            }
        });
    }
    registerExtensionAction(extensionActionOptions) {
        const menus = extensionActionOptions.menu ? Array.isArray(extensionActionOptions.menu) ? extensionActionOptions.menu : [extensionActionOptions.menu] : [];
        let menusWithOutTitles = [];
        const menusWithTitles = [];
        if (extensionActionOptions.menuTitles) {
            for (let index = 0; index < menus.length; index++) {
                const menu = menus[index];
                const menuTitle = extensionActionOptions.menuTitles[menu.id.id];
                if (menuTitle) {
                    menusWithTitles.push({ id: menu.id, item: { ...menu, command: { id: extensionActionOptions.id, title: menuTitle } } });
                }
                else {
                    menusWithOutTitles.push(menu);
                }
            }
        }
        else {
            menusWithOutTitles = menus;
        }
        const disposables = new DisposableStore();
        disposables.add(registerAction2(class extends Action2 {
            constructor() {
                super({
                    ...extensionActionOptions,
                    menu: menusWithOutTitles
                });
            }
            run(accessor, ...args) {
                return extensionActionOptions.run(accessor, ...args);
            }
        }));
        if (menusWithTitles.length) {
            disposables.add(MenuRegistry.appendMenuItems(menusWithTitles));
        }
        return disposables;
    }
};
ExtensionsContributions = __decorate([
    __param(0, IExtensionManagementService),
    __param(1, IExtensionManagementServerService),
    __param(2, IExtensionGalleryManifestService),
    __param(3, IContextKeyService),
    __param(4, IViewsService),
    __param(5, IExtensionsWorkbenchService),
    __param(6, IWorkbenchExtensionEnablementService),
    __param(7, IInstantiationService),
    __param(8, IDialogService),
    __param(9, ICommandService),
    __param(10, IProductService),
    __param(11, IPluginInstallService)
], ExtensionsContributions);
let ExtensionStorageCleaner = class ExtensionStorageCleaner {
    constructor(extensionManagementService, storageService) {
        ExtensionStorageService.removeOutdatedExtensionVersions(extensionManagementService, storageService);
    }
};
ExtensionStorageCleaner = __decorate([
    __param(0, IExtensionManagementService),
    __param(1, IStorageService)
], ExtensionStorageCleaner);
let TrustedPublishersInitializer = class TrustedPublishersInitializer {
    constructor(extensionManagementService, userDataProfilesService, productService, storageService) {
        const trustedPublishersInitStatusKey = 'trusted-publishers-init-migration';
        if (!storageService.get(trustedPublishersInitStatusKey, -1 /* StorageScope.APPLICATION */)) {
            for (const profile of userDataProfilesService.profiles) {
                extensionManagementService.getInstalled(1 /* ExtensionType.User */, profile.extensionsResource)
                    .then(async (extensions) => {
                    const trustedPublishers = new Map();
                    for (const extension of extensions) {
                        if (!extension.publisherDisplayName) {
                            continue;
                        }
                        const publisher = extension.manifest.publisher.toLowerCase();
                        if (productService.trustedExtensionPublishers?.includes(publisher)
                            || (extension.publisherDisplayName && productService.trustedExtensionPublishers?.includes(extension.publisherDisplayName.toLowerCase()))) {
                            continue;
                        }
                        trustedPublishers.set(publisher, { publisher, publisherDisplayName: extension.publisherDisplayName });
                    }
                    if (trustedPublishers.size) {
                        extensionManagementService.trustPublishers(...trustedPublishers.values());
                    }
                    storageService.store(trustedPublishersInitStatusKey, 'true', -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
                });
            }
        }
    }
};
TrustedPublishersInitializer = __decorate([
    __param(0, IWorkbenchExtensionManagementService),
    __param(1, IUserDataProfilesService),
    __param(2, IProductService),
    __param(3, IStorageService)
], TrustedPublishersInitializer);
let ExtensionToolsContribution = class ExtensionToolsContribution extends Disposable {
    static { this.ID = 'extensions.chat.toolsContribution'; }
    constructor(toolsService, instantiationService) {
        super();
        const searchExtensionsTool = instantiationService.createInstance(SearchExtensionsTool);
        this._register(toolsService.registerTool(SearchExtensionsToolData, searchExtensionsTool));
        this._register(toolsService.vscodeToolSet.addTool(SearchExtensionsToolData));
    }
};
ExtensionToolsContribution = __decorate([
    __param(0, ILanguageModelToolsService),
    __param(1, IInstantiationService)
], ExtensionToolsContribution);
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(ExtensionsContributions, 3 /* LifecyclePhase.Restored */);
workbenchRegistry.registerWorkbenchContribution(StatusUpdater, 4 /* LifecyclePhase.Eventually */);
workbenchRegistry.registerWorkbenchContribution(MaliciousExtensionChecker, 4 /* LifecyclePhase.Eventually */);
workbenchRegistry.registerWorkbenchContribution(KeymapExtensions, 3 /* LifecyclePhase.Restored */);
workbenchRegistry.registerWorkbenchContribution(ExtensionsViewletViewsContribution, 3 /* LifecyclePhase.Restored */);
workbenchRegistry.registerWorkbenchContribution(ExtensionActivationProgress, 4 /* LifecyclePhase.Eventually */);
workbenchRegistry.registerWorkbenchContribution(ExtensionDependencyChecker, 4 /* LifecyclePhase.Eventually */);
workbenchRegistry.registerWorkbenchContribution(ExtensionEnablementWorkspaceTrustTransitionParticipant, 3 /* LifecyclePhase.Restored */);
workbenchRegistry.registerWorkbenchContribution(ExtensionsCompletionItemsProvider, 3 /* LifecyclePhase.Restored */);
workbenchRegistry.registerWorkbenchContribution(UnsupportedExtensionsMigrationContrib, 4 /* LifecyclePhase.Eventually */);
workbenchRegistry.registerWorkbenchContribution(TrustedPublishersInitializer, 4 /* LifecyclePhase.Eventually */);
workbenchRegistry.registerWorkbenchContribution(ExtensionMarketplaceStatusUpdater, 4 /* LifecyclePhase.Eventually */);
if (isWeb) {
    workbenchRegistry.registerWorkbenchContribution(ExtensionStorageCleaner, 4 /* LifecyclePhase.Eventually */);
}
registerWorkbenchContribution2(ExtensionToolsContribution.ID, ExtensionToolsContribution, 3 /* WorkbenchPhase.AfterRestored */);
// Running Extensions
registerAction2(ShowRuntimeExtensionsAction);
registerAction2(class ExtensionsGallerySignInAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.extensions.actions.gallery.signIn',
            title: localize2('signInToMarketplace', 'Sign in to access Extensions Marketplace'),
            menu: {
                id: MenuId.AccountsContext,
                when: CONTEXT_EXTENSIONS_GALLERY_STATUS.isEqualTo("requiresSignIn" /* ExtensionGalleryManifestStatus.RequiresSignIn */)
            },
        });
    }
    run(accessor) {
        return accessor.get(ICommandService).executeCommand(DEFAULT_ACCOUNT_SIGN_IN_COMMAND);
    }
});
Registry.as(ConfigurationMigrationExtensions.ConfigurationMigration)
    .registerConfigurationMigrations([{
        key: AutoUpdateConfigurationKey,
        migrateFn: (value, accessor) => {
            if (value === 'onlySelectedExtensions') {
                return { value: false };
            }
            return [];
        }
    }]);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9ucy5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9leHRlbnNpb25zL2Jyb3dzZXIvZXh0ZW5zaW9ucy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFNUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRXpELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzlHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLGdDQUFnQyxDQUFDO0FBRXBFLE9BQU8sRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxPQUFPLEVBQThCLE1BQU0sRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDNUksT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDOUYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxVQUFVLElBQUksdUJBQXVCLEVBQThDLE1BQU0sb0VBQW9FLENBQUM7QUFDdkssT0FBTyxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN6SCxPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDcEcsT0FBTyxFQUFnRSxtQ0FBbUMsRUFBRSxzQ0FBc0MsRUFBNkIsZ0NBQWdDLEVBQUUsTUFBTSw2RUFBNkUsQ0FBQztBQUNyUyxPQUFPLEVBQUUsZ0NBQWdDLEVBQTBCLGlDQUFpQyxFQUFFLHdCQUF3QixFQUFjLHdCQUF3QixFQUFFLDJCQUEyQixFQUFFLHlCQUF5QixFQUFVLGlDQUFpQyxFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFDeFYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGVBQWUsRUFBRSxNQUFNLDRFQUE0RSxDQUFDO0FBQ2hJLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQzlHLE9BQU8sRUFBRSwyQ0FBMkMsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBQy9JLE9BQU8sRUFBRSxvQkFBb0IsRUFBaUIsTUFBTSxzREFBc0QsQ0FBQztBQUMzRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUYsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSw0REFBNEQsQ0FBQztBQUNySCxPQUFPLEtBQUssd0JBQXdCLE1BQU0scUVBQXFFLENBQUM7QUFDaEgsT0FBTyxFQUFFLG9CQUFvQixFQUFFLFFBQVEsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFHLE9BQU8sT0FBTyxNQUFNLGdEQUFnRCxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUV4RixPQUFPLEVBQUUsVUFBVSxFQUF3QixNQUFNLHVEQUF1RCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxvQkFBb0IsRUFBdUIsTUFBTSw0QkFBNEIsQ0FBQztBQUN2RixPQUFPLEVBQUUsVUFBVSxJQUFJLGdDQUFnQyxFQUFtQyxNQUFNLGtDQUFrQyxDQUFDO0FBQ25JLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxrQkFBa0IsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3BILE9BQU8sRUFBMkQsOEJBQThCLEVBQUUsVUFBVSxJQUFJLG1CQUFtQixFQUFrQixNQUFNLGtDQUFrQyxDQUFDO0FBQzlMLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQzdELE9BQU8sRUFBMkIsVUFBVSxJQUFJLHVCQUF1QixFQUF5QixNQUFNLDBCQUEwQixDQUFDO0FBQ2pJLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNsRixPQUFPLEVBQW1CLGlDQUFpQyxFQUFrQixvQ0FBb0MsRUFBRSxvQ0FBb0MsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQ3JPLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQzFLLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLGdGQUFnRixDQUFDO0FBQ25JLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUV0RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDMUcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDMUYsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDbEcsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFckYsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3BELE9BQU8sRUFBRSwyQkFBMkIsRUFBRSwwQkFBMEIsRUFBRSxpQ0FBaUMsRUFBRSxtQkFBbUIsRUFBRSxtQkFBbUIsRUFBa0QsbUJBQW1CLEVBQUUsdUJBQXVCLEVBQUUsMkJBQTJCLEVBQUUsNEJBQTRCLEVBQStDLDJCQUEyQixFQUFFLHFCQUFxQixFQUFFLHNDQUFzQyxFQUF1QyxnREFBZ0QsRUFBRSwyQkFBMkIsRUFBRSx3Q0FBd0MsRUFBRSxtQkFBbUIsRUFBRSxpQ0FBaUMsRUFBRSxvQkFBb0IsRUFBRSxVQUFVLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUM1dUIsT0FBTyxFQUFFLDZCQUE2QixFQUFFLCtCQUErQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDckgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQy9ELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ2hFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUN2RCxPQUFPLEVBQUUsc0RBQXNELEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNySSxPQUFPLEVBQUUsMENBQTBDLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUM3RyxPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsbURBQW1ELEVBQUUsNkNBQTZDLEVBQUUsYUFBYSxFQUFFLDJCQUEyQixFQUFFLHVDQUF1QyxFQUFFLG1CQUFtQixFQUFFLHNCQUFzQixFQUFFLHlCQUF5QixFQUFFLGtDQUFrQyxFQUFFLG1DQUFtQyxFQUFFLCtCQUErQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDeGEsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEYsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDM0YsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDOUUsT0FBTyxFQUFFLHNCQUFzQixFQUFFLHdCQUF3QixFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSwrQkFBK0IsRUFBRSxXQUFXLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUN0SyxPQUFPLEVBQUUsbUNBQW1DLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUN0SCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsaUNBQWlDLEVBQUUsNEJBQTRCLEVBQUUsdUJBQXVCLEVBQUUsa0NBQWtDLEVBQUUsMkJBQTJCLEVBQUUseUJBQXlCLEVBQUUsNEJBQTRCLEVBQUUsb0JBQW9CLEVBQUUsa0NBQWtDLEVBQUUsYUFBYSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDL1YsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0UsT0FBTyxpQ0FBaUMsQ0FBQztBQUN6QyxPQUFPLEVBQUUscUNBQXFDLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUV4RyxhQUFhO0FBQ2IsaUJBQWlCLENBQUMsMkJBQTJCLEVBQUUsMEJBQTBCLGtDQUF3RCxDQUFDO0FBQ2xJLGlCQUFpQixDQUFDLDJDQUEyQyxFQUFFLDBDQUEwQyxvQ0FBNEIsQ0FBQztBQUN0SSxpQkFBaUIsQ0FBQyxnQ0FBZ0MsRUFBRSwrQkFBK0Isa0NBQTBFLENBQUM7QUFFOUosZUFBZTtBQUNmLFFBQVEsQ0FBQyxFQUFFLENBQXVCLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQywyQkFBMkIsQ0FBQztJQUNyRixJQUFJLEVBQUUsbUNBQW1DO0lBQ3pDLE1BQU0sRUFBRSxtQ0FBbUMsQ0FBQyxNQUFNO0lBQ2xELFdBQVcsRUFBRSxRQUFRLENBQUMsd0NBQXdDLEVBQUUsbUNBQW1DLENBQUM7SUFDcEcsV0FBVyxFQUFFLENBQUMsRUFBRSxXQUFXLEVBQUUsUUFBUSxDQUFDLHNCQUFzQixFQUFFLG1CQUFtQixDQUFDLEVBQUUsQ0FBQztDQUNyRixDQUFDLENBQUM7QUFFSCxTQUFTO0FBQ1QsUUFBUSxDQUFDLEVBQUUsQ0FBc0IsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLENBQUMsa0JBQWtCLENBQy9FLG9CQUFvQixDQUFDLE1BQU0sQ0FDMUIsZUFBZSxFQUNmLGVBQWUsQ0FBQyxFQUFFLEVBQ2xCLFFBQVEsQ0FBQyxXQUFXLEVBQUUsV0FBVyxDQUFDLENBQ2xDLEVBQ0Q7SUFDQyxJQUFJLGNBQWMsQ0FBQyxlQUFlLENBQUM7Q0FDbkMsQ0FBQyxDQUFDO0FBRUosTUFBTSxDQUFDLE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxFQUFFLENBQTBCLHVCQUF1QixDQUFDLHNCQUFzQixDQUFDLENBQUMscUJBQXFCLENBQ3ZJO0lBQ0MsRUFBRSxFQUFFLFVBQVU7SUFDZCxLQUFLLEVBQUUsU0FBUyxDQUFDLFlBQVksRUFBRSxZQUFZLENBQUM7SUFDNUMsMkJBQTJCLEVBQUU7UUFDNUIsRUFBRSxFQUFFLFVBQVU7UUFDZCxhQUFhLEVBQUUsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLGtCQUFrQixFQUFFLE9BQU8sRUFBRSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxjQUFjLENBQUM7UUFDeEcsV0FBVyxFQUFFLEVBQUUsT0FBTyxFQUFFLG1EQUE2Qix3QkFBZSxFQUFFO1FBQ3RFLEtBQUssRUFBRSxDQUFDO0tBQ1I7SUFDRCxjQUFjLEVBQUUsSUFBSSxjQUFjLENBQUMsMkJBQTJCLENBQUM7SUFDL0QsSUFBSSxFQUFFLGtCQUFrQjtJQUN4QixLQUFLLEVBQUUsQ0FBQztJQUNSLGdCQUFnQixFQUFFLElBQUk7SUFDdEIsc0JBQXNCLEVBQUUsSUFBSTtDQUM1Qix3Q0FBZ0MsQ0FBQztBQUVuQyxRQUFRLENBQUMsRUFBRSxDQUF5Qix1QkFBdUIsQ0FBQyxhQUFhLENBQUM7S0FDeEUscUJBQXFCLENBQUM7SUFDdEIsRUFBRSxFQUFFLFlBQVk7SUFDaEIsS0FBSyxFQUFFLEVBQUU7SUFDVCxLQUFLLEVBQUUsUUFBUSxDQUFDLDhCQUE4QixFQUFFLFlBQVksQ0FBQztJQUM3RCxJQUFJLEVBQUUsUUFBUTtJQUNkLFVBQVUsRUFBRTtRQUNYLHVCQUF1QixFQUFFO1lBQ3hCLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRSxLQUFLLEVBQUU7WUFDN0MsY0FBYyxFQUFFO2dCQUNmLFFBQVEsQ0FBQyxLQUFLLEVBQUUsZ0JBQWdCLENBQUM7Z0JBQ2pDLFFBQVEsQ0FBQyxTQUFTLEVBQUUseUJBQXlCLENBQUM7Z0JBQzlDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDO2FBQ3hCO1lBQ0QsZ0JBQWdCLEVBQUU7Z0JBQ2pCLFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSxnRUFBZ0UsQ0FBQztnQkFDeEcsUUFBUSxDQUFDLCtCQUErQixFQUFFLHlFQUF5RSxDQUFDO2dCQUNwSCxRQUFRLENBQUMsNkJBQTZCLEVBQUUsMkNBQTJDLENBQUM7YUFDcEY7WUFDRCxXQUFXLEVBQUUsUUFBUSxDQUFDLHVCQUF1QixFQUFFLGdIQUFnSCxDQUFDO1lBQ2hLLE9BQU8sRUFBRSxJQUFJO1lBQ2IsS0FBSyx3Q0FBZ0M7WUFDckMsSUFBSSxFQUFFLENBQUMsb0JBQW9CLENBQUM7U0FDNUI7UUFDRCw2QkFBNkIsRUFBRTtZQUM5QixJQUFJLEVBQUUsU0FBUztZQUNmLFdBQVcsRUFBRSxRQUFRLENBQUMsd0JBQXdCLEVBQUUscU1BQXFNLENBQUM7WUFDdFAsT0FBTyxFQUFFLElBQUk7WUFDYixLQUFLLHdDQUFnQztZQUNyQyxJQUFJLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQztTQUM1QjtRQUNELGtDQUFrQyxFQUFFO1lBQ25DLElBQUksRUFBRSxTQUFTO1lBQ2YsV0FBVyxFQUFFLFFBQVEsQ0FBQyxpQ0FBaUMsRUFBRSxrRkFBa0YsQ0FBQztZQUM1SSxPQUFPLEVBQUUsS0FBSztTQUNkO1FBQ0QsNENBQTRDLEVBQUU7WUFDN0MsSUFBSSxFQUFFLFNBQVM7WUFDZixrQkFBa0IsRUFBRSxRQUFRLENBQUMsc0RBQXNELEVBQUUsaU1BQWlNLENBQUM7WUFDdlIsT0FBTyxFQUFFLEtBQUs7WUFDZCxJQUFJLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQztTQUM1QjtRQUNELDhDQUE4QyxFQUFFO1lBQy9DLElBQUksRUFBRSxTQUFTO1lBQ2YsV0FBVyxFQUFFLFFBQVEsQ0FBQyw2Q0FBNkMsRUFBRSwwSEFBMEgsQ0FBQztZQUNoTSxPQUFPLEVBQUUsS0FBSztTQUNkO1FBQ0QsNENBQTRDLEVBQUU7WUFDN0MsSUFBSSxFQUFFLE9BQU87WUFDYixLQUFLLEVBQUU7Z0JBQ04sSUFBSSxFQUFFLFFBQVE7YUFDZDtZQUNELFdBQVcsRUFBRSxRQUFRLENBQUMsOEJBQThCLEVBQUUsOEdBQThHLENBQUM7WUFDckssT0FBTyxFQUFFLEVBQUU7WUFDWCxLQUFLLHdDQUFnQztTQUNyQztRQUNELHNCQUFzQixFQUFFO1lBQ3ZCLElBQUksRUFBRSxDQUFDLFNBQVMsRUFBRSxRQUFRLENBQUM7WUFDM0IsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUM7WUFDM0IsZ0JBQWdCLEVBQUU7Z0JBQ2pCLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSx3REFBd0QsQ0FBQztnQkFDOUYsUUFBUSxDQUFDLDJCQUEyQixFQUFFLHVEQUF1RCxDQUFDO2dCQUM5RixRQUFRLENBQUMsMEJBQTBCLEVBQUUsK0VBQStFLENBQUM7YUFDckg7WUFDRCxXQUFXLEVBQUUsUUFBUSxDQUFDLHFCQUFxQixFQUFFLG1DQUFtQyxDQUFDO1lBQ2pGLE9BQU8sRUFBRSxNQUFNO1NBQ2Y7UUFDRCxxQ0FBcUMsRUFBRTtZQUN0QyxJQUFJLEVBQUUsUUFBUTtZQUNkLG1CQUFtQixFQUFFLFFBQVEsQ0FBQyxxQ0FBcUMsRUFBRSwwREFBMEQsQ0FBQztZQUNoSSxpQkFBaUIsRUFBRTtnQkFDbEIsMERBQTBELEVBQUU7b0JBQzNELElBQUksRUFBRSxTQUFTO29CQUNmLE9BQU8sRUFBRSxLQUFLO2lCQUNkO2FBQ0Q7WUFDRCxvQkFBb0IsRUFBRSxLQUFLO1lBQzNCLE9BQU8sRUFBRSxFQUFFO1lBQ1gsZUFBZSxFQUFFLENBQUM7b0JBQ2pCLE1BQU0sRUFBRTt3QkFDUCxVQUFVLEVBQUUsS0FBSztxQkFDakI7aUJBQ0QsQ0FBQztTQUNGO1FBQ0Qsa0NBQWtDLEVBQUU7WUFDbkMsSUFBSSxFQUFFLFFBQVE7WUFDZCxtQkFBbUIsRUFBRSxRQUFRLENBQUMscUJBQXFCLEVBQUUsMEVBQTBFLENBQUM7WUFDaEksaUJBQWlCLEVBQUU7Z0JBQ2xCLDBEQUEwRCxFQUFFO29CQUMzRCxJQUFJLEVBQUUsU0FBUztvQkFDZixPQUFPLEVBQUUsQ0FBQztpQkFDVjthQUNEO1lBQ0Qsb0JBQW9CLEVBQUUsS0FBSztZQUMzQixPQUFPLEVBQUUsRUFBRTtZQUNYLGVBQWUsRUFBRSxDQUFDO29CQUNqQixNQUFNLEVBQUU7d0JBQ1AsVUFBVSxFQUFFLENBQUM7cUJBQ2I7aUJBQ0QsQ0FBQztTQUNGO1FBQ0QsQ0FBQyxpQ0FBaUMsQ0FBQyxFQUFFO1lBQ3BDLElBQUksRUFBRSxRQUFRO1lBQ2QsS0FBSyx3Q0FBZ0M7WUFDckMsbUJBQW1CLEVBQUUsUUFBUSxDQUFDLHVDQUF1QyxFQUFFLCtTQUErUyxDQUFDO1lBQ3ZYLGlCQUFpQixFQUFFO2dCQUNsQiwwREFBMEQsRUFBRTtvQkFDM0QsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsVUFBVSxFQUFFO3dCQUNYLFdBQVcsRUFBRTs0QkFDWixJQUFJLEVBQUUsQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDOzRCQUMzQixJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLFNBQVMsQ0FBQzs0QkFDOUIsZ0JBQWdCLEVBQUU7Z0NBQ2pCLFFBQVEsQ0FBQyw0Q0FBNEMsRUFBRSxtQ0FBbUMsQ0FBQztnQ0FDM0YsUUFBUSxDQUFDLDZDQUE2QyxFQUFFLG9FQUFvRSxDQUFDO2dDQUM3SCxRQUFRLENBQUMsK0NBQStDLEVBQUUsOEZBQThGLENBQUM7NkJBQ3pKOzRCQUNELFdBQVcsRUFBRSxRQUFRLENBQUMsaURBQWlELEVBQUUsb0VBQW9FLENBQUM7eUJBQzlJO3dCQUNELFNBQVMsRUFBRTs0QkFDVixJQUFJLEVBQUUsUUFBUTs0QkFDZCxXQUFXLEVBQUUsUUFBUSxDQUFDLCtDQUErQyxFQUFFLHFLQUFxSyxDQUFDO3lCQUM3TztxQkFDRDtpQkFDRDthQUNEO1NBQ0Q7UUFDRCwyREFBMkQsRUFBRTtZQUM1RCxJQUFJLEVBQUUsU0FBUztZQUNmLFdBQVcsRUFBRSxRQUFRLENBQUMsNkNBQTZDLEVBQUUsb0hBQW9ILENBQUM7WUFDMUwsT0FBTyxFQUFFLEtBQUs7U0FDZDtRQUNELDBDQUEwQyxFQUFFO1lBQzNDLElBQUksRUFBRSxTQUFTO1lBQ2YsV0FBVyxFQUFFLFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSw2RkFBNkYsQ0FBQztZQUMvSSxPQUFPLEVBQUUsSUFBSTtTQUNiO1FBQ0QsbUNBQW1DLEVBQUU7WUFDcEMsSUFBSSxFQUFFLFNBQVM7WUFDZixXQUFXLEVBQUUsUUFBUSxDQUFDLG1DQUFtQyxFQUFFLDZFQUE2RSxDQUFDO1lBQ3pJLE9BQU8sRUFBRSxLQUFLLEVBQUUseUVBQXlFO1lBQ3pGLElBQUksRUFBRSxDQUFDLGNBQWMsQ0FBQztZQUN0QixVQUFVLEVBQUU7Z0JBQ1gsSUFBSSxFQUFFLE1BQU07YUFDWjtTQUNEO1FBQ0QsQ0FBQyxpQ0FBaUMsQ0FBQyxFQUFFO1lBQ3BDLElBQUksRUFBRSxTQUFTO1lBQ2YsV0FBVyxFQUFFLFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSw4RUFBOEUsQ0FBQztZQUNuSSxPQUFPLEVBQUUsSUFBSTtZQUNiLEtBQUssd0NBQWdDO1lBQ3JDLFFBQVEsRUFBRSxRQUFRO1NBQ2xCO1FBQ0QsQ0FBQywyQkFBMkIsQ0FBQyxFQUFFO1lBQzlCLElBQUksRUFBRSxTQUFTO1lBQ2YsV0FBVyxFQUFFLFFBQVEsQ0FBQyxhQUFhLEVBQUUsK0tBQStLLENBQUM7WUFDck4sT0FBTyxFQUFFLEtBQUs7WUFDZCxRQUFRLEVBQUUsT0FBTyxDQUFDLE9BQU8sS0FBSyxRQUFRO1NBQ3RDO1FBQ0QsQ0FBQyxtQ0FBbUMsQ0FBQyxFQUFFO1lBQ3RDLElBQUksRUFBRSxRQUFRO1lBQ2QsV0FBVyxFQUFFLFFBQVEsQ0FBQywrQkFBK0IsRUFBRSxxREFBcUQsQ0FBQztZQUM3RyxPQUFPLEVBQUUsRUFBRTtZQUNYLEtBQUssd0NBQWdDO1lBQ3JDLElBQUksRUFBRSxDQUFDLG9CQUFvQixDQUFDO1lBQzVCLFFBQVEsRUFBRSxLQUFLO1lBQ2YsTUFBTSxFQUFFO2dCQUNQLElBQUksRUFBRSw0QkFBNEI7Z0JBQ2xDLFFBQVEsRUFBRSxjQUFjLENBQUMsVUFBVTtnQkFDbkMsY0FBYyxFQUFFLE1BQU07Z0JBQ3RCLFlBQVksRUFBRTtvQkFDYixXQUFXLEVBQUU7d0JBQ1osR0FBRyxFQUFFLCtCQUErQjt3QkFDcEMsS0FBSyxFQUFFLFFBQVEsQ0FBQywrQkFBK0IsRUFBRSxxREFBcUQsQ0FBQztxQkFDdkc7aUJBQ0Q7YUFDRDtTQUNEO1FBQ0QsdUNBQXVDLEVBQUU7WUFDeEMsSUFBSSxFQUFFLFNBQVM7WUFDZixXQUFXLEVBQUUsUUFBUSxDQUFDLHNDQUFzQyxFQUFFLHdFQUF3RSxDQUFDO1lBQ3ZJLE9BQU8sRUFBRSxLQUFLO1NBQ2Q7UUFDRCxDQUFDLGlDQUFpQyxDQUFDLEVBQUU7WUFDcEMsSUFBSSxFQUFFLFFBQVE7WUFDZCxXQUFXLEVBQUUsUUFBUSxDQUFDLDBCQUEwQixFQUFFLDJHQUEyRyxDQUFDO1lBQzlKLE9BQU8sRUFBRSxNQUFNO1lBQ2YsS0FBSyx3Q0FBZ0M7WUFDckMsSUFBSSxFQUFFLENBQUMsVUFBVSxFQUFFLG9CQUFvQixDQUFDO1NBQ3hDO0tBQ0Q7Q0FDRCxDQUFDLENBQUM7QUFFSixNQUFNLFlBQVksR0FBdUQsUUFBUSxDQUFDLEVBQUUsQ0FBQyx3QkFBd0IsQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUMzSSxZQUFZLENBQUMsY0FBYyxDQUFDLCtCQUErQixFQUFFLDZCQUE2QixDQUFDLENBQUM7QUFFNUYsb0JBQW9CO0FBQ3BCLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLFFBQTBCLEVBQUUsV0FBbUIsRUFBRSxHQUF3QixFQUFFLGFBQXVCLEVBQUUsT0FBZ0IsRUFBRSxFQUFFO0lBQy9LLE1BQU0sZ0JBQWdCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO0lBQ25FLE1BQU0sU0FBUyxHQUFHLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLEVBQUUsRUFBRSxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN6RyxJQUFJLFNBQVMsRUFBRSxDQUFDO1FBQ2YsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxFQUFFLEdBQUcsRUFBRSxhQUFhLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUNuRSxDQUFDO1NBQU0sQ0FBQztRQUNQLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSw0QkFBNEIsRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBQ2xGLENBQUM7QUFDRixDQUFDLENBQUMsQ0FBQztBQUVILGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxXQUFtQixFQUFFLEdBQXdCLEVBQUUsYUFBdUIsRUFBRSxPQUFnQixFQUFFLFVBQW9CLEVBQUUsRUFBRTtJQUN2TSxNQUFNLGdCQUFnQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUMsQ0FBQztJQUNuRSxNQUFNLGNBQWMsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBRXJELE1BQU0sQ0FBQyxTQUFTLENBQUMsR0FBRyxNQUFNLGdCQUFnQixDQUFDLGFBQWEsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLFdBQVcsRUFBRSxDQUFDLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDeEcsSUFBSSxTQUFTLEVBQUUsQ0FBQztRQUNmLE9BQU8sZ0JBQWdCLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxFQUFFLEdBQUcsRUFBRSxhQUFhLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7SUFDdEYsQ0FBQztJQUVELE9BQU8sY0FBYyxDQUFDLGNBQWMsQ0FBQyxvQkFBb0IsRUFBRSxXQUFXLEVBQUUsR0FBRyxFQUFFLGFBQWEsRUFBRSxPQUFPLENBQUMsQ0FBQztBQUN0RyxDQUFDLENBQUMsQ0FBQztBQUVILGdCQUFnQixDQUFDLGVBQWUsQ0FBQztJQUNoQyxFQUFFLEVBQUUsdUNBQXVDO0lBQzNDLFFBQVEsRUFBRTtRQUNULFdBQVcsRUFBRSxRQUFRLENBQUMsbURBQW1ELEVBQUUsNkJBQTZCLENBQUM7UUFDekcsSUFBSSxFQUFFO1lBQ0w7Z0JBQ0MsSUFBSSxFQUFFLHNCQUFzQjtnQkFDNUIsV0FBVyxFQUFFLFFBQVEsQ0FBQyxzREFBc0QsRUFBRSxtQ0FBbUMsQ0FBQztnQkFDbEgsVUFBVSxFQUFFLENBQUMsS0FBVSxFQUFFLEVBQUUsQ0FBQyxPQUFPLEtBQUssS0FBSyxRQUFRLElBQUksS0FBSyxZQUFZLEdBQUc7YUFDN0U7WUFDRDtnQkFDQyxJQUFJLEVBQUUsU0FBUztnQkFDZixXQUFXLEVBQUUseUZBQXlGO29CQUNyRyw4TEFBOEw7Z0JBQy9MLFVBQVUsRUFBRSxJQUFJO2dCQUNoQixNQUFNLEVBQUU7b0JBQ1AsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLFlBQVksRUFBRTt3QkFDYiw0Q0FBNEMsRUFBRTs0QkFDN0MsTUFBTSxFQUFFLFNBQVM7NEJBQ2pCLGFBQWEsRUFBRSxRQUFRLENBQUMseUZBQXlGLEVBQUUsa0pBQWtKLENBQUM7NEJBQ3RRLE9BQU8sRUFBRSxLQUFLO3lCQUNkO3dCQUNELDBCQUEwQixFQUFFOzRCQUMzQixNQUFNLEVBQUUsU0FBUzs0QkFDakIsYUFBYSxFQUFFLFFBQVEsQ0FBQyx1RUFBdUUsRUFBRSx1RkFBdUYsQ0FBQzs0QkFDekwsT0FBTyxFQUFFLEtBQUs7eUJBQ2Q7d0JBQ0QsV0FBVyxFQUFFOzRCQUNaLE1BQU0sRUFBRSxTQUFTOzRCQUNqQixhQUFhLEVBQUUsUUFBUSxDQUFDLHdEQUF3RCxFQUFFLDRFQUE0RSxDQUFDOzRCQUMvSixPQUFPLEVBQUUsS0FBSzt5QkFDZDt3QkFDRCxlQUFlLEVBQUU7NEJBQ2hCLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUM7NEJBQzVCLGFBQWEsRUFBRSxRQUFRLENBQUMsNERBQTRELEVBQUUsNlJBQTZSLENBQUM7eUJBQ3BYO3dCQUNELFFBQVEsRUFBRTs0QkFDVCxNQUFNLEVBQUUsU0FBUzs0QkFDakIsYUFBYSxFQUFFLFFBQVEsQ0FBQyxxREFBcUQsRUFBRSx1SUFBdUksQ0FBQzs0QkFDdk4sT0FBTyxFQUFFLEtBQUs7eUJBQ2Q7d0JBQ0QsU0FBUyxFQUFFOzRCQUNWLE1BQU0sRUFBRSxRQUFROzRCQUNoQixhQUFhLEVBQUUsUUFBUSxDQUFDLHNEQUFzRCxFQUFFLDJNQUEyTSxDQUFDO3lCQUM1UjtxQkFDRDtpQkFDRDthQUNEO1NBQ0Q7S0FDRDtJQUNELE9BQU8sRUFBRSxLQUFLLEVBQ2IsUUFBUSxFQUNSLEdBQTJCLEVBQzNCLE9BT0MsRUFBRSxFQUFFO1FBQ0wsTUFBTSwwQkFBMEIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDLENBQUM7UUFDN0UsTUFBTSwwQkFBMEIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLG9DQUFvQyxDQUFDLENBQUM7UUFDdEYsTUFBTSx1QkFBdUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHdCQUF3QixDQUFDLENBQUM7UUFDdkUsSUFBSSxDQUFDO1lBQ0osSUFBSSxPQUFPLEdBQUcsS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDN0IsTUFBTSxDQUFDLEVBQUUsRUFBRSxPQUFPLENBQUMsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQzNDLE1BQU0sU0FBUyxHQUFHLDBCQUEwQixDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3JILElBQUksU0FBUyxFQUFFLGVBQWUsb0RBQTRDLEVBQUUsQ0FBQztvQkFDNUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLE1BQU0sdUJBQXVCLENBQUMsYUFBYSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxDQUFDLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQy9JLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQzt3QkFDZCxNQUFNLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsNEJBQTRCLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFDMUUsQ0FBQztvQkFDRCxNQUFNLDBCQUEwQixDQUFDLGtCQUFrQixDQUFDLE9BQU8sRUFBRTt3QkFDNUQsZUFBZSxFQUFFLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLHdGQUF3Rjt3QkFDaEosd0JBQXdCLEVBQUUsT0FBTyxFQUFFLHdCQUF3Qjt3QkFDM0QsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDLE9BQU87d0JBQzlCLE9BQU8sRUFBRSxFQUFFLEdBQUcsT0FBTyxFQUFFLE9BQU8sRUFBRSxDQUFDLGdDQUFnQyxDQUFDLGdEQUFnQyxFQUFFO3FCQUNwRyxDQUFDLENBQUM7Z0JBQ0osQ0FBQztxQkFBTSxDQUFDO29CQUNQLE1BQU0sMEJBQTBCLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRTt3QkFDNUMsT0FBTzt3QkFDUCx3QkFBd0IsRUFBRSxPQUFPLEVBQUUsd0JBQXdCO3dCQUMzRCxPQUFPLEVBQUUsRUFBRSxHQUFHLE9BQU8sRUFBRSxPQUFPLEVBQUUsQ0FBQyxnQ0FBZ0MsQ0FBQyxnREFBZ0MsRUFBRTt3QkFDcEcsYUFBYSxFQUFFLE9BQU8sRUFBRSxhQUFhO3dCQUNyQyxNQUFNLEVBQUUsT0FBTyxFQUFFLE1BQU07d0JBQ3ZCLGVBQWUsRUFBRSxPQUFPLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSx3RkFBd0Y7cUJBQ2hKLHlDQUFnQyxDQUFDO2dCQUNuQyxDQUFDO1lBQ0YsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE1BQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQzdCLE1BQU0sMEJBQTBCLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxFQUFFLG1CQUFtQixFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDL0UsQ0FBQztRQUNGLENBQUM7UUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ1osaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckIsTUFBTSxDQUFDLENBQUM7UUFDVCxDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILGdCQUFnQixDQUFDLGVBQWUsQ0FBQztJQUNoQyxFQUFFLEVBQUUseUNBQXlDO0lBQzdDLFFBQVEsRUFBRTtRQUNULFdBQVcsRUFBRSxRQUFRLENBQUMscURBQXFELEVBQUUsK0JBQStCLENBQUM7UUFDN0csSUFBSSxFQUFFO1lBQ0w7Z0JBQ0MsSUFBSSxFQUFFLFFBQVEsQ0FBQyxrREFBa0QsRUFBRSxrQ0FBa0MsQ0FBQztnQkFDdEcsTUFBTSxFQUFFO29CQUNQLE1BQU0sRUFBRSxRQUFRO2lCQUNoQjthQUNEO1NBQ0Q7S0FDRDtJQUNELE9BQU8sRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEVBQVUsRUFBRSxFQUFFO1FBQ3ZDLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNULE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDLENBQUM7UUFDcEUsQ0FBQztRQUNELE1BQU0sMEJBQTBCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1FBQzdFLE1BQU0sU0FBUyxHQUFHLE1BQU0sMEJBQTBCLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEUsTUFBTSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUYsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDM0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLGtJQUFrSSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbkwsQ0FBQztRQUNELElBQUksb0JBQW9CLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDcEMsTUFBTSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsU0FBUyxFQUFFLG1FQUFtRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDL0csQ0FBQztRQUVELElBQUksQ0FBQztZQUNKLE1BQU0sMEJBQTBCLENBQUMsU0FBUyxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDbEUsQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDWixpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNyQixNQUFNLENBQUMsQ0FBQztRQUNULENBQUM7SUFDRixDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsZ0JBQWdCLENBQUMsZUFBZSxDQUFDO0lBQ2hDLEVBQUUsRUFBRSw2QkFBNkI7SUFDakMsUUFBUSxFQUFFO1FBQ1QsV0FBVyxFQUFFLFFBQVEsQ0FBQyx5Q0FBeUMsRUFBRSxpQ0FBaUMsQ0FBQztRQUNuRyxJQUFJLEVBQUU7WUFDTDtnQkFDQyxJQUFJLEVBQUUsUUFBUSxDQUFDLHNDQUFzQyxFQUFFLHdCQUF3QixDQUFDO2dCQUNoRixNQUFNLEVBQUUsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFO2FBQzVCO1NBQ0Q7S0FDRDtJQUNELE9BQU8sRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLFFBQWdCLEVBQUUsRUFBRSxFQUFFO1FBQy9DLE9BQU8sUUFBUSxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNwRSxDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsU0FBUyw2Q0FBNkMsQ0FBQyxPQUFpQyxFQUFFLENBQThCO0lBQ3ZILE9BQU8sRUFBRSxpQkFBaUIsQ0FBQyxHQUFHLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQyxRQUFRLEVBQUUsRUFBRTtRQUNqRSxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ25ELE1BQU0sTUFBTSxHQUFHLGFBQWEsQ0FBQyxnQkFBZ0IsQ0FBQztRQUM5QyxJQUFJLE1BQU0sWUFBWSxlQUFlLEVBQUUsQ0FBQztZQUN2QyxJQUFJLE1BQU0sQ0FBQyxhQUFhLEVBQUUsU0FBUyxFQUFFLENBQUM7Z0JBQ3JDLENBQUMsQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUM7Z0JBQ3hCLE9BQU8sSUFBSSxDQUFDO1lBQ2IsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELDZDQUE2QyxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQ3JGLDZDQUE2QyxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO0FBQ25GLDZDQUE2QyxDQUFDLFdBQVcsRUFBRSxPQUFPLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0FBRXZGLFdBQVc7QUFDWCxNQUFNLENBQUMsTUFBTSx3QkFBd0IsR0FBRyxJQUFJLGFBQWEsQ0FBVSxnQkFBZ0IsRUFBRSxLQUFLLENBQUMsQ0FBQztBQUM1RixNQUFNLENBQUMsTUFBTSx5QkFBeUIsR0FBRyxJQUFJLGFBQWEsQ0FBVSxpQkFBaUIsRUFBRSxLQUFLLENBQUMsQ0FBQztBQUM5RixNQUFNLENBQUMsTUFBTSxzQkFBc0IsR0FBRyxJQUFJLGFBQWEsQ0FBVSxjQUFjLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDeEYsTUFBTSxpQ0FBaUMsR0FBRyxJQUFJLGFBQWEsQ0FBUyx5QkFBeUIsRUFBRSxFQUFFLENBQUMsQ0FBQztBQUNuRyxNQUFNLG1DQUFtQyxHQUFHLElBQUksYUFBYSxDQUFTLDJCQUEyQixFQUFFLEVBQUUsQ0FBQyxDQUFDO0FBQ3ZHLE1BQU0sNENBQTRDLEdBQUcsSUFBSSxhQUFhLENBQVUsa0NBQWtDLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDM0gsTUFBTSw2Q0FBNkMsR0FBRyxJQUFJLGFBQWEsQ0FBVSxtQ0FBbUMsRUFBRSxLQUFLLENBQUMsQ0FBQztBQUM3SCxNQUFNLGtDQUFrQyxHQUFHLElBQUksYUFBYSxDQUFVLHlCQUF5QixFQUFFLEtBQUssQ0FBQyxDQUFDO0FBRXhHLEtBQUssVUFBVSxTQUFTLENBQUMsTUFBZTtJQUN2QyxJQUFJLENBQUM7UUFDSixNQUFNLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNwQixDQUFDO1lBQVMsQ0FBQztRQUNWLElBQUksWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDMUIsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2xCLENBQUM7SUFDRixDQUFDO0FBQ0YsQ0FBQztBQU9ELElBQU0sdUJBQXVCLEdBQTdCLE1BQU0sdUJBQXdCLFNBQVEsVUFBVTtJQUUvQyxZQUMrQywwQkFBdUQsRUFDakQsZ0NBQW1FLEVBQ3BFLCtCQUFpRSxFQUMvRSxpQkFBcUMsRUFDMUMsWUFBMkIsRUFDYiwwQkFBdUQsRUFDOUMsMEJBQWdFLEVBQy9FLG9CQUEyQyxFQUNsRCxhQUE2QixFQUM1QixjQUErQixFQUMvQixjQUErQixFQUN6QixvQkFBMkM7UUFFbkYsS0FBSyxFQUFFLENBQUM7UUFic0MsK0JBQTBCLEdBQTFCLDBCQUEwQixDQUE2QjtRQUNqRCxxQ0FBZ0MsR0FBaEMsZ0NBQWdDLENBQW1DO1FBQ3BFLG9DQUErQixHQUEvQiwrQkFBK0IsQ0FBa0M7UUFDL0Usc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUMxQyxpQkFBWSxHQUFaLFlBQVksQ0FBZTtRQUNiLCtCQUEwQixHQUExQiwwQkFBMEIsQ0FBNkI7UUFDOUMsK0JBQTBCLEdBQTFCLDBCQUEwQixDQUFzQztRQUMvRSx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBQ2xELGtCQUFhLEdBQWIsYUFBYSxDQUFnQjtRQUM1QixtQkFBYyxHQUFkLGNBQWMsQ0FBaUI7UUFDL0IsbUJBQWMsR0FBZCxjQUFjLENBQWlCO1FBQ3pCLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFHbkYsTUFBTSxxQkFBcUIsR0FBRyx3QkFBd0IsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUNqRixJQUFJLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyw4QkFBOEIsRUFBRSxDQUFDO1lBQzFFLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqQyxDQUFDO1FBRUQsTUFBTSxzQkFBc0IsR0FBRyx5QkFBeUIsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUNuRixJQUFJLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQywrQkFBK0IsRUFBRSxDQUFDO1lBQzNFLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNsQyxDQUFDO1FBRUQsTUFBTSxtQkFBbUIsR0FBRyxzQkFBc0IsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUM3RSxJQUFJLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyw0QkFBNEIsRUFBRSxDQUFDO1lBQ3hFLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMvQixDQUFDO1FBRUQsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLENBQUM7UUFDNUMsSUFBSSxDQUFDLFNBQVMsQ0FBQywrQkFBK0IsQ0FBQyx5Q0FBeUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsb0NBQW9DLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDN0ksK0JBQStCLENBQUMsMkJBQTJCLEVBQUU7YUFDM0QsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEVBQUU7WUFDaEMsSUFBSSxDQUFDLGlDQUFpQyxDQUFDLHdCQUF3QixDQUFDLENBQUM7WUFDakUsSUFBSSxDQUFDLFNBQVMsQ0FBQywrQkFBK0IsQ0FBQyxtQ0FBbUMsQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ25MLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7UUFDN0IsSUFBSSxDQUFDLDBCQUEwQixFQUFFLENBQUM7UUFDbEMsSUFBSSxDQUFDLDJCQUEyQixFQUFFLENBQUM7SUFDcEMsQ0FBQztJQUVPLEtBQUssQ0FBQyxvQ0FBb0M7UUFDakQsbUJBQW1CLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsK0JBQStCLENBQUMsOEJBQThCLCtEQUE2QyxDQUFDLENBQUM7UUFDekssaUNBQWlDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsK0JBQStCLENBQUMsOEJBQThCLENBQUMsQ0FBQztJQUMzSSxDQUFDO0lBRU8sS0FBSyxDQUFDLGlDQUFpQyxDQUFDLHdCQUEwRDtRQUN6RyxpQ0FBaUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksd0JBQXdCLEVBQUUsWUFBWSxDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDbkwsbUNBQW1DLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHdCQUF3QixFQUFFLFlBQVksQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzVLLDRDQUE0QyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLHdCQUF3QixFQUFFLFlBQVksRUFBRSxPQUFPLEVBQUUseUJBQXlCLENBQUMsQ0FBQztRQUM5Siw2Q0FBNkMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyx3QkFBd0IsRUFBRSxZQUFZLEVBQUUsT0FBTyxFQUFFLDBCQUEwQixDQUFDLENBQUM7UUFDaEssa0NBQWtDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyx3QkFBd0IsSUFBSSxzQ0FBc0MsQ0FBQyx3QkFBd0IsK0ZBQXVELENBQUMsQ0FBQyxDQUFDO0lBQy9OLENBQUM7SUFFTywyQkFBMkI7UUFDbEMsSUFBSSxJQUFJLENBQUMsZ0NBQWdDLENBQUMsOEJBQThCO2VBQ3BFLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQywrQkFBK0I7ZUFDckUsSUFBSSxDQUFDLGdDQUFnQyxDQUFDLDRCQUE0QixFQUNwRSxDQUFDO1lBQ0YsUUFBUSxDQUFDLEVBQUUsQ0FBdUIsVUFBVSxDQUFDLFdBQVcsQ0FBQyxDQUFDLDJCQUEyQixDQUFDO2dCQUNyRixJQUFJLEVBQUUsbUNBQW1DO2dCQUN6QyxNQUFNLEVBQUUsbUNBQW1DLENBQUMsTUFBTTtnQkFDbEQsV0FBVyxFQUFFLFFBQVEsQ0FBQyx3Q0FBd0MsRUFBRSxxREFBcUQsQ0FBQztnQkFDdEgsV0FBVyxFQUFFLENBQUMsRUFBRSxXQUFXLEVBQUUsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLDhCQUE4QixDQUFDLEVBQUUsQ0FBQzthQUMzRyxDQUFDLENBQUM7UUFDSixDQUFDO0lBQ0YsQ0FBQztJQUVELGlCQUFpQjtJQUNULHFCQUFxQjtRQUM1QixJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLHNCQUFzQixFQUFFO1lBQ3pFLE9BQU8sRUFBRTtnQkFDUixFQUFFLEVBQUUsVUFBVTtnQkFDZCxLQUFLLEVBQUUsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLHlCQUF5QixFQUFFLE9BQU8sRUFBRSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxjQUFjLENBQUM7YUFDdkc7WUFDRCxLQUFLLEVBQUUsaUJBQWlCO1lBQ3hCLEtBQUssRUFBRSxDQUFDO1lBQ1IsSUFBSSxFQUFFLHVCQUF1QixDQUFDLE1BQU0sRUFBRTtTQUN0QyxDQUFDLENBQUMsQ0FBQztRQUNKLElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsY0FBYyxFQUFFO1lBQ2pFLE9BQU8sRUFBRTtnQkFDUixFQUFFLEVBQUUsVUFBVTtnQkFDZCxLQUFLLEVBQUUsUUFBUSxDQUFDLGdCQUFnQixFQUFFLFlBQVksQ0FBQzthQUMvQztZQUNELEtBQUssRUFBRSxpQkFBaUI7WUFDeEIsS0FBSyxFQUFFLENBQUM7U0FDUixDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsaURBQWlEO1lBQ3JELEtBQUssRUFBRSxTQUFTLENBQUMsaUJBQWlCLEVBQUUsMEJBQTBCLENBQUM7WUFDL0QsUUFBUSxFQUFFLHdCQUF3QjtZQUNsQyxFQUFFLEVBQUUsSUFBSTtZQUNSLEdBQUcsRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxFQUFFO2dCQUN6QyxNQUFNLFFBQVEsQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDaEUsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsK0NBQStDO1lBQ25ELEtBQUssRUFBRSxTQUFTLENBQUMsbUJBQW1CLEVBQUUsb0JBQW9CLENBQUM7WUFDM0QsUUFBUSxFQUFFLHdCQUF3QjtZQUNsQyxJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxjQUFjO2dCQUN6QixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxjQUFjLENBQUMsRUFBRSxDQUFDLHdCQUF3QixFQUFFLHlCQUF5QixFQUFFLHNCQUFzQixDQUFDLENBQUM7YUFDN0k7WUFDRCxHQUFHLEVBQUUsS0FBSyxFQUFFLFFBQTBCLEVBQUUsRUFBRTtnQkFDekMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDakUsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsNkRBQTZEO1lBQ2pFLEtBQUssRUFBRSxTQUFTLENBQUMsc0NBQXNDLEVBQUUsU0FBUyxDQUFDO1lBQ25FLFFBQVEsRUFBRSx5QkFBeUI7WUFDbkMsSUFBSSxFQUFFLENBQUM7b0JBQ04sRUFBRSxFQUFFLE1BQU0sQ0FBQyxjQUFjO29CQUN6QixJQUFJLEVBQUUsbUJBQW1CO2lCQUN6QixFQUFFO29CQUNGLEVBQUUsRUFBRSxNQUFNLENBQUMsV0FBVztvQkFDdEIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsMEJBQTBCLEVBQUUsbUJBQW1CLENBQUM7b0JBQ3pFLEtBQUssRUFBRSw2QkFBNkI7aUJBQ3BDLENBQUM7WUFDRixVQUFVLEVBQUU7Z0JBQ1gsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSxvQ0FBb0MsQ0FBQzthQUN2RztZQUNELEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsVUFBVSxDQUFDLHVCQUF1QixDQUFDO1NBQzlFLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsb0RBQW9EO1lBQ3hELEtBQUssRUFBRSxTQUFTLENBQUMsNkJBQTZCLEVBQUUscUJBQXFCLENBQUM7WUFDdEUsUUFBUSxFQUFFLHlCQUF5QjtZQUNuQyxJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxjQUFjO2dCQUN6QixJQUFJLEVBQUUsbUJBQW1CO2FBQ3pCO1lBQ0QsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxVQUFVLENBQUMseUJBQXlCLENBQUM7U0FDaEYsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSw2Q0FBNkM7WUFDakQsS0FBSyxFQUFFLFNBQVMsQ0FBQyxpQkFBaUIsRUFBRSw2QkFBNkIsQ0FBQztZQUNsRSxRQUFRLEVBQUUsd0JBQXdCO1lBQ2xDLElBQUksRUFBRSxDQUFDO29CQUNOLEVBQUUsRUFBRSxNQUFNLENBQUMsY0FBYztvQkFDekIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsY0FBYyxDQUFDLEVBQUUsQ0FBQyx3QkFBd0IsRUFBRSx5QkFBeUIsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO2lCQUM3SSxFQUFFO29CQUNGLEVBQUUsRUFBRSxNQUFNLENBQUMsa0JBQWtCO29CQUM3QixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRSxVQUFVLENBQUMsRUFBRSxtQkFBbUIsQ0FBQztvQkFDakcsS0FBSyxFQUFFLFdBQVc7b0JBQ2xCLEtBQUssRUFBRSxDQUFDO2lCQUNSLENBQUM7WUFDRixHQUFHLEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQ2YsTUFBTSxDQUFDLEVBQUUsWUFBWSxDQUFDLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDO29CQUMxQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsZUFBZSxFQUFFO29CQUNqRCxJQUFJLENBQUMsb0JBQW9CLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDO2lCQUNwRixDQUFDLENBQUM7Z0JBQ0gsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFDLFFBQVEsQ0FBQztnQkFDMUQsSUFBSSxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUM7b0JBQ3JCLE9BQU8sSUFBSSxDQUFDLDBCQUEwQixDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsQ0FBQztnQkFDakUsQ0FBQztxQkFBTSxJQUFJLFlBQVksQ0FBQyxZQUFZLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxZQUFZLENBQUMsV0FBVyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztvQkFDNUYsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsb0JBQW9CLEVBQUUsZ0NBQWdDLENBQUMsQ0FBQyxDQUFDO2dCQUNsRyxDQUFDO1lBQ0YsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILE1BQU0sNkJBQTZCLEdBQUcsY0FBYyxDQUFDLE1BQU0sQ0FBQyxVQUFVLDBCQUEwQixFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0csSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSw4Q0FBOEM7WUFDbEQsS0FBSyxFQUFFLFNBQVMsQ0FBQyxrQkFBa0IsRUFBRSx1Q0FBdUMsQ0FBQztZQUM3RSxRQUFRLEVBQUUsd0JBQXdCO1lBQ2xDLFlBQVksRUFBRSw2QkFBNkI7WUFDM0MsSUFBSSxFQUFFLENBQUM7b0JBQ04sRUFBRSxFQUFFLE1BQU0sQ0FBQyxrQkFBa0I7b0JBQzdCLEtBQUssRUFBRSxDQUFDO29CQUNSLEtBQUssRUFBRSxXQUFXO29CQUNsQixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRSxVQUFVLENBQUMsRUFBRSw2QkFBNkIsQ0FBQztpQkFDM0csRUFBRTtvQkFDRixFQUFFLEVBQUUsTUFBTSxDQUFDLGNBQWM7aUJBQ3pCLENBQUM7WUFDRixHQUFHLEVBQUUsQ0FBQyxRQUEwQixFQUFFLEVBQUUsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDLENBQUMsZ0NBQWdDLENBQUMsSUFBSSxDQUFDO1NBQ3JILENBQUMsQ0FBQztRQUVILE1BQU0sOEJBQThCLEdBQUcsY0FBYyxDQUFDLFNBQVMsQ0FBQyxVQUFVLDBCQUEwQixFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDL0csSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSwrQ0FBK0M7WUFDbkQsS0FBSyxFQUFFLFNBQVMsQ0FBQyxtQkFBbUIsRUFBRSx3Q0FBd0MsQ0FBQztZQUMvRSxZQUFZLEVBQUUsOEJBQThCO1lBQzVDLFFBQVEsRUFBRSx3QkFBd0I7WUFDbEMsSUFBSSxFQUFFLENBQUM7b0JBQ04sRUFBRSxFQUFFLE1BQU0sQ0FBQyxrQkFBa0I7b0JBQzdCLEtBQUssRUFBRSxDQUFDO29CQUNSLEtBQUssRUFBRSxXQUFXO29CQUNsQixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRSxVQUFVLENBQUMsRUFBRSw4QkFBOEIsQ0FBQztpQkFDNUcsRUFBRTtvQkFDRixFQUFFLEVBQUUsTUFBTSxDQUFDLGNBQWM7aUJBQ3pCLENBQUM7WUFDRixHQUFHLEVBQUUsQ0FBQyxRQUEwQixFQUFFLEVBQUUsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDLENBQUMsZ0NBQWdDLENBQUMsS0FBSyxDQUFDO1NBQ3RILENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsaURBQWlEO1lBQ3JELEtBQUssRUFBRSxTQUFTLENBQUMsV0FBVyxFQUFFLHVCQUF1QixDQUFDO1lBQ3RELFFBQVEsRUFBRSx3QkFBd0I7WUFDbEMsWUFBWSxFQUFFLDRCQUE0QjtZQUMxQyxJQUFJLEVBQUU7Z0JBQ0w7b0JBQ0MsRUFBRSxFQUFFLE1BQU0sQ0FBQyxjQUFjO29CQUN6QixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxjQUFjLENBQUMsRUFBRSxDQUFDLHdCQUF3QixFQUFFLHlCQUF5QixFQUFFLHNCQUFzQixDQUFDLENBQUM7aUJBQzdJLEVBQUU7b0JBQ0YsRUFBRSxFQUFFLE1BQU0sQ0FBQyxrQkFBa0I7b0JBQzdCLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsZUFBZSxFQUFFLFVBQVUsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxVQUFVLDBCQUEwQixFQUFFLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLFVBQVUsMEJBQTBCLEVBQUUsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7b0JBQzVQLEtBQUssRUFBRSxXQUFXO29CQUNsQixLQUFLLEVBQUUsQ0FBQztpQkFDUixFQUFFO29CQUNGLEVBQUUsRUFBRSxNQUFNLENBQUMsU0FBUztvQkFDcEIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLDJCQUEyQixDQUFDO29CQUNoRSxLQUFLLEVBQUUsWUFBWTtvQkFDbkIsS0FBSyxFQUFFLENBQUM7aUJBQ1I7YUFDRDtZQUNELElBQUksRUFBRSwrQkFBK0I7WUFDckMsR0FBRyxFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUNmLE1BQU0sSUFBSSxDQUFDLDBCQUEwQixDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ25ELENBQUM7U0FDRCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUJBQXVCLENBQUM7WUFDNUIsRUFBRSxFQUFFLHVDQUF1QztZQUMzQyxLQUFLLEVBQUUsU0FBUyxDQUFDLFdBQVcsRUFBRSx1QkFBdUIsQ0FBQztZQUN0RCxRQUFRLEVBQUUsd0JBQXdCO1lBQ2xDLElBQUksRUFBRSxDQUFDO29CQUNOLEVBQUUsRUFBRSxNQUFNLENBQUMsY0FBYztvQkFDekIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQUMsd0JBQXdCLEVBQUUseUJBQXlCLEVBQUUsc0JBQXNCLENBQUM7aUJBQ3BHLEVBQUU7b0JBQ0YsRUFBRSxFQUFFLE1BQU0sQ0FBQyxrQkFBa0I7b0JBQzdCLElBQUksRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRSxVQUFVLENBQUM7b0JBQ3hELEtBQUssRUFBRSxjQUFjO29CQUNyQixLQUFLLEVBQUUsQ0FBQztpQkFDUixDQUFDO1lBQ0YsR0FBRyxFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUNmLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUMsMEJBQTBCLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDL00sSUFBSSxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQztvQkFDL0IsTUFBTSxJQUFJLENBQUMsMEJBQTBCLENBQUMsYUFBYSxDQUFDLGtCQUFrQiwyQ0FBa0MsQ0FBQztnQkFDMUcsQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUJBQXVCLENBQUM7WUFDNUIsRUFBRSxFQUFFLGdEQUFnRDtZQUNwRCxLQUFLLEVBQUUsU0FBUyxDQUFDLG9CQUFvQixFQUFFLDBDQUEwQyxDQUFDO1lBQ2xGLFFBQVEsRUFBRSx3QkFBd0I7WUFDbEMsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsY0FBYztnQkFDekIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQUMsd0JBQXdCLEVBQUUseUJBQXlCLEVBQUUsc0JBQXNCLENBQUMsQ0FBQzthQUNwSztZQUNELEdBQUcsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDZixNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLDBCQUEwQixDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQy9NLElBQUksa0JBQWtCLENBQUMsTUFBTSxFQUFFLENBQUM7b0JBQy9CLE1BQU0sSUFBSSxDQUFDLDBCQUEwQixDQUFDLGFBQWEsQ0FBQyxrQkFBa0IsNENBQW1DLENBQUM7Z0JBQzNHLENBQUM7WUFDRixDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSx3Q0FBd0M7WUFDNUMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxZQUFZLEVBQUUsa0NBQWtDLENBQUM7WUFDbEUsUUFBUSxFQUFFLHdCQUF3QjtZQUNsQyxJQUFJLEVBQUUsQ0FBQztvQkFDTixFQUFFLEVBQUUsTUFBTSxDQUFDLGNBQWM7b0JBQ3pCLElBQUksRUFBRSxjQUFjLENBQUMsRUFBRSxDQUFDLHdCQUF3QixFQUFFLHlCQUF5QixFQUFFLHNCQUFzQixDQUFDO2lCQUNwRyxFQUFFO29CQUNGLEVBQUUsRUFBRSxNQUFNLENBQUMsa0JBQWtCO29CQUM3QixJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUUsVUFBVSxDQUFDO29CQUN4RCxLQUFLLEVBQUUsY0FBYztvQkFDckIsS0FBSyxFQUFFLENBQUM7aUJBQ1IsQ0FBQztZQUNGLEdBQUcsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDZixNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDL04sSUFBSSxtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsQ0FBQztvQkFDaEMsTUFBTSxJQUFJLENBQUMsMEJBQTBCLENBQUMsYUFBYSxDQUFDLG1CQUFtQiw0Q0FBbUMsQ0FBQztnQkFDNUcsQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUJBQXVCLENBQUM7WUFDNUIsRUFBRSxFQUFFLGlEQUFpRDtZQUNyRCxLQUFLLEVBQUUsU0FBUyxDQUFDLHFCQUFxQixFQUFFLHFEQUFxRCxDQUFDO1lBQzlGLFFBQVEsRUFBRSx3QkFBd0I7WUFDbEMsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsY0FBYztnQkFDekIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQUMsd0JBQXdCLEVBQUUseUJBQXlCLEVBQUUsc0JBQXNCLENBQUMsQ0FBQzthQUNwSztZQUNELEdBQUcsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDZixNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDL04sSUFBSSxtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsQ0FBQztvQkFDaEMsTUFBTSxJQUFJLENBQUMsMEJBQTBCLENBQUMsYUFBYSxDQUFDLG1CQUFtQiw2Q0FBb0MsQ0FBQztnQkFDN0csQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUJBQXVCLENBQUM7WUFDNUIsRUFBRSxFQUFFLHdDQUF3QztZQUM1QyxLQUFLLEVBQUUsU0FBUyxDQUFDLGlCQUFpQixFQUFFLHNCQUFzQixDQUFDO1lBQzNELFFBQVEsRUFBRSx3QkFBd0I7WUFDbEMsSUFBSSxFQUFFLENBQUM7b0JBQ04sRUFBRSxFQUFFLE1BQU0sQ0FBQyxjQUFjO29CQUN6QixJQUFJLEVBQUUsY0FBYyxDQUFDLEVBQUUsQ0FBQyx3QkFBd0IsRUFBRSx5QkFBeUIsQ0FBQztpQkFDNUUsRUFBRTtvQkFDRixFQUFFLEVBQUUsTUFBTSxDQUFDLGtCQUFrQjtvQkFDN0IsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUUsVUFBVSxDQUFDLEVBQUUsY0FBYyxDQUFDLEVBQUUsQ0FBQyx3QkFBd0IsRUFBRSx5QkFBeUIsQ0FBQyxDQUFDO29CQUNwSixLQUFLLEVBQUUsV0FBVztvQkFDbEIsS0FBSyxFQUFFLENBQUM7aUJBQ1IsQ0FBQztZQUNGLEdBQUcsRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxFQUFFO2dCQUN6QyxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFDM0QsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFDckQsTUFBTSxTQUFTLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQyxjQUFjLENBQUM7b0JBQ3hELEtBQUssRUFBRSxRQUFRLENBQUMsaUJBQWlCLEVBQUUsbUJBQW1CLENBQUM7b0JBQ3ZELE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLGlCQUFpQixFQUFFLFVBQVUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7b0JBQzVELGNBQWMsRUFBRSxJQUFJO29CQUNwQixhQUFhLEVBQUUsSUFBSTtvQkFDbkIsU0FBUyxFQUFFLG1CQUFtQixDQUFDLFFBQVEsQ0FBQyxFQUFFLEdBQUcsRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLENBQUMsdUJBQXVCLENBQUMsRUFBRSxFQUFFLFdBQVcsQ0FBQyxDQUFDO2lCQUNuSCxDQUFDLENBQUM7Z0JBQ0gsSUFBSSxTQUFTLEVBQUUsQ0FBQztvQkFDZixNQUFNLGNBQWMsQ0FBQyxjQUFjLENBQUMsc0NBQXNDLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBQ3hGLENBQUM7WUFDRixDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSxzQ0FBc0M7WUFDMUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxhQUFhLEVBQUUsd0JBQXdCLENBQUM7WUFDeEQsSUFBSSxFQUFFLENBQUM7b0JBQ04sRUFBRSxFQUFFLE1BQU0sQ0FBQyxlQUFlO29CQUMxQixLQUFLLEVBQUUsWUFBWTtvQkFDbkIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsRUFBRSxjQUFjLENBQUMsRUFBRSxDQUFDLHdCQUF3QixFQUFFLHlCQUF5QixDQUFDLENBQUM7aUJBQ2pKLENBQUM7WUFDRixHQUFHLEVBQUUsS0FBSyxFQUFFLFFBQTBCLEVBQUUsU0FBc0IsRUFBRSxFQUFFO2dCQUNqRSxNQUFNLDBCQUEwQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUMsQ0FBQztnQkFDN0UsTUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQztnQkFDL0MsTUFBTSxtQkFBbUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLENBQUM7Z0JBRS9ELE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDakUsTUFBTSxNQUFNLEdBQUcsTUFBTSxPQUFPLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxFQUFFLENBQUMsTUFBTSwwQkFBMEIsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEVBQUUsbUJBQW1CLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xKLElBQUksS0FBd0IsRUFBRSxhQUFhLEdBQUcsS0FBSyxFQUFFLGNBQWMsR0FBRyxLQUFLLENBQUM7Z0JBQzVFLEtBQUssTUFBTSxDQUFDLElBQUksTUFBTSxFQUFFLENBQUM7b0JBQ3hCLElBQUksQ0FBQyxDQUFDLE1BQU0sS0FBSyxVQUFVLEVBQUUsQ0FBQzt3QkFDN0IsS0FBSyxHQUFHLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQzt3QkFDNUIsTUFBTTtvQkFDUCxDQUFDO29CQUNELGFBQWEsR0FBRyxhQUFhLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxZQUFZLEVBQUUsTUFBTSxpRUFBNEMsQ0FBQztvQkFDMUcsY0FBYyxHQUFHLGNBQWMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSxNQUFNLDJFQUFpRCxDQUFDO2dCQUNsSCxDQUFDO2dCQUNELElBQUksS0FBSyxFQUFFLENBQUM7b0JBQ1gsTUFBTSxLQUFLLENBQUM7Z0JBQ2IsQ0FBQztnQkFDRCxJQUFJLGFBQWEsRUFBRSxDQUFDO29CQUNuQixtQkFBbUIsQ0FBQyxNQUFNLENBQ3pCLFFBQVEsQ0FBQyxJQUFJLEVBQ2IsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSxtRkFBbUYsQ0FBQzt3QkFDN0ksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxpQ0FBaUMsRUFBRSxnRkFBZ0YsQ0FBQyxFQUNoSSxDQUFDOzRCQUNBLEtBQUssRUFBRSxRQUFRLENBQUMsNkJBQTZCLEVBQUUsWUFBWSxDQUFDOzRCQUM1RCxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRTt5QkFDL0IsQ0FBQyxDQUNGLENBQUM7Z0JBQ0gsQ0FBQztxQkFDSSxJQUFJLGNBQWMsRUFBRSxDQUFDO29CQUN6QixtQkFBbUIsQ0FBQyxNQUFNLENBQ3pCLFFBQVEsQ0FBQyxJQUFJLEVBQ2IsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSw0RUFBNEUsQ0FBQzt3QkFDdkksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxrQ0FBa0MsRUFBRSx5RUFBeUUsQ0FBQyxFQUMxSCxDQUFDOzRCQUNBLEtBQUssRUFBRSxRQUFRLENBQUMscUNBQXFDLEVBQUUsb0JBQW9CLENBQUM7NEJBQzVFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQywwQkFBMEIsQ0FBQyx1QkFBdUIsRUFBRTt5QkFDL0QsQ0FBQyxDQUNGLENBQUM7Z0JBQ0gsQ0FBQztxQkFDSSxDQUFDO29CQUNMLG1CQUFtQixDQUFDLE1BQU0sQ0FDekIsUUFBUSxDQUFDLElBQUksRUFDYixLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLDhCQUE4QixFQUFFLGtDQUFrQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxtQ0FBbUMsRUFBRSxpQ0FBaUMsQ0FBQyxFQUNsTCxFQUFFLENBQ0YsQ0FBQztnQkFDSCxDQUFDO1lBQ0YsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsMERBQTBEO1lBQzlELEtBQUssRUFBRSxTQUFTLENBQUMsOEJBQThCLEVBQUUsb0NBQW9DLENBQUM7WUFDdEYsUUFBUSxFQUFFLFVBQVUsQ0FBQyxTQUFTO1lBQzlCLElBQUksRUFBRSxDQUFDO29CQUNOLEVBQUUsRUFBRSxNQUFNLENBQUMsY0FBYztvQkFDekIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQUMsc0JBQXNCLEVBQUUsd0JBQXdCLENBQUM7aUJBQ3pFLENBQUM7WUFDRixHQUFHLEVBQUUsS0FBSyxFQUFFLFFBQTBCLEVBQUUsRUFBRTtnQkFDekMsTUFBTSwwQkFBMEIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLG9DQUFvQyxDQUFDLENBQUM7Z0JBQ3RGLElBQUksS0FBSyxFQUFFLENBQUM7b0JBQ1gsT0FBTyxJQUFJLE9BQU8sQ0FBTyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTt3QkFDakMsTUFBTSxpQkFBaUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUM7d0JBQzNELE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7d0JBQzFDLE1BQU0sU0FBUyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQzt3QkFDdkUsU0FBUyxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUMscUJBQXFCLEVBQUUsaUNBQWlDLENBQUMsQ0FBQzt3QkFDckYsU0FBUyxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUM7d0JBQzlCLFNBQVMsQ0FBQyxXQUFXLEdBQUcsUUFBUSxDQUFDLGdCQUFnQixFQUFFLFNBQVMsQ0FBQyxDQUFDO3dCQUM5RCxTQUFTLENBQUMsV0FBVyxHQUFHLFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSwrQkFBK0IsQ0FBQyxDQUFDO3dCQUNwRyxTQUFTLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQzt3QkFDaEMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxXQUFXLEVBQUUsU0FBUyxDQUFDLFdBQVcsQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFOzRCQUNsRixTQUFTLENBQUMsSUFBSSxFQUFFLENBQUM7NEJBQ2pCLElBQUksU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO2dDQUNyQixJQUFJLENBQUM7b0NBQ0osTUFBTSwwQkFBMEIsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO2dDQUNsRixDQUFDO2dDQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7b0NBQ2hCLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQ0FDVCxPQUFPO2dDQUNSLENBQUM7NEJBQ0YsQ0FBQzs0QkFDRCxDQUFDLEVBQUUsQ0FBQzt3QkFDTCxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUNKLFdBQVcsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO3dCQUNsRSxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ2xCLENBQUMsQ0FBQyxDQUFDO2dCQUNKLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztvQkFDM0QsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLGlCQUFpQixDQUFDLGNBQWMsQ0FBQzt3QkFDaEUsZ0JBQWdCLEVBQUUsSUFBSTt3QkFDdEIsY0FBYyxFQUFFLEtBQUs7d0JBQ3JCLGFBQWEsRUFBRSxLQUFLO3dCQUNwQixLQUFLLEVBQUUsUUFBUSxDQUFDLHFCQUFxQixFQUFFLGlDQUFpQyxDQUFDO3FCQUN6RSxDQUFDLENBQUM7b0JBQ0gsSUFBSSxpQkFBaUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7d0JBQzVCLE1BQU0sMEJBQTBCLENBQUMsbUJBQW1CLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDNUUsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsMkJBQTJCLEVBQUU7WUFDeEQsT0FBTyxFQUFFLHVCQUF1QjtZQUNoQyxLQUFLLEVBQUUsUUFBUSxDQUFDLGtCQUFrQixFQUFFLHNCQUFzQixDQUFDO1lBQzNELEtBQUssRUFBRSxZQUFZO1lBQ25CLEtBQUssRUFBRSxDQUFDO1lBQ1IsSUFBSSxFQUFFLFVBQVU7U0FDaEIsQ0FBQyxDQUFDO1FBRUgsTUFBTSx3QkFBd0IsR0FBRyw0QkFBNEIsQ0FBQztRQUM5RCxNQUFNLDZCQUE2QixHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsY0FBYyxDQUFDLEtBQUssQ0FBQyxtQ0FBbUMsQ0FBQyxHQUFHLEVBQUUsSUFBSSxNQUFNLENBQUMsSUFBSSxvQ0FBbUIsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JMLElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsd0JBQXdCO1lBQzVCLEtBQUssRUFBRSxTQUFTLENBQUMsd0JBQXdCLEVBQUUsMEJBQTBCLENBQUM7WUFDdEUsUUFBUSxFQUFFLHdCQUF3QjtZQUNsQyxJQUFJLEVBQUUsQ0FBQztvQkFDTixFQUFFLEVBQUUsTUFBTSxDQUFDLGNBQWM7b0JBQ3pCLElBQUksRUFBRSw2QkFBNkI7aUJBQ25DLEVBQUU7b0JBQ0YsRUFBRSxFQUFFLHVCQUF1QjtvQkFDM0IsSUFBSSxFQUFFLDZCQUE2QjtvQkFDbkMsS0FBSyxFQUFFLGNBQWM7b0JBQ3JCLEtBQUssRUFBRSxDQUFDO2lCQUNSLENBQUM7WUFDRixVQUFVLEVBQUU7Z0JBQ1gsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLENBQUMsRUFBRSxRQUFRLENBQUMsaUJBQWlCLEVBQUUsVUFBVSxDQUFDO2FBQ3JFO1lBQ0QsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDO1NBQ25FLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsbURBQW1EO1lBQ3ZELEtBQUssRUFBRSxTQUFTLENBQUMsdUJBQXVCLEVBQUUseUJBQXlCLENBQUM7WUFDcEUsUUFBUSxFQUFFLHdCQUF3QjtZQUNsQyxJQUFJLEVBQUUsQ0FBQztvQkFDTixFQUFFLEVBQUUsTUFBTSxDQUFDLGNBQWM7b0JBQ3pCLElBQUksRUFBRSxtQkFBbUI7aUJBQ3pCLEVBQUU7b0JBQ0YsRUFBRSxFQUFFLHVCQUF1QjtvQkFDM0IsSUFBSSxFQUFFLG1CQUFtQjtvQkFDekIsS0FBSyxFQUFFLGNBQWM7b0JBQ3JCLEtBQUssRUFBRSxDQUFDO2lCQUNSLENBQUM7WUFDRixVQUFVLEVBQUU7Z0JBQ1gsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLENBQUMsRUFBRSxRQUFRLENBQUMscUJBQXFCLEVBQUUsY0FBYyxDQUFDO2FBQzdFO1lBQ0QsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDO1NBQ2xFLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsdURBQXVEO1lBQzNELEtBQUssRUFBRSxTQUFTLENBQUMsMkJBQTJCLEVBQUUsNkJBQTZCLENBQUM7WUFDNUUsUUFBUSxFQUFFLHdCQUF3QjtZQUNsQyxJQUFJLEVBQUUsQ0FBQztvQkFDTixFQUFFLEVBQUUsTUFBTSxDQUFDLGNBQWM7b0JBQ3pCLElBQUksRUFBRSxtQkFBbUI7aUJBQ3pCLEVBQUU7b0JBQ0YsRUFBRSxFQUFFLHVCQUF1QjtvQkFDM0IsSUFBSSxFQUFFLG1CQUFtQjtvQkFDekIsS0FBSyxFQUFFLGNBQWM7b0JBQ3JCLEtBQUssRUFBRSxDQUFDO2lCQUNSLENBQUM7WUFDRixVQUFVLEVBQUU7Z0JBQ1gsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLENBQUMsRUFBRSxRQUFRLENBQUMsMEJBQTBCLEVBQUUsYUFBYSxDQUFDO2FBQ2pGO1lBQ0QsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxVQUFVLENBQUMsZUFBZSxDQUFDO1NBQ3RFLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUseURBQXlEO1lBQzdELEtBQUssRUFBRSxTQUFTLENBQUMsNkJBQTZCLEVBQUUsb0NBQW9DLENBQUM7WUFDckYsUUFBUSxFQUFFLHdCQUF3QjtZQUNsQyxJQUFJLEVBQUUsQ0FBQztvQkFDTixFQUFFLEVBQUUsTUFBTSxDQUFDLGNBQWM7b0JBQ3pCLElBQUksRUFBRSxtQkFBbUI7aUJBQ3pCLEVBQUU7b0JBQ0YsRUFBRSxFQUFFLHVCQUF1QjtvQkFDM0IsSUFBSSxFQUFFLG1CQUFtQjtvQkFDekIsS0FBSyxFQUFFLGNBQWM7b0JBQ3JCLEtBQUssRUFBRSxDQUFDO2lCQUNSLENBQUM7WUFDRixVQUFVLEVBQUU7Z0JBQ1gsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLENBQUMsRUFBRSxRQUFRLENBQUMsMkJBQTJCLEVBQUUsb0JBQW9CLENBQUM7YUFDekY7WUFDRCxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLFVBQVUsQ0FBQyxxQkFBcUIsQ0FBQztTQUM1RSxDQUFDLENBQUM7UUFFSCxNQUFNLCtCQUErQixHQUFHLElBQUksTUFBTSxDQUFDLGlDQUFpQyxDQUFDLENBQUM7UUFDdEYsWUFBWSxDQUFDLGNBQWMsQ0FBQyx1QkFBdUIsRUFBRTtZQUNwRCxPQUFPLEVBQUUsK0JBQStCO1lBQ3hDLEtBQUssRUFBRSxRQUFRLENBQUMsb0JBQW9CLEVBQUUsVUFBVSxDQUFDO1lBQ2pELElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLG1CQUFtQixFQUFFLGNBQWMsQ0FBQyxLQUFLLENBQUMsbUNBQW1DLENBQUMsR0FBRyxFQUFFLElBQUksTUFBTSxDQUFDLElBQUksb0NBQW1CLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDcEosS0FBSyxFQUFFLGNBQWM7WUFDckIsS0FBSyxFQUFFLENBQUM7U0FDUixDQUFDLENBQUM7UUFFSCxvQkFBb0IsQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDaEQsSUFBSSxDQUFDLHVCQUF1QixDQUFDO2dCQUM1QixFQUFFLEVBQUUsdUNBQXVDLFFBQVEsRUFBRTtnQkFDckQsS0FBSyxFQUFFLFFBQVE7Z0JBQ2YsSUFBSSxFQUFFLENBQUM7d0JBQ04sRUFBRSxFQUFFLCtCQUErQjt3QkFDbkMsSUFBSSxFQUFFLG1CQUFtQjt3QkFDekIsS0FBSyxFQUFFLEtBQUs7cUJBQ1osQ0FBQztnQkFDRixHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLFVBQVUsQ0FBQyxjQUFjLFFBQVEsQ0FBQyxXQUFXLEVBQUUsR0FBRyxDQUFDO2FBQzlGLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSxpREFBaUQ7WUFDckQsS0FBSyxFQUFFLFNBQVMsQ0FBQyxxQkFBcUIsRUFBRSwyQkFBMkIsQ0FBQztZQUNwRSxRQUFRLEVBQUUsd0JBQXdCO1lBQ2xDLEVBQUUsRUFBRSxJQUFJO1lBQ1IsSUFBSSxFQUFFLENBQUM7b0JBQ04sRUFBRSxFQUFFLHVCQUF1QjtvQkFDM0IsS0FBSyxFQUFFLGFBQWE7b0JBQ3BCLEtBQUssRUFBRSxDQUFDO2lCQUNSLENBQUM7WUFDRixVQUFVLEVBQUU7Z0JBQ1gsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLENBQUMsRUFBRSxRQUFRLENBQUMsa0JBQWtCLEVBQUUsV0FBVyxDQUFDO2FBQ3ZFO1lBQ0QsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDO1NBQ3BFLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsbURBQW1EO1lBQ3ZELEtBQUssRUFBRSxTQUFTLENBQUMsdUJBQXVCLEVBQUUsMEJBQTBCLENBQUM7WUFDckUsUUFBUSxFQUFFLHdCQUF3QjtZQUNsQyxJQUFJLEVBQUUsQ0FBQztvQkFDTixFQUFFLEVBQUUsTUFBTSxDQUFDLGNBQWM7b0JBQ3pCLElBQUksRUFBRSxjQUFjLENBQUMsRUFBRSxDQUFDLHdCQUF3QixFQUFFLHlCQUF5QixFQUFFLHNCQUFzQixDQUFDO2lCQUNwRyxFQUFFO29CQUNGLEVBQUUsRUFBRSx1QkFBdUI7b0JBQzNCLEtBQUssRUFBRSxhQUFhO29CQUNwQixLQUFLLEVBQUUsQ0FBQztpQkFDUixDQUFDO1lBQ0YsVUFBVSxFQUFFO2dCQUNYLENBQUMsdUJBQXVCLENBQUMsRUFBRSxDQUFDLEVBQUUsUUFBUSxDQUFDLGdCQUFnQixFQUFFLFVBQVUsQ0FBQzthQUNwRTtZQUNELEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQztTQUNsRSxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUJBQXVCLENBQUM7WUFDNUIsRUFBRSxFQUFFLDhDQUE4QztZQUNsRCxLQUFLLEVBQUUsU0FBUyxDQUFDLGtCQUFrQixFQUFFLHdCQUF3QixDQUFDO1lBQzlELFFBQVEsRUFBRSx3QkFBd0I7WUFDbEMsWUFBWSxFQUFFLG1CQUFtQjtZQUNqQyxFQUFFLEVBQUUsSUFBSTtZQUNSLElBQUksRUFBRSxDQUFDO29CQUNOLEVBQUUsRUFBRSx1QkFBdUI7b0JBQzNCLEtBQUssRUFBRSxhQUFhO29CQUNwQixJQUFJLEVBQUUsbUJBQW1CO29CQUN6QixLQUFLLEVBQUUsQ0FBQztpQkFDUixDQUFDO1lBQ0YsVUFBVSxFQUFFO2dCQUNYLENBQUMsdUJBQXVCLENBQUMsRUFBRSxDQUFDLEVBQUUsUUFBUSxDQUFDLDBCQUEwQixFQUFFLFNBQVMsQ0FBQzthQUM3RTtZQUNELEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQztTQUNqRSxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUJBQXVCLENBQUM7WUFDNUIsRUFBRSxFQUFFLGdEQUFnRDtZQUNwRCxLQUFLLEVBQUUsU0FBUyxDQUFDLG9DQUFvQyxFQUFFLDBDQUEwQyxDQUFDO1lBQ2xHLFFBQVEsRUFBRSx3QkFBd0I7WUFDbEMsSUFBSSxFQUFFLENBQUM7b0JBQ04sRUFBRSxFQUFFLE1BQU0sQ0FBQyxjQUFjO29CQUN6QixJQUFJLEVBQUUsY0FBYyxDQUFDLEVBQUUsQ0FBQyx3QkFBd0IsRUFBRSx5QkFBeUIsQ0FBQztpQkFDNUUsRUFBRTtvQkFDRixFQUFFLEVBQUUsdUJBQXVCO29CQUMzQixLQUFLLEVBQUUsYUFBYTtvQkFDcEIsS0FBSyxFQUFFLENBQUM7b0JBQ1IsSUFBSSxFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQUMsd0JBQXdCLEVBQUUseUJBQXlCLENBQUM7aUJBQzVFLENBQUM7WUFDRixVQUFVLEVBQUU7Z0JBQ1gsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLENBQUMsRUFBRSxRQUFRLENBQUMsOEJBQThCLEVBQUUsdUJBQXVCLENBQUM7YUFDL0Y7WUFDRCxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLFVBQVUsQ0FBQyx1QkFBdUIsQ0FBQztTQUM5RSxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUJBQXVCLENBQUM7WUFDNUIsRUFBRSxFQUFFLG1EQUFtRDtZQUN2RCxLQUFLLEVBQUUsU0FBUyxDQUFDLHVCQUF1QixFQUFFLHlCQUF5QixDQUFDO1lBQ3BFLFFBQVEsRUFBRSx3QkFBd0I7WUFDbEMsSUFBSSxFQUFFLENBQUM7b0JBQ04sRUFBRSxFQUFFLE1BQU0sQ0FBQyxjQUFjO29CQUN6QixJQUFJLEVBQUUsY0FBYyxDQUFDLEVBQUUsQ0FBQyx3QkFBd0IsRUFBRSx5QkFBeUIsRUFBRSxzQkFBc0IsQ0FBQztpQkFDcEcsRUFBRTtvQkFDRixFQUFFLEVBQUUsdUJBQXVCO29CQUMzQixLQUFLLEVBQUUsYUFBYTtvQkFDcEIsS0FBSyxFQUFFLENBQUM7aUJBQ1IsQ0FBQztZQUNGLFVBQVUsRUFBRTtnQkFDWCxDQUFDLHVCQUF1QixDQUFDLEVBQUUsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxTQUFTLENBQUM7YUFDbkU7WUFDRCxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUM7U0FDbEUsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSxvREFBb0Q7WUFDeEQsS0FBSyxFQUFFLFNBQVMsQ0FBQyx3QkFBd0IsRUFBRSwwQkFBMEIsQ0FBQztZQUN0RSxRQUFRLEVBQUUsd0JBQXdCO1lBQ2xDLElBQUksRUFBRSxDQUFDO29CQUNOLEVBQUUsRUFBRSxNQUFNLENBQUMsY0FBYztvQkFDekIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQUMsd0JBQXdCLEVBQUUseUJBQXlCLEVBQUUsc0JBQXNCLENBQUM7aUJBQ3BHLEVBQUU7b0JBQ0YsRUFBRSxFQUFFLHVCQUF1QjtvQkFDM0IsS0FBSyxFQUFFLGFBQWE7b0JBQ3BCLEtBQUssRUFBRSxDQUFDO2lCQUNSLENBQUM7WUFDRixVQUFVLEVBQUU7Z0JBQ1gsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLENBQUMsRUFBRSxRQUFRLENBQUMsaUJBQWlCLEVBQUUsVUFBVSxDQUFDO2FBQ3JFO1lBQ0QsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDO1NBQ25FLENBQUMsQ0FBQztRQUVILE1BQU0scUJBQXFCLEdBQUcsSUFBSSxNQUFNLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUNsRSxZQUFZLENBQUMsY0FBYyxDQUFDLHVCQUF1QixFQUFFO1lBQ3BELE9BQU8sRUFBRSxxQkFBcUI7WUFDOUIsS0FBSyxFQUFFLFFBQVEsQ0FBQyxVQUFVLEVBQUUsU0FBUyxDQUFDO1lBQ3RDLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUMsbUJBQW1CLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztZQUNyRixLQUFLLEVBQUUsUUFBUTtZQUNmLEtBQUssRUFBRSxDQUFDO1NBQ1IsQ0FBQyxDQUFDO1FBRUg7WUFDQyxFQUFFLEVBQUUsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxlQUFlLENBQUMsRUFBRSxZQUFZLEVBQUUsd0JBQXdCLENBQUMsTUFBTSxFQUFFLEVBQUUsY0FBYywwQ0FBcUIsRUFBRTtZQUM5SixFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxRQUFRLENBQUMsRUFBRSxZQUFZLEVBQUUsd0JBQXdCLENBQUMsTUFBTSxFQUFFLEVBQUUsY0FBYyw4Q0FBdUIsRUFBRTtZQUNySixFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxjQUFjLEVBQUUsTUFBTSxDQUFDLEVBQUUsWUFBWSxFQUFFLHdCQUF3QixDQUFDLE1BQU0sRUFBRSxFQUFFLGNBQWMsNEJBQWMsRUFBRTtZQUN0SSxFQUFFLEVBQUUsRUFBRSxlQUFlLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxnQkFBZ0IsQ0FBQyxFQUFFLFlBQVksRUFBRSx3QkFBd0IsQ0FBQyxNQUFNLEVBQUUsRUFBRSxjQUFjLDRDQUFzQixFQUFFO1lBQzNLLEVBQUUsRUFBRSxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLHFCQUFxQixFQUFFLGNBQWMsQ0FBQyxFQUFFLFlBQVksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGtDQUFrQyxDQUFDLE1BQU0sRUFBRSxFQUFFLDRCQUE0QixDQUFDLE1BQU0sRUFBRSxFQUFFLHdCQUF3QixDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsY0FBYyxFQUFFLFlBQVksRUFBRTtTQUNuUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDNUQsTUFBTSxxQkFBcUIsR0FBRyxjQUFjLENBQUMsS0FBSyxDQUFDLGlDQUFpQyxDQUFDLEdBQUcsRUFBRSxJQUFJLE1BQU0sQ0FBQyxJQUFJLGNBQWMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUM3SCxJQUFJLENBQUMsdUJBQXVCLENBQUM7Z0JBQzVCLEVBQUUsRUFBRSxtQkFBbUIsRUFBRSxFQUFFO2dCQUMzQixLQUFLO2dCQUNMLFlBQVksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxjQUFjLENBQUMsS0FBSyxDQUFDLDRCQUE0QixDQUFDLEdBQUcsRUFBRSxlQUFlLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxxQkFBcUIsQ0FBQztnQkFDdkosSUFBSSxFQUFFLENBQUM7d0JBQ04sRUFBRSxFQUFFLHFCQUFxQjt3QkFDekIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQyxtQkFBbUIsRUFBRSxtQkFBbUIsQ0FBQyxFQUFFLHFCQUFxQixDQUFDO3dCQUM1RyxLQUFLLEVBQUUsS0FBSztxQkFDWixDQUFDO2dCQUNGLE9BQU8sRUFBRSx1QkFBdUIsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO2dCQUM5QyxHQUFHLEVBQUUsS0FBSyxJQUFJLEVBQUU7b0JBQ2YsTUFBTSwyQkFBMkIsR0FBRyxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFLG9CQUFvQixFQUFFLENBQTZDLENBQUM7b0JBQ3hLLE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsMkJBQTJCLEVBQUUsV0FBVyxJQUFJLEVBQUUsQ0FBQyxDQUFDO29CQUNqRiwyQkFBMkIsRUFBRSxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO29CQUNsRiwyQkFBMkIsRUFBRSxLQUFLLEVBQUUsQ0FBQztnQkFDdEMsQ0FBQzthQUNELENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSwwREFBMEQ7WUFDOUQsS0FBSyxFQUFFLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSxpQ0FBaUMsQ0FBQztZQUNuRixRQUFRLEVBQUUsd0JBQXdCO1lBQ2xDLElBQUksRUFBRSxzQkFBc0I7WUFDNUIsRUFBRSxFQUFFLElBQUk7WUFDUixZQUFZLEVBQUUsb0JBQW9CO1lBQ2xDLElBQUksRUFBRTtnQkFDTCxFQUFFLEVBQUUsMkJBQTJCO2dCQUMvQixLQUFLLEVBQUUsWUFBWTtnQkFDbkIsS0FBSyxFQUFFLENBQUM7YUFDUjtZQUNELEdBQUcsRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxFQUFFO2dCQUN6QyxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUMsZ0NBQWdDLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ25HLElBQUksaUJBQWlCLEVBQUUsQ0FBQztvQkFDdkIsTUFBTSwyQkFBMkIsR0FBRyxpQkFBaUQsQ0FBQztvQkFDdEYsMkJBQTJCLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUN2QywyQkFBMkIsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDckMsQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUJBQXVCLENBQUM7WUFDNUIsRUFBRSxFQUFFLDhDQUE4QztZQUNsRCxLQUFLLEVBQUUsU0FBUyxDQUFDLGtCQUFrQixFQUFFLFNBQVMsQ0FBQztZQUMvQyxRQUFRLEVBQUUsd0JBQXdCO1lBQ2xDLElBQUksRUFBRSxXQUFXO1lBQ2pCLEVBQUUsRUFBRSxJQUFJO1lBQ1IsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsa0JBQWtCO2dCQUM3QixJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUUsVUFBVSxDQUFDO2dCQUN4RCxLQUFLLEVBQUUsWUFBWTtnQkFDbkIsS0FBSyxFQUFFLENBQUM7YUFDUjtZQUNELEdBQUcsRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxFQUFFO2dCQUN6QyxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUMsZ0NBQWdDLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ25HLElBQUksaUJBQWlCLEVBQUUsQ0FBQztvQkFDdkIsTUFBTyxpQkFBa0QsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDckUsQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUJBQXVCLENBQUM7WUFDNUIsRUFBRSxFQUFFLG1FQUFtRTtZQUN2RSxLQUFLLEVBQUUsUUFBUSxDQUFDLHVDQUF1QyxFQUFFLDBDQUEwQyxDQUFDO1lBQ3BHLElBQUksRUFBRSwrQkFBK0I7WUFDckMsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsU0FBUztnQkFDcEIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLGlDQUFpQyxDQUFDO2dCQUN0RSxLQUFLLEVBQUUsWUFBWTtnQkFDbkIsS0FBSyxFQUFFLENBQUM7YUFDUjtZQUNELEdBQUcsRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxFQUFFO2dCQUN6QyxNQUFNLElBQUksR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDLG1CQUFtQixDQUFDLGlDQUFpQyxDQUF3QyxDQUFDO2dCQUN2SSxPQUFPLElBQUksQ0FBQywrQkFBK0IsRUFBRSxDQUFDO1lBQy9DLENBQUM7U0FDRCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUJBQXVCLENBQUM7WUFDNUIsRUFBRSxFQUFFLG1EQUFtRCxDQUFDLEVBQUU7WUFDMUQsS0FBSyxFQUFFLG1EQUFtRCxDQUFDLEtBQUs7WUFDaEUsSUFBSSxFQUFFLHdCQUF3QjtZQUM5QixJQUFJLEVBQUUsQ0FBQztvQkFDTixFQUFFLEVBQUUsTUFBTSxDQUFDLGNBQWM7b0JBQ3pCLElBQUksRUFBRSxxQkFBcUIsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDO2lCQUNoRCxFQUFFO29CQUNGLEVBQUUsRUFBRSxNQUFNLENBQUMsU0FBUztvQkFDcEIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLGlDQUFpQyxDQUFDO29CQUN0RSxLQUFLLEVBQUUsWUFBWTtvQkFDbkIsS0FBSyxFQUFFLENBQUM7aUJBQ1IsQ0FBQztZQUNGLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxtREFBbUQsRUFBRSxtREFBbUQsQ0FBQyxFQUFFLEVBQUUsbURBQW1ELENBQUMsS0FBSyxDQUFDLENBQUM7U0FDdE8sQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSx1Q0FBdUMsQ0FBQyxFQUFFO1lBQzlDLEtBQUssRUFBRSxFQUFFLEtBQUssRUFBRSx1Q0FBdUMsQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLDBDQUEwQyxFQUFFO1lBQ3JILFFBQVEsRUFBRSx3QkFBd0I7WUFDbEMsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsY0FBYztnQkFDekIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsY0FBYyxDQUFDLEVBQUUsQ0FBQyx3QkFBd0IsRUFBRSx5QkFBeUIsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO2FBQzdJO1lBQ0QsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHVDQUF1QyxFQUFFLHVDQUF1QyxDQUFDLEVBQUUsRUFBRSx1Q0FBdUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztTQUNsTSxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQseUJBQXlCO0lBQ2pCLDBCQUEwQjtRQUVqQyxJQUFJLENBQUMsdUJBQXVCLENBQUM7WUFDNUIsRUFBRSxFQUFFLG1CQUFtQixDQUFDLEVBQUU7WUFDMUIsS0FBSyxFQUFFLG1CQUFtQixDQUFDLEtBQUs7WUFDaEMsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsZ0JBQWdCO2dCQUMzQixLQUFLLEVBQUUsbUJBQW1CO2dCQUMxQixLQUFLLEVBQUUsQ0FBQztnQkFDUixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxXQUFXLENBQUMsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLHlCQUF5QixDQUFDLENBQUM7YUFDdks7WUFDRCxHQUFHLEVBQUUsS0FBSyxFQUFFLFFBQTBCLEVBQUUsV0FBbUIsRUFBRSxFQUFFO2dCQUM5RCxNQUFNLHlCQUF5QixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUMsQ0FBQztnQkFDNUUsTUFBTSxvQkFBb0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7Z0JBQ2pFLE1BQU0sU0FBUyxHQUFHLHlCQUF5QixDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLEVBQUUsRUFBRSxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDbEgsSUFBSSxTQUFTLEVBQUUsQ0FBQztvQkFDZixNQUFNLE1BQU0sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsbUJBQW1CLENBQUMsQ0FBQztvQkFDeEUsTUFBTSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7b0JBQzdCLE9BQU8sTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDO2dCQUNyQixDQUFDO1lBQ0YsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsc0JBQXNCLENBQUMsRUFBRTtZQUM3QixLQUFLLEVBQUUsc0JBQXNCLENBQUMsS0FBSztZQUNuQyxJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0I7Z0JBQzNCLEtBQUssRUFBRSxtQkFBbUI7Z0JBQzFCLEtBQUssRUFBRSxDQUFDO2dCQUNSLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLGlCQUFpQixFQUFFLFdBQVcsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsNEJBQTRCLENBQUMsQ0FBQzthQUMxSztZQUNELEdBQUcsRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxXQUFtQixFQUFFLEVBQUU7Z0JBQzlELE1BQU0seUJBQXlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO2dCQUM1RSxNQUFNLG9CQUFvQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQztnQkFDakUsTUFBTSxTQUFTLEdBQUcseUJBQXlCLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsRUFBRSxFQUFFLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNsSCxJQUFJLFNBQVMsRUFBRSxDQUFDO29CQUNmLE1BQU0sTUFBTSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO29CQUMzRSxNQUFNLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztvQkFDN0IsT0FBTyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUM7Z0JBQ3JCLENBQUM7WUFDRixDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSx5QkFBeUIsQ0FBQyxFQUFFO1lBQ2hDLEtBQUssRUFBRSx5QkFBeUIsQ0FBQyxLQUFLO1lBQ3RDLElBQUksRUFBRTtnQkFDTCxFQUFFLEVBQUUsTUFBTSxDQUFDLGdCQUFnQjtnQkFDM0IsS0FBSyxFQUFFLG1CQUFtQjtnQkFDMUIsS0FBSyxFQUFFLENBQUM7Z0JBQ1IsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLEVBQUUsV0FBVyxDQUFDLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO2FBQzdLO1lBQ0QsR0FBRyxFQUFFLEtBQUssRUFBRSxRQUEwQixFQUFFLFdBQW1CLEVBQUUsRUFBRTtnQkFDOUQsTUFBTSx5QkFBeUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDLENBQUM7Z0JBQzVFLE1BQU0sb0JBQW9CLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO2dCQUNqRSxNQUFNLFNBQVMsR0FBRyx5QkFBeUIsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxFQUFFLEVBQUUsRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xILElBQUksU0FBUyxFQUFFLENBQUM7b0JBQ2YsTUFBTSxNQUFNLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHlCQUF5QixDQUFDLENBQUM7b0JBQzlFLE1BQU0sQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO29CQUM3QixPQUFPLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQztnQkFDckIsQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUJBQXVCLENBQUM7WUFDNUIsRUFBRSxFQUFFLG1EQUFtRDtZQUN2RCxLQUFLLEVBQUUsU0FBUyxDQUFDLDBCQUEwQixFQUFFLDBCQUEwQixDQUFDO1lBQ3hFLElBQUksRUFBRTtnQkFDTCxFQUFFLEVBQUUsTUFBTSxDQUFDLGdCQUFnQjtnQkFDM0IsS0FBSyxFQUFFLHFCQUFxQjtnQkFDNUIsS0FBSyxFQUFFLENBQUM7Z0JBQ1IsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsc0NBQXNDLENBQUMsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLDhCQUE4QixDQUFDLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsQ0FBQzthQUN4UTtZQUNELEdBQUcsRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxXQUFtQixFQUFFLEVBQUU7Z0JBQzlELE1BQU0seUJBQXlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO2dCQUM1RSxNQUFNLFNBQVMsR0FBRyxDQUFDLE1BQU0seUJBQXlCLENBQUMsYUFBYSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNwSCx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUM1RSxDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSxpREFBaUQ7WUFDckQsS0FBSyxFQUFFLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxzQkFBc0IsQ0FBQztZQUNqRSxJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0I7Z0JBQzNCLEtBQUssRUFBRSxxQkFBcUI7Z0JBQzVCLEtBQUssRUFBRSxDQUFDO2dCQUNSLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLHNDQUFzQyxDQUFDLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsdUJBQXVCLENBQUMsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLENBQUM7YUFDdFE7WUFDRCxHQUFHLEVBQUUsS0FBSyxFQUFFLFFBQTBCLEVBQUUsV0FBbUIsRUFBRSxFQUFFO2dCQUM5RCxNQUFNLHlCQUF5QixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUMsQ0FBQztnQkFDNUUsTUFBTSxTQUFTLEdBQUcsQ0FBQyxNQUFNLHlCQUF5QixDQUFDLGFBQWEsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLFdBQVcsRUFBRSxDQUFDLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDcEgseUJBQXlCLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxFQUFFLHFCQUFxQixFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7WUFDN0UsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsa0NBQWtDLENBQUMsRUFBRTtZQUN6QyxLQUFLLEVBQUUsa0NBQWtDLENBQUMsS0FBSztZQUMvQyxRQUFRLEVBQUUsd0JBQXdCO1lBQ2xDLFlBQVksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxVQUFVLDBCQUEwQixFQUFFLEVBQUUsdUJBQXVCLENBQUMsRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLG9CQUFvQixFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsQ0FBQztZQUMzUixJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0I7Z0JBQzNCLEtBQUssRUFBRSxvQkFBb0I7Z0JBQzNCLEtBQUssRUFBRSxDQUFDO2dCQUNSLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUN2QixjQUFjLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEVBQ3ZDLGNBQWMsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLEVBQUUsV0FBVyxDQUFDLEVBQ3JELGNBQWMsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsQ0FDeEM7YUFDRDtZQUNELEdBQUcsRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxFQUFVLEVBQUUsRUFBRTtnQkFDckQsTUFBTSxvQkFBb0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7Z0JBQ2pFLE1BQU0seUJBQXlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO2dCQUM1RSxNQUFNLFNBQVMsR0FBRyx5QkFBeUIsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDckcsSUFBSSxTQUFTLEVBQUUsQ0FBQztvQkFDZixNQUFNLE1BQU0sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsa0NBQWtDLENBQUMsQ0FBQztvQkFDdkYsTUFBTSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7b0JBQzdCLE9BQU8sTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDO2dCQUNyQixDQUFDO1lBQ0YsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsbUNBQW1DLENBQUMsRUFBRTtZQUMxQyxLQUFLLEVBQUUsRUFBRSxLQUFLLEVBQUUsbUNBQW1DLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSx5QkFBeUIsRUFBRTtZQUNoRyxRQUFRLEVBQUUsd0JBQXdCO1lBQ2xDLFlBQVksRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLFVBQVUsMEJBQTBCLEVBQUUsRUFBRSxLQUFLLENBQUM7WUFDbEYsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsZ0JBQWdCO2dCQUMzQixLQUFLLEVBQUUsb0JBQW9CO2dCQUMzQixLQUFLLEVBQUUsQ0FBQztnQkFDUixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGlCQUFpQixFQUFFLFdBQVcsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsQ0FBQzthQUN6SDtZQUNELEdBQUcsRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxFQUFVLEVBQUUsRUFBRTtnQkFDckQsTUFBTSxvQkFBb0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7Z0JBQ2pFLE1BQU0seUJBQXlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO2dCQUM1RSxNQUFNLFNBQVMsR0FBRyx5QkFBeUIsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDckcsSUFBSSxTQUFTLEVBQUUsQ0FBQztvQkFDZixNQUFNLE1BQU0sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsbUNBQW1DLENBQUMsQ0FBQztvQkFDeEYsTUFBTSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7b0JBQzdCLE9BQU8sTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDO2dCQUNyQixDQUFDO1lBQ0YsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsK0NBQStDO1lBQ25ELEtBQUssRUFBRSxRQUFRLENBQUMsc0JBQXNCLEVBQUUsK0JBQStCLENBQUM7WUFDeEUsUUFBUSxFQUFFLHdCQUF3QjtZQUNsQyxJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0I7Z0JBQzNCLEtBQUssRUFBRSxxQkFBcUI7Z0JBQzVCLEtBQUssRUFBRSxDQUFDO2dCQUNSLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLG1CQUFtQixFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsc0NBQXNDLENBQUMsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLDhCQUE4QixDQUFDLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyx1Q0FBdUMsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLGlCQUFpQixFQUFFLFdBQVcsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsQ0FBQzthQUNwVztZQUNELEdBQUcsRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxFQUFVLEVBQUUsRUFBRTtnQkFDckQsTUFBTSxvQkFBb0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7Z0JBQ2pFLE1BQU0seUJBQXlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO2dCQUM1RSxNQUFNLFNBQVMsR0FBRyx5QkFBeUIsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDckcsSUFBSSxTQUFTLEVBQUUsQ0FBQztvQkFDZixNQUFNLE1BQU0sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsK0JBQStCLENBQUMsQ0FBQztvQkFDcEYsTUFBTSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7b0JBQzdCLE9BQU8sTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDO2dCQUNyQixDQUFDO1lBQ0YsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsNkNBQTZDO1lBQ2pELEtBQUssRUFBRSxRQUFRLENBQUMsdUJBQXVCLEVBQUUsMkJBQTJCLENBQUM7WUFDckUsUUFBUSxFQUFFLHdCQUF3QjtZQUNsQyxJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0I7Z0JBQzNCLEtBQUssRUFBRSxxQkFBcUI7Z0JBQzVCLEtBQUssRUFBRSxDQUFDO2dCQUNSLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLG1CQUFtQixFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsc0NBQXNDLENBQUMsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyx1Q0FBdUMsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLGlCQUFpQixFQUFFLFdBQVcsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsQ0FBQzthQUMxVjtZQUNELEdBQUcsRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxFQUFVLEVBQUUsRUFBRTtnQkFDckQsTUFBTSxvQkFBb0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7Z0JBQ2pFLE1BQU0seUJBQXlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO2dCQUM1RSxNQUFNLFNBQVMsR0FBRyx5QkFBeUIsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDckcsSUFBSSxTQUFTLEVBQUUsQ0FBQztvQkFDZixNQUFNLE1BQU0sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsK0JBQStCLENBQUMsQ0FBQztvQkFDcEYsTUFBTSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7b0JBQzdCLE9BQU8sTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDO2dCQUNyQixDQUFDO1lBQ0YsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsbUJBQW1CLENBQUMsRUFBRTtZQUMxQixLQUFLLEVBQUUsbUJBQW1CLENBQUMsS0FBSztZQUNoQyxJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0I7Z0JBQzNCLEtBQUssRUFBRSxxQkFBcUI7Z0JBQzVCLEtBQUssRUFBRSxDQUFDO2dCQUNSLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO2FBQzVKO1lBQ0QsR0FBRyxFQUFFLEtBQUssRUFBRSxRQUEwQixFQUFFLFdBQW1CLEVBQUUsRUFBRTtnQkFDOUQsTUFBTSxvQkFBb0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7Z0JBQ2pFLE1BQU0sMEJBQTBCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO2dCQUM3RSxNQUFNLFNBQVMsR0FBRyxDQUFDLE1BQU0sMEJBQTBCLENBQUMsYUFBYSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNySCxNQUFNLE1BQU0sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsbUJBQW1CLENBQUMsQ0FBQztnQkFDeEUsTUFBTSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7Z0JBQzdCLE9BQU8sTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ3JCLENBQUM7U0FDRCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUJBQXVCLENBQUM7WUFDNUIsRUFBRSxFQUFFLDZDQUE2QztZQUNqRCxLQUFLLEVBQUUsUUFBUSxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUM7WUFDckMsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsZ0JBQWdCO2dCQUMzQixLQUFLLEVBQUUsV0FBVztnQkFDbEIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxhQUFhLENBQUMsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsRUFDcE4sY0FBYyxDQUFDLEVBQUUsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLDRDQUE0QyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsNkNBQTZDLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDNU8sS0FBSyxFQUFFLENBQUM7YUFDUjtZQUNELEdBQUcsRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxXQUFtQixFQUFFLEVBQUU7Z0JBQzlELE1BQU0sb0JBQW9CLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO2dCQUNqRSxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsMEJBQTBCLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsRUFBRSxFQUFFLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzt1QkFDeEgsQ0FBQyxNQUFNLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxhQUFhLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxXQUFXLEVBQUUsQ0FBQyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzVHLElBQUksU0FBUyxFQUFFLENBQUM7b0JBQ2YsTUFBTSxNQUFNLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGFBQWEsRUFBRSxFQUFFLHdCQUF3QixFQUFFLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUM7b0JBQ25KLE1BQU0sQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO29CQUM3QixPQUFPLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQztnQkFDckIsQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUJBQXVCLENBQUM7WUFDNUIsRUFBRSxFQUFFLGlEQUFpRDtZQUNyRCxLQUFLLEVBQUUsUUFBUSxDQUFDLDZCQUE2QixFQUFFLHVCQUF1QixDQUFDO1lBQ3ZFLElBQUksRUFBRTtnQkFDTCxFQUFFLEVBQUUsTUFBTSxDQUFDLGdCQUFnQjtnQkFDM0IsS0FBSyxFQUFFLFdBQVc7Z0JBQ2xCLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLEVBQUUsYUFBYSxDQUFDLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLDBCQUEwQixDQUFDLEVBQUUsdUJBQXVCLENBQUM7Z0JBQzlPLEtBQUssRUFBRSxDQUFDO2FBQ1I7WUFDRCxHQUFHLEVBQUUsS0FBSyxFQUFFLFFBQTBCLEVBQUUsV0FBbUIsRUFBRSxFQUFFO2dCQUM5RCxNQUFNLG9CQUFvQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQztnQkFDakUsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLEVBQUUsRUFBRSxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7dUJBQ3hILENBQUMsTUFBTSxJQUFJLENBQUMsMEJBQTBCLENBQUMsYUFBYSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM1RyxJQUFJLFNBQVMsRUFBRSxDQUFDO29CQUNmLE1BQU0sTUFBTSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxhQUFhLEVBQUU7d0JBQ2pFLHdCQUF3QixFQUFFLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxpQkFBaUI7d0JBQzNFLGVBQWUsRUFBRSxJQUFJO3FCQUNyQixDQUFDLENBQUM7b0JBQ0gsTUFBTSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7b0JBQzdCLE9BQU8sTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDO2dCQUNyQixDQUFDO1lBQ0YsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsMkRBQTJEO1lBQy9ELEtBQUssRUFBRSxRQUFRLENBQUMsK0JBQStCLEVBQUUsbUNBQW1DLENBQUM7WUFDckYsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsZ0JBQWdCO2dCQUMzQixLQUFLLEVBQUUsV0FBVztnQkFDbEIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxhQUFhLENBQUMsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsOEJBQThCLENBQUMsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLDBCQUEwQixDQUFDLEVBQUUsdUJBQXVCLENBQUM7Z0JBQzdTLEtBQUssRUFBRSxDQUFDO2FBQ1I7WUFDRCxHQUFHLEVBQUUsS0FBSyxFQUFFLFFBQTBCLEVBQUUsV0FBbUIsRUFBRSxFQUFFO2dCQUM5RCxNQUFNLG9CQUFvQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQztnQkFDakUsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLEVBQUUsRUFBRSxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7dUJBQ3hILENBQUMsTUFBTSxJQUFJLENBQUMsMEJBQTBCLENBQUMsYUFBYSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM1RyxJQUFJLFNBQVMsRUFBRSxDQUFDO29CQUNmLE1BQU0sTUFBTSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxhQUFhLEVBQUU7d0JBQ2pFLGVBQWUsRUFBRSxJQUFJO3dCQUNyQixVQUFVLEVBQUUsSUFBSTtxQkFDaEIsQ0FBQyxDQUFDO29CQUNILE1BQU0sQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO29CQUM3QixPQUFPLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQztnQkFDckIsQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUJBQXVCLENBQUM7WUFDNUIsRUFBRSxFQUFFLDJCQUEyQixDQUFDLEVBQUU7WUFDbEMsS0FBSyxFQUFFLDJCQUEyQixDQUFDLEtBQUs7WUFDeEMsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsZ0JBQWdCO2dCQUMzQixLQUFLLEVBQUUsV0FBVztnQkFDbEIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxhQUFhLENBQUMsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsMEJBQTBCLENBQUMsQ0FBQztnQkFDck4sS0FBSyxFQUFFLENBQUM7YUFDUjtZQUNELEdBQUcsRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxXQUFtQixFQUFFLEVBQUU7Z0JBQzlELE1BQU0sb0JBQW9CLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO2dCQUNqRSxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsMEJBQTBCLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsRUFBRSxFQUFFLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzt1QkFDeEgsQ0FBQyxNQUFNLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxhQUFhLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxXQUFXLEVBQUUsQ0FBQyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzVHLElBQUksU0FBUyxFQUFFLENBQUM7b0JBQ2YsT0FBTyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsMkJBQTJCLEVBQUUsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDO2dCQUNqRyxDQUFDO1lBQ0YsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsMkNBQTJDO1lBQy9DLEtBQUssRUFBRSxTQUFTLENBQUMsMkNBQTJDLEVBQUUsTUFBTSxDQUFDO1lBQ3JFLElBQUksRUFBRTtnQkFDTCxFQUFFLEVBQUUsTUFBTSxDQUFDLGdCQUFnQjtnQkFDM0IsS0FBSyxFQUFFLFFBQVE7YUFDZjtZQUNELEdBQUcsRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxXQUFtQixFQUFFLEVBQUU7Z0JBQzlELE1BQU0sZ0JBQWdCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO2dCQUN6RCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsMEJBQTBCLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsRUFBRSxFQUFFLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzt1QkFDeEgsQ0FBQyxNQUFNLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxhQUFhLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxXQUFXLEVBQUUsQ0FBQyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzVHLElBQUksU0FBUyxFQUFFLENBQUM7b0JBQ2YsTUFBTSxJQUFJLEdBQUcsUUFBUSxDQUFDLG1CQUFtQixFQUFFLFdBQVcsRUFBRSxTQUFTLENBQUMsV0FBVyxDQUFDLENBQUM7b0JBQy9FLE1BQU0sRUFBRSxHQUFHLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxTQUFTLEVBQUUsV0FBVyxDQUFDLENBQUM7b0JBQy9ELE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxrQkFBa0IsRUFBRSxTQUFTLENBQUMsV0FBVyxDQUFDLENBQUM7b0JBQ3BHLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxjQUFjLEVBQUUsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUNyRixNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsd0JBQXdCLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxDQUFDLG9CQUFvQixDQUFDLENBQUM7b0JBQ3ZHLE1BQU0sSUFBSSxHQUFHLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSwwQkFBMEIsRUFBRSxHQUFHLFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7b0JBQy9ILE1BQU0sWUFBWSxHQUFHLEdBQUcsSUFBSSxLQUFLLEVBQUUsS0FBSyxXQUFXLEtBQUssUUFBUSxLQUFLLFNBQVMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDO29CQUMzRyxNQUFNLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsQ0FBQztnQkFDaEQsQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUJBQXVCLENBQUM7WUFDNUIsRUFBRSxFQUFFLDZDQUE2QztZQUNqRCxLQUFLLEVBQUUsU0FBUyxDQUFDLDZDQUE2QyxFQUFFLG1CQUFtQixDQUFDO1lBQ3BGLElBQUksRUFBRTtnQkFDTCxFQUFFLEVBQUUsTUFBTSxDQUFDLGdCQUFnQjtnQkFDM0IsS0FBSyxFQUFFLFFBQVE7YUFDZjtZQUNELEdBQUcsRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxFQUFVLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1NBQ3BHLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsc0NBQXNDO1lBQzFDLEtBQUssRUFBRSxTQUFTLENBQUMsc0NBQXNDLEVBQUUsV0FBVyxDQUFDO1lBQ3JFLElBQUksRUFBRTtnQkFDTCxFQUFFLEVBQUUsTUFBTSxDQUFDLGdCQUFnQjtnQkFDM0IsS0FBSyxFQUFFLFFBQVE7Z0JBQ2YsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLGtDQUFrQyxDQUFDO2FBQ3RHO1lBQ0QsR0FBRyxFQUFFLEtBQUssRUFBRSxRQUEwQixFQUFFLENBQUMsRUFBRSxTQUF3QixFQUFFLEVBQUU7Z0JBQ3RFLE1BQU0sZ0JBQWdCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO2dCQUN6RCxJQUFJLFNBQVMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztvQkFDM0IsTUFBTSxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxDQUFDO2dCQUN6RCxDQUFDO1lBQ0YsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsdUNBQXVDO1lBQzNDLEtBQUssRUFBRSxTQUFTLENBQUMsdUNBQXVDLEVBQUUsVUFBVSxDQUFDO1lBQ3JFLElBQUksRUFBRTtnQkFDTCxFQUFFLEVBQUUsTUFBTSxDQUFDLGdCQUFnQjtnQkFDM0IsS0FBSyxFQUFFLGFBQWE7Z0JBQ3BCLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLEVBQUUsV0FBVyxDQUFDLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO2dCQUNoSSxLQUFLLEVBQUUsQ0FBQzthQUNSO1lBQ0QsR0FBRyxFQUFFLEtBQUssRUFBRSxRQUEwQixFQUFFLEVBQVUsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLFlBQVksQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsQ0FBQztTQUNqSixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUJBQXVCLENBQUM7WUFDNUIsRUFBRSxFQUFFLHNDQUFzQztZQUMxQyxLQUFLLEVBQUUsUUFBUSxDQUFDLGVBQWUsRUFBRSxlQUFlLENBQUM7WUFDakQsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsZ0JBQWdCO2dCQUMzQixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLDBCQUEwQixDQUFDLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO2dCQUNsSCxLQUFLLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDdkQ7WUFDRCxHQUFHLEVBQUUsS0FBSyxFQUFFLFFBQTBCLEVBQUUsV0FBbUIsRUFBRSxFQUFFO2dCQUM5RCxRQUFRLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDLENBQUMsWUFBWSxDQUFDLFdBQVcsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUNoRixDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSxnREFBZ0Q7WUFDcEQsS0FBSyxFQUFFLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSwyQkFBMkIsQ0FBQztZQUNwRSxJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0I7Z0JBQzNCLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsMEJBQTBCLENBQUMsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO2dCQUN2SyxLQUFLLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDdkQ7WUFDRCxHQUFHLEVBQUUsS0FBSyxFQUFFLFFBQTBCLEVBQUUsV0FBbUIsRUFBRSxFQUFFO2dCQUM5RCxRQUFRLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDLENBQUMsWUFBWSxDQUFDLFdBQVcsRUFBRSxZQUFZLENBQUMsQ0FBQztZQUNuRixDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSxxREFBcUQ7WUFDekQsS0FBSyxFQUFFLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSxtQ0FBbUMsQ0FBQztZQUNqRixJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0I7Z0JBQzNCLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsMEJBQTBCLENBQUMsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLENBQUM7Z0JBQ2xILEtBQUssRUFBRSxDQUFDO2FBQ1I7WUFDRCxHQUFHLEVBQUUsS0FBSyxFQUFFLFFBQTBCLEVBQUUsV0FBbUIsRUFBRSxFQUFFO2dCQUM5RCxRQUFRLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDLENBQUMsWUFBWSxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM1RSxDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSxzREFBc0Q7WUFDMUQsS0FBSyxFQUFFLFNBQVMsQ0FBQyxxREFBcUQsRUFBRSxxQkFBcUIsQ0FBQztZQUM5RixJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0I7Z0JBQzNCLEtBQUssRUFBRSxhQUFhO2dCQUNwQixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGlCQUFpQixFQUFFLFdBQVcsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsZ0NBQWdDLENBQUMsQ0FBQztnQkFDckksS0FBSyxFQUFFLENBQUM7YUFDUjtZQUNELEdBQUcsRUFBRSxDQUFDLFFBQTBCLEVBQUUsRUFBVSxFQUFFLEVBQUUsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyx1Q0FBdUMsRUFBRSxFQUFFLENBQUM7U0FDMUksQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSxrREFBa0Q7WUFDdEQsS0FBSyxFQUFFLFNBQVMsQ0FBQyxrREFBa0QsRUFBRSxvQkFBb0IsQ0FBQztZQUMxRixJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0I7Z0JBQzNCLEtBQUssRUFBRSxhQUFhO2dCQUNwQixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGlCQUFpQixFQUFFLFdBQVcsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMseUJBQXlCLENBQUMsQ0FBQztnQkFDOUgsS0FBSyxFQUFFLENBQUM7YUFDUjtZQUNELEdBQUcsRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxFQUFVLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsQ0FBQyw0QkFBNEIsQ0FBQyxLQUFLLEVBQUUsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxDQUFDO1NBQ3JKLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsc0RBQXNEO1lBQzFELEtBQUssRUFBRSxTQUFTLENBQUMsc0RBQXNELEVBQUUsaUNBQWlDLENBQUM7WUFDM0csT0FBTyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsOEJBQThCLENBQUM7WUFDM0QsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsZ0JBQWdCO2dCQUMzQixLQUFLLEVBQUUsYUFBYTtnQkFDcEIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxXQUFXLENBQUMsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLHFDQUFxQyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsNEJBQTRCLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQ2xRLEtBQUssRUFBRSxDQUFDO2FBQ1I7WUFDRCxHQUFHLEVBQUUsS0FBSyxFQUFFLFFBQTBCLEVBQUUsQ0FBUyxFQUFFLFlBQTJCLEVBQUUsRUFBRTtnQkFDakYsTUFBTSxrQkFBa0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLENBQUM7Z0JBQzdELE1BQU0sU0FBUyxHQUFHLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO2dCQUN2TCxJQUFJLFNBQVMsRUFBRSxDQUFDO29CQUNmLE9BQU8sSUFBSSxDQUFDLDBCQUEwQixDQUFDLGlDQUFpQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUNyRixDQUFDO1lBQ0YsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1QixFQUFFLEVBQUUsaUNBQWlDO1lBQ3JDLEtBQUssRUFBRSxTQUFTLENBQUMsbURBQW1ELEVBQUUscUJBQXFCLENBQUM7WUFDNUYsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsZ0JBQWdCO2dCQUMzQixLQUFLLEVBQUUsYUFBYTtnQkFDcEIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxXQUFXLENBQUMsRUFBRSx1QkFBdUIsRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLDRCQUE0QixFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUNwSyxLQUFLLEVBQUUsQ0FBQzthQUNSO1lBQ0QsR0FBRyxFQUFFLEtBQUssRUFBRSxRQUEwQixFQUFFLEVBQVUsRUFBRSxFQUFFO2dCQUNyRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsMEJBQTBCLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7Z0JBQzNHLElBQUksU0FBUyxFQUFFLENBQUM7b0JBQ2YsT0FBTyxJQUFJLENBQUMsMEJBQTBCLENBQUMsNEJBQTRCLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ2hGLENBQUM7WUFDRixDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSxrREFBa0Q7WUFDdEQsS0FBSyxFQUFFLFNBQVMsQ0FBQyxrREFBa0QsRUFBRSx1QkFBdUIsQ0FBQztZQUM3RixJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0I7Z0JBQzNCLEtBQUssRUFBRSxtQkFBbUI7Z0JBQzFCLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLHdCQUF3QixDQUFDO2dCQUNsRCxLQUFLLEVBQUUsQ0FBQzthQUNSO1lBQ0QsR0FBRyxFQUFFLEtBQUssRUFBRSxRQUEwQixFQUFFLEVBQVUsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDLGlDQUFpQyxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUM7U0FDeEosQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSx1REFBdUQ7WUFDM0QsS0FBSyxFQUFFLFNBQVMsQ0FBQyx1REFBdUQsRUFBRSw2QkFBNkIsQ0FBQztZQUN4RyxJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0I7Z0JBQzNCLEtBQUssRUFBRSxtQkFBbUI7Z0JBQzFCLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLDZCQUE2QixDQUFDO2dCQUN2RCxLQUFLLEVBQUUsQ0FBQzthQUNSO1lBQ0QsR0FBRyxFQUFFLEtBQUssRUFBRSxRQUEwQixFQUFFLEVBQVUsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDLGlDQUFpQyxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUM7U0FDekosQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSxvRUFBb0U7WUFDeEUsS0FBSyxFQUFFLFNBQVMsQ0FBQyxvRUFBb0UsRUFBRSxrQ0FBa0MsQ0FBQztZQUMxSCxJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0I7Z0JBQzNCLEtBQUssRUFBRSxtQkFBbUI7Z0JBQzFCLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsNkJBQTZCLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxjQUFjLENBQUMsU0FBUyxDQUFDLGlCQUFpQixFQUFFLFVBQVUsQ0FBQyxDQUFDO2dCQUM1UyxLQUFLLEVBQUUsQ0FBQzthQUNSO1lBQ0QsR0FBRyxFQUFFLENBQUMsUUFBMEIsRUFBRSxFQUFVLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLENBQUM7U0FDekgsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSx5RUFBeUU7WUFDN0UsS0FBSyxFQUFFLFNBQVMsQ0FBQyx5RUFBeUUsRUFBRSx1Q0FBdUMsQ0FBQztZQUNwSSxJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0I7Z0JBQzNCLEtBQUssRUFBRSxtQkFBbUI7Z0JBQzFCLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO2dCQUM5SyxLQUFLLEVBQUUsQ0FBQzthQUNSO1lBQ0QsR0FBRyxFQUFFLENBQUMsUUFBMEIsRUFBRSxFQUFVLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLENBQUM7U0FDekgsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSwyREFBMkQ7WUFDL0QsS0FBSyxFQUFFLFNBQVMsQ0FBQywyREFBMkQsRUFBRSw0Q0FBNEMsQ0FBQztZQUMzSCxRQUFRLEVBQUUsbUJBQW1CO1lBQzdCLElBQUksRUFBRTtnQkFDTCxFQUFFLEVBQUUsTUFBTSxDQUFDLGNBQWM7Z0JBQ3pCLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQzthQUNsSTtZQUNELEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEI7Z0JBQ25DLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7Z0JBQ25ELE1BQU0sZ0NBQWdDLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO2dCQUN6RixJQUFJLENBQUMsQ0FBQyxhQUFhLENBQUMsWUFBWSxZQUFZLGVBQWUsQ0FBQyxFQUFFLENBQUM7b0JBQzlELE9BQU87Z0JBQ1IsQ0FBQztnQkFDRCxNQUFNLFdBQVcsR0FBRyxhQUFhLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUNyRixNQUFNLGVBQWUsR0FBRyxNQUFNLGdDQUFnQyxDQUFDLGtCQUFrQixFQUFFLENBQUM7Z0JBQ3BGLElBQUksZUFBZSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO29CQUMzQyxPQUFPO2dCQUNSLENBQUM7Z0JBQ0QsTUFBTSxnQ0FBZ0MsQ0FBQyxvQkFBb0IsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUMxRSxDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSxpRUFBaUU7WUFDckUsS0FBSyxFQUFFLFNBQVMsQ0FBQyxpRUFBaUUsRUFBRSxtREFBbUQsQ0FBQztZQUN4SSxRQUFRLEVBQUUsbUJBQW1CO1lBQzdCLElBQUksRUFBRTtnQkFDTCxFQUFFLEVBQUUsTUFBTSxDQUFDLGNBQWM7Z0JBQ3pCLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQzthQUMvSDtZQUNELEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQywyREFBMkQsQ0FBQztTQUMxRyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUJBQXVCLENBQUM7WUFDNUIsRUFBRSxFQUFFLGtFQUFrRTtZQUN0RSxLQUFLLEVBQUUsU0FBUyxDQUFDLGtFQUFrRSxFQUFFLG9EQUFvRCxDQUFDO1lBQzFJLFFBQVEsRUFBRSxtQkFBbUI7WUFDN0IsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsY0FBYztnQkFDekIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLEVBQUUsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO2FBQ2xJO1lBQ0QsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtnQkFDbkMsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztnQkFDbkQsTUFBTSxnQ0FBZ0MsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7Z0JBQ3pGLElBQUksQ0FBQyxDQUFDLGFBQWEsQ0FBQyxZQUFZLFlBQVksZUFBZSxDQUFDLEVBQUUsQ0FBQztvQkFDOUQsT0FBTztnQkFDUixDQUFDO2dCQUNELE1BQU0sV0FBVyxHQUFHLGFBQWEsQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ3JGLE1BQU0sdUJBQXVCLEdBQUcsTUFBTSxnQ0FBZ0MsQ0FBQywwQkFBMEIsRUFBRSxDQUFDO2dCQUNwRyxJQUFJLHVCQUF1QixDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO29CQUNuRCxPQUFPO2dCQUNSLENBQUM7Z0JBQ0QsTUFBTSxnQ0FBZ0MsQ0FBQyw0QkFBNEIsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNsRixDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSx3RUFBd0U7WUFDNUUsS0FBSyxFQUFFLFNBQVMsQ0FBQyx3RUFBd0UsRUFBRSwyREFBMkQsQ0FBQztZQUN2SixRQUFRLEVBQUUsbUJBQW1CO1lBQzdCLElBQUksRUFBRTtnQkFDTCxFQUFFLEVBQUUsTUFBTSxDQUFDLGNBQWM7Z0JBQ3pCLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQzthQUMvSDtZQUNELEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQyxrRUFBa0UsQ0FBQztTQUNqSCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUJBQXVCLENBQUM7WUFDNUIsRUFBRSxFQUFFLDZDQUE2QyxDQUFDLEVBQUU7WUFDcEQsS0FBSyxFQUFFLEVBQUUsS0FBSyxFQUFFLDZDQUE2QyxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsOENBQThDLEVBQUU7WUFDL0gsUUFBUSxFQUFFLG1CQUFtQjtZQUM3QixJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxjQUFjO2dCQUN6QixJQUFJLEVBQUUscUJBQXFCLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQzthQUNsRDtZQUNELEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyw2Q0FBNkMsRUFBRSw2Q0FBNkMsQ0FBQyxFQUFFLEVBQUUsNkNBQTZDLENBQUMsS0FBSyxDQUFDLENBQUM7U0FDcE4sQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1lBQzVCLEVBQUUsRUFBRSxxREFBcUQ7WUFDekQsS0FBSyxFQUFFLFNBQVMsQ0FBQyxxREFBcUQsRUFBRSxxQ0FBcUMsQ0FBQztZQUM5RyxRQUFRLEVBQUUsbUJBQW1CO1lBQzdCLEVBQUUsRUFBRSxJQUFJO1lBQ1IsR0FBRyxFQUFFLEtBQUssRUFBRSxRQUEwQixFQUFFLEVBQUU7Z0JBQ3pDLE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUMzRCxNQUFNLDBCQUEwQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsb0NBQW9DLENBQUMsQ0FBQztnQkFDdEYsTUFBTSxpQkFBaUIsR0FBRywwQkFBMEIsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO2dCQUM1RSxNQUFNLHFCQUFxQixHQUFHLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQ2pFLEVBQUUsRUFBRSxTQUFTLENBQUMsU0FBUztvQkFDdkIsS0FBSyxFQUFFLFNBQVMsQ0FBQyxvQkFBb0I7b0JBQ3JDLFdBQVcsRUFBRSxTQUFTLENBQUMsU0FBUztvQkFDaEMsTUFBTSxFQUFFLElBQUk7aUJBQ1osQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQ25ELE1BQU0sTUFBTSxHQUFHLE1BQU0saUJBQWlCLENBQUMsSUFBSSxDQUFDLHFCQUFxQixFQUFFO29CQUNsRSxXQUFXLEVBQUUsSUFBSTtvQkFDakIsS0FBSyxFQUFFLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSxxQ0FBcUMsQ0FBQztvQkFDM0UsV0FBVyxFQUFFLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSxrQ0FBa0MsQ0FBQztpQkFDekYsQ0FBQyxDQUFDO2dCQUNILElBQUksTUFBTSxFQUFFLENBQUM7b0JBQ1osTUFBTSxtQkFBbUIsR0FBRyxFQUFFLENBQUM7b0JBQy9CLEtBQUssTUFBTSxFQUFFLFNBQVMsRUFBRSxJQUFJLGlCQUFpQixFQUFFLENBQUM7d0JBQy9DLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxTQUFTLENBQUMsRUFBRSxDQUFDOzRCQUMzQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7d0JBQ3JDLENBQUM7b0JBQ0YsQ0FBQztvQkFDRCxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO29CQUN2RiwwQkFBMEIsQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLG1CQUFtQixDQUFDLENBQUM7Z0JBQ3RFLENBQUM7WUFDRixDQUFDO1NBQ0QsQ0FBQyxDQUFDO0lBRUosQ0FBQztJQUVPLHVCQUF1QixDQUFDLHNCQUErQztRQUM5RSxNQUFNLEtBQUssR0FBRyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQzFKLElBQUksa0JBQWtCLEdBQW9ELEVBQUUsQ0FBQztRQUM3RSxNQUFNLGVBQWUsR0FBc0MsRUFBRSxDQUFDO1FBQzlELElBQUksc0JBQXNCLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDdkMsS0FBSyxJQUFJLEtBQUssR0FBRyxDQUFDLEVBQUUsS0FBSyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQztnQkFDbkQsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUMxQixNQUFNLFNBQVMsR0FBRyxzQkFBc0IsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDaEUsSUFBSSxTQUFTLEVBQUUsQ0FBQztvQkFDZixlQUFlLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsR0FBRyxJQUFJLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxFQUFFLHNCQUFzQixDQUFDLEVBQUUsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ3hILENBQUM7cUJBQU0sQ0FBQztvQkFDUCxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQy9CLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQzthQUFNLENBQUM7WUFDUCxrQkFBa0IsR0FBRyxLQUFLLENBQUM7UUFDNUIsQ0FBQztRQUNELE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDMUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsS0FBTSxTQUFRLE9BQU87WUFDcEQ7Z0JBQ0MsS0FBSyxDQUFDO29CQUNMLEdBQUcsc0JBQXNCO29CQUN6QixJQUFJLEVBQUUsa0JBQWtCO2lCQUN4QixDQUFDLENBQUM7WUFDSixDQUFDO1lBQ0QsR0FBRyxDQUFDLFFBQTBCLEVBQUUsR0FBRyxJQUFlO2dCQUNqRCxPQUFPLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQztZQUN0RCxDQUFDO1NBQ0QsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLGVBQWUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUM1QixXQUFXLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxlQUFlLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQztRQUNoRSxDQUFDO1FBQ0QsT0FBTyxXQUFXLENBQUM7SUFDcEIsQ0FBQztDQUVELENBQUE7QUE5NUNLLHVCQUF1QjtJQUcxQixXQUFBLDJCQUEyQixDQUFBO0lBQzNCLFdBQUEsaUNBQWlDLENBQUE7SUFDakMsV0FBQSxnQ0FBZ0MsQ0FBQTtJQUNoQyxXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsYUFBYSxDQUFBO0lBQ2IsV0FBQSwyQkFBMkIsQ0FBQTtJQUMzQixXQUFBLG9DQUFvQyxDQUFBO0lBQ3BDLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxjQUFjLENBQUE7SUFDZCxXQUFBLGVBQWUsQ0FBQTtJQUNmLFlBQUEsZUFBZSxDQUFBO0lBQ2YsWUFBQSxxQkFBcUIsQ0FBQTtHQWRsQix1QkFBdUIsQ0E4NUM1QjtBQUVELElBQU0sdUJBQXVCLEdBQTdCLE1BQU0sdUJBQXVCO0lBRTVCLFlBQzhCLDBCQUF1RCxFQUNuRSxjQUErQjtRQUVoRCx1QkFBdUIsQ0FBQywrQkFBK0IsQ0FBQywwQkFBMEIsRUFBRSxjQUFjLENBQUMsQ0FBQztJQUNyRyxDQUFDO0NBQ0QsQ0FBQTtBQVJLLHVCQUF1QjtJQUcxQixXQUFBLDJCQUEyQixDQUFBO0lBQzNCLFdBQUEsZUFBZSxDQUFBO0dBSlosdUJBQXVCLENBUTVCO0FBRUQsSUFBTSw0QkFBNEIsR0FBbEMsTUFBTSw0QkFBNEI7SUFDakMsWUFDdUMsMEJBQWdFLEVBQzVFLHVCQUFpRCxFQUMxRCxjQUErQixFQUMvQixjQUErQjtRQUVoRCxNQUFNLDhCQUE4QixHQUFHLG1DQUFtQyxDQUFDO1FBQzNFLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLDhCQUE4QixvQ0FBMkIsRUFBRSxDQUFDO1lBQ25GLEtBQUssTUFBTSxPQUFPLElBQUksdUJBQXVCLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ3hELDBCQUEwQixDQUFDLFlBQVksNkJBQXFCLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQztxQkFDckYsSUFBSSxDQUFDLEtBQUssRUFBQyxVQUFVLEVBQUMsRUFBRTtvQkFDeEIsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLEdBQUcsRUFBMEIsQ0FBQztvQkFDNUQsS0FBSyxNQUFNLFNBQVMsSUFBSSxVQUFVLEVBQUUsQ0FBQzt3QkFDcEMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDOzRCQUNyQyxTQUFTO3dCQUNWLENBQUM7d0JBQ0QsTUFBTSxTQUFTLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsV0FBVyxFQUFFLENBQUM7d0JBQzdELElBQUksY0FBYyxDQUFDLDBCQUEwQixFQUFFLFFBQVEsQ0FBQyxTQUFTLENBQUM7K0JBQzlELENBQUMsU0FBUyxDQUFDLG9CQUFvQixJQUFJLGNBQWMsQ0FBQywwQkFBMEIsRUFBRSxRQUFRLENBQUMsU0FBUyxDQUFDLG9CQUFvQixDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDOzRCQUMzSSxTQUFTO3dCQUNWLENBQUM7d0JBQ0QsaUJBQWlCLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxFQUFFLFNBQVMsRUFBRSxvQkFBb0IsRUFBRSxTQUFTLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxDQUFDO29CQUN2RyxDQUFDO29CQUNELElBQUksaUJBQWlCLENBQUMsSUFBSSxFQUFFLENBQUM7d0JBQzVCLDBCQUEwQixDQUFDLGVBQWUsQ0FBQyxHQUFHLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7b0JBQzNFLENBQUM7b0JBQ0QsY0FBYyxDQUFDLEtBQUssQ0FBQyw4QkFBOEIsRUFBRSxNQUFNLG1FQUFrRCxDQUFDO2dCQUMvRyxDQUFDLENBQUMsQ0FBQztZQUNMLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUE7QUFoQ0ssNEJBQTRCO0lBRS9CLFdBQUEsb0NBQW9DLENBQUE7SUFDcEMsV0FBQSx3QkFBd0IsQ0FBQTtJQUN4QixXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEsZUFBZSxDQUFBO0dBTFosNEJBQTRCLENBZ0NqQztBQUVELElBQU0sMEJBQTBCLEdBQWhDLE1BQU0sMEJBQTJCLFNBQVEsVUFBVTthQUVsQyxPQUFFLEdBQUcsbUNBQW1DLEFBQXRDLENBQXVDO0lBRXpELFlBQzZCLFlBQXdDLEVBQzdDLG9CQUEyQztRQUVsRSxLQUFLLEVBQUUsQ0FBQztRQUNSLE1BQU0sb0JBQW9CLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDdkYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUFDLHdCQUF3QixFQUFFLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMxRixJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQztJQUM5RSxDQUFDOztBQVpJLDBCQUEwQjtJQUs3QixXQUFBLDBCQUEwQixDQUFBO0lBQzFCLFdBQUEscUJBQXFCLENBQUE7R0FObEIsMEJBQTBCLENBYS9CO0FBRUQsTUFBTSxpQkFBaUIsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFrQyxtQkFBbUIsQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUN0RyxpQkFBaUIsQ0FBQyw2QkFBNkIsQ0FBQyx1QkFBdUIsa0NBQTBCLENBQUM7QUFDbEcsaUJBQWlCLENBQUMsNkJBQTZCLENBQUMsYUFBYSxvQ0FBNEIsQ0FBQztBQUMxRixpQkFBaUIsQ0FBQyw2QkFBNkIsQ0FBQyx5QkFBeUIsb0NBQTRCLENBQUM7QUFDdEcsaUJBQWlCLENBQUMsNkJBQTZCLENBQUMsZ0JBQWdCLGtDQUEwQixDQUFDO0FBQzNGLGlCQUFpQixDQUFDLDZCQUE2QixDQUFDLGtDQUFrQyxrQ0FBMEIsQ0FBQztBQUM3RyxpQkFBaUIsQ0FBQyw2QkFBNkIsQ0FBQywyQkFBMkIsb0NBQTRCLENBQUM7QUFDeEcsaUJBQWlCLENBQUMsNkJBQTZCLENBQUMsMEJBQTBCLG9DQUE0QixDQUFDO0FBQ3ZHLGlCQUFpQixDQUFDLDZCQUE2QixDQUFDLHNEQUFzRCxrQ0FBMEIsQ0FBQztBQUNqSSxpQkFBaUIsQ0FBQyw2QkFBNkIsQ0FBQyxpQ0FBaUMsa0NBQTBCLENBQUM7QUFDNUcsaUJBQWlCLENBQUMsNkJBQTZCLENBQUMscUNBQXFDLG9DQUE0QixDQUFDO0FBQ2xILGlCQUFpQixDQUFDLDZCQUE2QixDQUFDLDRCQUE0QixvQ0FBNEIsQ0FBQztBQUN6RyxpQkFBaUIsQ0FBQyw2QkFBNkIsQ0FBQyxpQ0FBaUMsb0NBQTRCLENBQUM7QUFDOUcsSUFBSSxLQUFLLEVBQUUsQ0FBQztJQUNYLGlCQUFpQixDQUFDLDZCQUE2QixDQUFDLHVCQUF1QixvQ0FBNEIsQ0FBQztBQUNyRyxDQUFDO0FBRUQsOEJBQThCLENBQUMsMEJBQTBCLENBQUMsRUFBRSxFQUFFLDBCQUEwQix1Q0FBK0IsQ0FBQztBQUd4SCxxQkFBcUI7QUFDckIsZUFBZSxDQUFDLDJCQUEyQixDQUFDLENBQUM7QUFFN0MsZUFBZSxDQUFDLE1BQU0sNkJBQThCLFNBQVEsT0FBTztJQUNsRTtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSw2Q0FBNkM7WUFDakQsS0FBSyxFQUFFLFNBQVMsQ0FBQyxxQkFBcUIsRUFBRSwwQ0FBMEMsQ0FBQztZQUNuRixJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxlQUFlO2dCQUMxQixJQUFJLEVBQUUsaUNBQWlDLENBQUMsU0FBUyxzRUFBK0M7YUFDaEc7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBQ0QsR0FBRyxDQUFDLFFBQTBCO1FBQzdCLE9BQU8sUUFBUSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQyxjQUFjLENBQUMsK0JBQStCLENBQUMsQ0FBQztJQUN0RixDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsUUFBUSxDQUFDLEVBQUUsQ0FBa0MsZ0NBQWdDLENBQUMsc0JBQXNCLENBQUM7S0FDbkcsK0JBQStCLENBQUMsQ0FBQztRQUNqQyxHQUFHLEVBQUUsMEJBQTBCO1FBQy9CLFNBQVMsRUFBRSxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsRUFBRTtZQUM5QixJQUFJLEtBQUssS0FBSyx3QkFBd0IsRUFBRSxDQUFDO2dCQUN4QyxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDO1lBQ3pCLENBQUM7WUFDRCxPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7S0FDRCxDQUFDLENBQUMsQ0FBQyJ9