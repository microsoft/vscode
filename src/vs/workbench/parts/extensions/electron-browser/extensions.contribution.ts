/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/extensions';
import { localize } from 'vs/nls';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtensionTipsService, ExtensionsLabel, ExtensionsChannelId, PreferencesLabel } from 'vs/platform/extensionManagement/common/extensionManagement';

import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actions';
import { ExtensionTipsService } from 'vs/workbench/parts/extensions/electron-browser/extensionTipsService';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IOutputChannelRegistry, Extensions as OutputExtensions } from 'vs/workbench/parts/output/common/output';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { VIEWLET_ID, IExtensionsWorkbenchService } from '../common/extensions';
import { ExtensionsWorkbenchService } from 'vs/workbench/parts/extensions/node/extensionsWorkbenchService';
import {
	OpenExtensionsViewletAction, InstallExtensionsAction, ShowOutdatedExtensionsAction, ShowRecommendedExtensionsAction, ShowRecommendedKeymapExtensionsAction, ShowPopularExtensionsAction,
	ShowEnabledExtensionsAction, ShowInstalledExtensionsAction, ShowDisabledExtensionsAction, ShowBuiltInExtensionsAction, UpdateAllAction,
	EnableAllAction, EnableAllWorkpsaceAction, DisableAllAction, DisableAllWorkpsaceAction, CheckForUpdatesAction, ShowLanguageExtensionsAction, ShowAzureExtensionsAction, EnableAutoUpdateAction, DisableAutoUpdateAction, ConfigureRecommendedExtensionsCommandsContributor, OpenExtensionsFolderAction, InstallVSIXAction, ReinstallAction, InstallSpecificVersionOfExtensionAction
} from 'vs/workbench/parts/extensions/electron-browser/extensionsActions';
import { ExtensionsInput } from 'vs/workbench/parts/extensions/common/extensionsInput';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { ExtensionEditor } from 'vs/workbench/parts/extensions/electron-browser/extensionEditor';
import { StatusUpdater, ExtensionsViewlet, MaliciousExtensionChecker, ExtensionsViewletViewsContribution } from 'vs/workbench/parts/extensions/electron-browser/extensionsViewlet';
import { IQuickOpenRegistry, Extensions, QuickOpenHandlerDescriptor } from 'vs/workbench/browser/quickopen';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import * as jsonContributionRegistry from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { ExtensionsConfigurationSchema, ExtensionsConfigurationSchemaId } from 'vs/workbench/parts/extensions/common/extensionsFileTemplate';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeymapExtensions } from 'vs/workbench/parts/extensions/electron-browser/extensionsUtils';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { GalleryExtensionsHandler, ExtensionsHandler } from 'vs/workbench/parts/extensions/browser/extensionsQuickOpen';
import { EditorDescriptor, IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { RuntimeExtensionsEditor, ShowRuntimeExtensionsAction, IExtensionHostProfileService, DebugExtensionHostAction, StartExtensionHostProfileAction, StopExtensionHostProfileAction, CONTEXT_PROFILE_SESSION_STATE, SaveExtensionHostProfileAction, CONTEXT_EXTENSION_HOST_PROFILE_RECORDED } from 'vs/workbench/parts/extensions/electron-browser/runtimeExtensionsEditor';
import { EditorInput, IEditorInputFactory, IEditorInputFactoryRegistry, Extensions as EditorInputExtensions, ActiveEditorContext } from 'vs/workbench/common/editor';
import { ExtensionHostProfileService } from 'vs/workbench/parts/extensions/electron-browser/extensionProfileService';
import { RuntimeExtensionsInput } from 'vs/workbench/services/extensions/electron-browser/runtimeExtensionsInput';
import { URI } from 'vs/base/common/uri';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionActivationProgress } from 'vs/workbench/parts/extensions/electron-browser/extensionsActivationProgress';
import { ExtensionsAutoProfiler } from 'vs/workbench/parts/extensions/electron-browser/extensionsAutoProfiler';

