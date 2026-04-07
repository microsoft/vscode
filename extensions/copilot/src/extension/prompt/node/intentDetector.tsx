/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptElementProps, PromptMetadata, Raw, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import type { CancellationToken, ChatContext, ChatParticipantDetectionProvider, ChatParticipantDetectionResult, ChatParticipantMetadata, ChatRequest, Uri, ChatLocation as VscodeChatLocation } from 'vscode';
import { CHAT_PARTICIPANT_ID_PREFIX, editingSessionAgentEditorName, getChatParticipantIdFromName } from '../../../platform/chat/common/chatAgents';
import { ChatFetchResponseType, ChatLocation, ChatResponse } from '../../../platform/chat/common/commonTypes';
import { getTextPart, roleToString } from '../../../platform/chat/common/globalStringUtils';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { ILogService } from '../../../platform/log/common/logService';
import { ITabsAndEditorsService } from '../../../platform/tabs/common/tabsAndEditorsService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { isNotebookCellOrNotebookChatInput } from '../../../util/common/notebooks';
import { isFalsyOrEmpty } from '../../../util/vs/base/common/arrays';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Position, Range } from '../../../vscodeTypes';
import { getAgentForIntent, GITHUB_PLATFORM_AGENT, Intent } from '../../common/constants';
import { IIntentService } from '../../intents/node/intentService';
import { UnknownIntent } from '../../intents/node/unknownIntent';
import { InstructionMessage } from '../../prompts/node/base/instructionMessage';
import { PromptRenderer, renderPromptElement } from '../../prompts/node/base/promptRenderer';
import { ChatVariablesAndQuery } from '../../prompts/node/panel/chatVariables';
import { ConversationHistory, HistoryWithInstructions } from '../../prompts/node/panel/conversationHistory';
import { CurrentSelection } from '../../prompts/node/panel/currentSelection';
import { CodeBlock } from '../../prompts/node/panel/safeElements';
import { getToolName } from '../../tools/common/toolNames';
import { CodebaseTool } from '../../tools/node/codebaseTool';
import { ChatVariablesCollection } from '../common/chatVariablesCollection';
import { Turn } from '../common/conversation';
import { addHistoryToConversation } from './chatParticipantRequestHandler';
import { IDocumentContext } from './documentContext';
import { IIntent } from './intents';
import { ConversationalBaseTelemetryData } from './telemetry';

