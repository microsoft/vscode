/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscodeTypes from '../../../../vscodeTypes';
import { CancellationTokenSource } from '../../../vs/base/common/cancellation';
import { Emitter as EventEmitter } from '../../../vs/base/common/event';
import { URI as Uri } from '../../../vs/base/common/uri';
import { Diagnostic, DiagnosticRelatedInformation } from '../../../vs/workbench/api/common/extHostTypes/diagnostic';
import { Location } from '../../../vs/workbench/api/common/extHostTypes/location';
import { MarkdownString } from '../../../vs/workbench/api/common/extHostTypes/markdownString';
import { NotebookCellData, NotebookCellKind, NotebookData, NotebookEdit, NotebookRange } from '../../../vs/workbench/api/common/extHostTypes/notebooks';
import { Position } from '../../../vs/workbench/api/common/extHostTypes/position';
import { Range } from '../../../vs/workbench/api/common/extHostTypes/range';
import { Selection } from '../../../vs/workbench/api/common/extHostTypes/selection';
import { SnippetString } from '../../../vs/workbench/api/common/extHostTypes/snippetString';
import { SnippetTextEdit } from '../../../vs/workbench/api/common/extHostTypes/snippetTextEdit';
import { SymbolInformation, SymbolKind } from '../../../vs/workbench/api/common/extHostTypes/symbolInformation';
import { EndOfLine, TextEdit } from '../../../vs/workbench/api/common/extHostTypes/textEdit';
import { AISearchKeyword, ChatErrorLevel, ChatQuestion, ChatQuestionType, ChatReferenceBinaryData, ChatReferenceDiagnostic, ChatRequestEditedFileEventKind, ChatRequestEditorData, ChatRequestNotebookData, ChatRequestTurn, ChatRequestTurn2, ChatResponseAnchorPart, ChatResponseClearToPreviousToolInvocationReason, ChatResponseCodeblockUriPart, ChatResponseCodeCitationPart, ChatResponseCommandButtonPart, ChatResponseConfirmationPart, ChatResponseExtensionsPart, ChatResponseExternalEditPart, ChatResponseFileTreePart, ChatResponseHookPart, ChatResponseMarkdownPart, ChatResponseMarkdownWithVulnerabilitiesPart, ChatResponseMovePart, ChatResponseNotebookEditPart, ChatResponseProgressPart, ChatResponseProgressPart2, ChatResponsePullRequestPart, ChatResponseQuestionCarouselPart, ChatResponseReferencePart, ChatResponseReferencePart2, ChatResponseTextEditPart, ChatResponseThinkingProgressPart, ChatResponseTurn, ChatResponseTurn2, ChatResponseWarningPart, ChatResponseWorkspaceEditPart, ChatSessionStatus, ChatSubagentToolInvocationData, ChatToolInvocationPart, ExcludeSettingOptions, LanguageModelChatMessage, LanguageModelChatMessageRole, LanguageModelChatToolMode, LanguageModelDataPart, LanguageModelDataPart2, LanguageModelError, LanguageModelPartAudience, LanguageModelPromptTsxPart, LanguageModelTextPart, LanguageModelTextPart2, LanguageModelThinkingPart, LanguageModelToolCallPart, LanguageModelToolExtensionSource, LanguageModelToolMCPSource, LanguageModelToolResult, LanguageModelToolResult2, LanguageModelToolResultPart, LanguageModelToolResultPart2, McpHttpServerDefinition, McpStdioServerDefinition, McpToolInvocationContentData, TextSearchMatch2 } from './chatTypes';
import { TextDocumentChangeReason, TextEditorSelectionChangeKind, WorkspaceEdit } from './editing';
import { ChatLocation, ChatVariableLevel, DiagnosticSeverity, ExtensionMode, FileType, TextEditorCursorStyle, TextEditorLineNumbersStyle, TextEditorRevealType } from './enums';
import { t } from './l10n';
import { NewSymbolName, NewSymbolNameTag, NewSymbolNameTriggerKind } from './newSymbolName';
import { TerminalShellExecutionCommandLineConfidence } from './terminal';
import { ThemeIcon } from './themes';

