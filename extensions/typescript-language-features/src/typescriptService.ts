/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import BufferSyncSupport from './features/bufferSyncSupport';
import * as Proto from './protocol';
import API from './utils/api';
import { TypeScriptServiceConfiguration } from './utils/configuration';
import Logger from './utils/logger';
import { PluginManager } from './utils/plugins';

export namespace ServerResponse {

	export class Cancelled {
		public readonly type = 'cancelled';

		constructor(
			public readonly reason: string
		) { }
	}

	export const NoContent = { type: 'noContent' } as const;

	export type Response<T extends Proto.Response> = T | Cancelled | typeof NoContent;
}

export namespace ExperimentalProtocol {
	/**
	 * A request to get encoded semantic classifications for a span in the file
	 */
	export interface EncodedSemanticClassificationsRequest extends Proto.FileRequest {
		arguments: EncodedSemanticClassificationsRequestArgs;
	}

	/**
	 * Arguments for EncodedSemanticClassificationsRequest request.
	 */
	export interface EncodedSemanticClassificationsRequestArgs extends Proto.FileRequestArgs {
		/**
		 * Start position of the span.
		 */
		start: number;
		/**
		 * Length of the span.
		 */
		length: number;
	}

	export const enum EndOfLineState {
		None,
		InMultiLineCommentTrivia,
		InSingleQuoteStringLiteral,
		InDoubleQuoteStringLiteral,
		InTemplateHeadOrNoSubstitutionTemplate,
		InTemplateMiddleOrTail,
		InTemplateSubstitutionPosition,
	}

	export const enum ClassificationType {
		comment = 1,
		identifier = 2,
		keyword = 3,
		numericLiteral = 4,
		operator = 5,
		stringLiteral = 6,
		regularExpressionLiteral = 7,
		whiteSpace = 8,
		text = 9,
		punctuation = 10,
		className = 11,
		enumName = 12,
		interfaceName = 13,
		moduleName = 14,
		typeParameterName = 15,
		typeAliasName = 16,
		parameterName = 17,
		docCommentTagName = 18,
		jsxOpenTagName = 19,
		jsxCloseTagName = 20,
		jsxSelfClosingTagName = 21,
		jsxAttribute = 22,
		jsxText = 23,
		jsxAttributeStringLiteralValue = 24,
		bigintLiteral = 25,
	}

	export interface EncodedSemanticClassificationsResponse extends Proto.Response {
		body?: {
			endOfLineState: EndOfLineState;
			spans: number[];
		};
	}
}

interface StandardTsServerRequests {
	'applyCodeActionCommand': [Proto.ApplyCodeActionCommandRequestArgs, Proto.ApplyCodeActionCommandResponse];
	'completionEntryDetails': [Proto.CompletionDetailsRequestArgs, Proto.CompletionDetailsResponse];
	'completionInfo': [Proto.CompletionsRequestArgs, Proto.CompletionInfoResponse];
	'completions': [Proto.CompletionsRequestArgs, Proto.CompletionsResponse];
	'configure': [Proto.ConfigureRequestArguments, Proto.ConfigureResponse];
	'definition': [Proto.FileLocationRequestArgs, Proto.DefinitionResponse];
	'definitionAndBoundSpan': [Proto.FileLocationRequestArgs, Proto.DefinitionInfoAndBoundSpanReponse];
	'docCommentTemplate': [Proto.FileLocationRequestArgs, Proto.DocCommandTemplateResponse];
	'documentHighlights': [Proto.DocumentHighlightsRequestArgs, Proto.DocumentHighlightsResponse];
	'encodedSemanticClassifications-full': [ExperimentalProtocol.EncodedSemanticClassificationsRequestArgs, ExperimentalProtocol.EncodedSemanticClassificationsResponse];
	'format': [Proto.FormatRequestArgs, Proto.FormatResponse];
	'formatonkey': [Proto.FormatOnKeyRequestArgs, Proto.FormatResponse];
	'getApplicableRefactors': [Proto.GetApplicableRefactorsRequestArgs, Proto.GetApplicableRefactorsResponse];
	'getCodeFixes': [Proto.CodeFixRequestArgs, Proto.CodeFixResponse];
	'getCombinedCodeFix': [Proto.GetCombinedCodeFixRequestArgs, Proto.GetCombinedCodeFixResponse];
	'getEditsForFileRename': [Proto.GetEditsForFileRenameRequestArgs, Proto.GetEditsForFileRenameResponse];
	'getEditsForRefactor': [Proto.GetEditsForRefactorRequestArgs, Proto.GetEditsForRefactorResponse];
	'getOutliningSpans': [Proto.FileRequestArgs, Proto.OutliningSpansResponse];
	'getSupportedCodeFixes': [null, Proto.GetSupportedCodeFixesResponse];
	'implementation': [Proto.FileLocationRequestArgs, Proto.ImplementationResponse];
	'jsxClosingTag': [Proto.JsxClosingTagRequestArgs, Proto.JsxClosingTagResponse];
	'navto': [Proto.NavtoRequestArgs, Proto.NavtoResponse];
	'navtree': [Proto.FileRequestArgs, Proto.NavTreeResponse];
	'organizeImports': [Proto.OrganizeImportsRequestArgs, Proto.OrganizeImportsResponse];
	'projectInfo': [Proto.ProjectInfoRequestArgs, Proto.ProjectInfoResponse];
	'quickinfo': [Proto.FileLocationRequestArgs, Proto.QuickInfoResponse];
	'references': [Proto.FileLocationRequestArgs, Proto.ReferencesResponse];
	'rename': [Proto.RenameRequestArgs, Proto.RenameResponse];
	'selectionRange': [Proto.SelectionRangeRequestArgs, Proto.SelectionRangeResponse];
	'signatureHelp': [Proto.SignatureHelpRequestArgs, Proto.SignatureHelpResponse];
	'typeDefinition': [Proto.FileLocationRequestArgs, Proto.TypeDefinitionResponse];
	'updateOpen': [Proto.UpdateOpenRequestArgs, Proto.Response];
}

