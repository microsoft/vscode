/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//#region --- editor/workbench core

import '../editor/editor.all';

import './api/browser/extensionHost.contribution';
import './browser/workbench.contribution';

//#endregion


//#region --- workbench actions

import './browser/actions/textInputActions';
import './browser/actions/developerActions';
import './browser/actions/helpActions';
import './browser/actions/layoutActions';
import './browser/actions/listCommands';
import './browser/actions/navigationActions';
import './browser/actions/windowActions';
import './browser/actions/workspaceActions';
import './browser/actions/workspaceCommands';
import './browser/actions/quickAccessActions';
import './browser/actions/widgetNavigationCommands';

//#endregion


//#region --- API Extension Points

import './services/actions/common/menusExtensionPoint';
import './api/common/configurationExtensionPoint';
import './api/browser/viewsExtensionPoint';

//#endregion


//#region --- workbench parts

import './browser/parts/editor/editor.contribution';
import './browser/parts/editor/editorParts';
import './browser/parts/paneCompositePartService';
import './browser/parts/banner/bannerPart';
import './browser/parts/statusbar/statusbarPart';

//#endregion


//#region --- workbench services

import '../platform/actions/common/actions.contribution';
import '../platform/undoRedo/common/undoRedoService';
import './services/workspaces/common/editSessionIdentityService';
import './services/workspaces/common/canonicalUriService';
import './services/extensions/browser/extensionUrlHandler';
import './services/keybinding/common/keybindingEditing';
import './services/decorations/browser/decorationsService';
import './services/dialogs/common/dialogService';
import './services/progress/browser/progressService';
import './services/editor/browser/codeEditorService';
import './services/preferences/browser/preferencesService';
import './services/configuration/common/jsonEditingService';
import './services/textmodelResolver/common/textModelResolverService';
import './services/editor/browser/editorService';
import './services/editor/browser/editorResolverService';
import './services/aiEmbeddingVector/common/aiEmbeddingVectorService';
import './services/aiRelatedInformation/common/aiRelatedInformationService';
import './services/history/browser/historyService';
import './services/activity/browser/activityService';
import './services/keybinding/browser/keybindingService';
import './services/untitled/common/untitledTextEditorService';
import './services/textresourceProperties/common/textResourcePropertiesService';
import './services/textfile/common/textEditorService';
import './services/language/common/languageService';
import './services/model/common/modelService';
import './services/notebook/common/notebookDocumentService';
import './services/commands/common/commandService';
import './services/themes/browser/workbenchThemeService';
import './services/label/common/labelService';
import './services/extensions/common/extensionManifestPropertiesService';
import './services/extensionManagement/browser/extensionEnablementService';
import './services/extensionManagement/browser/builtinExtensionsScannerService';
import './services/extensionRecommendations/common/extensionIgnoredRecommendationsService';
import './services/extensionRecommendations/common/workspaceExtensionsConfig';
import './services/extensionManagement/common/extensionFeaturesManagemetService';
import './services/notification/common/notificationService';
import './services/userDataSync/common/userDataSyncUtil';
import './services/userDataProfile/browser/userDataProfileImportExportService';
import './services/userDataProfile/browser/userDataProfileManagement';
import './services/userDataProfile/common/remoteUserDataProfiles';
import './services/remote/common/remoteExplorerService';
import './services/remote/common/remoteExtensionsScanner';
import './services/terminal/common/embedderTerminalService';
import './services/workingCopy/common/workingCopyService';
import './services/workingCopy/common/workingCopyFileService';
import './services/workingCopy/common/workingCopyEditorService';
import './services/filesConfiguration/common/filesConfigurationService';
import './services/views/browser/viewDescriptorService';
import './services/views/browser/viewsService';
import './services/quickinput/browser/quickInputService';
import './services/userDataSync/browser/userDataSyncWorkbenchService';
import './services/authentication/browser/authenticationService';
import './services/authentication/browser/authenticationExtensionsService';
import './services/authentication/browser/authenticationUsageService';
import './services/authentication/browser/authenticationAccessService';
import '../editor/browser/services/hoverService/hoverService';
import './services/assignment/common/assignmentService';
import './services/outline/browser/outlineService';
import './services/languageDetection/browser/languageDetectionWorkerServiceImpl';
import '../editor/common/services/languageFeaturesService';
import '../editor/common/services/semanticTokensStylingService';
import '../editor/common/services/treeViewsDndService';
import './services/textMate/browser/textMateTokenizationFeature.contribution';
import './services/treeSitter/browser/treeSitterTokenizationFeature.contribution';
import './services/userActivity/common/userActivityService';
import './services/userActivity/browser/userActivityBrowser';
import './services/editor/browser/editorPaneService';
import './services/editor/common/customEditorLabelService';