// Singletons
registerSingleton(IExtensionsWorkbenchService, ExtensionsWorkbenchService);
registerSingleton(IExtensionTipsService, ExtensionTipsService);
registerSingleton(IExtensionHostProfileService, ExtensionHostProfileService, true);

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(StatusUpdater, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(MaliciousExtensionChecker, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(ConfigureRecommendedExtensionsCommandsContributor, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(KeymapExtensions, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(ExtensionsViewletViewsContribution, LifecyclePhase.Starting);
workbenchRegistry.registerWorkbenchContribution(ExtensionActivationProgress, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(ExtensionsAutoProfiler, LifecyclePhase.Eventually);

Registry.as<IOutputChannelRegistry>(OutputExtensions.OutputChannels)
	.registerChannel({ id: ExtensionsChannelId, label: ExtensionsLabel, log: false });

// Quickopen
Registry.as<IQuickOpenRegistry>(Extensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		ExtensionsHandler,
		ExtensionsHandler.ID,
		'ext ',
		null,
		localize('extensionsCommands', "Manage Extensions"),
		true
	)
);

Registry.as<IQuickOpenRegistry>(Extensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		GalleryExtensionsHandler,
		GalleryExtensionsHandler.ID,
		'ext install ',
		null,
		localize('galleryExtensionsCommands', "Install Gallery Extensions"),
		true
	)
);

// Editor
const editorDescriptor = new EditorDescriptor(
	ExtensionEditor,
	ExtensionEditor.ID,
	localize('extension', "Extension")
);

Registry.as<IEditorRegistry>(EditorExtensions.Editors)
	.registerEditor(editorDescriptor, [new SyncDescriptor(ExtensionsInput)]);

// Running Extensions Editor

const runtimeExtensionsEditorDescriptor = new EditorDescriptor(
	RuntimeExtensionsEditor,
	RuntimeExtensionsEditor.ID,
	localize('runtimeExtension', "Running Extensions")
);

Registry.as<IEditorRegistry>(EditorExtensions.Editors)
	.registerEditor(runtimeExtensionsEditorDescriptor, [new SyncDescriptor(RuntimeExtensionsInput)]);

class RuntimeExtensionsInputFactory implements IEditorInputFactory {
	serialize(editorInput: EditorInput): string {
		return '';
	}
	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		return new RuntimeExtensionsInput();
	}
}

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(RuntimeExtensionsInput.ID, RuntimeExtensionsInputFactory);


// Viewlet
const viewletDescriptor = new ViewletDescriptor(
	ExtensionsViewlet,
	VIEWLET_ID,
	localize('extensions', "Extensions"),
	'extensions',
	4
);

Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets)
	.registerViewlet(viewletDescriptor);

// Global actions
const actionRegistry = Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions);

const openViewletActionDescriptor = new SyncActionDescriptor(OpenExtensionsViewletAction, OpenExtensionsViewletAction.ID, OpenExtensionsViewletAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_X });
actionRegistry.registerWorkbenchAction(openViewletActionDescriptor, 'View: Show Extensions', localize('view', "View"));

const installActionDescriptor = new SyncActionDescriptor(InstallExtensionsAction, InstallExtensionsAction.ID, InstallExtensionsAction.LABEL);
actionRegistry.registerWorkbenchAction(installActionDescriptor, 'Extensions: Install Extensions', ExtensionsLabel);

const listOutdatedActionDescriptor = new SyncActionDescriptor(ShowOutdatedExtensionsAction, ShowOutdatedExtensionsAction.ID, ShowOutdatedExtensionsAction.LABEL);
actionRegistry.registerWorkbenchAction(listOutdatedActionDescriptor, 'Extensions: Show Outdated Extensions', ExtensionsLabel);

const recommendationsActionDescriptor = new SyncActionDescriptor(ShowRecommendedExtensionsAction, ShowRecommendedExtensionsAction.ID, ShowRecommendedExtensionsAction.LABEL);
actionRegistry.registerWorkbenchAction(recommendationsActionDescriptor, 'Extensions: Show Recommended Extensions', ExtensionsLabel);

