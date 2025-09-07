/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { mnemonicButtonLabel } from '../../../../base/common/labels.js';
import { Disposable, DisposableStore, IDisposable, isDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isNative, isWeb } from '../../../../base/common/platform.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { MultiCommand } from '../../../../editor/browser/editorExtensions.js';
import { CopyAction, CutAction, PasteAction } from '../../../../editor/contrib/clipboard/browser/clipboard.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, IAction2Options, IMenuItem, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { Extensions as ConfigurationExtensions, ConfigurationScope, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ExtensionGalleryManifestStatus, ExtensionGalleryResourceType, ExtensionGalleryServiceUrlConfigKey, getExtensionGalleryManifestResourceUri, IExtensionGalleryManifest, IExtensionGalleryManifestService } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { EXTENSION_INSTALL_SOURCE_CONTEXT, ExtensionInstallSource, ExtensionsLocalizedLabel, FilterType, IExtensionGalleryService, IExtensionManagementService, PreferencesLocalizedLabel, SortBy, VerifyExtensionSignatureConfigKey } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { areSameExtensions, getIdAndVersion } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { ExtensionStorageService } from '../../../../platform/extensionManagement/common/extensionStorage.js';
import { IExtensionRecommendationNotificationService } from '../../../../platform/extensionRecommendations/common/extensionRecommendations.js';
import { EXTENSION_CATEGORIES, ExtensionType } from '../../../../platform/extensions/common/extensions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import * as jsonContributionRegistry from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import product from '../../../../platform/product/common/product.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { Extensions, IQuickAccessRegistry } from '../../../../platform/quickinput/common/quickAccess.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { Extensions as ConfigurationMigrationExtensions, IConfigurationMigrationRegistry } from '../../../common/configuration.js';
import { ResourceContextKey, WorkbenchStateContext } from '../../../common/contextkeys.js';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, registerWorkbenchContribution2, Extensions as WorkbenchExtensions, WorkbenchPhase } from '../../../common/contributions.js';
import { EditorExtensions } from '../../../common/editor.js';
import { IViewContainersRegistry, Extensions as ViewContainerExtensions, ViewContainerLocation } from '../../../common/views.js';
import { DEFAULT_ACCOUNT_SIGN_IN_COMMAND } from '../../../services/accounts/common/defaultAccount.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { EnablementState, IExtensionManagementServerService, IPublisherInfo, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionIgnoredRecommendationsService, IExtensionRecommendationsService } from '../../../services/extensionRecommendations/common/extensionRecommendations.js';
import { IWorkspaceExtensionsConfigService } from '../../../services/extensionRecommendations/common/workspaceExtensionsConfig.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { CONTEXT_SYNC_ENABLEMENT } from '../../../services/userDataSync/common/userDataSync.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { WORKSPACE_TRUST_EXTENSION_SUPPORT } from '../../../services/workspaces/common/workspaceTrust.js';
import { ILanguageModelToolsService } from '../../chat/common/languageModelToolsService.js';
import { CONTEXT_KEYBINDINGS_EDITOR } from '../../preferences/common/preferences.js';
import { IWebview } from '../../webview/browser/webview.js';
import { Query } from '../common/extensionQuery.js';
import { AutoRestartConfigurationKey, AutoUpdateConfigurationKey, CONTEXT_EXTENSIONS_GALLERY_STATUS, CONTEXT_HAS_GALLERY, DefaultViewsContext, ExtensionEditorTab, ExtensionRuntimeActionType, EXTENSIONS_CATEGORY, extensionsFilterSubMenu, extensionsSearchActionsMenu, HasOutdatedExtensionsContext, IExtensionArg, IExtensionsViewPaneContainer, IExtensionsWorkbenchService, INSTALL_ACTIONS_GROUP, INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID, IWorkspaceRecommendedExtensionsView, LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID, OUTDATED_EXTENSIONS_VIEW_ID, SELECT_INSTALL_VSIX_EXTENSION_COMMAND_ID, THEME_ACTIONS_GROUP, TOGGLE_IGNORE_EXTENSION_ACTION_ID, UPDATE_ACTIONS_GROUP, VIEWLET_ID, WORKSPACE_RECOMMENDATIONS_VIEW_ID } from '../common/extensions.js';
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
registerSingleton(IExtensionsWorkbenchService, ExtensionsWorkbenchService, InstantiationType.Eager /* Auto updates extensions */);
registerSingleton(IExtensionRecommendationNotificationService, ExtensionRecommendationNotificationService, InstantiationType.Delayed);
registerSingleton(IExtensionRecommendationsService, ExtensionRecommendationsService, InstantiationType.Eager /* Prompts recommendations in the background */);

