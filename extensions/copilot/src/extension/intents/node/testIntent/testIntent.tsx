/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type { CancellationToken, ChatPromptReference, ChatRequest, ChatResponseStream, ChatResult } from 'vscode';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { IChatHookService } from '../../../../platform/chat/common/chatHookService';
import { ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { IConversationOptions } from '../../../../platform/chat/common/conversationOptions';
import { IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { IEditSurvivalTrackerService } from '../../../../platform/editSurvivalTracking/common/editSurvivalTrackerService';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { IOctoKitService } from '../../../../platform/github/common/githubService';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IRequestLogger } from '../../../../platform/requestLogger/node/requestLogger';
import { ISurveyService } from '../../../../platform/survey/common/surveyService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { ISetupTestsDetector, isStartSetupTestConfirmation, SetupTestActionType } from '../../../../platform/testing/node/setupTestDetector';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { getLanguage } from '../../../../util/common/languages';
import { isUri } from '../../../../util/common/types';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { Position, Range, Selection } from '../../../../vscodeTypes';
import { Intent } from '../../../common/constants';
import { Conversation } from '../../../prompt/common/conversation';
import { ChatTelemetryBuilder } from '../../../prompt/node/chatParticipantTelemetry';
import { DefaultIntentRequestHandler } from '../../../prompt/node/defaultIntentRequestHandler';
import { IDocumentContext } from '../../../prompt/node/documentContext';
import { IIntent, IIntentInvocation, IIntentInvocationContext, IIntentSlashCommandInfo } from '../../../prompt/node/intents';
import { isTestFile } from '../../../prompt/node/testFiles';
import { ContributedToolName } from '../../../tools/common/toolNames';
import { TestFromSourceInvocation } from './testFromSrcInvocation';
import { TestFromTestInvocation } from './testFromTestInvocation';
import { UserQueryParser } from './userQueryParser';


export class TestsIntent implements IIntent {

	static readonly ID = Intent.Tests;

	readonly id = Intent.Tests;

	readonly locations = [ChatLocation.Panel, ChatLocation.Editor];

	readonly description = l10n.t('Generate unit tests for the selected code');

	readonly commandInfo: IIntentSlashCommandInfo = { toolEquivalent: ContributedToolName.FindTestFiles };

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@ILogService private readonly logService: ILogService,
	) { }

	handleRequest(conversation: Conversation, request: ChatRequest, stream: ChatResponseStream, token: CancellationToken, documentContext: IDocumentContext | undefined, agentName: string, location: ChatLocation, chatTelemetry: ChatTelemetryBuilder): Promise<ChatResult> {
		return this.instantiationService.createInstance(RequestHandler, this, conversation, request, stream, token, documentContext, location, chatTelemetry).getResult();
	}

	async invoke(invocationContext: IIntentInvocationContext): Promise<IIntentInvocation> {

		let documentContext = invocationContext.documentContext;
		let alreadyConsumedChatVariable: ChatPromptReference | undefined;

		// try resolving the document context programmatically
		if (!documentContext) {
			const r = await this.resolveDocContextProgrammatically(invocationContext);
			if (r) {
				documentContext = r.documentContext;
				alreadyConsumedChatVariable = r.alreadyConsumedChatVariable;
			}
		}

		// try resolving the document context using LLM
		if (!documentContext) {
			const r = await this.resolveDocContextUsingLlm(invocationContext);
			if (r) {
				documentContext = r.documentContext;
				alreadyConsumedChatVariable = r.alreadyConsumedChatVariable;
			}
		}

		if (!documentContext) {
			throw new Error('To generate tests, open a file and select code to test.');
		}

		if (await this.ignoreService.isCopilotIgnored(documentContext.document.uri)) {
			throw new Error('Copilot is disabled for this file.');
		}

		const location = invocationContext.location;

		const endpoint = await this.endpointProvider.getChatEndpoint(invocationContext.request);

		return isTestFile(documentContext.document)
			? this.instantiationService.createInstance(TestFromTestInvocation, this, endpoint, location, documentContext, alreadyConsumedChatVariable)
			: this.instantiationService.createInstance(TestFromSourceInvocation, this, endpoint, location, documentContext, alreadyConsumedChatVariable);
	}

	private async resolveDocContextProgrammatically(invocationContext: IIntentInvocationContext) {

		const refs = invocationContext.request.references;

		// find a #file to use for testing

		// count #file's because we use LLM if there're more than 1 in the prompt
		let hashFileCount = 0;

		const fileRefs: [ChatPromptReference, URI][] = [];

		for (const ref of refs) {
			if (ref.id === 'copilot.file' || ref.id === 'vscode.file') {
				if (isUri(ref.value)) {
					hashFileCount += 1;
					fileRefs.push([ref, ref.value]);
				}
			} else {
				if (!isUri(ref.id)) {
					continue;
				}
				const uri = URI.parse(ref.id);
				if (uri !== undefined) {
					fileRefs.push([ref, uri]);
				}
			}
		}

		if (hashFileCount > 1  // use LLM if there's more than 1 file reference
			|| fileRefs.length === 0
		) {
			return;
		}

		const [ref, fileUri] = fileRefs[0];

		return {
			documentContext: await this.createDocumentContext(fileUri),
			alreadyConsumedChatVariable: ref,
		};
	}

	private async resolveDocContextUsingLlm(invocationContext: IIntentInvocationContext) {

		const queryParser = this.instantiationService.createInstance(UserQueryParser);
		const parsedQuery = await queryParser.parse(invocationContext.request.prompt);

		if (parsedQuery === null) {
			return;
		}

		// FIXME@ulugbekna: UserQueryParser also returns symbols that need testing; we should use that info
		const { fileToTest, } = parsedQuery;

		// if parser couldn't identify the file, if there's only one file referenced, use that
		if (fileToTest === undefined) {
			return;
		}

		for (let i = 0; i < invocationContext.request.references.length; i++) {

			const ref = invocationContext.request.references[i];

			// FIXME@ulugbekna: I don't like how I fish for #file references

			if (ref.id !== 'vscode.file' && ref.id !== 'copilot.file') {
				continue;
			}

			const [kind, fileName] = ref.name.trim().split(':');
			if (kind !== 'file' ||
				fileName === undefined ||
				!(URI.isUri(ref.value)) ||
				fileName !== fileToTest
			) {
				continue;
			}

			return {
				documentContext: await this.createDocumentContext(ref.value),
				alreadyConsumedChatVariable: ref,
			};
		}
	}

	/**
	 *
	 * @param selection defaults to whole file
	 */
	private async createDocumentContext(file: URI, selection?: Range) {
		let td: TextDocumentSnapshot | undefined;
		try {
			td = await this.workspaceService.openTextDocumentAndSnapshot(file);
		} catch (e) {
			this.log(`Tried opening file ${file.toString()} but got error: ${e}`);
			return;
		}

		const wholeFile = selection ?? new Range(
			new Position(0, 0),
			new Position(td.lineCount - 1, td.lineAt(td.lineCount - 1).text.length)
		);

		return {
			document: td,
			fileIndentInfo: undefined,
			language: getLanguage(td.languageId),
			wholeRange: wholeFile,
			selection: new Selection(wholeFile.start, wholeFile.end),
		} satisfies IDocumentContext;
	}

	private log(...args: any[]): void {
		const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, '\t') : arg).join('\n');
		this.logService.debug(`[TestsIntent] ${message}`);
	}
}

