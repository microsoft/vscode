/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//#region --- editor/workbench core
import '../editor/editor.all.js';
import '../workbench/api/browser/extensionHost.contribution.js';
import '../workbench/browser/workbench.contribution.js';
//#endregion
//#region --- workbench actions
import '../workbench/browser/actions/textInputActions.js';
import '../workbench/browser/actions/developerActions.js';
import '../workbench/browser/actions/helpActions.js';
import '../workbench/browser/actions/listCommands.js';
// import '../workbench/browser/actions/layoutActions.js';
import '../workbench/browser/actions/navigationActions.js';
import '../workbench/browser/actions/windowActions.js';
import '../workbench/browser/actions/workspaceActions.js';
import '../workbench/browser/actions/workspaceCommands.js';
import '../workbench/browser/actions/quickAccessActions.js';
import '../workbench/browser/actions/widgetNavigationCommands.js';
//#endregion
//#region --- API Extension Points
import '../workbench/services/actions/common/menusExtensionPoint.js';
import '../workbench/api/common/configurationExtensionPoint.js';
import '../workbench/api/browser/viewsExtensionPoint.js';
//#endregion
//#region --- workbench parts
import '../workbench/browser/parts/editor/editor.contribution.js';
import '../workbench/browser/parts/editor/editorParts.js';
// import '../workbench/browser/parts/paneCompositePartService.js';
import '../workbench/browser/parts/banner/bannerPart.js';
import '../workbench/browser/parts/statusbar/statusbarPart.js';
//#endregion
//#region --- workbench services
import '../platform/actions/common/actions.contribution.js';
import '../platform/undoRedo/common/undoRedoService.js';
import '../platform/mcp/common/mcpResourceScannerService.js';
import '../workbench/services/workspaces/common/editSessionIdentityService.js';
import '../workbench/services/workspaces/common/canonicalUriService.js';
import '../workbench/services/extensions/browser/extensionUrlHandler.js';
import '../workbench/services/keybinding/common/keybindingEditing.js';
import '../workbench/services/decorations/browser/decorationsService.js';
import '../workbench/services/dialogs/common/dialogService.js';
import '../workbench/services/progress/browser/progressService.js';
import '../workbench/services/editor/browser/codeEditorService.js';
import '../workbench/services/preferences/browser/preferencesService.js';
import '../workbench/services/configuration/common/jsonEditingService.js';
import '../workbench/services/textmodelResolver/common/textModelResolverService.js';
import '../workbench/services/editor/browser/editorService.js';
import '../workbench/services/editor/browser/editorResolverService.js';
import '../workbench/services/aiEmbeddingVector/common/aiEmbeddingVectorService.js';
import '../workbench/services/aiRelatedInformation/common/aiRelatedInformationService.js';
import '../workbench/services/aiSettingsSearch/common/aiSettingsSearchService.js';
import '../workbench/services/history/browser/historyService.js';
import '../workbench/services/activity/browser/activityService.js';
import '../workbench/services/keybinding/browser/keybindingService.js';
import '../workbench/services/untitled/common/untitledTextEditorService.js';
import '../workbench/services/textresourceProperties/common/textResourcePropertiesService.js';
import '../workbench/services/textfile/common/textEditorService.js';
import '../workbench/services/language/common/languageService.js';
import '../workbench/services/model/common/modelService.js';
import '../workbench/services/notebook/common/notebookDocumentService.js';
import '../workbench/services/commands/common/commandService.js';
import '../workbench/services/themes/browser/workbenchThemeService.js';
import '../workbench/services/label/common/labelService.js';
import '../workbench/services/extensions/common/extensionManifestPropertiesService.js';
import '../workbench/services/extensionManagement/common/extensionGalleryService.js';
import '../workbench/services/extensionManagement/browser/extensionEnablementService.js';
import '../workbench/services/extensionManagement/browser/builtinExtensionsScannerService.js';
import '../workbench/services/extensionRecommendations/common/extensionIgnoredRecommendationsService.js';
import '../workbench/services/extensionRecommendations/common/workspaceExtensionsConfig.js';
import '../workbench/services/extensionManagement/common/extensionFeaturesManagemetService.js';
import '../workbench/services/notification/common/notificationService.js';
import '../workbench/services/userDataSync/common/userDataSyncUtil.js';
import '../workbench/services/userDataProfile/browser/userDataProfileImportExportService.js';
import '../workbench/services/userDataProfile/browser/userDataProfileManagement.js';
import '../workbench/services/userDataProfile/common/remoteUserDataProfiles.js';
import '../workbench/services/remote/common/remoteExplorerService.js';
import '../workbench/services/remote/common/remoteExtensionsScanner.js';
import '../workbench/services/terminal/common/embedderTerminalService.js';
import '../workbench/services/workingCopy/common/workingCopyService.js';
import '../workbench/services/workingCopy/common/workingCopyFileService.js';
import '../workbench/services/workingCopy/common/workingCopyEditorService.js';
import '../workbench/services/filesConfiguration/common/filesConfigurationService.js';
import '../workbench/services/views/browser/viewDescriptorService.js';
import '../workbench/services/views/browser/viewsService.js';
import '../workbench/services/quickinput/browser/quickInputService.js';
import '../workbench/services/userDataSync/browser/userDataSyncWorkbenchService.js';
import '../workbench/services/authentication/browser/authenticationService.js';
import '../workbench/services/authentication/browser/authenticationExtensionsService.js';
import '../workbench/services/authentication/browser/authenticationUsageService.js';
import '../workbench/services/authentication/browser/authenticationAccessService.js';
import '../workbench/services/authentication/browser/authenticationMcpUsageService.js';
import '../workbench/services/authentication/browser/authenticationMcpAccessService.js';
import '../workbench/services/authentication/browser/authenticationMcpService.js';
import '../workbench/services/authentication/browser/dynamicAuthenticationProviderStorageService.js';
import '../workbench/services/authentication/browser/authenticationQueryService.js';
import '../platform/hover/browser/hoverService.js';
import '../platform/userInteraction/browser/userInteractionServiceImpl.js';
import '../workbench/services/assignment/common/assignmentService.js';
import '../workbench/services/outline/browser/outlineService.js';
import '../workbench/services/languageDetection/browser/languageDetectionWorkerServiceImpl.js';
import '../editor/common/services/languageFeaturesService.js';
import '../editor/common/services/semanticTokensStylingService.js';
import '../editor/common/services/treeViewsDndService.js';
import '../workbench/services/textMate/browser/textMateTokenizationFeature.contribution.js';
import '../workbench/services/treeSitter/browser/treeSitter.contribution.js';
import '../workbench/services/userActivity/common/userActivityService.js';
import '../workbench/services/userActivity/browser/userActivityBrowser.js';
import '../workbench/services/userAttention/browser/userAttentionBrowser.js';
import '../workbench/services/editor/browser/editorPaneService.js';
import '../workbench/services/editor/common/customEditorLabelService.js';
import '../workbench/services/dataChannel/browser/dataChannelService.js';
import '../workbench/services/inlineCompletions/common/inlineCompletionsUnification.js';
import '../workbench/services/chat/common/chatEntitlementService.js';
import '../workbench/services/log/common/defaultLogLevels.js';
import { registerSingleton } from '../platform/instantiation/common/extensions.js';
import { GlobalExtensionEnablementService } from '../platform/extensionManagement/common/extensionEnablementService.js';
import { IAllowedExtensionsService, IGlobalExtensionEnablementService } from '../platform/extensionManagement/common/extensionManagement.js';
import { ContextViewService } from '../platform/contextview/browser/contextViewService.js';
import { IContextViewService } from '../platform/contextview/browser/contextView.js';
import { IListService, ListService } from '../platform/list/browser/listService.js';
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
import { AllowedExtensionsService } from '../platform/extensionManagement/common/allowedExtensionsService.js';
import { IAllowedMcpServersService, IMcpGalleryService } from '../platform/mcp/common/mcpManagement.js';
import { McpGalleryService } from '../platform/mcp/common/mcpGalleryService.js';
import { AllowedMcpServersService } from '../platform/mcp/common/allowedMcpServersService.js';
import { IWebWorkerService } from '../platform/webWorker/browser/webWorkerService.js';
import { WebWorkerService } from '../platform/webWorker/browser/webWorkerServiceImpl.js';
registerSingleton(IUserDataSyncLogService, UserDataSyncLogService, 1 /* InstantiationType.Delayed */);
registerSingleton(IAllowedExtensionsService, AllowedExtensionsService, 1 /* InstantiationType.Delayed */);
registerSingleton(IIgnoredExtensionsManagementService, IgnoredExtensionsManagementService, 1 /* InstantiationType.Delayed */);
registerSingleton(IGlobalExtensionEnablementService, GlobalExtensionEnablementService, 1 /* InstantiationType.Delayed */);
registerSingleton(IExtensionStorageService, ExtensionStorageService, 1 /* InstantiationType.Delayed */);
registerSingleton(IContextViewService, ContextViewService, 1 /* InstantiationType.Delayed */);
registerSingleton(IListService, ListService, 1 /* InstantiationType.Delayed */);
registerSingleton(IMarkerDecorationsService, MarkerDecorationsService, 1 /* InstantiationType.Delayed */);
registerSingleton(IMarkerService, MarkerService, 1 /* InstantiationType.Delayed */);
registerSingleton(IContextKeyService, ContextKeyService, 1 /* InstantiationType.Delayed */);
registerSingleton(ITextResourceConfigurationService, TextResourceConfigurationService, 1 /* InstantiationType.Delayed */);
registerSingleton(IDownloadService, DownloadService, 1 /* InstantiationType.Delayed */);
registerSingleton(IOpenerService, OpenerService, 1 /* InstantiationType.Delayed */);
registerSingleton(IWebWorkerService, WebWorkerService, 1 /* InstantiationType.Delayed */);
registerSingleton(IMcpGalleryService, McpGalleryService, 1 /* InstantiationType.Delayed */);
registerSingleton(IAllowedMcpServersService, AllowedMcpServersService, 1 /* InstantiationType.Delayed */);
//#endregion
//#region --- workbench contributions
// Default Account
import '../workbench/services/accounts/browser/defaultAccount.js';
// Telemetry
import '../workbench/contrib/telemetry/browser/telemetry.contribution.js';
// Preferences
import '../workbench/contrib/preferences/browser/preferences.contribution.js';
import '../workbench/contrib/preferences/browser/keybindingsEditorContribution.js';
import '../workbench/contrib/preferences/browser/preferencesSearch.js';
// Performance
import '../workbench/contrib/performance/browser/performance.contribution.js';
// Notebook
import '../workbench/contrib/notebook/browser/notebook.contribution.js';
// Speech
import '../workbench/contrib/speech/browser/speech.contribution.js';
// Chat
import '../workbench/contrib/chat/browser/chat.contribution.js';
//import '../workbench/contrib/inlineChat/browser/inlineChat.contribution.js';
import '../workbench/contrib/mcp/browser/mcp.contribution.js';
import '../workbench/contrib/chat/browser/chatSessions/chatSessions.contribution.js';
import '../workbench/contrib/chat/browser/contextContrib/chatContext.contribution.js';
import '../workbench/contrib/imageCarousel/browser/imageCarousel.contribution.js';
// Interactive
import '../workbench/contrib/interactive/browser/interactive.contribution.js';
// repl
import '../workbench/contrib/replNotebook/browser/repl.contribution.js';
// Testing
import '../workbench/contrib/testing/browser/testing.contribution.js';
// Logs
import '../workbench/contrib/logs/common/logs.contribution.js';
// Quickaccess
import '../workbench/contrib/quickaccess/browser/quickAccess.contribution.js';
// Explorer
import '../workbench/contrib/files/browser/explorerViewlet.js';
import '../workbench/contrib/files/browser/fileActions.contribution.js';
import '../workbench/contrib/files/browser/files.contribution.js';
// Bulk Edit
import '../workbench/contrib/bulkEdit/browser/bulkEditService.js';
import '../workbench/contrib/bulkEdit/browser/preview/bulkEdit.contribution.js';
// Rename Symbol Tracker for Inline completions.
import '../workbench/contrib/inlineCompletions/browser/renameSymbolTrackerService.js';
// Search
import '../workbench/contrib/search/browser/search.contribution.js';
import '../workbench/contrib/search/browser/searchView.js';
// Search Editor
import '../workbench/contrib/searchEditor/browser/searchEditor.contribution.js';
// Sash
import '../workbench/contrib/sash/browser/sash.contribution.js';
// Git
import '../workbench/contrib/git/browser/git.contributions.js';
// SCM
import '../workbench/contrib/scm/browser/scm.contribution.js';
// Debug
import '../workbench/contrib/debug/browser/debug.contribution.js';
import '../workbench/contrib/debug/browser/debugEditorContribution.js';
import '../workbench/contrib/debug/browser/breakpointEditorContribution.js';
import '../workbench/contrib/debug/browser/callStackEditorContribution.js';
import '../workbench/contrib/debug/browser/repl.js';
import '../workbench/contrib/debug/browser/debugViewlet.js';
// Markers
import '../workbench/contrib/markers/browser/markers.contribution.js';
// Process Explorer
import '../workbench/contrib/processExplorer/browser/processExplorer.contribution.js';
// Merge Editor
import '../workbench/contrib/mergeEditor/browser/mergeEditor.contribution.js';
// Multi Diff Editor
import '../workbench/contrib/multiDiffEditor/browser/multiDiffEditor.contribution.js';
// Commands
import '../workbench/contrib/commands/common/commands.contribution.js';
// Comments
import '../workbench/contrib/comments/browser/comments.contribution.js';
// URL Support
import '../workbench/contrib/url/browser/url.contribution.js';
// Webview
import '../workbench/contrib/webview/browser/webview.contribution.js';
import '../workbench/contrib/webviewPanel/browser/webviewPanel.contribution.js';
import '../workbench/contrib/webviewView/browser/webviewView.contribution.js';
import '../workbench/contrib/customEditor/browser/customEditor.contribution.js';
// External Uri Opener
import '../workbench/contrib/externalUriOpener/common/externalUriOpener.contribution.js';
// Extensions Management
import '../workbench/contrib/extensions/browser/extensions.contribution.js';
import '../workbench/contrib/extensions/browser/extensionsViewlet.js';
// Output View
import '../workbench/contrib/output/browser/output.contribution.js';
import '../workbench/contrib/output/browser/outputView.js';
// Terminal
import '../workbench/contrib/terminal/terminal.all.js';
// External terminal
import '../workbench/contrib/externalTerminal/browser/externalTerminal.contribution.js';
// Relauncher
import '../workbench/contrib/relauncher/browser/relauncher.contribution.js';
// Tasks
import '../workbench/contrib/tasks/browser/task.contribution.js';
// Remote
import '../workbench/contrib/remote/common/remote.contribution.js';
import '../workbench/contrib/remote/browser/remote.contribution.js';
// Emmet
import '../workbench/contrib/emmet/browser/emmet.contribution.js';
// CodeEditor Contributions
import '../workbench/contrib/codeEditor/browser/codeEditor.contribution.js';
// Markdown
import '../workbench/contrib/markdown/browser/markdown.contribution.js';
// Keybindings Contributions
import '../workbench/contrib/keybindings/browser/keybindings.contribution.js';
// Snippets
import '../workbench/contrib/snippets/browser/snippets.contribution.js';
// Formatter Help
import '../workbench/contrib/format/browser/format.contribution.js';
// Folding
import '../workbench/contrib/folding/browser/folding.contribution.js';
// Limit Indicator
import '../workbench/contrib/limitIndicator/browser/limitIndicator.contribution.js';
// Inlay Hint Accessibility
import '../workbench/contrib/inlayHints/browser/inlayHintsAccessibilty.js';
// Themes
import '../workbench/contrib/themes/browser/themes.contribution.js';
// Update
import '../workbench/contrib/update/browser/update.contribution.js';
// Surveys
import '../workbench/contrib/surveys/browser/nps.contribution.js';
import '../workbench/contrib/surveys/browser/languageSurveys.contribution.js';
// Welcome
// import '../workbench/contrib/welcomeGettingStarted/browser/gettingStarted.contribution.js';
// import '../workbench/contrib/welcomeAgentSessions/browser/agentSessionsWelcome.contribution.js';
// import '../workbench/contrib/welcomeWalkthrough/browser/walkThrough.contribution.js';
import '../workbench/contrib/welcomeViews/common/viewsWelcome.contribution.js';
import '../workbench/contrib/welcomeViews/common/newFile.contribution.js';
// Call Hierarchy
import '../workbench/contrib/callHierarchy/browser/callHierarchy.contribution.js';
// Type Hierarchy
import '../workbench/contrib/typeHierarchy/browser/typeHierarchy.contribution.js';
// Outline
import '../workbench/contrib/codeEditor/browser/outline/documentSymbolsOutline.js';
import '../workbench/contrib/outline/browser/outline.contribution.js';
// Language Detection
import '../workbench/contrib/languageDetection/browser/languageDetection.contribution.js';
// Language Status
import '../workbench/contrib/languageStatus/browser/languageStatus.contribution.js';
// Authentication
import '../workbench/contrib/authentication/browser/authentication.contribution.js';
// User Data Sync
import '../workbench/contrib/userDataSync/browser/userDataSync.contribution.js';
// User Data Profiles
import '../workbench/contrib/userDataProfile/browser/userDataProfile.contribution.js';
// Continue Edit Session
import '../workbench/contrib/editSessions/browser/editSessions.contribution.js';
// Remote Coding Agents
import '../workbench/contrib/remoteCodingAgents/browser/remoteCodingAgents.contribution.js';
// Code Actions
import '../workbench/contrib/codeActions/browser/codeActions.contribution.js';
// Timeline
import '../workbench/contrib/timeline/browser/timeline.contribution.js';
// Local History
import '../workbench/contrib/localHistory/browser/localHistory.contribution.js';
// Workspace
import '../workbench/contrib/workspace/browser/workspace.contribution.js';
// Workspaces
import '../workbench/contrib/workspaces/browser/workspaces.contribution.js';
// List
import '../workbench/contrib/list/browser/list.contribution.js';
// Accessibility Signals
import '../workbench/contrib/accessibilitySignals/browser/accessibilitySignal.contribution.js';
// Bracket Pair Colorizer 2 Telemetry
import '../workbench/contrib/bracketPairColorizer2Telemetry/browser/bracketPairColorizer2Telemetry.contribution.js';
// Accessibility
import '../workbench/contrib/accessibility/browser/accessibility.contribution.js';
// Metered Connection
import '../workbench/contrib/meteredConnection/browser/meteredConnection.contribution.js';
// Share
import '../workbench/contrib/share/browser/share.contribution.js';
// Synchronized Scrolling
import '../workbench/contrib/scrollLocking/browser/scrollLocking.contribution.js';
// Inline Completions
import '../workbench/contrib/inlineCompletions/browser/inlineCompletions.contribution.js';
// Drop or paste into
import '../workbench/contrib/dropOrPasteInto/browser/dropOrPasteInto.contribution.js';
// Edit Telemetry
import '../workbench/contrib/editTelemetry/browser/editTelemetry.contribution.js';
// Opener
import '../workbench/contrib/opener/browser/opener.contribution.js';
//#endregion
//#region --- sessions contributions
import './browser/paneCompositePartService.js';
import './browser/layoutActions.js';
import './contrib/accountMenu/browser/account.contribution.js';
import './contrib/aiCustomizationTreeView/browser/aiCustomizationTreeView.contribution.js';
import './contrib/chat/browser/chat.contribution.js';
import './contrib/chat/browser/customizationsDebugLog.contribution.js';
import './contrib/copilotChatSessions/browser/copilotChatSessions.contribution.js';
import './contrib/sessions/browser/sessions.contribution.js';
import './contrib/sessions/browser/customizationsToolbar.contribution.js';
import './contrib/changes/browser/changesView.contribution.js';
import './contrib/layout/browser/layout.contribution.js';
import './contrib/codeReview/browser/codeReview.contributions.js';
import './contrib/files/browser/files.contribution.js';
import './contrib/github/browser/github.contribution.js';
import './contrib/applyCommitsToParentRepo/browser/applyChangesToParentRepo.js';
import './contrib/fileTreeView/browser/fileTreeView.contribution.js'; // view registration disabled; filesystem provider still needed
import './contrib/configuration/browser/configuration.contribution.js';
import './contrib/terminal/browser/sessionsTerminalContribution.js';
import './contrib/logs/browser/logs.contribution.js';
import './contrib/chatDebug/browser/chatDebug.contribution.js';
import './contrib/workspace/browser/workspace.contribution.js';
import './contrib/welcome/browser/welcome.contribution.js';
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnMuY29tbW9uLm1haW4uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9zZXNzaW9ucy5jb21tb24ubWFpbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxtQ0FBbUM7QUFFbkMsT0FBTyx5QkFBeUIsQ0FBQztBQUVqQyxPQUFPLHdEQUF3RCxDQUFDO0FBQ2hFLE9BQU8sZ0RBQWdELENBQUM7QUFFeEQsWUFBWTtBQUdaLCtCQUErQjtBQUUvQixPQUFPLGtEQUFrRCxDQUFDO0FBQzFELE9BQU8sa0RBQWtELENBQUM7QUFDMUQsT0FBTyw2Q0FBNkMsQ0FBQztBQUNyRCxPQUFPLDhDQUE4QyxDQUFDO0FBQ3RELDBEQUEwRDtBQUMxRCxPQUFPLG1EQUFtRCxDQUFDO0FBQzNELE9BQU8sK0NBQStDLENBQUM7QUFDdkQsT0FBTyxrREFBa0QsQ0FBQztBQUMxRCxPQUFPLG1EQUFtRCxDQUFDO0FBQzNELE9BQU8sb0RBQW9ELENBQUM7QUFDNUQsT0FBTywwREFBMEQsQ0FBQztBQUVsRSxZQUFZO0FBR1osa0NBQWtDO0FBRWxDLE9BQU8sNkRBQTZELENBQUM7QUFDckUsT0FBTyx3REFBd0QsQ0FBQztBQUNoRSxPQUFPLGlEQUFpRCxDQUFDO0FBRXpELFlBQVk7QUFHWiw2QkFBNkI7QUFFN0IsT0FBTywwREFBMEQsQ0FBQztBQUNsRSxPQUFPLGtEQUFrRCxDQUFDO0FBQzFELG1FQUFtRTtBQUNuRSxPQUFPLGlEQUFpRCxDQUFDO0FBQ3pELE9BQU8sdURBQXVELENBQUM7QUFFL0QsWUFBWTtBQUdaLGdDQUFnQztBQUVoQyxPQUFPLG9EQUFvRCxDQUFDO0FBQzVELE9BQU8sZ0RBQWdELENBQUM7QUFDeEQsT0FBTyxxREFBcUQsQ0FBQztBQUM3RCxPQUFPLHVFQUF1RSxDQUFDO0FBQy9FLE9BQU8sZ0VBQWdFLENBQUM7QUFDeEUs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