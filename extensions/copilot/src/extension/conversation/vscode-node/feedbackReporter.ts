/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Raw } from '@vscode/prompt-tsx';
import * as vscode from 'vscode';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { getTextPart, roleToString } from '../../../platform/chat/common/globalStringUtils';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IEditLogService } from '../../../platform/multiFileEdit/common/editLogService';
import { ILoggedPendingRequest, IRequestLogger, LoggedInfoKind, LoggedRequestKind } from '../../../platform/requestLogger/common/requestLogger';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IObservable } from '../../../util/vs/base/common/observableInternal';
import { basename } from '../../../util/vs/base/common/resources';
import { splitLinesIncludeSeparators } from '../../../util/vs/base/common/strings';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { EXTENSION_ID } from '../../common/constants';
import { InteractionOutcome, PromptQuery } from '../../inlineChat/node/promptCraftingTypes';
import { Conversation, RequestDebugInformation, Turn } from '../../prompt/common/conversation';
import { IntentInvocationMetadata } from '../../prompt/node/conversation';
import { IFeedbackReporter } from '../../prompt/node/feedbackReporter';
import { SearchFeedbackKind, SemanticSearchTextSearchProvider } from '../../workspaceSemanticSearch/node/semanticSearchTextSearchProvider';
import { WorkspaceStateSnapshotHelper } from './logWorkspaceState';

const SEPARATOR = '---------------------------------';

export class FeedbackReporter extends Disposable implements IFeedbackReporter {

	declare readonly _serviceBrand: undefined;

