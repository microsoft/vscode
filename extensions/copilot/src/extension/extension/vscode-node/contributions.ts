/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptFileContribution } from '../../agents/vscode-node/promptFileContrib';
import { AuthenticationContrib } from '../../authentication/vscode-node/authentication.contribution';
import { BYOKContrib } from '../../byok/vscode-node/byokContribution';
import { ChatDebugFileLoggerContribution } from '../../chat/vscode-node/chatDebugFileLoggerService';
import { ChatQuotaContribution } from '../../chat/vscode-node/chatQuota.contribution';
import { ChatSessionContextContribution } from '../../chatSessionContext/vscode-node/chatSessionContextProvider';
import { ChatSessionsContrib } from '../../chatSessions/vscode-node/chatSessions';
import { SessionStoreTracker } from '../../chronicle/vscode-node/sessionStoreTracker';
import * as sessionSyncContribution from '../../chronicle/vscode-node/sessionSync.contribution';
import * as chatBlockLanguageContribution from '../../codeBlocks/vscode-node/chatBlockLanguageFeatures.contribution';
import { IExtensionContributionFactory, asContributionFactory } from '../../common/contributions';
import { CompletionsUnificationContribution } from '../../completions/vscode-node/completionsUnificationContribution';
import { ConfigurationMigrationContribution } from '../../configuration/vscode-node/configurationMigration';
import { ContextKeysContribution } from '../../contextKeys/vscode-node/contextKeys.contribution';
import { ChatInputNotificationContribution } from '../../chatInputNotification/vscode-node/chatInputNotification.contribution';
import { AiMappedEditsContrib } from '../../conversation/vscode-node/aiMappedEditsContrib';
import { ConversationFeature } from '../../conversation/vscode-node/conversationFeature';
import { FeedbackCommandContribution } from '../../conversation/vscode-node/feedbackContribution';
import { LanguageModelAccess } from '../../conversation/vscode-node/languageModelAccess';
import { LogWorkspaceStateContribution } from '../../conversation/vscode-node/logWorkspaceState';
import { RemoteAgentContribution } from '../../conversation/vscode-node/remoteAgents';
import { DiagnosticsContextContribution } from '../../diagnosticsContext/vscode/diagnosticsContextProvider';
import { LanguageModelProxyContrib } from '../../externalAgents/vscode-node/lmProxyContrib';
import { WalkthroughCommandContribution } from '../../getting-started/vscode-node/commands';
import * as newWorkspaceContribution from '../../getting-started/vscode-node/newWorkspace.contribution';
import { ScmContextProviderContribution } from '../../git/vscode/scmContextprovider';
import { GitHubMcpContrib } from '../../githubMcp/vscode-node/githubMcp.contribution';
import { IgnoredFileProviderContribution } from '../../ignore/vscode-node/ignoreProvider';
import { JointCompletionsProviderContribution } from '../../inlineEdits/vscode-node/jointInlineCompletionProvider';
import { FixTestFailureContribution } from '../../intents/vscode-node/fixTestFailureContributions';
import { ExtensionStateCommandContribution } from '../../log/vscode-node/extensionStateCommand';
import { FetcherTelemetryContribution, LoggingActionsContrib } from '../../log/vscode-node/loggingActions';
import { RequestLogTree } from '../../log/vscode-node/requestLogTree';
import { McpSetupCommands } from '../../mcp/vscode-node/commands';
import { NotebookFollowCommands } from '../../notebook/vscode-node/followActions';
import { CopilotDebugCommandContribution } from '../../onboardDebug/vscode-node/copilotDebugCommandContribution';
import { OnboardTerminalTestsContribution } from '../../onboardDebug/vscode-node/onboardTerminalTestsContribution';
import { OTelContrib } from '../../otel/vscode-node/otelContrib';
import { PowerStateLogger } from '../../power/vscode-node/powerStateLogger';
import { DebugCommandsContribution } from '../../prompt/vscode-node/debugCommands';
import { RenameSuggestionsContrib } from '../../prompt/vscode-node/renameSuggestions';
import { PromptFileContextContribution } from '../../promptFileContext/vscode-node/promptFileContextService';
import { SearchPanelCommands } from '../../search/vscode-node/commands';
import { SettingsSchemaFeature } from '../../settingsSchema/vscode-node/settingsSchemaFeature';
import { SurveyCommandContribution } from '../../survey/vscode-node/surveyCommands';
import { SetupTestsContribution } from '../../testing/vscode/setupTestContributions';
import { ToolsContribution } from '../../tools/vscode-node/tools';
import { OTelChatDebugLogProviderContribution } from '../../trajectory/vscode-node/otelChatDebugLogProvider';
import { InlineCompletionContribution } from '../../typescriptContext/vscode-node/languageContextService';
import { NesRenameContribution } from '../../typescriptContext/vscode-node/nesRenameService';
import * as workspaceIndexingContribution from '../../workspaceChunkSearch/vscode-node/workspaceChunkSearch.contribution';
import { WorkspaceRecorderFeature } from '../../workspaceRecorder/vscode-node/workspaceRecorderFeature';
import vscodeContributions from '../vscode/contributions';