// Quick Access
Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess).registerQuickAccessProvider({
	ctor: ManageExtensionsQuickAccessProvider,
	prefix: ManageExtensionsQuickAccessProvider.PREFIX,
	placeholder: localize('manageExtensionsQuickAccessPlaceholder', "Press Enter to manage extensions."),
	helpEntries: [{ description: localize('manageExtensionsHelp', "Manage Extensions") }]
});

// Editor
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ExtensionEditor,
		ExtensionEditor.ID,
		localize('extension', "Extension")
	),
	[
		new SyncDescriptor(ExtensionsInput)
	]);

export const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer(
	{
		id: VIEWLET_ID,
		title: localize2('extensions', "Extensions"),
		openCommandActionDescriptor: {
			id: VIEWLET_ID,
			mnemonicTitle: localize({ key: 'miViewExtensions', comment: ['&& denotes a mnemonic'] }, "E&&xtensions"),
			keybindings: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyX },
			order: 4,
		},
		ctorDescriptor: new SyncDescriptor(ExtensionsViewPaneContainer),
		icon: extensionsViewIcon,
		order: 4,
		rejectAddedViews: true,
		alwaysUseContainerInfo: true,
	}, ViewContainerLocation.Sidebar);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
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
				scope: ConfigurationScope.APPLICATION,
				tags: ['usesOnlineServices']
			},
			'extensions.autoCheckUpdates': {
				type: 'boolean',
				description: localize('extensionsCheckUpdates', "When enabled, automatically checks extensions for updates. If an extension has an update, it is marked as outdated in the Extensions view. The updates are fetched from a Microsoft online service."),
				default: true,
				scope: ConfigurationScope.APPLICATION,
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
				scope: ConfigurationScope.APPLICATION
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
				scope: ConfigurationScope.APPLICATION,
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
			[VerifyExtensionSignatureConfigKey]: {
				type: 'boolean',
				description: localize('extensions.verifySignature', "When enabled, extensions are verified to be signed before getting installed."),
				default: true,
				scope: ConfigurationScope.APPLICATION,
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
				scope: ConfigurationScope.APPLICATION,
				tags: ['usesOnlineServices'],
				included: false,
				policy: {
					name: 'ExtensionGalleryServiceUrl',
					minimumVersion: '1.99',
				},
			},
			'extensions.supportNodeGlobalNavigator': {
				type: 'boolean',
				description: localize('extensionsSupportNodeGlobalNavigator', "When enabled, Node.js navigator object is exposed on the global scope."),
				default: false,
			},
		}
	});

const jsonRegistry = <jsonContributionRegistry.IJSONContributionRegistry>Registry.as(jsonContributionRegistry.Extensions.JSONContribution);
jsonRegistry.registerSchema(ExtensionsConfigurationSchemaId, ExtensionsConfigurationSchema);

// Register Commands
CommandsRegistry.registerCommand('_extensions.manage', (accessor: ServicesAccessor, extensionId: string, tab?: ExtensionEditorTab, preserveFocus?: boolean, feature?: string) => {
	const extensionService = accessor.get(IExtensionsWorkbenchService);
	const extension = extensionService.local.find(e => areSameExtensions(e.identifier, { id: extensionId }));
	if (extension) {
		extensionService.open(extension, { tab, preserveFocus, feature });
	} else {
		throw new Error(localize('notFound', "Extension '{0}' not found.", extensionId));
	}
});

