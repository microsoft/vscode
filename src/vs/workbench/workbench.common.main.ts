/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//#region --- editor/workbench core

import '../editor/editor.all.js';

import './api/browser/extensionHost.contribution.js';
import './browser/workbench.contribution.js';

//#endregion


//#region --- workbench actions

import './browser/actions/textInputActions.js';
import './browser/actions/developerActions.js';
import './browser/actions/helpActions.js';
import './browser/actions/layoutActions.js';
import './browser/actions/listCommands.js';
import './browser/actions/navigationActions.js';
import './browser/actions/windowActions.js';
import './browser/actions/workspaceActions.js';
import './browser/actions/workspaceCommands.js';
import './browser/actions/quickAccessActions.js';
import './browser/actions/widgetNavigationCommands.js';

//#endregion


//#region --- API Extension Points

import './services/actions/common/menusExtensionPoint.js';
import './api/common/configurationExtensionPoint.js';
import './api/browser/viewsExtensionPoint.js';

//#endregion


//#region --- workbench parts

import './browser/parts/editor/editor.contribution.js';
import './browser/parts/editor/editorParts.js';
import './browser/parts/paneCompositePartService.js';
import './browser/parts/banner/bannerPart.js';
import './browser/parts/statusbar/statusbarPart.js';

//#endregion


//#region --- workbench services

import '../platform/actions/common/actions.contribution.js';
import '../platform/undoRedo/common/undoRedoService.js';
import './services/workspaces/common/editSessionIdentityService.js';
import './services/workspaces/common/canonicalUriService.js';
import './services/extensions/browser/extensionUrlHandler.js';
import './services/keybinding/common/keybindingEditing.js';
import './services/decorations/browser/decorationsService.js';
import './services/dialogs/common/dialogService.js';
import './services/progress/browser/progressService.js';
import './services/editor/browser/codeEditorService.js';
import './services/preferences/browser/preferencesService.js';
import './services/configuration/common/jsonEditingService.js';
import './services/textmodelResolver/common/textModelResolverService.js';
import './services/editor/browser/editorService.js';
import './services/editor/browser/editorResolverService.js';
import './services/aiEmbeddingVector/common/aiEmbeddingVectorService.js';
import './services/aiRelatedInformation/common/aiRelatedInformationService.js';
import './services/history/browser/historyService.js';
import './services/activity/browser/activityService.js';
import './services/keybinding/browser/keybindingService.js';
import './services/untitled/common/untitledTextEditorService.js';
import './services/textresourceProperties/common/textResourcePropertiesService.js';
import './services/textfile/common/textEditorService.js';
import './services/language/common/languageService.js';
import './services/model/common/modelService.js';
import './services/notebook/common/notebookDocumentService.js';
import './services/commands/common/commandService.js';
import './services/themes/browser/workbenchThemeService.js';
import './services/label/common/labelService.js';
import './services/extensions/common/extensionManifestPropertiesService.js';
import './services/extensionManagement/browser/extensionEnablementService.js';
import './services/extensionManagement/browser/builtinExtensionsScannerService.js';
import './services/extensionRecommendations/common/extensionIgnoredRecommendationsService.js';
import './services/extensionRecommendations/common/workspaceExtensionsConfig.js';
import './services/extensionManagement/common/extensionFeaturesManagemetService.js';
import './services/notification/common/notificationService.js';
import './services/userDataSync/common/userDataSyncUtil.js';
import './services/userDataProfile/browser/userDataProfileImportExportService.js';
import './services/userDataProfile/browser/userDataProfileManagement.js';
import './services/userDataProfile/common/remoteUserDataProfiles.js';
import './services/remote/common/remoteExplorerService.js';
import './services/remote/common/remoteExtensionsScanner.js';
import './services/terminal/common/embedderTerminalService.js';
import './services/workingCopy/common/workingCopyService.js';
import './services/workingCopy/common/workingCopyFileService.js';
import './services/workingCopy/common/workingCopyEditorService.js';
import './services/filesConfiguration/common/filesConfigurationService.js';
import './services/views/browser/viewDescriptorService.js';
import './services/views/browser/viewsService.js';
import './services/quickinput/browser/quickInputService.js';
import './services/userDataSync/browser/userDataSyncWorkbenchService.js';
import './services/authentication/browser/authenticationService.js';
import './services/authentication/browser/authenticationExtensionsService.js';
import './services/authentication/browser/authenticationUsageService.js';
import './services/authentication/browser/authenticationAccessService.js';
import '../editor/browser/services/hoverService/hoverService.js';
import './services/assignment/common/assignmentService.js';
import './services/outline/browser/outlineService.js';
import './services/languageDetection/browser/languageDetectionWorkerServiceImpl.js';
import '../editor/common/services/languageFeaturesService.js';
import '../editor/common/services/semanticTokensStylingService.js';
import '../editor/common/services/treeViewsDndService.js';
import './services/textMate/browser/textMateTokenizationFeature.contribution.js';
import './services/treeSitter/browser/treeSitterTokenizationFeature.contribution.js';
import './services/userActivity/common/userActivityService.js';
import './services/userActivity/browser/userActivityBrowser.js';
import './services/editor/browser/editorPaneService.js';
import './services/editor/common/customEditorLabelService.js';