import { InstantiationType, registerSingleton } from '../platform/instantiation/common/extensions';
import { ExtensionGalleryService } from '../platform/extensionManagement/common/extensionGalleryService';
import { GlobalExtensionEnablementService } from '../platform/extensionManagement/common/extensionEnablementService';
import { IExtensionGalleryService, IGlobalExtensionEnablementService } from '../platform/extensionManagement/common/extensionManagement';
import { ContextViewService } from '../platform/contextview/browser/contextViewService';
import { IContextViewService } from '../platform/contextview/browser/contextView';
import { IListService, ListService } from '../platform/list/browser/listService';
import { IEditorWorkerService } from '../editor/common/services/editorWorker';
import { WorkbenchEditorWorkerService } from './contrib/codeEditor/browser/workbenchEditorWorkerService';
import { MarkerDecorationsService } from '../editor/common/services/markerDecorationsService';
import { IMarkerDecorationsService } from '../editor/common/services/markerDecorations';
import { IMarkerService } from '../platform/markers/common/markers';
import { MarkerService } from '../platform/markers/common/markerService';
import { ContextKeyService } from '../platform/contextkey/browser/contextKeyService';
import { IContextKeyService } from '../platform/contextkey/common/contextkey';
import { ITextResourceConfigurationService } from '../editor/common/services/textResourceConfiguration';
import { TextResourceConfigurationService } from '../editor/common/services/textResourceConfigurationService';
import { IDownloadService } from '../platform/download/common/download';
import { DownloadService } from '../platform/download/common/downloadService';
import { OpenerService } from '../editor/browser/services/openerService';
import { IOpenerService } from '../platform/opener/common/opener';
import { IgnoredExtensionsManagementService, IIgnoredExtensionsManagementService } from '../platform/userDataSync/common/ignoredExtensions';
import { ExtensionStorageService, IExtensionStorageService } from '../platform/extensionManagement/common/extensionStorage';
import { IUserDataSyncLogService } from '../platform/userDataSync/common/userDataSync';
import { UserDataSyncLogService } from '../platform/userDataSync/common/userDataSyncLog';

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
import './contrib/telemetry/browser/telemetry.contribution';

// Preferences
import './contrib/preferences/browser/preferences.contribution';
import './contrib/preferences/browser/keybindingsEditorContribution';
import './contrib/preferences/browser/preferencesSearch';

// Performance
import './contrib/performance/browser/performance.contribution';

// Context Menus
import './contrib/contextmenu/browser/contextmenu.contribution';

// Notebook
import './contrib/notebook/browser/notebook.contribution';

// Speech
import './contrib/speech/browser/speech.contribution';

// Chat
import './contrib/chat/browser/chat.contribution';
import './contrib/inlineChat/browser/inlineChat.contribution';

// Interactive
import './contrib/interactive/browser/interactive.contribution';

// repl
import './contrib/replNotebook/browser/repl.contribution';

// Testing
import './contrib/testing/browser/testing.contribution';

// Logs
import './contrib/logs/common/logs.contribution';

// Quickaccess
import './contrib/quickaccess/browser/quickAccess.contribution';

// Explorer
import './contrib/files/browser/explorerViewlet';
import './contrib/files/browser/fileActions.contribution';
import './contrib/files/browser/files.contribution';

// Bulk Edit
import './contrib/bulkEdit/browser/bulkEditService';
import './contrib/bulkEdit/browser/preview/bulkEdit.contribution';

// Search
import './contrib/search/browser/search.contribution';
import './contrib/search/browser/searchView';

// Search Editor
import './contrib/searchEditor/browser/searchEditor.contribution';

// Sash
import './contrib/sash/browser/sash.contribution';

// SCM
import './contrib/scm/browser/scm.contribution';

// Debug
import './contrib/debug/browser/debug.contribution';
import './contrib/debug/browser/debugEditorContribution';
import './contrib/debug/browser/breakpointEditorContribution';
import './contrib/debug/browser/callStackEditorContribution';
import './contrib/debug/browser/repl';
import './contrib/debug/browser/debugViewlet';

// Markers
import './contrib/markers/browser/markers.contribution';

// Merge Editor
import './contrib/mergeEditor/browser/mergeEditor.contribution';

// Multi Diff Editor
import './contrib/multiDiffEditor/browser/multiDiffEditor.contribution';