// ###################################################################################################
// ###                                                                                             ###
// ###                   Node contributions run ONLY in node.js extension host.                    ###
// ###                                                                                             ###
// ### !!! Prefer to list contributions in ../vscode/contributions.ts to support them anywhere !!! ###
// ###                                                                                             ###
// ###################################################################################################

export const vscodeNodeContributions: IExtensionContributionFactory[] = [
	...vscodeContributions,
	asContributionFactory(ExtensionStateCommandContribution),
	asContributionFactory(ConversationFeature),
	asContributionFactory(AuthenticationContrib),
	chatBlockLanguageContribution,
	asContributionFactory(LoggingActionsContrib),
	asContributionFactory(FetcherTelemetryContribution),
	asContributionFactory(PowerStateLogger),
	asContributionFactory(ContextKeysContribution),
	asContributionFactory(ChatInputNotificationContribution),
	asContributionFactory(CopilotDebugCommandContribution),
	asContributionFactory(DebugCommandsContribution),
	asContributionFactory(LanguageModelAccess),
	asContributionFactory(WalkthroughCommandContribution),
	asContributionFactory(JointCompletionsProviderContribution),
	// replaced by JointCompletionsProviderContribution
	// asContributionFactory(InlineEditProviderFeatureContribution),
	// asContributionFactory(CompletionsCoreContribution),
	asContributionFactory(SettingsSchemaFeature),
	asContributionFactory(WorkspaceRecorderFeature),
	asContributionFactory(SurveyCommandContribution),
	asContributionFactory(FeedbackCommandContribution),
	asContributionFactory(InlineCompletionContribution),
	asContributionFactory(NesRenameContribution),
	asContributionFactory(SearchPanelCommands),
	asContributionFactory(ChatQuotaContribution),
	asContributionFactory(NotebookFollowCommands),
	asContributionFactory(PromptFileContextContribution),
	asContributionFactory(ScmContextProviderContribution),
	asContributionFactory(DiagnosticsContextContribution),
	asContributionFactory(ChatSessionContextContribution),
	asContributionFactory(CompletionsUnificationContribution),
	workspaceIndexingContribution,
	asContributionFactory(ChatSessionsContrib),
	asContributionFactory(GitHubMcpContrib),
	asContributionFactory(OTelContrib),
	asContributionFactory(SessionStoreTracker),
	sessionSyncContribution,
];

/**
 * These contributions are special in that they are only instantiated
 * when the user is logged in and chat is enabled.
 * Anything that contributes a copilot chat feature that doesn't need
 * to run when chat is not enabled should be added here.
*/
export const vscodeNodeChatContributions: IExtensionContributionFactory[] = [
	asContributionFactory(ConfigurationMigrationContribution),
	asContributionFactory(RequestLogTree),
	asContributionFactory(OnboardTerminalTestsContribution),
	asContributionFactory(ToolsContribution),
	asContributionFactory(RemoteAgentContribution),
	asContributionFactory(AiMappedEditsContrib),
	asContributionFactory(RenameSuggestionsContrib),
	asContributionFactory(LogWorkspaceStateContribution),
	asContributionFactory(SetupTestsContribution),
	asContributionFactory(FixTestFailureContribution),
	asContributionFactory(IgnoredFileProviderContribution),
	asContributionFactory(BYOKContrib),
	asContributionFactory(McpSetupCommands),
	asContributionFactory(LanguageModelProxyContrib),
	asContributionFactory(PromptFileContribution),
	newWorkspaceContribution,
	asContributionFactory(OTelChatDebugLogProviderContribution),
	asContributionFactory(ChatDebugFileLoggerContribution),
];