import { InstantiationType, registerSingleton } from '../platform/instantiation/common/extensions.js';
import { ExtensionGalleryService } from '../platform/extensionManagement/common/extensionGalleryService.js';
import { GlobalExtensionEnablementService } from '../platform/extensionManagement/common/extensionEnablementService.js';
import { IExtensionGalleryService, IGlobalExtensionEnablementService } from '../platform/extensionManagement/common/extensionManagement.js';
import { ContextViewService } from '../platform/contextview/browser/contextViewService.js';
import { IContextViewService } from '../platform/contextview/browser/contextView.js';
import { IListService, ListService } from '../platform/list/browser/listService.js';
import { IEditorWorkerService } from '../editor/common/services/editorWorker.js';
import { WorkbenchEditorWorkerService } from './contrib/codeEditor/browser/workbenchEditorWorkerService.js';
import { MarkerDecorationsService } from '../editor/common/services/markerDecorationsService.js';
import { IMarkerDecorationsService } from '../editor/common/services/markerDecorations.js';
import { IMarkerService } from '../platform/markers/common/markers.js';
import { MarkerService } from '../platform/markers/common/markerService.js';
import { ContextKeyService } from '../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../platform/contextkey/common/contextkey.js';
import { ITextResourceConfigurationService } from '../editor/common/services/textResourceConfiguration.js';
import { TextResourceConfigurationService } from '../editor/common/services/textResourceConfigurationService.js';
import { IDownloadService } from '../platform/download/common/download.js';
import { DownloadService } from '../platform/download/common/downloadService.js';
import { OpenerService } from '../editor/browser/services/openerService.js';
import { IOpenerService } from '../platform/opener/common/opener.js';
import { IgnoredExtensionsManagementService, IIgnoredExtensionsManagementService } from '../platform/userDataSync/common/ignoredExtensions.js';
import { ExtensionStorageService, IExtensionStorageService } from '../platform/extensionManagement/common/extensionStorage.js';
import { IUserDataSyncLogService } from '../platform/userDataSync/common/userDataSync.js';
import { UserDataSyncLogService } from '../platform/userDataSync/common/userDataSyncLog.js';