interface NoResponseTsServerRequests {
	'open': [Proto.OpenRequestArgs, null];
	'close': [Proto.FileRequestArgs, null];
	'change': [Proto.ChangeRequestArgs, null];
	'compilerOptionsForInferredProjects': [Proto.SetCompilerOptionsForInferredProjectsArgs, null];
	'reloadProjects': [null, null];
	'configurePlugin': [Proto.ConfigurePluginRequest, Proto.ConfigurePluginResponse];
}

interface AsyncTsServerRequests {
	'geterr': [Proto.GeterrRequestArgs, Proto.Response];
}

export type TypeScriptRequests = StandardTsServerRequests & NoResponseTsServerRequests & AsyncTsServerRequests;

export type ExecConfig = {
	readonly lowPriority?: boolean;
	readonly nonRecoverable?: boolean;
	readonly cancelOnResourceChange?: vscode.Uri
};

export interface ITypeScriptServiceClient {
	/**
	 * Convert a resource (VS Code) to a normalized path (TypeScript).
	 *
	 * Does not try handling case insensitivity.
	 */
	normalizedPath(resource: vscode.Uri): string | undefined;

	/**
	 * Map a resource to a normalized path
	 *
	 * This will attempt to handle case insensitivity.
	 */
	toPath(resource: vscode.Uri): string | undefined;

	/**
	 * Convert a path to a resource.
	 */
	toResource(filepath: string): vscode.Uri;

	/**
	 * Tries to ensure that a vscode document is open on the TS server.
	 *
	 * Returns the normalized path.
	 */
	toOpenedFilePath(document: vscode.TextDocument): string | undefined;

	getWorkspaceRootForResource(resource: vscode.Uri): string | undefined;

	readonly onTsServerStarted: vscode.Event<API>;
	readonly onProjectLanguageServiceStateChanged: vscode.Event<Proto.ProjectLanguageServiceStateEventBody>;
	readonly onDidBeginInstallTypings: vscode.Event<Proto.BeginInstallTypesEventBody>;
	readonly onDidEndInstallTypings: vscode.Event<Proto.EndInstallTypesEventBody>;
	readonly onTypesInstallerInitializationFailed: vscode.Event<Proto.TypesInstallerInitializationFailedEventBody>;

	readonly apiVersion: API;
	readonly pluginManager: PluginManager;
	readonly configuration: TypeScriptServiceConfiguration;
	readonly logger: Logger;
	readonly bufferSyncSupport: BufferSyncSupport;

	execute<K extends keyof StandardTsServerRequests>(
		command: K,
		args: StandardTsServerRequests[K][0],
		token: vscode.CancellationToken,
		config?: ExecConfig
	): Promise<ServerResponse.Response<StandardTsServerRequests[K][1]>>;

	executeWithoutWaitingForResponse<K extends keyof NoResponseTsServerRequests>(
		command: K,
		args: NoResponseTsServerRequests[K][0]
	): void;

	executeAsync(command: 'geterr', args: Proto.GeterrRequestArgs, token: vscode.CancellationToken): Promise<ServerResponse.Response<Proto.Response>>;

	/**
	 * Cancel on going geterr requests and re-queue them after `f` has been evaluated.
	 */
	interruptGetErr<R>(f: () => R): R;
}
