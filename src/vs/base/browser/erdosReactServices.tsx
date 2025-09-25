/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../platform/log/common/log.js';
import { IFileService } from '../../platform/files/common/files.js';
import { ILabelService } from '../../platform/label/common/label.js';
import { IModelService } from '../../editor/common/services/model.js';
import { IHoverService } from '../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../platform/opener/common/opener.js';
import { IViewDescriptorService } from '../../workbench/common/views.js';
import { IThemeService } from '../../platform/theme/common/themeService.js';
import { ICommandService } from '../../platform/commands/common/commands.js';
import { ILanguageService } from '../../editor/common/languages/language.js';
import { IHostService } from '../../workbench/services/host/browser/host.js';
import { IFileDialogService } from '../../platform/dialogs/common/dialogs.js';
import { IPathService } from '../../workbench/services/path/common/pathService.js';
import { ITextModelService } from '../../editor/common/services/resolverService.js';
import { IContextKeyService } from '../../platform/contextkey/common/contextkey.js';
import { IQuickInputService } from '../../platform/quickinput/common/quickInput.js';
import { IWorkspacesService } from '../../platform/workspaces/common/workspaces.js';
import { IKeybindingService } from '../../platform/keybinding/common/keybinding.js';
import { IWebviewService } from '../../workbench/contrib/webview/browser/webview.js';
import { IViewsService } from '../../workbench/services/views/common/viewsService.js';
import { IWorkspaceContextService } from '../../platform/workspace/common/workspace.js';
import { IClipboardService } from '../../platform/clipboard/common/clipboardService.js';
import { IContextMenuService } from '../../platform/contextview/browser/contextView.js';
import { IEditorService } from '../../workbench/services/editor/common/editorService.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { INativeHostService } from '../../platform/native/common/native.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IAccessibilityService } from '../../platform/accessibility/common/accessibility.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { ILanguageModelsService } from '../../workbench/contrib/chat/common/languageModels.js';
import { IPreferencesService } from '../../workbench/services/preferences/common/preferences.js';
import { IWorkbenchLayoutService } from '../../workbench/services/layout/browser/layoutService.js';
import { IWorkspaceTrustManagementService } from '../../platform/workspace/common/workspaceTrust.js';
import { IErdosPlotsService } from '../../workbench/services/erdosPlots/common/erdosPlots.js';
import { IRuntimeSessionService } from '../../workbench/services/runtimeSession/common/runtimeSessionService.js';
import { IWorkbenchEnvironmentService } from '../../workbench/services/environment/common/environmentService.js';
import { IRuntimeStartupService } from '../../workbench/services/runtimeStartup/common/runtimeStartupService.js';
import { IErdosNewFolderService } from '../../workbench/services/erdosNewFolder/common/erdosNewFolder.js';
import { ILanguageRuntimeService } from '../../workbench/services/languageRuntime/common/languageRuntimeService.js';
import { IErdosModalDialogsService } from '../../workbench/services/erdosModalDialogs/common/erdosModalDialogs.js';
import { IErdosConsoleService } from '../../workbench/services/erdosConsole/browser/interfaces/erdosConsoleService.js';
import { IExecutionHistoryService } from '../../workbench/services/executionHistory/common/executionHistoryService.js';
import { IErdosTopActionBarService } from '../../workbench/services/erdosTopActionBar/browser/erdosTopActionBarService.js';
import { IErdosWebviewPreloadService } from '../../workbench/services/erdosWebviewPreloads/browser/erdosWebviewPreloadService.js';
import { IErdosNotebookOutputWebviewService } from '../../workbench/contrib/erdosOutputWebview/browser/notebookOutputWebviewService.js';
import { IErdosHelpService } from '../../workbench/contrib/erdosHelp/browser/erdosHelpService.js';
import { IErdosHelpSearchService } from '../../workbench/contrib/erdosHelp/browser/erdosHelpSearchService.js';
import { IFunctionParserService } from '../../workbench/services/erdosAiCommands/common/functionParserService.js';
import { IFileResolverService } from '../../workbench/services/erdosAiUtils/common/fileResolverService.js';
import { ISearchService } from '../../workbench/services/search/common/search.js';

import { ILanguageFeaturesService } from '../../editor/common/services/languageFeatures.js';
import { ILanguageConfigurationService } from '../../editor/common/languages/languageConfigurationRegistry.js';
import { IContextService } from '../../workbench/services/erdosAiContext/common/contextService.js';
import { IImageAttachmentService } from '../../workbench/services/erdosAiMedia/common/imageAttachmentService.js';
import { IDocumentManager } from '../../workbench/services/erdosAiDocument/common/documentManager.js';
import { IWidgetManager } from '../../workbench/services/erdosAi/common/widgetManager.js';
import { IJupytextService } from '../../workbench/services/erdosAiIntegration/common/jupytextService.js';
import { IFileChangeTracker } from '../../workbench/services/erdosAi/common/fileChangeTracker.js';