registerSingleton(IUserDataSyncLogService, UserDataSyncLogService, InstantiationType.Delayed);
registerSingleton(IIgnoredExtensionsManagementService, IgnoredExtensionsManagementService, InstantiationType.Delayed);
registerSingleton(IGlobalExtensionEnablementService, GlobalExtensionEnablementService, InstantiationType.Delayed);
registerSingleton(IExtensionStorageService, ExtensionStorageService, InstantiationType.Delayed);
registerSingleton(IExtensionGalleryService, ExtensionGalleryService, InstantiationType.Delayed);
registerSingleton(IContextViewService, ContextViewService, InstantiationType.Delayed);
registerSingleton(IListService, ListService, InstantiationType.Delayed);
registerSingleton(IEditorWorkerService, WorkbenchEditorWorkerService, InstantiationType.Eager /* registers link detection and word based suggestions for any document */);
registerSingleton(IMarkerDecorationsService, MarkerDecorationsService, InstantiationType.Delayed);
registerSingleton(IMarkerService, MarkerService, InstantiationType.Delayed);
registerSingleton(IContextKeyService, ContextKeyService, InstantiationType.Delayed);
registerSingleton(ITextResourceConfigurationService, TextResourceConfigurationService, InstantiationType.Delayed);
registerSingleton(IDownloadService, DownloadService, InstantiationType.Delayed);
registerSingleton(IOpenerService, OpenerService, InstantiationType.Delayed);

//#endregion


//#region --- workbench contributions

// Telemetry
import './contrib/telemetry/browser/telemetry.contribution.js';

// Preferences
import './contrib/preferences/browser/preferences.contribution.js';
import './contrib/preferences/browser/keybindingsEditorContribution.js';
import './contrib/preferences/browser/preferencesSearch.js';

// Performance
import './contrib/performance/browser/performance.contribution.js';

// Context Menus
import './contrib/contextmenu/browser/contextmenu.contribution.js';

// Notebook
import './contrib/notebook/browser/notebook.contribution.js';

// Speech
import './contrib/speech/browser/speech.contribution.js';

// Chat
import './contrib/chat/browser/chat.contribution.js';
import './contrib/inlineChat/browser/inlineChat.contribution.js';

// Interactive
import './contrib/interactive/browser/interactive.contribution.js';

// repl
import './contrib/replNotebook/browser/repl.contribution.js';

// Testing
import './contrib/testing/browser/testing.contribution.js';

// Logs
import './contrib/logs/common/logs.contribution.js';

// Quickaccess
import './contrib/quickaccess/browser/quickAccess.contribution.js';

// Explorer
import './contrib/files/browser/explorerViewlet.js';
import './contrib/files/browser/fileActions.contribution.js';
import './contrib/files/browser/files.contribution.js';

// Bulk Edit
import './contrib/bulkEdit/browser/bulkEditService.js';
import './contrib/bulkEdit/browser/preview/bulkEdit.contribution.js';

// Search
import './contrib/search/browser/search.contribution.js';
import './contrib/search/browser/searchView.js';

// Search Editor
import './contrib/searchEditor/browser/searchEditor.contribution.js';

// Sash
import './contrib/sash/browser/sash.contribution.js';

// SCM
import './contrib/scm/browser/scm.contribution.js';

// Debug
import './contrib/debug/browser/debug.contribution.js';
import './contrib/debug/browser/debugEditorContribution.js';
import './contrib/debug/browser/breakpointEditorContribution.js';
import './contrib/debug/browser/callStackEditorContribution.js';
import './contrib/debug/browser/repl.js';
import './contrib/debug/browser/debugViewlet.js';

// Markers
import './contrib/markers/browser/markers.contribution.js';

// Merge Editor
import './contrib/mergeEditor/browser/mergeEditor.contribution.js';

// Multi Diff Editor
import './contrib/multiDiffEditor/browser/multiDiffEditor.contribution.js';

// Mapped Edits
import './contrib/mappedEdits/common/mappedEdits.contribution.js';

// Commands
import './contrib/commands/common/commands.contribution.js';

// Comments
import './contrib/comments/browser/comments.contribution.js';

// URL Support
import './contrib/url/browser/url.contribution.js';

// Webview
import './contrib/webview/browser/webview.contribution.js';
import './contrib/webviewPanel/browser/webviewPanel.contribution.js';
import './contrib/webviewView/browser/webviewView.contribution.js';
import './contrib/customEditor/browser/customEditor.contribution.js';

// External Uri Opener
import './contrib/externalUriOpener/common/externalUriOpener.contribution.js';

// Extensions Management
import './contrib/extensions/browser/extensions.contribution.js';
import './contrib/extensions/browser/extensionsViewlet.js';