class RequestHandler extends DefaultIntentRequestHandler {
	constructor(
		intent: IIntent,
		conversation: Conversation,
		request: ChatRequest,
		stream: ChatResponseStream,
		token: CancellationToken,
		documentContext: IDocumentContext | undefined,
		location: ChatLocation,
		chatTelemetry: ChatTelemetryBuilder,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConversationOptions conversationOptions: IConversationOptions,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService logService: ILogService,
		@ISurveyService surveyService: ISurveyService,
		@ISetupTestsDetector private readonly setupTestsDetector: ISetupTestsDetector,
		@IRequestLogger requestLogger: IRequestLogger,
		@IEditSurvivalTrackerService editSurvivalTrackerService: IEditSurvivalTrackerService,
		@IAuthenticationService authenticationService: IAuthenticationService,
		@IChatHookService chatHookService: IChatHookService,
		@IOctoKitService octoKitService: IOctoKitService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(intent, conversation, request, stream, token, documentContext, location, chatTelemetry, undefined, undefined, instantiationService, conversationOptions, telemetryService, logService, surveyService, requestLogger, editSurvivalTrackerService, authenticationService, chatHookService, octoKitService, configurationService);
	}

	/**
	 * - Delegates out to setting up tests if the user confirmed they wanted to do that
	 * - Otherwise try to detect if setup should be shown
	 *   - If not, just delegate to the base class
	 *   - If so, either return just that or append a reminder.
	 */
	public override async getResult(): Promise<ChatResult> {
		// if the user is starting test setup, we need to finish this request
		// before they can prompt us with the new one
		if (this.request.acceptedConfirmationData?.some(isStartSetupTestConfirmation)) {
			setTimeout(() => this.getResultInner());
			return {};
		}

		return this.getResultInner();
	}
	private async getResultInner(): Promise<ChatResult> {
		const suggestion = this.documentContext && await this.setupTestsDetector.shouldSuggestSetup(this.documentContext, this.request, this.stream);
		if (!suggestion) {
			return super.getResult();
		}

		let result: ChatResult = {};
		if (suggestion.type === SetupTestActionType.Remind) {
			result = await super.getResult();
		}

		this.setupTestsDetector.showSuggestion(suggestion).forEach(p => this.stream.push(p));

		return result;
	}
}
