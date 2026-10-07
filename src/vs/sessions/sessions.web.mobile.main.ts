/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


// #######################################################################
// ###                                                                 ###
// ###  Mobile web entry point of the Agents Window.                   ###
// ###                                                                 ###
// ###  This bundle is an ALLOW-LIST. It loads the services shared     ###
// ###  with the desktop bundles and then only the feature             ###
// ###  contributions a phone needs to manage chat sessions:           ###
// ###  the sessions list, the chat, the new-session composer,         ###
// ###  changes/diff review, account, and remote host connectivity.    ###
// ###                                                                 ###
// ###  Do NOT import sessions.common.main.js or sessions.web.main.js  ###
// ###  here. If a feature is missing on the phone, add its            ###
// ###  contribution explicitly and give it a phone presentation.      ###
// ###                                                                 ###
// #######################################################################

//#region --- sessions core (services, parts, extension points)

import './sessions.core.main.js';
import './sessions.core.web.main.js';

//#endregion


//#region --- shared services the phone needs without their editors or views

// Every registration here is a service that a shared component requires in its
// constructor even though the phone never shows the corresponding UI. Each is a
// coupling to break with a seam later; keeping them listed makes the debt visible.

import { InstantiationType, registerSingleton } from '../platform/instantiation/common/extensions.js';

// chatEditingService and agentSessionProjectionService query INotebookService to
// tell notebook URIs apart from text files. The notebook editor is not shipped.
import { INotebookService } from '../workbench/contrib/notebook/common/notebookService.js';
import { NotebookService } from '../workbench/contrib/notebook/browser/services/notebookServiceImpl.js';
import { INotebookEditorModelResolverService } from '../workbench/contrib/notebook/common/notebookEditorModelResolverService.js';
import { NotebookModelResolverServiceImpl } from '../workbench/contrib/notebook/common/notebookEditorModelResolverServiceImpl.js';
import { INotebookLoggingService } from '../workbench/contrib/notebook/common/notebookLoggingService.js';
import { NotebookLoggingService } from '../workbench/contrib/notebook/browser/services/notebookLoggingServiceImpl.js';
registerSingleton(INotebookService, NotebookService, InstantiationType.Delayed);
registerSingleton(INotebookEditorModelResolverService, NotebookModelResolverServiceImpl, InstantiationType.Delayed);
registerSingleton(INotebookLoggingService, NotebookLoggingService, InstantiationType.Delayed);

// The telemetry contribution opens its log channel through IOutputService. The
// Output view is not shipped; showing a channel is a no-op on the phone.
import { IOutputService } from '../workbench/services/output/common/output.js';
import { OutputService } from '../workbench/contrib/output/browser/outputServices.js';
registerSingleton(IOutputService, OutputService, InstantiationType.Delayed);

// chatEditingService resolves multi-file edits through IMultiDiffSourceResolverService.
// The phone reviews changes with its own diff overlays; the multi-diff editor is not shipped.
import { IMultiDiffSourceResolverService, MultiDiffSourceResolverService } from '../workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService.js';
registerSingleton(IMultiDiffSourceResolverService, MultiDiffSourceResolverService, InstantiationType.Delayed);

// The chat outline creator requires IOutlineService.
import '../workbench/services/outline/browser/outlineService.js';

// Agent-host sessions (AgentHostSessionHandler) and the transcript parts that
// show a command the agent ran (ChatTerminalToolProgressPart and its
// confirmation) require ITerminalChatService. It tracks tool sessions and
// the read-only output sources that feed the command card; it creates no
// terminal. The terminal inline chat it was written for is not shipped.
import { ITerminalChatService } from '../workbench/contrib/terminal/browser/terminal.js';
import { TerminalChatService } from '../workbench/contrib/terminalContrib/chat/browser/terminalChatService.js';
registerSingleton(ITerminalChatService, TerminalChatService, InstantiationType.Delayed);

//#endregion


//#region --- services forced by the extension host API surface

// The extension host instantiates every `MainThread*` customer and then asserts
// that all of them exist (`ExtensionHostManager#_createExtensionHostCustomers`).
// A single missing service therefore breaks the whole extension host — and with
// it GitHub authentication and every extension-backed provider. Until the API
// layer supports optional customers, the phone must register the services the
// desktop-only customers depend on. Only service implementations are loaded
// here; the editors, views, and actions of these features stay out of the bundle.