const shim: typeof vscodeTypes = {
	Position,
	Range,
	Selection,
	EventEmitter,
	CancellationTokenSource,
	Diagnostic,
	Location,
	DiagnosticRelatedInformation,
	TextEdit,
	WorkspaceEdit: <any>WorkspaceEdit,
	Uri,
	MarkdownString,
	DiagnosticSeverity,
	TextEditorCursorStyle,
	TextEditorLineNumbersStyle,
	TextEditorRevealType,
	EndOfLine,
	l10n: {
		t
	},
	ExtensionMode,
	ChatVariableLevel,
	ChatResponseClearToPreviousToolInvocationReason,
	ChatResponseMarkdownPart,
	ChatResponseFileTreePart,
	ChatResponseAnchorPart,
	ChatResponseMovePart,
	ChatResponseExtensionsPart,
	ChatResponseProgressPart,
	ChatResponseProgressPart2,
	ChatResponseWarningPart,
	ChatResponseHookPart,
	ChatResponseReferencePart,
	ChatResponseReferencePart2,
	ChatResponseCodeCitationPart,
	ChatResponseCommandButtonPart,
	ChatResponseExternalEditPart,
	ChatResponseMarkdownWithVulnerabilitiesPart,
	ChatResponseCodeblockUriPart,
	ChatResponseTextEditPart,
	ChatResponseNotebookEditPart,
	ChatResponseWorkspaceEditPart,
	ChatResponseConfirmationPart,
	ChatQuestion,
	ChatQuestionType,
	ChatResponseQuestionCarouselPart,
	ChatRequestTurn,
	ChatResponseTurn,
	ChatRequestEditorData,
	ChatRequestNotebookData,
	NewSymbolName,
	NewSymbolNameTag,
	NewSymbolNameTriggerKind,
	ChatLocation,
	SymbolInformation: SymbolInformation as any,
	LanguageModelToolResult,
	ExtendedLanguageModelToolResult: LanguageModelToolResult,
	LanguageModelToolResult2,
	LanguageModelPromptTsxPart,
	LanguageModelTextPart,
	LanguageModelDataPart,
	LanguageModelToolExtensionSource,
	LanguageModelToolMCPSource,
	ChatReferenceBinaryData,
	ChatReferenceDiagnostic,
	TextSearchMatch2,
	AISearchKeyword,
	ExcludeSettingOptions,
	NotebookCellKind,
	NotebookRange,
	NotebookEdit,
	NotebookCellData,
	NotebookData,
	ChatErrorLevel,
	TerminalShellExecutionCommandLineConfidence,
	ChatRequestEditedFileEventKind,
	ChatResponsePullRequestPart,
	LanguageModelTextPart2,
	LanguageModelDataPart2,
	LanguageModelThinkingPart,
	LanguageModelPartAudience,
	ChatResponseThinkingProgressPart,
	LanguageModelToolCallPart,
	LanguageModelToolResultPart,
	LanguageModelToolResultPart2,
	LanguageModelChatMessageRole,
	LanguageModelChatMessage,
	LanguageModelChatToolMode,
	TextEditorSelectionChangeKind,
	TextDocumentChangeReason,
	ChatToolInvocationPart,
	ChatSubagentToolInvocationData,
	McpToolInvocationContentData,
	ChatResponseTurn2,
	ChatRequestTurn2,
	LanguageModelError: LanguageModelError as any, // Some difference in the definition of Error is breaking this
	SymbolKind,
	SnippetString,
	SnippetTextEdit,
	FileType,
	ChatSessionStatus,
	authentication: {
		getSession: async () => { throw new Error('authentication.getSession not mocked in test'); }
	},
	McpHttpServerDefinition,
	McpStdioServerDefinition,
	ThemeIcon
};

export = shim;