CommandsRegistry.registerCommand('extension.open', async (accessor: ServicesAccessor, extensionId: string, tab?: ExtensionEditorTab, preserveFocus?: boolean, feature?: string, sideByside?: boolean) => {
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
				constraint: (value: any) => typeof value === 'string' || value instanceof URI,
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
	handler: async (
		accessor,
		arg: string | UriComponents,
		options?: {
			installOnlyNewlyAddedFromExtensionPackVSIX?: boolean;
			installPreReleaseVersion?: boolean;
			donotSync?: boolean;
			justification?: string | { reason: string; action: string };
			enable?: boolean;
			context?: IStringDictionary<any>;
		}) => {
		const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
		const extensionManagementService = accessor.get(IWorkbenchExtensionManagementService);
		const extensionGalleryService = accessor.get(IExtensionGalleryService);
		try {
			if (typeof arg === 'string') {
				const [id, version] = getIdAndVersion(arg);
				const extension = extensionsWorkbenchService.local.find(e => areSameExtensions(e.identifier, { id, uuid: version }));
				if (extension?.enablementState === EnablementState.DisabledByExtensionKind) {
					const [gallery] = await extensionGalleryService.getExtensions([{ id, preRelease: options?.installPreReleaseVersion }], CancellationToken.None);
					if (!gallery) {
						throw new Error(localize('notFound', "Extension '{0}' not found.", arg));
					}
					await extensionManagementService.installFromGallery(gallery, {
						isMachineScoped: options?.donotSync ? true : undefined, /* do not allow syncing extensions automatically while installing through the command */
						installPreReleaseVersion: options?.installPreReleaseVersion,
						installGivenVersion: !!version,
						context: { ...options?.context, [EXTENSION_INSTALL_SOURCE_CONTEXT]: ExtensionInstallSource.COMMAND },
					});
				} else {
					await extensionsWorkbenchService.install(arg, {
						version,
						installPreReleaseVersion: options?.installPreReleaseVersion,
						context: { ...options?.context, [EXTENSION_INSTALL_SOURCE_CONTEXT]: ExtensionInstallSource.COMMAND },
						justification: options?.justification,
						enable: options?.enable,
						isMachineScoped: options?.donotSync ? true : undefined, /* do not allow syncing extensions automatically while installing through the command */
					}, ProgressLocation.Notification);
				}
			} else {
				const vsix = URI.revive(arg);
				await extensionsWorkbenchService.install(vsix, { installGivenVersion: true });
			}
		} catch (e) {
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
	handler: async (accessor, id: string) => {
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
		} catch (e) {
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
	handler: async (accessor, query: string = '') => {
		return accessor.get(IExtensionsWorkbenchService).openSearch(query);
	}
});

function overrideActionForActiveExtensionEditorWebview(command: MultiCommand | undefined, f: (webview: IWebview) => void) {
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
export const CONTEXT_HAS_LOCAL_SERVER = new RawContextKey<boolean>('hasLocalServer', false);
export const CONTEXT_HAS_REMOTE_SERVER = new RawContextKey<boolean>('hasRemoteServer', false);
export const CONTEXT_HAS_WEB_SERVER = new RawContextKey<boolean>('hasWebServer', false);
const CONTEXT_GALLERY_SORT_CAPABILITIES = new RawContextKey<string>('gallerySortCapabilities', '');
const CONTEXT_GALLERY_FILTER_CAPABILITIES = new RawContextKey<string>('galleryFilterCapabilities', '');
const CONTEXT_GALLERY_ALL_PUBLIC_REPOSITORY_SIGNED = new RawContextKey<boolean>('galleryAllPublicRepositorySigned', false);
const CONTEXT_GALLERY_ALL_PRIVATE_REPOSITORY_SIGNED = new RawContextKey<boolean>('galleryAllPrivateRepositorySigned', false);
const CONTEXT_GALLERY_HAS_EXTENSION_LINK = new RawContextKey<boolean>('galleryHasExtensionLink', false);

async function runAction(action: IAction): Promise<void> {
	try {
		await action.run();
	} finally {
		if (isDisposable(action)) {
			action.dispose();
		}
	}
}

type IExtensionActionOptions = IAction2Options & {
	menuTitles?: { [id: string]: string };
	run(accessor: ServicesAccessor, ...args: any[]): Promise<any>;
};

class ExtensionsContributions extends Disposable implements IWorkbenchContribution {

	constructor(
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@IExtensionGalleryManifestService private readonly extensionGalleryManifestService: IExtensionGalleryManifestService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IViewsService private readonly viewsService: IViewsService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IDialogService private readonly dialogService: IDialogService,
		@ICommandService private readonly commandService: ICommandService,
		@IProductService private readonly productService: IProductService,
	) {
		super();
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

	private async updateExtensionGalleryStatusContexts(): Promise<void> {
		CONTEXT_HAS_GALLERY.bindTo(this.contextKeyService).set(this.extensionGalleryManifestService.extensionGalleryManifestStatus === ExtensionGalleryManifestStatus.Available);
		CONTEXT_EXTENSIONS_GALLERY_STATUS.bindTo(this.contextKeyService).set(this.extensionGalleryManifestService.extensionGalleryManifestStatus);
	}

	private async updateGalleryCapabilitiesContexts(extensionGalleryManifest: IExtensionGalleryManifest | null): Promise<void> {
		CONTEXT_GALLERY_SORT_CAPABILITIES.bindTo(this.contextKeyService).set(`_${extensionGalleryManifest?.capabilities.extensionQuery.sorting?.map(s => s.name)?.join('_')}_UpdateDate_`);
		CONTEXT_GALLERY_FILTER_CAPABILITIES.bindTo(this.contextKeyService).set(`_${extensionGalleryManifest?.capabilities.extensionQuery.filtering?.map(s => s.name)?.join('_')}_`);
		CONTEXT_GALLERY_ALL_PUBLIC_REPOSITORY_SIGNED.bindTo(this.contextKeyService).set(!!extensionGalleryManifest?.capabilities?.signing?.allPublicRepositorySigned);
		CONTEXT_GALLERY_ALL_PRIVATE_REPOSITORY_SIGNED.bindTo(this.contextKeyService).set(!!extensionGalleryManifest?.capabilities?.signing?.allPrivateRepositorySigned);
		CONTEXT_GALLERY_HAS_EXTENSION_LINK.bindTo(this.contextKeyService).set(!!(extensionGalleryManifest && getExtensionGalleryManifestResourceUri(extensionGalleryManifest, ExtensionGalleryResourceType.ExtensionDetailsViewUri)));
	}

	private registerQuickAccessProvider(): void {
		if (this.extensionManagementServerService.localExtensionManagementServer
			|| this.extensionManagementServerService.remoteExtensionManagementServer
			|| this.extensionManagementServerService.webExtensionManagementServer
		) {
			Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess).registerQuickAccessProvider({
				ctor: InstallExtensionQuickAccessProvider,
				prefix: InstallExtensionQuickAccessProvider.PREFIX,
				placeholder: localize('installExtensionQuickAccessPlaceholder', "Type the name of an extension to install or search."),
				helpEntries: [{ description: localize('installExtensionQuickAccessHelp', "Install or Search Extensions") }]
			});
		}
	}

	// Global actions
	private registerGlobalActions(): void {
		this._register(MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
			command: {
				id: VIEWLET_ID,
				title: localize({ key: 'miPreferencesExtensions', comment: ['&& denotes a mnemonic'] }, "&&Extensions")
			},
			group: '2_configuration',
			order: 3
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
			run: async (accessor: ServicesAccessor) => {
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
			run: async (accessor: ServicesAccessor) => {
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
				await this.extensionsWorkbenchService.checkForUpdates();
				const outdated = this.extensionsWorkbenchService.outdated;
				if (outdated.length) {
					return this.extensionsWorkbenchService.openSearch('@outdated ');
				} else {
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
			run: (accessor: ServicesAccessor) => accessor.get(IExtensionsWorkbenchService).updateAutoUpdateForAllExtensions(true)
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
			run: (accessor: ServicesAccessor) => accessor.get(IExtensionsWorkbenchService).updateAutoUpdateForAllExtensions(false)
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
					await this.extensionsWorkbenchService.setEnablement(extensionsToEnable, EnablementState.EnabledGlobally);
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
					await this.extensionsWorkbenchService.setEnablement(extensionsToEnable, EnablementState.EnabledWorkspace);
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
					await this.extensionsWorkbenchService.setEnablement(extensionsToDisable, EnablementState.DisabledGlobally);
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
					await this.extensionsWorkbenchService.setEnablement(extensionsToDisable, EnablementState.DisabledWorkspace);
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
			run: async (accessor: ServicesAccessor) => {
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
			run: async (accessor: ServicesAccessor, resources: URI[] | URI) => {
				const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
				const hostService = accessor.get(IHostService);
				const notificationService = accessor.get(INotificationService);

				const vsixs = Array.isArray(resources) ? resources : [resources];
				const result = await Promise.allSettled(vsixs.map(async (vsix) => await extensionsWorkbenchService.install(vsix, { installGivenVersion: true })));
				let error: Error | undefined, requireReload = false, requireRestart = false;
				for (const r of result) {
					if (r.status === 'rejected') {
						error = new Error(r.reason);
						break;
					}
					requireReload = requireReload || r.value.runtimeState?.action === ExtensionRuntimeActionType.ReloadWindow;
					requireRestart = requireRestart || r.value.runtimeState?.action === ExtensionRuntimeActionType.RestartExtensions;
				}
				if (error) {
					throw error;
				}
				if (requireReload) {
					notificationService.prompt(
						Severity.Info,
						vsixs.length > 1 ? localize('InstallVSIXs.successReload', "Completed installing extensions. Please reload Visual Studio Code to enable them.")
							: localize('InstallVSIXAction.successReload', "Completed installing extension. Please reload Visual Studio Code to enable it."),
						[{
							label: localize('InstallVSIXAction.reloadNow', "Reload Now"),
							run: () => hostService.reload()
						}]
					);
				}
				else if (requireRestart) {
					notificationService.prompt(
						Severity.Info,
						vsixs.length > 1 ? localize('InstallVSIXs.successRestart', "Completed installing extensions. Please restart extensions to enable them.")
							: localize('InstallVSIXAction.successRestart', "Completed installing extension. Please restart extensions to enable it."),
						[{
							label: localize('InstallVSIXAction.restartExtensions', "Restart Extensions"),
							run: () => extensionsWorkbenchService.updateRunningExtensions()
						}]
					);
				}
				else {
					notificationService.prompt(
						Severity.Info,
						vsixs.length > 1 ? localize('InstallVSIXs.successNoReload', "Completed installing extensions.") : localize('InstallVSIXAction.successNoReload', "Completed installing extension."),
						[]
					);
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
			run: async (accessor: ServicesAccessor) => {
				const extensionManagementService = accessor.get(IWorkbenchExtensionManagementService);
				if (isWeb) {
					return new Promise<void>((c, e) => {
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
								} catch (error) {
									e(error);
									return;
								}
							}
							c();
						}));
						disposables.add(quickPick.onDidHide(() => disposables.dispose()));
						quickPick.show();
					});
				} else {
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
		const featuresExtensionsWhenContext = ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.regex(CONTEXT_GALLERY_FILTER_CAPABILITIES.key, new RegExp(`_${FilterType.Featured}_`)));
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
			when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.regex(CONTEXT_GALLERY_FILTER_CAPABILITIES.key, new RegExp(`_${FilterType.Category}_`))),
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
			{ id: 'installs', title: localize('sort by installs', "Install Count"), precondition: BuiltInExtensionsContext.negate(), sortCapability: SortBy.InstallCount },
			{ id: 'rating', title: localize('sort by rating', "Rating"), precondition: BuiltInExtensionsContext.negate(), sortCapability: SortBy.WeightedRating },
			{ id: 'name', title: localize('sort by name', "Name"), precondition: BuiltInExtensionsContext.negate(), sortCapability: SortBy.Title },
			{ id: 'publishedDate', title: localize('sort by published date', "Published Date"), precondition: BuiltInExtensionsContext.negate(), sortCapability: SortBy.PublishedDate },
			{ id: 'updateDate', title: localize('sort by update date', "Updated Date"), precondition: ContextKeyExpr.and(SearchMarketplaceExtensionsContext.negate(), RecommendedExtensionsContext.negate(), BuiltInExtensionsContext.negate()), sortCapability: 'UpdateDate' },
		].map(({ id, title, precondition, sortCapability }, index) => {
			const sortCapabilityContext = ContextKeyExpr.regex(CONTEXT_GALLERY_SORT_CAPABILITIES.key, new RegExp(`_${sortCapability}_`));
			this.registerExtensionAction({
				id: `extensions.sort.${id}`,
				title,
				precondition: ContextKeyExpr.and(precondition, ContextKeyExpr.regex(ExtensionsSearchValueContext.key, /^@feature:/).negate(), sortCapabilityContext),
				menu: [{
					id: extensionsSortSubMenu,
					when: ContextKeyExpr.and(ContextKeyExpr.or(CONTEXT_HAS_GALLERY, DefaultViewsContext), sortCapabilityContext),
					order: index,
				}],
				toggled: ExtensionsSortByContext.isEqualTo(id),
				run: async () => {
					const extensionsViewPaneContainer = ((await this.viewsService.openViewContainer(VIEWLET_ID, true))?.getViewPaneContainer()) as IExtensionsViewPaneContainer | undefined;
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
			run: async (accessor: ServicesAccessor) => {
				const viewPaneContainer = accessor.get(IViewsService).getActiveViewPaneContainerWithId(VIEWLET_ID);
				if (viewPaneContainer) {
					const extensionsViewPaneContainer = viewPaneContainer as IExtensionsViewPaneContainer;
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
			run: async (accessor: ServicesAccessor) => {
				const viewPaneContainer = accessor.get(IViewsService).getActiveViewPaneContainerWithId(VIEWLET_ID);
				if (viewPaneContainer) {
					await (viewPaneContainer as IExtensionsViewPaneContainer).refresh();
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
			run: async (accessor: ServicesAccessor) => {
				const view = accessor.get(IViewsService).getActiveViewWithId(WORKSPACE_RECOMMENDATIONS_VIEW_ID) as IWorkspaceRecommendedExtensionsView;
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
	private registerContextMenuActions(): void {

		this.registerExtensionAction({
			id: SetColorThemeAction.ID,
			title: SetColorThemeAction.TITLE,
			menu: {
				id: MenuId.ExtensionContext,
				group: THEME_ACTIONS_GROUP,
				order: 0,
				when: ContextKeyExpr.and(ContextKeyExpr.not('inExtensionEditor'), ContextKeyExpr.equals('extensionStatus', 'installed'), ContextKeyExpr.has('extensionHasColorThemes'))
			},
			run: async (accessor: ServicesAccessor, extensionId: string) => {
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
			run: async (accessor: ServicesAccessor, extensionId: string) => {
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
			run: async (accessor: ServicesAccessor, extensionId: string) => {
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
			run: async (accessor: ServicesAccessor, extensionId: string) => {
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
			run: async (accessor: ServicesAccessor, extensionId: string) => {
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
				when: ContextKeyExpr.and(
					ContextKeyExpr.not('inExtensionEditor'),
					ContextKeyExpr.equals('extensionStatus', 'installed'),
					ContextKeyExpr.not('isBuiltinExtension'),
				)
			},
			run: async (accessor: ServicesAccessor, id: string) => {
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
			run: async (accessor: ServicesAccessor, id: string) => {
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
			run: async (accessor: ServicesAccessor, id: string) => {
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
			run: async (accessor: ServicesAccessor, id: string) => {
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
			run: async (accessor: ServicesAccessor, extensionId: string) => {
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
				when: ContextKeyExpr.and(ContextKeyExpr.equals('extensionStatus', 'uninstalled'), ContextKeyExpr.has('isGalleryExtension'), ContextKeyExpr.not('extensionDisallowInstall'), ContextKeyExpr.has('extensionIsUnsigned'),
					ContextKeyExpr.or(ContextKeyExpr.and(CONTEXT_GALLERY_ALL_PUBLIC_REPOSITORY_SIGNED, ContextKeyExpr.not('extensionIsPrivate')), ContextKeyExpr.and(CONTEXT_GALLERY_ALL_PRIVATE_REPOSITORY_SIGNED, ContextKeyExpr.has('extensionIsPrivate')))),
				order: 1
			},
			run: async (accessor: ServicesAccessor, extensionId: string) => {
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
			run: async (accessor: ServicesAccessor, extensionId: string) => {
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
			run: async (accessor: ServicesAccessor, extensionId: string) => {
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
			run: async (accessor: ServicesAccessor, extensionId: string) => {
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
			run: async (accessor: ServicesAccessor, extensionId: string) => {
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
			run: async (accessor: ServicesAccessor, id: string) => accessor.get(IClipboardService).writeText(id)
		});

		this.registerExtensionAction({
			id: 'workbench.extensions.action.copyLink',
			title: localize2('workbench.extensions.action.copyLink', 'Copy Link'),
			menu: {
				id: MenuId.ExtensionContext,
				group: '1_copy',
				when: ContextKeyExpr.and(ContextKeyExpr.has('isGalleryExtension'), CONTEXT_GALLERY_HAS_EXTENSION_LINK),
			},
			run: async (accessor: ServicesAccessor, _, extension: IExtensionArg) => {
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
			run: async (accessor: ServicesAccessor, id: string) => accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: `@ext:${id}` })
		});

		this.registerExtensionAction({
			id: 'workbench.extensions.action.download',
			title: localize('download VSIX', "Download VSIX"),
			menu: {
				id: MenuId.ExtensionContext,
				when: ContextKeyExpr.and(ContextKeyExpr.not('extensionDisallowInstall'), ContextKeyExpr.has('isGalleryExtension')),
				order: this.productService.quality === 'stable' ? 0 : 1
			},
			run: async (accessor: ServicesAccessor, extensionId: string) => {
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
			run: async (accessor: ServicesAccessor, extensionId: string) => {
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
			run: async (accessor: ServicesAccessor, extensionId: string) => {
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
			run: (accessor: ServicesAccessor, id: string) => accessor.get(ICommandService).executeCommand('_manageAccountPreferencesForExtension', id)
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
			run: async (accessor: ServicesAccessor, id: string) => accessor.get(IPreferencesService).openGlobalKeybindingSettings(false, { query: `@ext:${id}` })
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
			run: async (accessor: ServicesAccessor, _: string, extensionArg: IExtensionArg) => {
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
			run: async (accessor: ServicesAccessor, id: string) => {
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
			run: async (accessor: ServicesAccessor, id: string) => accessor.get(IExtensionIgnoredRecommendationsService).toggleGlobalIgnoredRecommendation(id, true)
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
			run: async (accessor: ServicesAccessor, id: string) => accessor.get(IExtensionIgnoredRecommendationsService).toggleGlobalIgnoredRecommendation(id, false)
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
			run: (accessor: ServicesAccessor, id: string) => accessor.get(IWorkspaceExtensionsConfigService).toggleRecommendation(id)
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
			run: (accessor: ServicesAccessor, id: string) => accessor.get(IWorkspaceExtensionsConfigService).toggleRecommendation(id)
		});

		this.registerExtensionAction({
			id: 'workbench.extensions.action.addToWorkspaceRecommendations',
			title: localize2('workbench.extensions.action.addToWorkspaceRecommendations', "Add Extension to Workspace Recommendations"),
			category: EXTENSIONS_CATEGORY,
			menu: {
				id: MenuId.CommandPalette,
				when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo('workspace'), ContextKeyExpr.equals('resourceScheme', Schemas.extension)),
			},
			async run(accessor: ServicesAccessor): Promise<any> {
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
			async run(accessor: ServicesAccessor): Promise<any> {
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
			run: async (accessor: ServicesAccessor) => {
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

	private registerExtensionAction(extensionActionOptions: IExtensionActionOptions): IDisposable {
		const menus = extensionActionOptions.menu ? Array.isArray(extensionActionOptions.menu) ? extensionActionOptions.menu : [extensionActionOptions.menu] : [];
		let menusWithOutTitles: ({ id: MenuId } & Omit<IMenuItem, 'command'>)[] = [];
		const menusWithTitles: { id: MenuId; item: IMenuItem }[] = [];
		if (extensionActionOptions.menuTitles) {
			for (let index = 0; index < menus.length; index++) {
				const menu = menus[index];
				const menuTitle = extensionActionOptions.menuTitles[menu.id.id];
				if (menuTitle) {
					menusWithTitles.push({ id: menu.id, item: { ...menu, command: { id: extensionActionOptions.id, title: menuTitle } } });
				} else {
					menusWithOutTitles.push(menu);
				}
			}
		} else {
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
			run(accessor: ServicesAccessor, ...args: any[]): Promise<any> {
				return extensionActionOptions.run(accessor, ...args);
			}
		}));
		if (menusWithTitles.length) {
			disposables.add(MenuRegistry.appendMenuItems(menusWithTitles));
		}
		return disposables;
	}

}

class ExtensionStorageCleaner implements IWorkbenchContribution {

	constructor(
		@IExtensionManagementService extensionManagementService: IExtensionManagementService,
		@IStorageService storageService: IStorageService,
	) {
		ExtensionStorageService.removeOutdatedExtensionVersions(extensionManagementService, storageService);
	}
}

class TrustedPublishersInitializer implements IWorkbenchContribution {
	constructor(
		@IWorkbenchExtensionManagementService extensionManagementService: IWorkbenchExtensionManagementService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IProductService productService: IProductService,
		@IStorageService storageService: IStorageService,
	) {
		const trustedPublishersInitStatusKey = 'trusted-publishers-init-migration';
		if (!storageService.get(trustedPublishersInitStatusKey, StorageScope.APPLICATION)) {
			for (const profile of userDataProfilesService.profiles) {
				extensionManagementService.getInstalled(ExtensionType.User, profile.extensionsResource)
					.then(async extensions => {
						const trustedPublishers = new Map<string, IPublisherInfo>();
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
						storageService.store(trustedPublishersInitStatusKey, 'true', StorageScope.APPLICATION, StorageTarget.MACHINE);
					});
			}
		}
	}
}

class ExtensionToolsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'extensions.chat.toolsContribution';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const searchExtensionsTool = instantiationService.createInstance(SearchExtensionsTool);
		this._register(toolsService.registerTool(SearchExtensionsToolData, searchExtensionsTool));
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(ExtensionsContributions, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(StatusUpdater, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(MaliciousExtensionChecker, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(KeymapExtensions, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(ExtensionsViewletViewsContribution, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(ExtensionActivationProgress, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(ExtensionDependencyChecker, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(ExtensionEnablementWorkspaceTrustTransitionParticipant, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(ExtensionsCompletionItemsProvider, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(UnsupportedExtensionsMigrationContrib, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(TrustedPublishersInitializer, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(ExtensionMarketplaceStatusUpdater, LifecyclePhase.Eventually);
if (isWeb) {
	workbenchRegistry.registerWorkbenchContribution(ExtensionStorageCleaner, LifecyclePhase.Eventually);
}

registerWorkbenchContribution2(ExtensionToolsContribution.ID, ExtensionToolsContribution, WorkbenchPhase.AfterRestored);


// Running Extensions
registerAction2(ShowRuntimeExtensionsAction);

registerAction2(class ExtensionsGallerySignInAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.extensions.actions.gallery.signIn',
			title: localize2('signInToMarketplace', 'Sign in to access Extensions Marketplace'),
			menu: {
				id: MenuId.AccountsContext,
				when: CONTEXT_EXTENSIONS_GALLERY_STATUS.isEqualTo(ExtensionGalleryManifestStatus.RequiresSignIn)
			},
		});
	}
	run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(ICommandService).executeCommand(DEFAULT_ACCOUNT_SIGN_IN_COMMAND);
	}
});

Registry.as<IConfigurationMigrationRegistry>(ConfigurationMigrationExtensions.ConfigurationMigration)
	.registerConfigurationMigrations([{
		key: AutoUpdateConfigurationKey,
		migrateFn: (value, accessor) => {
			if (value === 'onlySelectedExtensions') {
				return { value: false };
			}
			return [];
		}
	}]);