// MainThreadNotebook*, MainThreadNotebooksAndEditors, MainThreadNotebookRenderers
import { INotebookEditorService } from '../workbench/contrib/notebook/browser/services/notebookEditorService.js';
import { NotebookEditorWidgetService } from '../workbench/contrib/notebook/browser/services/notebookEditorServiceImpl.js';
import { INotebookCellStatusBarService } from '../workbench/contrib/notebook/common/notebookCellStatusBarService.js';
import { NotebookCellStatusBarService } from '../workbench/contrib/notebook/browser/services/notebookCellStatusBarServiceImpl.js';
import { INotebookRendererMessagingService } from '../workbench/contrib/notebook/common/notebookRendererMessagingService.js';
import { NotebookRendererMessagingService } from '../workbench/contrib/notebook/browser/services/notebookRendererMessagingServiceImpl.js';
import { INotebookKernelService, INotebookKernelHistoryService } from '../workbench/contrib/notebook/common/notebookKernelService.js';
import { NotebookKernelService } from '../workbench/contrib/notebook/browser/services/notebookKernelServiceImpl.js';
import { NotebookKernelHistoryService } from '../workbench/contrib/notebook/browser/services/notebookKernelHistoryServiceImpl.js';
import { INotebookExecutionService } from '../workbench/contrib/notebook/common/notebookExecutionService.js';
import { NotebookExecutionService } from '../workbench/contrib/notebook/browser/services/notebookExecutionServiceImpl.js';
import { INotebookExecutionStateService } from '../workbench/contrib/notebook/common/notebookExecutionStateService.js';
import { NotebookExecutionStateService } from '../workbench/contrib/notebook/browser/services/notebookExecutionStateServiceImpl.js';
registerSingleton(INotebookEditorService, NotebookEditorWidgetService, InstantiationType.Delayed);
registerSingleton(INotebookCellStatusBarService, NotebookCellStatusBarService, InstantiationType.Delayed);
registerSingleton(INotebookRendererMessagingService, NotebookRendererMessagingService, InstantiationType.Delayed);
registerSingleton(INotebookKernelService, NotebookKernelService, InstantiationType.Delayed);
registerSingleton(INotebookKernelHistoryService, NotebookKernelHistoryService, InstantiationType.Delayed);
registerSingleton(INotebookExecutionService, NotebookExecutionService, InstantiationType.Delayed);
registerSingleton(INotebookExecutionStateService, NotebookExecutionStateService, InstantiationType.Delayed);

// MainThreadWebviewPanels, MainThreadEditorInsets, MainThreadWebviewsViews (and chat attachment widgets)
import '../workbench/contrib/webview/browser/webview.web.contribution.js';
import { IWebviewWorkbenchService, WebviewEditorService } from '../workbench/contrib/webviewPanel/browser/webviewWorkbenchService.js';
import { IWebviewViewService, WebviewViewService } from '../workbench/contrib/webviewView/browser/webviewViewService.js';
registerSingleton(IWebviewWorkbenchService, WebviewEditorService, InstantiationType.Delayed);
registerSingleton(IWebviewViewService, WebviewViewService, InstantiationType.Delayed);

// MainThreadInteractive
import { IInteractiveDocumentService, InteractiveDocumentService } from '../workbench/contrib/interactive/browser/interactiveDocumentService.js';
registerSingleton(IInteractiveDocumentService, InteractiveDocumentService, InstantiationType.Delayed);

// MainThreadCustomEditors
import { ICustomEditorService } from '../workbench/contrib/customEditor/common/customEditor.js';
import { CustomEditorService } from '../workbench/contrib/customEditor/browser/customEditors.js';
registerSingleton(ICustomEditorService, CustomEditorService, InstantiationType.Delayed);

// MainThreadComments
import { ICommentService, CommentService } from '../workbench/contrib/comments/browser/commentService.js';
registerSingleton(ICommentService, CommentService, InstantiationType.Delayed);

// MainThreadSCM, MainThreadQuickDiff, MainThreadDocumentsAndEditors
import '../workbench/contrib/scm/browser/quickDiff.contribution.js';

// MainThreadTimeline, MainThreadShare
import '../workbench/contrib/timeline/browser/timeline.service.contribution.js';
import '../workbench/contrib/share/browser/share.contribution.js';

// MainThreadBrowsers, MainThreadBrowserTunnelProxy (and chat attachment resolution)
import '../workbench/contrib/browserView/browser/browserView.contribution.js';