	readonly canReport: IObservable<boolean>;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IRequestLogger private readonly _requestLogger: IRequestLogger,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IEditLogService private readonly _editLogService: IEditLogService,
	) {
		super();

		this.canReport = this._configurationService.getConfigObservable(ConfigKey.TeamInternal.DebugReportFeedback);
	}

	private _findChatParamsForTurn(turn: Turn): ILoggedPendingRequest | undefined {
		for (const request of this._requestLogger.getRequests().reverse()) {
			if (request.kind !== LoggedInfoKind.Request) {
				continue;
			}
			if (request.entry.type === LoggedRequestKind.MarkdownContentRequest) {
				continue;
			}
			if (request.entry.chatParams.ourRequestId === turn.id) {
				return (<ILoggedPendingRequest>request.entry.chatParams);
			}
		}
	}

	async reportInline(conversation: Conversation, promptQuery: PromptQuery, interactionOutcome: InteractionOutcome): Promise<void> {
		if (!this.canReport) {
			return;
		}

		const turn = conversation.getLatestTurn();
		const latestMessages = this._findChatParamsForTurn(turn)?.messages;

		const intentDump = promptQuery.intent ? this._embedCodeblock('INTENT', promptQuery.intent.id) : '';
		const contextDump = this._embedCodeblock('CONTEXT', JSON.stringify({
			document: promptQuery.document.uri.toString(),
			fileIndentInfo: promptQuery.fileIndentInfo,
			language: promptQuery.language,
			wholeRange: promptQuery.wholeRange,
			selection: promptQuery.selection,
		}, null, '\t'));
		let messagesDump = '';

		if (latestMessages && latestMessages.length > 0) {
			const messagesInfo = latestMessages.map(message => this._embedCodeblock(roleToString(message.role).toUpperCase(), getTextPart(message.content))).join('\n');
			messagesDump = `\t${SEPARATOR}\n${this._headerSeparator()}PROMPT MESSAGES:\n${messagesInfo}`;
		} else {
			messagesDump = this._embedCodeblock(turn.request.type.toUpperCase(), turn.request.message);
		}

		const responseDump = this._embedCodeblock('ASSISTANT', turn.responseMessage?.message || '');
		const parsedReplyDump = this._embedCodeblock('Interaction outcome', JSON.stringify(interactionOutcome, null, '\t'));

		const output: string[] = [];
		appendPromptDetailsSection(output, intentDump, contextDump, messagesDump, responseDump, parsedReplyDump);
		await appendSTestSection(output, turn);
		await this._reportIssue('Feedback for inline chat', output.join('\n'));
	}

	async reportChat(turn: Turn): Promise<void> {
		if (!this.canReport) {
			return;
		}

		let messagesDump = '';
		const params = this._findChatParamsForTurn(turn);

		if (params?.messages && params.messages.length > 0) {
			const messagesInfo = params.messages.map(message => {
				let content = getTextPart(message.content);

				if (message.content.some(part => part.type === Raw.ChatCompletionContentPartKind.CacheBreakpoint)) {
					content += `\ncopilot_cache_control: { type: 'ephemeral' }`;
				}
				if (message.role === Raw.ChatRole.Assistant && message.toolCalls?.length) {
					if (content) {
						content += '\n';
					}
					content += message.toolCalls.map(c => {
						let argsStr = c.function.arguments;
						try {
							const parsedArgs = JSON.parse(c.function.arguments);
							argsStr = JSON.stringify(parsedArgs, undefined, 2);
						} catch (e) { }
						return `🛠️ ${c.function.name} (${c.id}) ${argsStr}`;
					}).join('\n');
				} else if (message.role === Raw.ChatRole.Tool) {
					content = `🛠️ ${message.toolCallId}\n${content}`;
				}

				return this._embedCodeblock(roleToString(message.role).toUpperCase(), content);
			}).join('\n');
			messagesDump += `\t${SEPARATOR}\n${this._headerSeparator()}PROMPT MESSAGES:\n${messagesInfo}`;
		} else {
			messagesDump += this._embedCodeblock(turn.request.type.toUpperCase(), turn.request.message);
		}

		const intent = turn.getMetadata(IntentInvocationMetadata)?.value.intent;
		const intentDump = intent ? this._embedCodeblock('INTENT', `[${intent.id}] ${intent.description}`) : '';
		const responseDump = this._embedCodeblock('ASSISTANT', turn.responseMessage?.message || '');
		const workspaceState = await this._instantiationService.createInstance(WorkspaceStateSnapshotHelper).captureWorkspaceStateSnapshot([]);
		const workspaceStateDump = this._embedCodeblock('WORKSPACE STATE', JSON.stringify(workspaceState, null, 2));
		const toolsDump = params?.body?.tools ? this._embedCodeblock('TOOLS', JSON.stringify(params.body.tools, null, 2)) : '';
		const metadata = this._embedCodeblock('METADATA', `requestID: ${turn.id}\nmodel: ${params?.model}`);
		const edits = (await this._editLogService.getEditLog(turn.id))?.map((edit, i) => {
			return this._embedCodeblock(`EDIT ${i + 1}`, JSON.stringify(edit, null, 2));
		}).join('\n') || '';

		const output: string[] = [];

		appendPromptDetailsSection(output, intentDump, messagesDump, responseDump, workspaceStateDump, toolsDump, metadata, edits);
		await appendSTestSection(output, turn);

		await this._reportIssue('Feedback for sidebar chat', output.join('\n'));
	}

	async reportSearch(kind: SearchFeedbackKind): Promise<void> {
		/* __GDPR__
			"copilot.search.feedback" : {
				"owner": "osortega",
				"comment": "Feedback telemetry for copilot search",
				"kind": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Feedback provided by the user." },
				"chunkCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Count of copilot search code chunks." },
				"rankResult": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Result of the copilot search ranking." },
				"rankResultsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Count of the results from copilot search ranking." },
				"combinedResultsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Count of combined results from copilot search." },
				"chunkSearchDuration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Duration of the chunk search" },
				"llmFilteringDuration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Duration of the LLM filtering" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('copilot.search.feedback', {
			kind,
			rankResult: SemanticSearchTextSearchProvider.feedBackTelemetry.rankResult,
		}, {
			chunkCount: SemanticSearchTextSearchProvider.feedBackTelemetry.chunkCount,
			rankResultsCount: SemanticSearchTextSearchProvider.feedBackTelemetry.rankResultsCount,
			combinedResultsCount: SemanticSearchTextSearchProvider.feedBackTelemetry.combinedResultsCount,
			chunkSearchDuration: SemanticSearchTextSearchProvider.feedBackTelemetry.chunkSearchDuration,
			llmFilteringDuration: SemanticSearchTextSearchProvider.feedBackTelemetry.llmFilteringDuration,
		});
	}

	private _embedCodeblock(header: string, text: string) {
		const body = this._bodySeparator() + text.split('\n').join(`\n${this._bodySeparator()}`);
		return `\t${SEPARATOR}\n${this._headerSeparator()}${header}:\n${body}`;
	}

	private _headerSeparator() {
		return `\t`;
	}

	private _bodySeparator() {
		return `\t\t`;
	}

	private async _reportIssue(title: string, body: string) {
		openIssueReporter({ title, data: body });
	}
}

export async function openIssueReporter(args: { title: string; issueBody?: string; data: string; public?: boolean }) {
	await vscode.commands.executeCommand('workbench.action.openIssueReporter', {
		extensionId: EXTENSION_ID,
		issueTitle: args.title,
		data: args.data,
		issueBody: args.issueBody ?? '',
		// team -> vscode-copilot
		uri: vscode.Uri.parse(args.public ? 'https://github.com/microsoft/vscode' : 'https://github.com/microsoft/vscode-copilot-issues'),
	});
}

function appendPromptDetailsSection(output: string[], ...dumps: string[]): void {
	output.push(
		`<details><summary>Prompt Details</summary>`,
		`<p>`,
		'', // Necessary for the indentation to render as a codeblock inside the <p>
		...dumps,
		`</p>`,
		`</details>`,
	);
}

async function appendSTestSection(output: string[], turn: Turn): Promise<void> {
	const test = await generateSTest(turn);
	if (test) {
		output.push(
			`<details><summary>STest</summary>`,
			`<p>`,
			`STest code:`,
			``,
			'```ts',
			...test,
			'```',
			`</p>`,
			`</details>`,
		);
	}
}

export async function generateSTest(turn: Turn): Promise<string[] | undefined> {
	const intentInvocation = turn.getMetadata(IntentInvocationMetadata)?.value;
	if (intentInvocation) {
		if (intentInvocation.location === ChatLocation.Editor) {
			return generateInlineChatSTest(turn);
		}
	}
	return undefined;
}


export function generateInlineChatSTest(turn: Turn): string[] | undefined {
	const requestInfo = turn.getMetadata(RequestDebugInformation);
	if (!requestInfo) {
		return undefined;
	}
	const fileName = basename(requestInfo.uri);
	const str = (val: unknown) => JSON.stringify(val);

	return [
		`stest({ description: 'Issue #XXXXX', language: ${str(requestInfo.languageId)}, model }, (testingServiceCollection) => {`,
		`	return simulateInlineChat(testingServiceCollection, {`,
		`		files: [toFile({`,
		`			fileName: ${str(`${requestInfo.intentId}/issue-XXXXX/${fileName}`)},`,
		`			fileContents: [`,
		...splitLinesIncludeSeparators(requestInfo.initialDocumentText).map(line => `				${str(line)},`),
		`			]`,
		`		})],`,
		`		queries: [`,
		`			{`,
		`				file: ${str(fileName)},`,
		`				selection: ${str(selectionAsArray(requestInfo.userSelection))},`,
		`				query: ${str(requestInfo.userPrompt)},`,
		`				diagnostics: 'tsc',`,
		`				expectedIntent: ${str(requestInfo.intentId)},`,
		`				validate: async (outcome, workspace, accessor) => {`,
		`					assertInlineEdit(outcome);`,
		`					await assertNoDiagnosticsAsync(accessor, outcome, workspace, KnownDiagnosticProviders.tscIgnoreImportErrors);`,
		`				}`,
		`			}`,
		`		]`,
		`	});`,
		`});`
	];
}

function selectionAsArray(range: vscode.Range) {
	return [range.start.line, range.start.character, range.end.line, range.end.character];
}