export class ErdosReactServices {
	public static services: ErdosReactServices;

	static initialize(instantiationService: IInstantiationService) {
		if (!ErdosReactServices.services) {
			ErdosReactServices.services = instantiationService.createInstance(ErdosReactServices);
		}
	}

	public constructor(
		@IAccessibilityService public readonly accessibilityService: IAccessibilityService,
		@IClipboardService public readonly clipboardService: IClipboardService,
		@ICommandService public readonly commandService: ICommandService,
		@IConfigurationService public readonly configurationService: IConfigurationService,
		@IContextKeyService public readonly contextKeyService: IContextKeyService,
		@IContextMenuService public readonly contextMenuService: IContextMenuService,
		@IEditorService public readonly editorService: IEditorService,

		@IFileService public readonly fileService: IFileService,
		@IFileDialogService public readonly fileDialogService: IFileDialogService,
		@IHoverService public readonly hoverService: IHoverService,
		@IHostService public readonly hostService: IHostService,
		@IInstantiationService public readonly instantiationService: IInstantiationService,
		@IKeybindingService public readonly keybindingService: IKeybindingService,
		@ILabelService public readonly labelService: ILabelService,
		@ILanguageConfigurationService public readonly languageConfigurationService: ILanguageConfigurationService,
		@ILanguageFeaturesService public readonly languageFeaturesService: ILanguageFeaturesService,
		@ILanguageModelsService public readonly languageModelsService: ILanguageModelsService,
		@ILanguageRuntimeService public readonly languageRuntimeService: ILanguageRuntimeService,
		@ILanguageService public readonly languageService: ILanguageService,
		@ILogService public readonly logService: ILogService,
		@IModelService public readonly modelService: IModelService,
		@INativeHostService public readonly nativeHostService: INativeHostService,
		@INotificationService public readonly notificationService: INotificationService,
		@IOpenerService public readonly openerService: IOpenerService,
		@IPathService public readonly pathService: IPathService,

		@IErdosConsoleService public readonly erdosConsoleService: IErdosConsoleService,
		@IExecutionHistoryService public readonly executionHistoryService: IExecutionHistoryService,
		@IErdosHelpService public readonly erdosHelpService: IErdosHelpService,
		@IErdosHelpSearchService public readonly erdosHelpSearchService: IErdosHelpSearchService,

		@IErdosModalDialogsService public readonly erdosModalDialogsService: IErdosModalDialogsService,
		@IErdosNewFolderService public readonly erdosNewFolderService: IErdosNewFolderService,
		@IErdosNotebookOutputWebviewService public readonly erdosNotebookOutputWebviewService: IErdosNotebookOutputWebviewService,
		@IErdosPlotsService public readonly erdosPlotsService: IErdosPlotsService,

		@IErdosTopActionBarService public readonly erdosTopActionBarService: IErdosTopActionBarService,

		@IErdosWebviewPreloadService public readonly erdosWebviewPreloadService: IErdosWebviewPreloadService,
		@IPreferencesService public readonly preferencesService: IPreferencesService,
		@IQuickInputService public readonly quickInputService: IQuickInputService,
		@IRuntimeSessionService public readonly runtimeSessionService: IRuntimeSessionService,
		@IRuntimeStartupService public readonly runtimeStartupService: IRuntimeStartupService,
		@ITextModelService public readonly textModelService: ITextModelService,
		@IThemeService public readonly themeService: IThemeService,
		@IViewDescriptorService public readonly viewDescriptorService: IViewDescriptorService,
		@IViewsService public readonly viewsService: IViewsService,
		@IWebviewService public readonly webviewService: IWebviewService,
		@IWorkbenchEnvironmentService public readonly workbenchEnvironmentService: IWorkbenchEnvironmentService,
		@IWorkbenchLayoutService public readonly workbenchLayoutService: IWorkbenchLayoutService,
		@IWorkspaceContextService public readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspacesService public readonly workspacesService: IWorkspacesService,
		@IWorkspaceTrustManagementService public readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IContextService public readonly contextService: IContextService,
		@IImageAttachmentService public readonly imageAttachmentService: IImageAttachmentService,
		@IDocumentManager public readonly documentManager: IDocumentManager,
		@IFunctionParserService public readonly functionParserService: IFunctionParserService,
		@IFileResolverService public readonly fileResolverService: IFileResolverService,
		@ISearchService public readonly searchService: ISearchService,
		@IWidgetManager public readonly widgetManager: IWidgetManager,
		@IJupytextService public readonly jupytextService: IJupytextService,
		@IFileChangeTracker public readonly fileChangeTracker: IFileChangeTracker
	) { }
}