const keymapRecommendationsActionDescriptor = new SyncActionDescriptor(ShowRecommendedKeymapExtensionsAction, ShowRecommendedKeymapExtensionsAction.ID, ShowRecommendedKeymapExtensionsAction.SHORT_LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_M) });
actionRegistry.registerWorkbenchAction(keymapRecommendationsActionDescriptor, 'Preferences: Keymaps', PreferencesLabel);

const languageExtensionsActionDescriptor = new SyncActionDescriptor(ShowLanguageExtensionsAction, ShowLanguageExtensionsAction.ID, ShowLanguageExtensionsAction.SHORT_LABEL);
actionRegistry.registerWorkbenchAction(languageExtensionsActionDescriptor, 'Preferences: Language Extensions', PreferencesLabel);

const azureExtensionsActionDescriptor = new SyncActionDescriptor(ShowAzureExtensionsAction, ShowAzureExtensionsAction.ID, ShowAzureExtensionsAction.SHORT_LABEL);
actionRegistry.registerWorkbenchAction(azureExtensionsActionDescriptor, 'Preferences: Azure Extensions', PreferencesLabel);

const popularActionDescriptor = new SyncActionDescriptor(ShowPopularExtensionsAction, ShowPopularExtensionsAction.ID, ShowPopularExtensionsAction.LABEL);
actionRegistry.registerWorkbenchAction(popularActionDescriptor, 'Extensions: Show Popular Extensions', ExtensionsLabel);

const enabledActionDescriptor = new SyncActionDescriptor(ShowEnabledExtensionsAction, ShowEnabledExtensionsAction.ID, ShowEnabledExtensionsAction.LABEL);
actionRegistry.registerWorkbenchAction(enabledActionDescriptor, 'Extensions: Show Enabled Extensions', ExtensionsLabel);

const installedActionDescriptor = new SyncActionDescriptor(ShowInstalledExtensionsAction, ShowInstalledExtensionsAction.ID, ShowInstalledExtensionsAction.LABEL);
actionRegistry.registerWorkbenchAction(installedActionDescriptor, 'Extensions: Show Installed Extensions', ExtensionsLabel);

const disabledActionDescriptor = new SyncActionDescriptor(ShowDisabledExtensionsAction, ShowDisabledExtensionsAction.ID, ShowDisabledExtensionsAction.LABEL);
actionRegistry.registerWorkbenchAction(disabledActionDescriptor, 'Extensions: Show Disabled Extensions', ExtensionsLabel);

const builtinActionDescriptor = new SyncActionDescriptor(ShowBuiltInExtensionsAction, ShowBuiltInExtensionsAction.ID, ShowBuiltInExtensionsAction.LABEL);
actionRegistry.registerWorkbenchAction(builtinActionDescriptor, 'Extensions: Show Built-in Extensions', ExtensionsLabel);

const updateAllActionDescriptor = new SyncActionDescriptor(UpdateAllAction, UpdateAllAction.ID, UpdateAllAction.LABEL);
actionRegistry.registerWorkbenchAction(updateAllActionDescriptor, 'Extensions: Update All Extensions', ExtensionsLabel);

const openExtensionsFolderActionDescriptor = new SyncActionDescriptor(OpenExtensionsFolderAction, OpenExtensionsFolderAction.ID, OpenExtensionsFolderAction.LABEL);
actionRegistry.registerWorkbenchAction(openExtensionsFolderActionDescriptor, 'Extensions: Open Extensions Folder', ExtensionsLabel);

const installVSIXActionDescriptor = new SyncActionDescriptor(InstallVSIXAction, InstallVSIXAction.ID, InstallVSIXAction.LABEL);
actionRegistry.registerWorkbenchAction(installVSIXActionDescriptor, 'Extensions: Install from VSIX...', ExtensionsLabel);

const disableAllAction = new SyncActionDescriptor(DisableAllAction, DisableAllAction.ID, DisableAllAction.LABEL);
actionRegistry.registerWorkbenchAction(disableAllAction, 'Extensions: Disable All Installed Extensions', ExtensionsLabel);

