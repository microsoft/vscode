/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//#region --- editor/workbench core

import 'vs/editor/editor.all';

import 'vs/workbench/api/browser/extensionHost.contribution';
import 'vs/workbench/browser/workbench.contribution';

//#endregion


//#region --- workbench actions

import 'vs/workbench/browser/actions/textInputActions';
import 'vs/workbench/browser/actions/developerActions';
import 'vs/workbench/browser/actions/helpActions';
import 'vs/workbench/browser/actions/layoutActions';
import 'vs/workbench/browser/actions/listCommands';
import 'vs/workbench/browser/actions/navigationActions';
import 'vs/workbench/browser/actions/windowActions';
import 'vs/workbench/browser/actions/workspaceActions';
import 'vs/workbench/browser/actions/workspaceCommands';
import 'vs/workbench/browser/actions/quickAccessActions';
import 'vs/workbench/browser/actions/widgetNavigationCommands';

//#endregion


//#region --- API Extension Points

import 'vs/workbench/services/actions/common/menusExtensionPoint';
import 'vs/workbench/api/common/configurationExtensionPoint';
import 'vs/workbench/api/browser/viewsExtensionPoint';

//#endregion


//#region --- workbench parts

import 'vs/workbench/browser/parts/editor/editor.contribution';
import 'vs/workbench/browser/parts/editor/editorPart';
import 'vs/workbench/browser/parts/paneCompositePart';
import 'vs/workbench/browser/parts/banner/bannerPart';
import 'vs/workbench/browser/parts/statusbar/statusbarPart';
import 'vs/workbench/browser/parts/views/viewsService';

//#endregion


//#region --- workbench services

