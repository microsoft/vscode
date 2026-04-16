/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="../../../../src/typings/thenable.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.d.ts" />

// List of all API proposals we depend on
/// <reference path="../../../../src/vscode-dts/vscode.proposed.activeComment.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.agentSessionsWorkspace.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.aiRelatedInformation.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.aiSettingsSearch.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.aiTextSearchProvider.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.authLearnMore.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.chatDebug.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.chatHooks.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.chatParticipantAdditions.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.chatParticipantPrivate.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.chatPromptFiles.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.chatProvider.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.chatReferenceBinaryData.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.chatReferenceDiagnostic.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.chatSessionCustomizationProvider.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.chatSessionsProvider.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.chatStatusItem.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.codeActionAI.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.commentReveal.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.contribChatEditorInlineGutterMenu.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.contribCommentThreadAdditionalMenu.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.contribCommentsViewThreadMenus.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.contribDebugCreateConfiguration.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.contribEditorContentMenu.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.contribLanguageModelToolSets.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.contribSourceControlInputBoxMenu.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.dataChannels.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.defaultChatParticipant.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.devDeviceId.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.documentFiltersExclusive.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.embeddings.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.environmentPower.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.extensionsAny.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.findFiles2.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.findTextInFiles.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.findTextInFiles2.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.inlineCompletionsAdditions.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.interactive.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.languageModelCapabilities.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.languageModelSystem.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.languageModelThinkingPart.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.languageModelToolResultAudience.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.languageModelToolSupportsModel.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.mappedEditsProvider.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.mcpServerDefinitions.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.newSymbolNamesProvider.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.resolvers.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.tabInputMultiDiff.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.taskExecutionTerminal.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.taskProblemMatcherStatus.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.terminalDataWriteEvent.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.terminalExecuteCommandEvent.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.terminalQuickFixProvider.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.terminalSelection.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.terminalTitle.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.testObserver.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.textDocumentChangeReason.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.textSearchProvider.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.textSearchProvider2.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.toolInvocationApproveCombination.d.ts" />
/// <reference path="../../../../src/vscode-dts/vscode.proposed.workspaceTrust.d.ts" />