const disableAllWorkspaceAction = new SyncActionDescriptor(DisableAllWorkpsaceAction, DisableAllWorkpsaceAction.ID, DisableAllWorkpsaceAction.LABEL);
actionRegistry.registerWorkbenchAction(disableAllWorkspaceAction, 'Extensions: Disable All Installed Extensions for this Workspace', ExtensionsLabel);

const enableAllAction = new SyncActionDescriptor(EnableAllAction, EnableAllAction.ID, EnableAllAction.LABEL);
actionRegistry.registerWorkbenchAction(enableAllAction, 'Extensions: Enable All Installed Extensions', ExtensionsLabel);

const enableAllWorkspaceAction = new SyncActionDescriptor(EnableAllWorkpsaceAction, EnableAllWorkpsaceAction.ID, EnableAllWorkpsaceAction.LABEL);
actionRegistry.registerWorkbenchAction(enableAllWorkspaceAction, 'Extensions: Enable All Installed Extensions for this Workspace', ExtensionsLabel);

const checkForUpdatesAction = new SyncActionDescriptor(CheckForUpdatesAction, CheckForUpdatesAction.ID, CheckForUpdatesAction.LABEL);
actionRegistry.registerWorkbenchAction(checkForUpdatesAction, `Extensions: Check for Updates`, ExtensionsLabel);

actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(EnableAutoUpdateAction, EnableAutoUpdateAction.ID, EnableAutoUpdateAction.LABEL), `Extensions: Enable Auto Updating Extensions`, ExtensionsLabel);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(DisableAutoUpdateAction, DisableAutoUpdateAction.ID, DisableAutoUpdateAction.LABEL), `Extensions: Disable Auto Updating Extensions`, ExtensionsLabel);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(InstallSpecificVersionOfExtensionAction, InstallSpecificVersionOfExtensionAction.ID, InstallSpecificVersionOfExtensionAction.LABEL), 'Install Specific Version of Extension...', ExtensionsLabel);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ShowRuntimeExtensionsAction, ShowRuntimeExtensionsAction.ID, ShowRuntimeExtensionsAction.LABEL), 'Show Running Extensions', localize('developer', "Developer"));
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ReinstallAction, ReinstallAction.ID, ReinstallAction.LABEL), 'Reinstall Extension...', localize('developer', "Developer"));

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		id: 'extensions',
		order: 30,
		title: localize('extensionsConfigurationTitle', "Extensions"),
		type: 'object',
		properties: {
			'extensions.autoUpdate': {
				type: 'boolean',
				description: localize('extensionsAutoUpdate', "When enabled, automatically installs updates for extensions. The updates are fetched from a Microsoft online service."),
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
				description: localize('extensionsShowRecommendationsOnlyOnDemand', "When enabled, recommendations will not be fetched or shown unless specifically requested by the user. Some recommendations are fetched from a Microsoft online service."),
				default: false,
				tags: ['usesOnlineServices']
			},
			'extensions.closeExtensionDetailsOnViewChange': {
				type: 'boolean',
				description: localize('extensionsCloseExtensionDetailsOnViewChange', "When enabled, editors with extension details will be automatically closed upon navigating away from the Extensions View."),
				default: false
			}
		}
	});

const jsonRegistry = <jsonContributionRegistry.IJSONContributionRegistry>Registry.as(jsonContributionRegistry.Extensions.JSONContribution);
jsonRegistry.registerSchema(ExtensionsConfigurationSchemaId, ExtensionsConfigurationSchema);

// Register Commands
CommandsRegistry.registerCommand('_extensions.manage', (accessor: ServicesAccessor, extensionId: string) => {
	const extensionService = accessor.get(IExtensionsWorkbenchService);
	const extension = extensionService.local.filter(e => areSameExtensions(e.identifier, { id: extensionId }));
	if (extension.length === 1) {
		extensionService.open(extension[0]);
	}
});

CommandsRegistry.registerCommand('extension.open', (accessor: ServicesAccessor, extensionId: string) => {
	const extensionService = accessor.get(IExtensionsWorkbenchService);

	return extensionService.queryGallery({ names: [extensionId], pageSize: 1 }).then(pager => {
		if (pager.total !== 1) {
			return;
		}

		extensionService.open(pager.firstPage[0]);
	});
});