// MainThreadTerminalService, MainThreadTerminalShellIntegration, MainThreadTask.
// The terminal service layer and the three terminal features the API customer
// injects. No xterm instance is created unless a terminal is opened, and the
// phone's IAgentHostTerminalService never opens one.
import '../workbench/contrib/terminal/browser/terminal.contribution.js';
import '../workbench/contrib/terminal/browser/terminal.web.contribution.js';
import '../workbench/contrib/terminal/common/environmentVariable.contribution.js';
import '../workbench/contrib/terminal/common/terminalExtensionPoints.contribution.js';
import '../workbench/contrib/terminalContrib/links/browser/terminal.links.contribution.js';
import '../workbench/contrib/terminalContrib/suggest/browser/terminal.suggest.contribution.js';
import '../workbench/contrib/terminalContrib/quickFix/browser/terminal.quickFix.contribution.js';
import '../workbench/contrib/tasks/browser/taskService.js';

//#endregion


//#region --- workbench actions

import '../workbench/browser/actions/textInputActions.js';
import '../workbench/browser/actions/listCommands.js';
import '../workbench/browser/actions/navigationActions.js';
import '../workbench/browser/actions/widgetNavigationCommands.js';

//#endregion


//#region --- web bootstrap and phone presentation

// Bottom-sheet dialogs in place of the standard web dialog handler.
import './browser/parts/dialogs/mobileDialog.web.contribution.js';

// Sessions browser bootstrap (workspace, configuration, storage).
import './browser/web.main.js';

// Per-session layout controller for the phone layout.
import './contrib/layout/browser/sessions.mobile.layout.contribution.js';

//#endregion


//#region --- workbench contributions the phone needs

// Default Account
import '../workbench/services/accounts/browser/defaultAccount.js';

// Telemetry (chat markdown parts report AI edits through IAiEditTelemetryService)
import '../workbench/contrib/telemetry/browser/telemetry.contribution.js';
import '../workbench/contrib/editTelemetry/browser/editTelemetry.contribution.js';

// Chat
import '../workbench/contrib/chat/browser/chat.shared.contribution.js';
import '../workbench/contrib/mcp/browser/mcp.contribution.js';
import '../workbench/contrib/chat/browser/chatSessions/chatSessions.contribution.js';
import '../workbench/contrib/chat/browser/contextContrib/chatContext.contribution.js';
// "Add Context" opens the file picker through the anything quick-access
// provider; without this registration the action runs and shows nothing.
import '../workbench/contrib/search/browser/searchQuickAccess.contribution.js';

// Voice: speech-to-text is a first-class phone input
import '../workbench/contrib/speech/browser/speech.contribution.js';
import '../workbench/contrib/agentsVoice/browser/agentsVoice.contribution.js';
import './contrib/chat/browser/voiceBridge.contribution.js';

// Text files and editors (chat opens files and diffs through the editor service)
import '../workbench/contrib/files/browser/files.contribution.js';
import '../workbench/contrib/bulkEdit/browser/bulkEditService.js';
import '../workbench/contrib/codeEditor/browser/codeEditor.contribution.js';
import '../workbench/contrib/markdown/browser/markdown.contribution.js';

// Editor services the chat input editors instantiate through editor contributions
import '../workbench/contrib/snippets/browser/snippets.service.contribution.js';
import '../workbench/contrib/inlineCompletions/browser/renameSymbolTrackerService.js';

// Onboarding scenarios back the session archive suggestion shown in the chat view
import '../workbench/contrib/onboarding/browser/onboarding.contribution.js';

// Source control services (session changes are computed against git)
import '../workbench/contrib/git/browser/git.contributions.js';
import '../workbench/contrib/scm/browser/scm.service.contribution.js';

// Links
import '../workbench/contrib/url/browser/url.contribution.js';
import '../workbench/contrib/opener/browser/opener.contribution.js';
import '../workbench/contrib/externalUriOpener/common/externalUriOpener.contribution.js';

// Authentication (sign-in flows and the `contributes.authentication` extension point)
import '../workbench/contrib/authentication/browser/authentication.contribution.js';

// Accessibility (accessible view and signals are injected by the chat widget)
import '../workbench/contrib/accessibility/browser/accessibility.contribution.js';
import '../workbench/contrib/accessibilitySignals/browser/accessibilitySignal.contribution.js';

// Lists
import '../workbench/contrib/list/browser/list.contribution.js';

// Paste and drop into the chat input (images, files)
import '../workbench/contrib/dropOrPasteInto/browser/dropOrPasteInto.contribution.js';

// Extension host debugging service required by the web extension host
import '../workbench/contrib/debug/browser/extensionHostDebugService.js';

//#endregion


