/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';

import { PromptElement, PromptPiece, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { IResponsePart } from '../../../platform/chat/common/chatMLFetcher';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { IParserService } from '../../../platform/parser/node/parserService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { languageIdToMDCodeBlockLang } from '../../../util/common/markdown';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { StringEdit } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatVariablesCollection } from '../../prompt/common/chatVariablesCollection';
import { Turn } from '../../prompt/common/conversation';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { DefinitionAroundCursor, Props as DefinitionAroundCursorProps, determineNodeToDocument, NodeToDocument } from '../../prompt/node/definitionAroundCursor';
import { IDocumentContext } from '../../prompt/node/documentContext';
import { EditStrategy } from '../../prompt/node/editGeneration';
import { EarlyStopping, IIntent, IIntentInvocation, IIntentInvocationContext, IIntentSlashCommandInfo, IResponseProcessorContext, LeadingMarkdownStreaming } from '../../prompt/node/intents';
import { InsertionStreamingEdits, InsertOrReplaceStreamingEdits, TextPieceClassifiers } from '../../prompt/node/streamingEdits';
import { InstructionMessage } from '../../prompts/node/base/instructionMessage';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { InlineReplyInterpreter } from '../../prompts/node/inline/promptingSummarizedDocument';
import { ProjectedDocument } from '../../prompts/node/inline/summarizedDocument/summarizeDocument';
import { ChatToolReferences, ChatVariables } from '../../prompts/node/panel/chatVariables';
import { HistoryWithInstructions } from '../../prompts/node/panel/conversationHistory';


export class InlineDocIntent implements IIntent {

	static readonly ID: string = 'doc';
	readonly id: string = InlineDocIntent.ID;
	readonly description: string = l10n.t('Add documentation comment for this symbol');
	readonly locations: ChatLocation[] = [ChatLocation.Editor];
	readonly commandInfo: IIntentSlashCommandInfo = {};

	constructor(
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IParserService private readonly parserService: IParserService,
		@IInstantiationService private readonly instaService: IInstantiationService,
	) { }

	async invoke(invocationContext: IIntentInvocationContext): Promise<IIntentInvocation> {

		const { documentContext, request } = invocationContext;
		if (!documentContext) {
			throw new Error('Open a file to add documentation.');
		}

		const nodeToDocument = await determineNodeToDocument(this.parserService, this.telemetryService, documentContext);

		const endpoint = await this.endpointProvider.getChatEndpoint(request);
		return this.instaService.createInstance(DocInvocation, endpoint, documentContext, this, nodeToDocument);
	}

}


class DocInvocation implements IIntentInvocation {

	readonly location: ChatLocation = ChatLocation.Editor;

	constructor(
		readonly endpoint: IChatEndpoint,
		private readonly context: IDocumentContext,
		readonly intent: InlineDocIntent,
		private nodeToDocument: NodeToDocument | undefined,
		@IParserService private readonly parserService: IParserService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	async buildPrompt(
		promptContext: IBuildPromptContext,
		progress: vscode.Progress<vscode.ChatResponseReferencePart | vscode.ChatResponseProgressPart>,
		token: vscode.CancellationToken
	) {
		const { query, history, chatVariables, } = promptContext;
		const nodeToDocument = this.nodeToDocument ?? await determineNodeToDocument(this.parserService, this.telemetryService, this.context);

		const renderer = PromptRenderer.create(
			this.instantiationService,
			this.endpoint,
			DocPrompt,
			{
				userQuery: query,
				documentContext: this.context,
				nodeToDocument,
				endpointInfo: this.endpoint,
				history: history,
				chatVariables,
				promptContext
			}
		);

		const renderedPrompt = await renderer.render(progress, token);

		return renderedPrompt;
	}

	processResponse(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: vscode.ChatResponseStream, token: CancellationToken): Promise<void> {

		const document = this.context.document;

		const projectedDoc = new ProjectedDocument(document.getText(), StringEdit.empty, document.languageId);

		const range = this.nodeToDocument?.range ?? this.context.selection;

		let replyInterpreter: InlineReplyInterpreter;
		if (document.languageId === 'python') {

			/* @ulugbekna: for python, insert below first line of node being documented, e.g.,

				```python
				class Foo: # <- this's being documented, so the node to document is the whole class; the docstring must be the line below `class Foo:`

					def bar():
						pass
				```

			*/

			const linesInRange = document.getText(range).split('\n').filter(s => s !== '').map(s => s.trim());
			const linesInOriginalRange = new Set(linesInRange);

			replyInterpreter = new InlineReplyInterpreter(
				this.context.document.uri,
				projectedDoc,
				this.context.fileIndentInfo,
				LeadingMarkdownStreaming.Mute,
				EarlyStopping.StopAfterFirstCodeBlock,
				(lineFilter, streamingWorkingCopyDocument) => new InsertionStreamingEdits(
					streamingWorkingCopyDocument,
					range.start,
					lineFilter,
				),
				TextPieceClassifiers.createCodeBlockClassifier(),
				(line) =>
					!line.value.includes('FILEPATH') /* @ulugbekna: this's to remove marker lines if any */ &&
					!linesInOriginalRange.has(line.value.trim()) /* @ulugbekna: this's to prevent repeating of existing code */,
			);
		} else {
			replyInterpreter = new InlineReplyInterpreter(
				this.context.document.uri,
				projectedDoc,
				this.context.fileIndentInfo,
				LeadingMarkdownStreaming.Mute,
				EarlyStopping.StopAfterFirstCodeBlock,
				(lineFilter, streamingWorkingCopyDocument) => new InsertOrReplaceStreamingEdits(
					streamingWorkingCopyDocument,
					range,
					range,
					EditStrategy.FallbackToInsertAboveRange,
					false,
					lineFilter
				),
				TextPieceClassifiers.createCodeBlockClassifier(),
				(line) => !line.value.includes('FILEPATH')
			);
		}

		return replyInterpreter.processResponse(context, inputStream, outputStream, token);
	}
}

type Props = {
	userQuery: string;
	history: readonly Turn[];
	chatVariables: ChatVariablesCollection;
	promptContext: IBuildPromptContext;
} & DefinitionAroundCursorProps;

class DocPrompt extends PromptElement<Props> {
	override render(state: void, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		const language = languageIdToMDCodeBlockLang(this.props.documentContext.language.languageId);

		const rewrittenMessage = this.props.chatVariables.substituteVariablesWithReferences(this.props.userQuery);

		const query = `${this.getQueryPrefix()} ${rewrittenMessage}`.trim();

		return (
			<>
				<SystemMessage>
					You are an AI programming assistant.<br />
					When asked for your name, you must respond with "GitHub Copilot".<br />
					You must follow user's requirements carefully.<br />
					You must follow Microsoft content policies.<br />
					You must avoid content that violates copyrights.<br />
					For questions not related to software development, you should give a reminder that you are an AI programming assistant.<br />
				</SystemMessage>
				<ChatToolReferences priority={750} promptContext={this.props.promptContext} flexGrow={1} embeddedInsideUserMessage={false} />
				<ChatVariables chatVariables={this.props.chatVariables} embeddedInsideUserMessage={false} />
				<DefinitionAroundCursor
					documentContext={this.props.documentContext}
					nodeToDocument={this.props.nodeToDocument}
					endpointInfo={this.props.endpointInfo} />
				<HistoryWithInstructions inline={true} history={this.props.history} passPriority historyPriority={700}>
					<InstructionMessage>
						When user asks you to document something, you must answer in the form of a {language} markdown code block.<br />
					</InstructionMessage>
				</HistoryWithInstructions>
				<UserMessage>
					{query}
				</UserMessage>
			</>
		);
	}

	private getQueryPrefix(): string {

		const identifier = this.props.nodeToDocument?.identifier;
		const hasIdentifier = identifier !== undefined && identifier !== '';
		const docCommentTarget = hasIdentifier ? identifier : 'the selection';

		let docName: string;
		switch (this.props.documentContext.language.languageId) {
			case 'typescript':
			case 'typescriptreact':
				docName = (hasIdentifier ? 'a TSDoc comment' : 'TSDoc comment');
				break;
			case 'javascript':
			case 'javascriptreact':
				docName = (hasIdentifier ? 'a JSDoc comment' : 'JSDoc comment');
				break;
			case 'python':
				docName = 'docstring';
				break;
			default: // TODO@ulugbekna: add more languages based on tree-sitter parsers we have
				docName = 'documentation comment';
		}

		return `Please, given ${docCommentTarget}, generate ${docName} only. Do not repeat given code, only reply with ${docName} in a code block.`;
	}
}