// Mapped Edits
import './contrib/mappedEdits/common/mappedEdits.contribution';

// Commands
import './contrib/commands/common/commands.contribution';

// Comments
import './contrib/comments/browser/comments.contribution';

// URL Support
import './contrib/url/browser/url.contribution';

// Webview
import './contrib/webview/browser/webview.contribution';
import './contrib/webviewPanel/browser/webviewPanel.contribution';
import './contrib/webviewView/browser/webviewView.contribution';
import './contrib/customEditor/browser/customEditor.contribution';

// External Uri Opener
import './contrib/externalUriOpener/common/externalUriOpener.contribution';

// Extensions Management
import './contrib/extensions/browser/extensions.contribution';
import './contrib/extensions/browser/extensionsViewlet';

// Output View
import './contrib/output/common/outputChannelModelService';
import './contrib/output/browser/output.contribution';
import './contrib/output/browser/outputView';

// Terminal
import './contrib/terminal/terminal.all';

// External terminal
import './contrib/externalTerminal/browser/externalTerminal.contribution';

// Relauncher
import './contrib/relauncher/browser/relauncher.contribution';

// Tasks
import './contrib/tasks/browser/task.contribution';

// Remote
import './contrib/remote/common/remote.contribution';
import './contrib/remote/browser/remote.contribution';

// Emmet
import './contrib/emmet/browser/emmet.contribution';

// CodeEditor Contributions
import './contrib/codeEditor/browser/codeEditor.contribution';

// Keybindings Contributions
import './contrib/keybindings/browser/keybindings.contribution';

// Snippets
import './contrib/snippets/browser/snippets.contribution';

// Formatter Help
import './contrib/format/browser/format.contribution';

// Folding
import './contrib/folding/browser/folding.contribution';

// Limit Indicator
import './contrib/limitIndicator/browser/limitIndicator.contribution';

// Inlay Hint Accessibility
import './contrib/inlayHints/browser/inlayHintsAccessibilty';

// Themes
import './contrib/themes/browser/themes.contribution';

// Update
import './contrib/update/browser/update.contribution';

// Surveys
import './contrib/surveys/browser/nps.contribution';
import './contrib/surveys/browser/languageSurveys.contribution';

// Welcome
import './contrib/welcomeGettingStarted/browser/gettingStarted.contribution';
import './contrib/welcomeWalkthrough/browser/walkThrough.contribution';
import './contrib/welcomeViews/common/viewsWelcome.contribution';
import './contrib/welcomeViews/common/newFile.contribution';

// Call Hierarchy
import './contrib/callHierarchy/browser/callHierarchy.contribution';

// Type Hierarchy
import './contrib/typeHierarchy/browser/typeHierarchy.contribution';

// Outline
import './contrib/codeEditor/browser/outline/documentSymbolsOutline';
import './contrib/outline/browser/outline.contribution';

// Language Detection
import './contrib/languageDetection/browser/languageDetection.contribution';

// Language Status
import './contrib/languageStatus/browser/languageStatus.contribution';

// Authentication
import './contrib/authentication/browser/authentication.contribution';

// User Data Sync
import './contrib/userDataSync/browser/userDataSync.contribution';

// User Data Profiles
import './contrib/userDataProfile/browser/userDataProfile.contribution';

// Continue Edit Session
import './contrib/editSessions/browser/editSessions.contribution';

// Code Actions
import './contrib/codeActions/browser/codeActions.contribution';

// Timeline
import './contrib/timeline/browser/timeline.contribution';

// Local History
import './contrib/localHistory/browser/localHistory.contribution';

// Workspace
import './contrib/workspace/browser/workspace.contribution';

// Workspaces
import './contrib/workspaces/browser/workspaces.contribution';

// List
import './contrib/list/browser/list.contribution';

// Accessibility Signals
import './contrib/accessibilitySignals/browser/accessibilitySignal.contribution';

// Deprecated Extension Migrator
import './contrib/deprecatedExtensionMigrator/browser/deprecatedExtensionMigrator.contribution';

// Bracket Pair Colorizer 2 Telemetry
import './contrib/bracketPairColorizer2Telemetry/browser/bracketPairColorizer2Telemetry.contribution';

// Accessibility
import './contrib/accessibility/browser/accessibility.contribution';

// Share
import './contrib/share/browser/share.contribution';

// Account Entitlements
import './contrib/accountEntitlements/browser/accountsEntitlements.contribution';

// Synchronized Scrolling
import './contrib/scrollLocking/browser/scrollLocking.contribution';
//#endregion