//#region --- sessions contributions the phone needs

// Parts and shared sessions services
import './browser/paneCompositePartService.js';
import './browser/parts/editorParts.js';
import './browser/parts/sessionsParts.js';
import './browser/parts/customViewGridParts.js';
import './services/sessions/browser/sessionsWindowUsageService.js';
import './services/sessions/browser/sessionsService.js';
import './services/sessions/browser/sessionsManagementService.js';
import './services/sessions/browser/sessionsListModelService.js';
import './services/sessions/browser/sessionGroupsService.js';
import './services/sessions/browser/sessionComparisonService.js';
import './services/sessions/browser/sessionSectionOrderService.js';
import './services/workspaceFolderLabel/browser/workspaceFolderLabelService.js';
import './services/mcp/browser/mcpWorkspaceInstallTargetService.js';
import './services/customView/browser/customViewService.js';
import './services/agentHostFilter/browser/agentHostFilterService.js';

// Account
import './contrib/accountMenu/browser/account.contribution.js';

// GitHub: the default Copilot sessions provider and the title bar resolve
// pull requests and blocked sessions through IGitHubService.
import './contrib/github/browser/github.contribution.js';

// Code review registers ICodeReviewService, which the changes service requires.
// Its actions are already gated off the phone layout.
import './contrib/codeReview/browser/codeReview.contributions.js';

// Chat and the new-session composer (includes the phone diff/changes overlays)
import './contrib/chat/browser/chat.contribution.js';
import './contrib/chat/browser/requestOriginProvider.contribution.js';
import './contrib/sessions/browser/customizationsToolbar.contribution.js';

// Coupling debt: NewChatWidget takes IAquariumService in its constructor.
import './contrib/aquarium/browser/aquarium.contribution.js';

// Sessions list
import './contrib/sessions/browser/sessions.contribution.js';

// Coupling debt: sessions.contribution.ts registers the automations custom view,
// whose contribution takes IAutomationService in its constructor.
import './contrib/automations/browser/automations.contribution.js';

// Changes
import './contrib/changes/browser/changes.contribution.js';

// Session file system provider (needed to read files for diffs)
import './contrib/fileTreeView/browser/fileTreeView.contribution.js';

// Workspace resolution for new sessions
import './contrib/workspace/browser/workspace.contribution.js';

// Settings and policy
import './contrib/configuration/browser/configuration.contribution.js';
import './contrib/policyBlocked/browser/policyBlocked.contribution.js';
import '../workbench/services/policies/browser/managedSettingsUpdate.contribution.js';

// Providers: Copilot chat sessions
import './contrib/providers/copilotChatSessions/browser/copilotChatSessions.contribution.js';

// Providers: agent host (mode/model configuration, debug log export, subagents)
import './contrib/providers/agentHost/browser/agentHostSessionConfigPicker.js';
import './contrib/providers/agentHost/browser/exportDebugLogsAction.js';
import './contrib/providers/agentHost/browser/agentSessionSettings.contribution.js';
import './contrib/providers/agentHost/browser/agentHostSettings.contribution.js';
import './contrib/providers/agentHost/browser/openSubagentChat.js';

// Providers: remote agent hosts reachable from a phone (tunnels, WebSocket, cloud sandbox)
import './contrib/providers/remoteAgentHost/browser/webTunnelAgentHostService.contribution.js';
import './contrib/providers/remoteAgentHost/browser/tunnelAgentHost.contribution.js';
import './contrib/providers/remoteAgentHost/browser/webSocketAgentHost.contribution.js';
import './contrib/providers/remoteAgentHost/browser/remoteAgentHost.contribution.js';
import './contrib/providers/remoteAgentHost/browser/remoteAgentHostActions.js';
import './contrib/providers/remoteAgentHost/browser/cloudSandboxAgentHost.contribution.js';
import './contrib/providers/remoteAgentHost/browser/mobileHostFilter.contribution.js';

// Phone pickers for mode and model in the chat input
import './contrib/providers/agentHost/browser/mobile/mobileChatInputConfigPicker.js';
import './contrib/providers/agentHost/browser/mobile/experimentalMobileChatPhoneInputPresenter.js';

// Agent feedback is not supported on web
import './contrib/agentFeedback/browser/nullAgentFeedbackService.contribution.js';

//#endregion


//#region --- phone presentations of shared services

// Must stay last: the service collection keeps the final registration for an
// id, so these override the implementations registered by everything above.
import './contrib/mobile/browser/mobile.contribution.js';

//#endregion