CommandsRegistry.registerCommand(DebugExtensionHostAction.ID, (accessor: ServicesAccessor) => {
	const instantationService = accessor.get(IInstantiationService);
	instantationService.createInstance(DebugExtensionHostAction).run();
});

CommandsRegistry.registerCommand(StartExtensionHostProfileAction.ID, (accessor: ServicesAccessor) => {
	const instantationService = accessor.get(IInstantiationService);
	instantationService.createInstance(StartExtensionHostProfileAction, StartExtensionHostProfileAction.ID, StartExtensionHostProfileAction.LABEL).run();
});

CommandsRegistry.registerCommand(StopExtensionHostProfileAction.ID, (accessor: ServicesAccessor) => {
	const instantationService = accessor.get(IInstantiationService);
	instantationService.createInstance(StopExtensionHostProfileAction, StopExtensionHostProfileAction.ID, StopExtensionHostProfileAction.LABEL).run();
});

CommandsRegistry.registerCommand(SaveExtensionHostProfileAction.ID, (accessor: ServicesAccessor) => {
	const instantationService = accessor.get(IInstantiationService);
	instantationService.createInstance(SaveExtensionHostProfileAction, SaveExtensionHostProfileAction.ID, SaveExtensionHostProfileAction.LABEL).run();
});

// File menu registration

MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
	group: '2_keybindings',
	command: {
		id: ShowRecommendedKeymapExtensionsAction.ID,
		title: localize({ key: 'miOpenKeymapExtensions', comment: ['&& denotes a mnemonic'] }, "&&Keymaps")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
	group: '1_settings',
	command: {
		id: VIEWLET_ID,
		title: localize({ key: 'miPreferencesExtensions', comment: ['&& denotes a mnemonic'] }, "&&Extensions")
	},
	order: 2
});

// View menu

MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '3_views',
	command: {
		id: VIEWLET_ID,
		title: localize({ key: 'miViewExtensions', comment: ['&& denotes a mnemonic'] }, "E&&xtensions")
	},
	order: 5
});

// Running extensions

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: DebugExtensionHostAction.ID,
		title: DebugExtensionHostAction.LABEL,
		iconLocation: {
			dark: URI.parse(require.toUrl(`vs/workbench/parts/extensions/electron-browser/media/start-inverse.svg`)),
			light: URI.parse(require.toUrl(`vs/workbench/parts/extensions/electron-browser/media/start.svg`)),
		}
	},
	group: 'navigation',
	when: ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID)
});

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: StartExtensionHostProfileAction.ID,
		title: StartExtensionHostProfileAction.LABEL,
		iconLocation: {
			dark: URI.parse(require.toUrl(`vs/workbench/parts/extensions/electron-browser/media/profile-start-inverse.svg`)),
			light: URI.parse(require.toUrl(`vs/workbench/parts/extensions/electron-browser/media/profile-start.svg`)),
		}
	},
	group: 'navigation',
	when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID), CONTEXT_PROFILE_SESSION_STATE.notEqualsTo('running'))
});

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: StopExtensionHostProfileAction.ID,
		title: StopExtensionHostProfileAction.LABEL,
		iconLocation: {
			dark: URI.parse(require.toUrl(`vs/workbench/parts/extensions/electron-browser/media/profile-stop-inverse.svg`)),
			light: URI.parse(require.toUrl(`vs/workbench/parts/extensions/electron-browser/media/profile-stop.svg`)),
		}
	},
	group: 'navigation',
	when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID), CONTEXT_PROFILE_SESSION_STATE.isEqualTo('running'))
});

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: SaveExtensionHostProfileAction.ID,
		title: SaveExtensionHostProfileAction.LABEL,
		iconLocation: {
			dark: URI.parse(require.toUrl(`vs/workbench/parts/extensions/electron-browser/media/save-inverse.svg`)),
			light: URI.parse(require.toUrl(`vs/workbench/parts/extensions/electron-browser/media/save.svg`)),
		},
		precondition: CONTEXT_EXTENSION_HOST_PROFILE_RECORDED
	},
	group: 'navigation',
	when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID))
});