// Output View
import './contrib/output/common/outputChannelModelService.js';
import './contrib/output/browser/output.contribution.js';
import './contrib/output/browser/outputView.js';

// Terminal
import './contrib/terminal/terminal.all.js';

// External terminal
import './contrib/externalTerminal/browser/externalTerminal.contribution.js';

// Relauncher
import './contrib/relauncher/browser/relauncher.contribution.js';

// Tasks
import './contrib/tasks/browser/task.contribution.js';

// Remote
import './contrib/remote/common/remote.contribution.js';
import './contrib/remote/browser/remote.contribution.js';

// Emmet
import './contrib/emmet/browser/emmet.contribution.js';

// CodeEditor Contributions
import './contrib/codeEditor/browser/codeEditor.contribution.js';

// Keybindings Contributions
import './contrib/keybindings/browser/keybindings.contribution.js';

// Snippets
import './contrib/snippets/browser/snippets.contribution.js';

// Formatter Help
import './contrib/format/browser/format.contribution.js';

// Folding
import './contrib/folding/browser/folding.contribution.js';

// Limit Indicator
import './contrib/limitIndicator/browser/limitIndicator.contribution.js';

// Inlay Hint Accessibility
import './contrib/inlayHints/browser/inlayHintsAccessibilty.js';

// Themes
import './contrib/themes/browser/themes.contribution.js';

// Update
import './contrib/update/browser/update.contribution.js';

// Surveys
import './contrib/surveys/browser/nps.contribution.js';
import './contrib/surveys/browser/languageSurveys.contribution.js';

// Welcome
import './contrib/welcomeGettingStarted/browser/gettingStarted.contribution.js';
import './contrib/welcomeWalkthrough/browser/walkThrough.contribution.js';
import './contrib/welcomeViews/common/viewsWelcome.contribution.js';
import './contrib/welcomeViews/common/newFile.contribution.js';

// Call Hierarchy
import './contrib/callHierarchy/browser/callHierarchy.contribution.js';

// Type Hierarchy
import './contrib/typeHierarchy/browser/typeHierarchy.contribution.js';

// Outline
import './contrib/codeEditor/browser/outline/documentSymbolsOutline.js';
import './contrib/outline/browser/outline.contribution.js';

// Language Detection
import './contrib/languageDetection/browser/languageDetection.contribution.js';

// Language Status
import './contrib/languageStatus/browser/languageStatus.contribution.js';

// Authentication
import './contrib/authentication/browser/authentication.contribution.js';

// User Data Sync
import './contrib/userDataSync/browser/userDataSync.contribution.js';

// User Data Profiles
import './contrib/userDataProfile/browser/userDataProfile.contribution.js';

// Continue Edit Session
import './contrib/editSessions/browser/editSessions.contribution.js';

// Code Actions
import './contrib/codeActions/browser/codeActions.contribution.js';

// Timeline
import './contrib/timeline/browser/timeline.contribution.js';

// Local History
import './contrib/localHistory/browser/localHistory.contribution.js';

// Workspace
import './contrib/workspace/browser/workspace.contribution.js';

// Workspaces
import './contrib/workspaces/browser/workspaces.contribution.js';

// List
import './contrib/list/browser/list.contribution.js';

// Accessibility Signals
import './contrib/accessibilitySignals/browser/accessibilitySignal.contribution.js';

// Deprecated Extension Migrator
import './contrib/deprecatedExtensionMigrator/browser/deprecatedExtensionMigrator.contribution.js';

// Bracket Pair Colorizer 2 Telemetry
import './contrib/bracketPairColorizer2Telemetry/browser/bracketPairColorizer2Telemetry.contribution.js';

// Accessibility
import './contrib/accessibility/browser/accessibility.contribution.js';

// Share
import './contrib/share/browser/share.contribution.js';

// Account Entitlements
import './contrib/accountEntitlements/browser/accountsEntitlements.contribution.js';

// Synchronized Scrolling
import './contrib/scrollLocking/browser/scrollLocking.contribution.js';

//#endregion