import 'vs/platform/actions/common/actions.contribution';
import 'vs/platform/undoRedo/common/undoRedoService';
import 'vs/workbench/services/workspaces/common/editSessionIdentityService';
import 'vs/workbench/services/workspaces/common/canonicalUriService';
import 'vs/workbench/services/extensions/browser/extensionUrlHandler';
import 'vs/workbench/services/keybinding/common/keybindingEditing';
import 'vs/workbench/services/decorations/browser/decorationsService';
import 'vs/workbench/services/dialogs/common/dialogService';
import 'vs/workbench/services/progress/browser/progressService';
import 'vs/workbench/services/editor/browser/codeEditorService';
import 'vs/workbench/services/preferences/browser/preferencesService';
import 'vs/workbench/services/configuration/common/jsonEditingService';
import 'vs/workbench/services/textmodelResolver/common/textModelResolverService';
import 'vs/workbench/services/editor/browser/editorService';
import 'vs/workbench/services/editor/browser/editorResolverService';
import 'vs/workbench/services/aiEmbeddingVector/common/aiEmbeddingVectorService';
import 'vs/workbench/services/aiRelatedInformation/common/aiRelatedInformationService';
import 'vs/workbench/services/history/browser/historyService';
import 'vs/workbench/services/activity/browser/activityService';
import 'vs/workbench/services/keybinding/browser/keybindingService';
import 'vs/workbench/services/untitled/common/untitledTextEditorService';
import 'vs/workbench/services/textresourceProperties/common/textResourcePropertiesService';
import 'vs/workbench/services/textfile/common/textEditorService';
import 'vs/workbench/services/language/common/languageService';
import 'vs/workbench/services/model/common/modelService';
import 'vs/workbench/services/commands/common/commandService';
import 'vs/workbench/services/themes/browser/workbenchThemeService';
import 'vs/workbench/services/label/common/labelService';
import 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import 'vs/workbench/services/extensionManagement/browser/extensionEnablementService';
import 'vs/workbench/services/extensionManagement/browser/builtinExtensionsScannerService';
import 'vs/workbench/services/extensionRecommendations/common/extensionIgnoredRecommendationsService';
import 'vs/workbench/services/extensionRecommendations/common/workspaceExtensionsConfig';
import 'vs/workbench/services/notification/common/notificationService';
import 'vs/workbench/services/userDataSync/common/userDataSyncUtil';
import 'vs/workbench/services/userDataProfile/browser/userDataProfileImportExportService';
import 'vs/workbench/services/userDataProfile/browser/userDataProfileManagement';
import 'vs/workbench/services/userDataProfile/common/remoteUserDataProfiles';
import 'vs/workbench/services/remote/common/remoteExplorerService';
import 'vs/workbench/services/remote/common/remoteExtensionsScanner';
import 'vs/workbench/services/terminal/common/embedderTerminalService';
import 'vs/workbench/services/workingCopy/common/workingCopyService';
import 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import 'vs/workbench/services/workingCopy/common/workingCopyEditorService';
import 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import 'vs/workbench/services/views/browser/viewDescriptorService';
import 'vs/workbench/services/quickinput/browser/quickInputService';
import 'vs/workbench/services/userDataSync/browser/userDataSyncWorkbenchService';
import 'vs/workbench/services/authentication/browser/authenticationService';
import 'vs/workbench/services/hover/browser/hoverService';
import 'vs/workbench/services/assignment/common/assignmentService';
import 'vs/workbench/services/outline/browser/outlineService';
import 'vs/workbench/services/languageDetection/browser/languageDetectionWorkerServiceImpl';
import 'vs/editor/common/services/languageFeaturesService';
import 'vs/editor/common/services/semanticTokensStylingService';
import 'vs/editor/common/services/treeViewsDndService';
import 'vs/workbench/services/textMate/browser/textMateTokenizationFeature.contribution';
import 'vs/workbench/services/userActivity/common/userActivityService';
import 'vs/workbench/services/userActivity/browser/userActivityBrowser';
import 'vs/workbench/services/issue/browser/issueTroubleshoot';

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionGalleryService';
import { GlobalExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionEnablementService';
import { IExtensionGalleryService, IGlobalExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ContextViewService } from 'vs/platform/contextview/browser/contextViewService';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IListService, ListService } from 'vs/platform/list/browser/listService';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { EditorWorkerService } from 'vs/editor/browser/services/editorWorkerService';
import { MarkerDecorationsService } from 'vs/editor/common/services/markerDecorationsService';
import { IMarkerDecorationsService } from 'vs/editor/common/services/markerDecorations';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { MarkerService } from 'vs/platform/markers/common/markerService';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { TextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfigurationService';
import { IDownloadService } from 'vs/platform/download/common/download';
import { DownloadService } from 'vs/platform/download/common/downloadService';
import { OpenerService } from 'vs/editor/browser/services/openerService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IgnoredExtensionsManagementService, IIgnoredExtensionsManagementService } from 'vs/platform/userDataSync/common/ignoredExtensions';
import { ExtensionStorageService, IExtensionStorageService } from 'vs/platform/extensionManagement/common/extensionStorage';
import { IUserDataSyncLogService } from 'vs/platform/userDataSync/common/userDataSync';
import { UserDataSyncLogService } from 'vs/platform/userDataSync/common/userDataSyncLog';

registerSingleton(IUserDataSyncLogService, UserDataSyncLogService, InstantiationType.Delayed);
registerSingleton(IIgnoredExtensionsManagementService, IgnoredExtensionsManagementService, InstantiationType.Delayed);
registerSingleton(IGlobalExtensionEnablementService, GlobalExtensionEnablementService, InstantiationType.Delayed);
registerSingleton(IExtensionStorageService, ExtensionStorageService, InstantiationType.Delayed);
registerSingleton(IExtensionGalleryService, ExtensionGalleryService, InstantiationType.Delayed);
registerSingleton(IContextViewService, ContextViewService, InstantiationType.Delayed);
registerSingleton(IListService, ListService, InstantiationType.Delayed);
registerSingleton(IEditorWorkerService, EditorWorkerService, InstantiationType.Eager /* registers link detection and word based suggestions for any document */);
registerSingleton(IMarkerDecorationsService, MarkerDecorationsService, InstantiationType.Delayed);
registerSingleton(IMarkerService, MarkerService, InstantiationType.Delayed);
registerSingleton(IContextKeyService, ContextKeyService, InstantiationType.Delayed);
registerSingleton(ITextResourceConfigurationService, TextResourceConfigurationService, InstantiationType.Delayed);
registerSingleton(IDownloadService, DownloadService, InstantiationType.Delayed);
registerSingleton(IOpenerService, OpenerService, InstantiationType.Delayed);

//#endregion


//#region --- workbench contributions

// Telemetry
import 'vs/workbench/contrib/telemetry/browser/telemetry.contribution';

// Preferences
import 'vs/workbench/contrib/preferences/browser/preferences.contribution';
import 'vs/workbench/contrib/preferences/browser/keybindingsEditorContribution';
import 'vs/workbench/contrib/preferences/browser/preferencesSearch';

// Performance
import 'vs/workbench/contrib/performance/browser/performance.contribution';

// Context Menus
import 'vs/workbench/contrib/contextmenu/browser/contextmenu.contribution';

// Notebook
import 'vs/workbench/contrib/notebook/browser/notebook.contribution';

import 'vs/workbench/contrib/chat/browser/chat.contribution';
import 'vs/workbench/contrib/inlineChat/browser/inlineChat.contribution';

// Interactive
import 'vs/workbench/contrib/interactive/browser/interactive.contribution';

// Testing
import 'vs/workbench/contrib/testing/browser/testing.contribution';

// Logs
import 'vs/workbench/contrib/logs/common/logs.contribution';

// Quickaccess
import 'vs/workbench/contrib/quickaccess/browser/quickAccess.contribution';

// Explorer
import 'vs/workbench/contrib/files/browser/explorerViewlet';
import 'vs/workbench/contrib/files/browser/fileActions.contribution';
import 'vs/workbench/contrib/files/browser/files.contribution';

// Bulk Edit
import 'vs/workbench/contrib/bulkEdit/browser/bulkEditService';
import 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEdit.contribution';

// Search
import 'vs/workbench/contrib/search/browser/search.contribution';
import 'vs/workbench/contrib/search/browser/searchView';

// Search Editor
import 'vs/workbench/contrib/searchEditor/browser/searchEditor.contribution';

// Sash
import 'vs/workbench/contrib/sash/browser/sash.contribution';

// SCM
import 'vs/workbench/contrib/scm/browser/scm.contribution';

// Debug
import 'vs/workbench/contrib/debug/browser/debug.contribution';
import 'vs/workbench/contrib/debug/browser/debugEditorContribution';
import 'vs/workbench/contrib/debug/browser/breakpointEditorContribution';
import 'vs/workbench/contrib/debug/browser/callStackEditorContribution';
import 'vs/workbench/contrib/debug/browser/repl';
import 'vs/workbench/contrib/debug/browser/debugViewlet';

// Markers
import 'vs/workbench/contrib/markers/browser/markers.contribution';

// Merge Editor
import 'vs/workbench/contrib/mergeEditor/browser/mergeEditor.contribution';

// Mapped Edits
import 'vs/workbench/contrib/mappedEdits/common/mappedEdits.contribution';

// Commands
import 'vs/workbench/contrib/commands/common/commands.contribution';

// Comments
import 'vs/workbench/contrib/comments/browser/comments.contribution';

// URL Support
import 'vs/workbench/contrib/url/browser/url.contribution';

// Webview
import 'vs/workbench/contrib/webview/browser/webview.contribution';
import 'vs/workbench/contrib/webviewPanel/browser/webviewPanel.contribution';
import 'vs/workbench/contrib/webviewView/browser/webviewView.contribution';
import 'vs/workbench/contrib/customEditor/browser/customEditor.contribution';

// External Uri Opener
import 'vs/workbench/contrib/externalUriOpener/common/externalUriOpener.contribution';

// Extensions Management
import 'vs/workbench/contrib/extensions/browser/extensions.contribution';
import 'vs/workbench/contrib/extensions/browser/extensionsViewlet';

// Output View
import 'vs/workbench/contrib/output/common/outputChannelModelService';
import 'vs/workbench/contrib/output/browser/output.contribution';
import 'vs/workbench/contrib/output/browser/outputView';

// Terminal
import 'vs/workbench/contrib/terminal/terminal.all';

// External terminal
import 'vs/workbench/contrib/externalTerminal/browser/externalTerminal.contribution';

// Relauncher
import 'vs/workbench/contrib/relauncher/browser/relauncher.contribution';

// Tasks
import 'vs/workbench/contrib/tasks/browser/task.contribution';

// Remote
import 'vs/workbench/contrib/remote/common/remote.contribution';
import 'vs/workbench/contrib/remote/browser/remote.contribution';

// Emmet
import 'vs/workbench/contrib/emmet/browser/emmet.contribution';

// CodeEditor Contributions
import 'vs/workbench/contrib/codeEditor/browser/codeEditor.contribution';

// Keybindings Contributions
import 'vs/workbench/contrib/keybindings/browser/keybindings.contribution';

// Snippets
import 'vs/workbench/contrib/snippets/browser/snippets.contribution';

// Formatter Help
import 'vs/workbench/contrib/format/browser/format.contribution';

// Folding
import 'vs/workbench/contrib/folding/browser/folding.contribution';

// Limit Indicator
import 'vs/workbench/contrib/limitIndicator/browser/limitIndicator.contribution';

// Inlay Hint Accessibility
import 'vs/workbench/contrib/inlayHints/browser/inlayHintsAccessibilty';

// Themes
import 'vs/workbench/contrib/themes/browser/themes.contribution';

// Update
import 'vs/workbench/contrib/update/browser/update.contribution';

// Surveys
import 'vs/workbench/contrib/surveys/browser/nps.contribution';
import 'vs/workbench/contrib/surveys/browser/ces.contribution';
import 'vs/workbench/contrib/surveys/browser/languageSurveys.contribution';

// Welcome
import 'vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.contribution';
import 'vs/workbench/contrib/welcomeWalkthrough/browser/walkThrough.contribution';
import 'vs/workbench/contrib/welcomeViews/common/viewsWelcome.contribution';
import 'vs/workbench/contrib/welcomeViews/common/newFile.contribution';

// Call Hierarchy
import 'vs/workbench/contrib/callHierarchy/browser/callHierarchy.contribution';

// Type Hierarchy
import 'vs/workbench/contrib/typeHierarchy/browser/typeHierarchy.contribution';

// Outline
import 'vs/workbench/contrib/codeEditor/browser/outline/documentSymbolsOutline';
import 'vs/workbench/contrib/outline/browser/outline.contribution';

// Language Detection
import 'vs/workbench/contrib/languageDetection/browser/languageDetection.contribution';

// Language Status
import 'vs/workbench/contrib/languageStatus/browser/languageStatus.contribution';

// User Data Sync
import 'vs/workbench/contrib/userDataSync/browser/userDataSync.contribution';

// User Data Profiles
import 'vs/workbench/contrib/userDataProfile/browser/userDataProfile.contribution';

// Continue Edit Session
import 'vs/workbench/contrib/editSessions/browser/editSessions.contribution';

// Code Actions
import 'vs/workbench/contrib/codeActions/browser/codeActions.contribution';

// Timeline
import 'vs/workbench/contrib/timeline/browser/timeline.contribution';

// Local History
import 'vs/workbench/contrib/localHistory/browser/localHistory.contribution';

// Workspace
import 'vs/workbench/contrib/workspace/browser/workspace.contribution';

// Workspaces
import 'vs/workbench/contrib/workspaces/browser/workspaces.contribution';

// List
import 'vs/workbench/contrib/list/browser/list.contribution';

// Audio Cues
import 'vs/workbench/contrib/audioCues/browser/audioCues.contribution';

// Deprecated Extension Migrator
import 'vs/workbench/contrib/deprecatedExtensionMigrator/browser/deprecatedExtensionMigrator.contribution';

// Bracket Pair Colorizer 2 Telemetry
import 'vs/workbench/contrib/bracketPairColorizer2Telemetry/browser/bracketPairColorizer2Telemetry.contribution';

// Accessibility
import 'vs/workbench/contrib/accessibility/browser/accessibility.contribution';

// Share
import 'vs/workbench/contrib/share/browser/share.contribution';

//#endregion