export class IntentDetector implements ChatParticipantDetectionProvider {

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IIntentService private readonly intentService: IIntentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITabsAndEditorsService private readonly tabsAndEditorsService: ITabsAndEditorsService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
	) { }

	async provideParticipantDetection(chatRequest: ChatRequest, context: ChatContext, options: { participants?: ChatParticipantMetadata[]; location: VscodeChatLocation }, token: CancellationToken): Promise<ChatParticipantDetectionResult | null | undefined> {
		if ((options.location !== ChatLocation.Panel && options.location !== ChatLocation.Editor) || this.configurationService.getNonExtensionConfig('chat.detectParticipant.enabled') === false) {
			return;
		}

		const selectedEndpoint = await this.endpointProvider.getChatEndpoint(chatRequest);
		// Disable intent detection if the user is requesting their request be completed with o1 since o1 has such a low RPS the cost of an incorrect intent is high
		if (selectedEndpoint.family.startsWith('o1')) {
			return;
		}

		const chatVariables = new ChatVariablesCollection(chatRequest.references);
		const { turns } = this.instantiationService.invokeFunction(accessor => addHistoryToConversation(accessor, context.history));
		let detectedIntentId: string | ChatParticipantDetectionResult | undefined;
		const shouldIncludeGitHub = (chatRequest.toolReferences.length === 0);
		const builtinParticipants = options.participants?.filter(p => ((p.participant === GITHUB_PLATFORM_AGENT && shouldIncludeGitHub) || p.participant.startsWith(CHAT_PARTICIPANT_ID_PREFIX)) && p.disambiguation.length) ?? [];
		const thirdPartyParticipants = options.participants?.filter(p => p.participant !== GITHUB_PLATFORM_AGENT && !p.participant.startsWith(CHAT_PARTICIPANT_ID_PREFIX) && p.disambiguation.length) ?? [];

		try {

			const detectedIntent = await this.detectIntent(
				options.location,
				IDocumentContext.inferDocumentContext(chatRequest, this.tabsAndEditorsService.activeTextEditor, turns),
				chatRequest.prompt,
				token,
				undefined,
				chatVariables,
				builtinParticipants,
				undefined,
				turns,
			);


			if (detectedIntent && 'participant' in detectedIntent) {
				if (detectedIntent.participant === getChatParticipantIdFromName('workspace')) {
					if (chatRequest.toolReferences.find((ref) => getToolName(ref.name) === CodebaseTool.toolName)) {
						return undefined;
					}

					if (this.configurationService.getExperimentBasedConfig<boolean>(ConfigKey.TeamInternal.AskAgent, this.experimentationService)
						&& chatRequest.model.capabilities.supportsToolCalling) {
						return undefined;
					}
				}

				detectedIntentId = detectedIntent;
				return detectedIntent;
			} else if (detectedIntent) {
				detectedIntentId = detectedIntent.id;
				const agent = getAgentForIntent(detectedIntent.id as Intent, options.location);

				if (agent) {
					const overrideCommand = agent.agent === Intent.Editor && (agent.command === Intent.Edit || agent.command === Intent.Generate) ? undefined : agent.command;

					return {
						participant: getChatParticipantIdFromName(agent.agent),
						command: overrideCommand,
					};
				}
			} else if (thirdPartyParticipants.length && options.location === ChatLocation.Panel) {
				// If the detected intent is `unknown` and we have 3P participants, try picking from them instead
				const detectedIntent = await this.detectIntent(
					options.location,
					undefined,
					chatRequest.prompt,
					token,
					undefined,
					new ChatVariablesCollection(chatRequest.references),
					builtinParticipants,
					thirdPartyParticipants,
					turns,
				);

				if (detectedIntent && 'participant' in detectedIntent) {
					detectedIntentId = detectedIntent;
					return detectedIntent;
				}
			}
		} finally {
			if (detectedIntentId) {
				// Collect telemetry based on the full unfiltered history, rather than when the request handler is invoked (at which point the conversation history is already scoped)
				const doc = this.tabsAndEditorsService.activeTextEditor?.document;
				const docSnapshot = doc ? TextDocumentSnapshot.create(doc) : undefined;
				this.collectIntentDetectionContextInternal(
					chatRequest.prompt,
					detectedIntentId,
					chatVariables,
					options.location,
					turns.slice(0, -1),
					docSnapshot
				);
			}
		}
	}

	private async getPreferredIntent(location: ChatLocation, documentContext: IDocumentContext | undefined, history?: readonly Turn[], messageText?: string) {
		let preferredIntent: Intent | undefined;
		if (location === ChatLocation.Editor && documentContext && !history?.length) {
			if (documentContext.selection.isEmpty && documentContext.document.lineAt(documentContext.selection.start.line).text.trim() === '') {
				preferredIntent = Intent.Generate;
			} else if (!documentContext.selection.isEmpty && documentContext.selection.start.line !== documentContext.selection.end.line) {
				preferredIntent = Intent.Edit;
			}
		}
		// /fixTestFailure was removed, delegate to /fix if there are historical usages of it.
		if (messageText?.trimStart().startsWith('/fixTestFailure')) {
			preferredIntent = Intent.Fix;
		}

		return preferredIntent;
	}

	/**
	 * @param preferredIntent tells the model that this intent is the most likely the developer wants.
	 * @param currentFilePath file path relative to the workspace root and will be mentioned in the prompt if present
	 * @param isRerunWithoutIntentDetection for telemetry purposes -- if `undefined`, then intent detection is invoked either from inline chat of an older vscode or from panel chat
	 */
	async detectIntent(
		location: ChatLocation,
		documentContext: IDocumentContext | undefined,
		messageText: string,
		token: CancellationToken,
		baseUserTelemetry: ConversationalBaseTelemetryData | undefined,
		chatVariables: ChatVariablesCollection,
		builtinParticipants: ChatParticipantMetadata[],
		thirdPartyParticipants?: ChatParticipantMetadata[],
		history?: readonly Turn[],
	): Promise<IIntent | ChatParticipantDetectionResult | undefined> {

		this.logService.trace('Building intent detector');

		if (builtinParticipants.length === 0 && (isFalsyOrEmpty(thirdPartyParticipants))) {
			this.logService.trace('No participants available for intent detection');
			return undefined;
		}

		const endpoint = await this.endpointProvider.getChatEndpoint('copilot-fast');

		const preferredIntent = await this.getPreferredIntent(location, documentContext, history, messageText);

		const promptRenderer = PromptRenderer.create(
			this.instantiationService,
			endpoint,
			(location === ChatLocation.Editor
				? IntentDetectionPrompt
				: GPT4OIntentDetectionPrompt),
			{
				preferredIntent,
				location,
				userQuestion: messageText,
				documentContext,
				history,
				chatVariables,
				builtinParticipants: builtinParticipants,
				thirdPartyParticipants: thirdPartyParticipants,
			}
		);

		const { messages, metadata } = await promptRenderer.render(undefined, token);
		this.logService.trace('Built intent detector');

		const fetchResult = await endpoint.makeChatRequest(
			'intentDetection',
			messages,
			undefined,
			token,
			location,
			undefined,
			{
				stop: [';'],
				max_tokens: 20
			}
		);
		const intent = this.validateResult(fetchResult, baseUserTelemetry, messageText, location, preferredIntent, thirdPartyParticipants ? thirdPartyParticipants : builtinParticipants, documentContext);
		const chosenIntent = intent && 'id' in intent ? intent?.id : intent?.participant;

		this.sendTelemetry(
			preferredIntent,
			chosenIntent,
			documentContext?.language.languageId,
			undefined,
			location
		);

		const fileMetadata = metadata.get(DocumentExcerptInfo);

		this.sendInternalTelemetry(
			messageText,
			preferredIntent,
			fileMetadata?.filePath,
			fileMetadata?.fileExcerpt,
			chosenIntent,
			documentContext?.language.languageId,
			undefined,
			messages.slice(0, -1),
			location
		);

		return intent;
	}

	async collectIntentDetectionContextInternal(
		userQuery: string,
		assignedIntent: string | ChatParticipantDetectionResult,
		chatVariables: ChatVariablesCollection,
		location: ChatLocation,
		history: Turn[] = [],
		document?: TextDocumentSnapshot
	) {
		const endpoint = await this.endpointProvider.getChatEndpoint('copilot-fast');

		const { messages: currentSelection } = await renderPromptElement(this.instantiationService, endpoint, CurrentSelection, { document });
		const { messages: conversationHistory } = await renderPromptElement(this.instantiationService, endpoint, ConversationHistory, { history, priority: 1000 }, undefined, undefined).catch(() => ({ messages: [] }));

		const { history: historyMessages, fileExcerpt, attachedContext, fileExcerptExceedsBudget } = this.prepareInternalTelemetryContext(getTextPart(currentSelection?.[0]?.content), conversationHistory, chatVariables);

		this.telemetryService.sendInternalMSFTTelemetryEvent(
			'participantDetectionContext',
			{
				chatLocation: ChatLocation.toString(location),
				userQuery,
				history: historyMessages.join(''),
				assignedIntent: typeof assignedIntent === 'string' ? assignedIntent : undefined,
				assignedThirdPartyChatParticipant: typeof assignedIntent !== 'string' ? assignedIntent.participant : undefined,
				assignedThirdPartyChatCommand: typeof assignedIntent !== 'string' ? assignedIntent.command : undefined,
				fileExcerpt: fileExcerpt ?? (fileExcerptExceedsBudget ? '<truncated>' : '<none>'),
				attachedContext: attachedContext.join(';')
			},
			{}
		);
	}

	private validateResult(
		fetchResult: ChatResponse,
		baseUserTelemetry: ConversationalBaseTelemetryData | undefined,
		messageText: string,
		location: ChatLocation,
		preferredIntent?: Intent,
		participants?: ChatParticipantMetadata[],
		documentContext?: IDocumentContext | undefined,
	): IIntent | ChatParticipantDetectionResult | undefined {

		if (fetchResult.type !== ChatFetchResponseType.Success) {
			if (baseUserTelemetry) {
				this.sendPromptIntentErrorTelemetry(baseUserTelemetry, fetchResult);
			}
			return undefined;
		}

		let cleanedIntentResponses = [fetchResult.value].map(intentResponse =>
			intentResponse
				.trimStart()
				.split('\n')[0]
				.replaceAll('```', '')
				.replace(/function id:|response:/i, '')
				.trim());

		cleanedIntentResponses = cleanedIntentResponses.filter(i => i !== UnknownIntent.ID);
		if (!cleanedIntentResponses.length && preferredIntent) {
			cleanedIntentResponses = [preferredIntent];
		}

		// Dynamic chat participants
		if ((cleanedIntentResponses[0] === 'github_questions') && participants?.find(p => p.participant === GITHUB_PLATFORM_AGENT)) {
			return { participant: GITHUB_PLATFORM_AGENT };
		}

		const categoryNamesToParticipants = participants?.reduce<{ [categoryName: string]: { participant: string; command?: string } }>((acc, participant) => {
			participant.disambiguation.forEach((alias) => {
				acc[alias.category] = { participant: participant.participant, command: participant.command };
			});
			return acc;
		}, {});

		let intent = cleanedIntentResponses
			.map(r => this.intentService.getIntent(r, location) ?? categoryNamesToParticipants?.[r])
			.filter((s): s is (IIntent | { participant: string; command?: string }) => s !== undefined)?.[0];

		const chosenIntent = intent && 'id' in intent ? intent?.id : intent?.participant;

		this.logService.debug(`picked intent "${chosenIntent}" from ${JSON.stringify(fetchResult.value, null, '\t')}`);

		// override /edit in inline chat based on the document context
		if (location === ChatLocation.Editor
			&& chosenIntent === Intent.Edit
			&& documentContext
			&& documentContext.selection.isEmpty
			&& documentContext.document.lineAt(documentContext.selection.start.line).text.trim() === ''
		) {
			// the selection is empty and sits on a whitespace only line, we will always detect generate instead of edit
			const editIntent = this.intentService.getIntent(Intent.Generate, ChatLocation.Editor);
			if (editIntent) {
				intent = editIntent;
			}
		}

		if (location === ChatLocation.Editor
			&& !this.configurationService.getNonExtensionConfig('inlineChat.enableV2')
			&& chosenIntent !== Intent.InlineChat
		) {
			return {
				command: chosenIntent,
				participant: getChatParticipantIdFromName(editingSessionAgentEditorName)
			};
		}

		if (baseUserTelemetry) {
			const promptTelemetryData = baseUserTelemetry.extendedBy({
				messageText,
				promptContext: cleanedIntentResponses.join(),
				intent: chosenIntent || 'unknown',
			});
			this.telemetryService.sendEnhancedGHTelemetryEvent('conversation.promptIntent', promptTelemetryData.raw.properties, promptTelemetryData.raw.measurements);
		}
		return intent;
	}

	private sendPromptIntentErrorTelemetry(
		baseUserTelemetry: ConversationalBaseTelemetryData,
		fetchResult: { type: string; reason: string; requestId: string }
	) {
		const telemetryErrorData = baseUserTelemetry.extendedBy({
			resultType: fetchResult.type,
			reason: fetchResult.reason,
		});
		this.telemetryService.sendEnhancedGHTelemetryErrorEvent('conversation.promptIntentError', telemetryErrorData.raw.properties, telemetryErrorData.raw.measurements);
	}

	private sendTelemetry(
		preferredIntent: Intent | undefined,
		detectedIntent: string | undefined,
		languageId: string | undefined,
		isRerunWithoutIntentDetection: boolean | undefined,
		location: ChatLocation
	) {
		/* __GDPR__
			"intentDetection" : {
				"owner": "ulugbekna",
				"comment": "Intent detection telemetry.",
				"chatLocation": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Which chat (panel or inline) intent detection is used for." },
				"preferredIntent": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Which intent was initially provided as preferred." },
				"detectedIntent": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Intent that was detected by Copilot" },
				"languageId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Language ID of the document for which intent detection happened." },
				"isRerunWithoutIntentDetection": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the user disliked the detected intent and tried to rerun without it." }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent(
			'intentDetection',
			{
				chatLocation: ChatLocation.toString(location),
				preferredIntent: preferredIntent ?? '<none>',
				detectedIntent: detectedIntent ?? '<none>',
				languageId: languageId ?? '<none>',
				isRerunWithoutIntentDetection: String(isRerunWithoutIntentDetection) ?? '<none>',
			}
		);
	}

	private prepareInternalTelemetryContext(fileExcerpt: string | undefined, historyMessages: Raw.ChatMessage[], attachedContext?: ChatVariablesCollection) {

		// Single internal telemetry size must be less than 8KB
		// Be conservative and set the budget to 5KB to account for other properties
		let telemetryBudget = 5000;

		const names: string[] = [];
		if (attachedContext) {
			for (const attachment of attachedContext) {
				const nameLength = Buffer.byteLength(attachment.uniqueName, 'utf8');
				if (telemetryBudget - nameLength < 0) {
					break;
				}
				telemetryBudget -= nameLength;
				names.push(attachment.uniqueName);
			}
		}

		let fileExcerptExceedsBudget = false;
		if (fileExcerpt) {
			const fileExcerptSize = Buffer.byteLength(fileExcerpt, 'utf8');
			if (fileExcerptSize > telemetryBudget) {
				fileExcerptExceedsBudget = true;
				fileExcerpt = undefined;
			} else {
				telemetryBudget -= fileExcerptSize;
			}
		} else {
			fileExcerpt = undefined;
		}

		const history: string[] = [];
		for (let i = historyMessages.length - 1; i >= 0; i -= 1) {
			const message = historyMessages[i];
			const text = `${roleToString(message.role).toUpperCase()}: ${message.content}\n\n`;
			const textLength = Buffer.byteLength(text, 'utf8');
			if (telemetryBudget - textLength < 0) {
				break;
			}
			history.push(text);
			telemetryBudget -= textLength;
		}

		return { fileExcerpt, fileExcerptExceedsBudget, history: history.reverse(), attachedContext: names };
	}

	private sendInternalTelemetry(
		request: string,
		preferredIntent: Intent | undefined,
		currentFilePath: string | undefined,
		fileExerpt: string | undefined,
		detectedIntent: string | undefined,
		languageId: string | undefined,
		isRerunWithoutIntentDetection: boolean | undefined,
		historyMessages: Raw.ChatMessage[],
		location: ChatLocation
	) {
		const { fileExcerpt, history } = this.prepareInternalTelemetryContext(fileExerpt, historyMessages);

		this.telemetryService.sendInternalMSFTTelemetryEvent(
			'intentDetection',
			{
				chatLocation: ChatLocation.toString(location),
				request,
				preferredIntent: preferredIntent ?? '<none>',
				filePath: currentFilePath ?? '<none>',
				fileExerpt: fileExcerpt ?? '<none>',
				detectedIntent: detectedIntent ?? '<none>',
				languageId: languageId ?? '<none>',
				isRerunWithoutIntentDetection: String(isRerunWithoutIntentDetection) ?? '<none>',
				history: history.join('')
			},
			{}
		);
	}
}

class DocumentExcerptInfo extends PromptMetadata {
	constructor(
		readonly fileExcerpt: string | undefined,
		readonly filePath: string | undefined,
	) {
		super();
	}
}

type IntentDetectionPromptProps = PromptElementProps<{
	history?: readonly Turn[];
	preferredIntent: Intent | undefined;
	location: ChatLocation;
	userQuestion: string;
	documentContext: IDocumentContext | undefined;
	chatVariables: ChatVariablesCollection;
	builtinParticipants: ChatParticipantMetadata[];
	thirdPartyParticipants?: ChatParticipantMetadata[];
}>;

class IntentDetectionPrompt extends PromptElement<IntentDetectionPromptProps> {

	constructor(
		props: IntentDetectionPromptProps,
		@IIgnoreService protected readonly _ignoreService: IIgnoreService,
		@IConfigurationService protected readonly _configurationService: IConfigurationService,
		@IIntentService protected readonly _intentService: IIntentService,
	) {
		super(props);
	}

	async render() {
		let {
			builtinParticipants,
			preferredIntent,
			userQuestion,
			documentContext,
		} = this.props;

		let currentFileUri: Uri | undefined;
		let currentFileContext: string | undefined;
		let fileExcerptCodeBlock: CodeBlock | undefined;
		try {
			if (documentContext !== undefined && !(await this._ignoreService.isCopilotIgnored(documentContext.document.uri))) {

				const { document, selection } = documentContext;

				currentFileUri = document.uri;
				const range = new Range(
					new Position(Math.max(selection.start.line - 5, 0), 0),
					new Position(Math.min(selection.end.line + 5, document.lineCount), document.lineAt(selection.end.line).text.length),
				);
				currentFileContext = document.getText(range);
				fileExcerptCodeBlock = currentFileContext.trim().length > 0 ? <CodeBlock uri={currentFileUri} languageId={document.languageId} code={currentFileContext} shouldTrim={false} /> : undefined;
			}
		} catch (_e) { }

		const fileMetadata = new DocumentExcerptInfo(currentFileContext, currentFileUri?.path);

		if (documentContext !== undefined && isNotebookCellOrNotebookChatInput(documentContext.document.uri)) {
			builtinParticipants = builtinParticipants.filter((participant) => participant.command !== 'tests');
		}


		function commands(participant: ChatParticipantMetadata[]) {
			const seen = new Set<string>();

			const a = participant.flatMap((p) => p.disambiguation);

			return a.filter(value => {
				if (seen.has(value.category)) {
					return false;
				}
				seen.add(value.category);
				return true;
			});
		}

		return (
			<>
				<meta value={fileMetadata} />
				<SystemMessage>
					When asked for your name, you must respond with "GitHub Copilot".<br />
					Follow the user's requirements carefully & to the letter.<br />
				</SystemMessage>
				<UserMessage>
					A software developer is using an AI chatbot in a code editor{currentFileUri && ` in file ${currentFileUri.path}`}.<br />
					{fileExcerptCodeBlock === undefined
						? <br />
						: <>
							Current active file contains following excerpt:<br />
							{fileExcerptCodeBlock}<br />
						</>}
					The developer added the following request to the chat and your goal is to select a function to perform the request.<br />
					{preferredIntent && `The developer probably wants Function Id '${preferredIntent}', pick different only if you're certain.`}<br />
					Request: {userQuestion}<br />
					<br />
					Available functions:<br />
					{commands(builtinParticipants).map((alias) =>
						<>
							Function Id: {alias.category}<br />
							Function Description: {alias.description}<br />
							<br />
						</>
					)}
					<br />
					Here are some examples to make the instructions clearer:<br />
					{commands(builtinParticipants).map((alias) =>
						<>
							Request: {alias.examples[0]}<br />
							Response: {alias.category}<br />
							<br />
						</>)
					}
					Request: {userQuestion}<br />
					Response:
				</UserMessage>
			</>
		);
	}


}

interface BuiltinParticipantDescriptionsProps extends BasePromptElementProps {
	includeDynamicParticipants: boolean;
	participants: ChatParticipantMetadata[];
}

class ParticipantDescriptions extends PromptElement<BuiltinParticipantDescriptionsProps> {
	override render() {
		return (<>
			{this.props.participants.flatMap((p) => {
				return p.disambiguation.map((alias) => {
					return (
						<>
							| {alias.category ?? (alias as any).categoryName} | {alias.description} | {alias.examples.length ? alias.examples.map(example => `"${example}"`).join(', ') : '--'} |<br />
						</>
					);
				});
			})}
			{this.props.includeDynamicParticipants && <>| github_questions | The user is asking about an issue, pull request, branch, commit hash, diff, discussion, repository, or published release on GitHub.com.  This category does not include performing local Git operations using the CLI. | "What has been changed in the pull request 1361 in browserify/browserify repo?" |<br /></>}
			{this.props.includeDynamicParticipants && <>| web_questions | The user is asking a question that requires current knowledge from a web search engine. Such questions often reference time periods that exceed your knowledge cutoff. | "What is the latest LTS version of Node.js?" |<br /></>}
			| unknown | The user's question does not fit exactly one of the categories above, is about a product other than Visual Studio Code or GitHub, or is a general question about code, code errors, or software engineering. | "How do I center a div in CSS?" |<br /></>);
	}
}

export class GPT4OIntentDetectionPrompt extends IntentDetectionPrompt {

	override render() {
		const { history, chatVariables, userQuestion } = this.props;

		return (<>
			<HistoryWithInstructions history={history || []} passPriority historyPriority={800}>
				<InstructionMessage>
					You are a helpful AI programming assistant to a user who is a software engineer, acting on behalf of the Visual Studio Code editor. Your task is to choose one category from the Markdown table of categories below that matches the user's question. Carefully review the user's question, any previous messages, and any provided context such as code snippets. Respond with just the category name. Your chosen category will help Visual Studio Code provide the user with a higher-quality response, and choosing incorrectly will degrade the user's experience of using Visual Studio Code, so you must choose wisely. If you cannot choose just one category, or if none of the categories seem like they would provide the user with a better result, you must always respond with "unknown".<br />
					<br />
					| Category name | Category description | Example of matching question |<br />
					| -- | -- | -- |<br />
					<ParticipantDescriptions participants={this.props.thirdPartyParticipants ? this.props.thirdPartyParticipants : this.props.builtinParticipants} includeDynamicParticipants={!this.props.thirdPartyParticipants} />
				</InstructionMessage>
			</HistoryWithInstructions>
			{<ChatVariablesAndQuery query={userQuestion} chatVariables={chatVariables} priority={900} embeddedInsideUserMessage={false} />}
		</>
		);
	}
}
