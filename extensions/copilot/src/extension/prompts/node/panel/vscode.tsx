/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, SystemMessage, TextChunk, UserMessage } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { ChatFetchResponseType, ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { EmbeddingType, IEmbeddingsComputer } from '../../../../platform/embeddings/common/embeddingsComputer';
import { CommandListItem, ICombinedEmbeddingIndex, SettingListItem, settingItemToContext } from '../../../../platform/embeddings/common/vscodeIndex';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { IEnvService } from '../../../../platform/env/common/envService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { IReleaseNotesService } from '../../../../platform/releaseNotes/common/releaseNotesService';
import { reportProgressOnSlowPromise } from '../../../../util/common/progress';
import { sanitizeVSCodeVersion } from '../../../../util/common/vscodeVersion';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseProgressPart } from '../../../../vscodeTypes';
import { Turn } from '../../../prompt/common/conversation';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { ToolName } from '../../../tools/common/toolNames';
import { CopilotIdentityRules } from '../base/copilotIdentity';
import { InstructionMessage } from '../base/instructionMessage';
import { PromptRenderer } from '../base/promptRenderer';
import { ResponseTranslationRules } from '../base/responseTranslationRules';
import { SafetyRules } from '../base/safetyRules';
import { Tag } from '../base/tag';
import { ChatToolReferences, ChatVariablesAndQuery } from './chatVariables';
import { ConversationHistoryWithTools, HistoryWithInstructions } from './conversationHistory';
import { ChatToolCalls } from './toolCalling';
import { UnsafeCodeBlock } from './unsafeElements';

export interface VscodePromptProps extends BasePromptElementProps {
	promptContext: IBuildPromptContext;
	endpoint: IChatEndpoint;
}

export interface VscodePromptState {
	settings: SettingListItem[];
	commands: CommandListItem[];
	query: string;
	releaseNotes?: { version: string; notes: string }[];
	currentVersion?: string;
}

export class VscodePrompt extends PromptElement<VscodePromptProps, VscodePromptState> {

	constructor(props: VscodePromptProps,
		@ILogService private readonly logService: ILogService,
		@IEmbeddingsComputer private readonly embeddingsComputer: IEmbeddingsComputer,
		@IEndpointProvider private readonly endPointProvider: IEndpointProvider,
		@ICombinedEmbeddingIndex private readonly combinedEmbeddingIndex: ICombinedEmbeddingIndex,
		@IEnvService private readonly envService: IEnvService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IReleaseNotesService private readonly releaseNotesService: IReleaseNotesService,
	) {
		super(props);
	}

	override async prepare(sizing: PromptSizing, progress: vscode.Progress<vscode.ChatResponseProgressPart> | undefined, token: vscode.CancellationToken): Promise<VscodePromptState> {
		if (!this.props.promptContext.query) {
			return { settings: [], commands: [], query: '' };
		}

		progress?.report(new ChatResponseProgressPart(l10n.t('Refining question to improve search accuracy.')));
		let userQuery: string = this.props.promptContext.query;

		const endpoint = await this.endPointProvider.getChatEndpoint('copilot-fast');
		const renderer = PromptRenderer.create(this.instantiationService, endpoint, VscodeMetaPrompt, this.props.promptContext);
		const { messages } = await renderer.render();
		if (token.isCancellationRequested) {
			return { settings: [], commands: [], query: userQuery };
		}

		this.logService.debug('[VSCode Prompt] Asking the model to update the user question.');

		const fetchResult = await endpoint.makeChatRequest(
			'vscodePrompt',
			messages,
			async (_) => void 0,
			token,
			ChatLocation.Panel,
			undefined,
			{
				temperature: 0,
			},
		);

		if (token.isCancellationRequested) {
			return { settings: [], commands: [], query: userQuery };
		}

		let fetchReleaseNotes = false;
		let shouldIncludeDocsSearch = false;
		let extensionSearch = false;
		let vscodeApiSearch = false;
		if (fetchResult.type === ChatFetchResponseType.Success) {
			userQuery = parseMetaPromptResponse(this.props.promptContext.query, fetchResult.value);
			shouldIncludeDocsSearch = fetchResult.value.includes('Other Question');
			fetchReleaseNotes = fetchResult.value.includes('release_notes');
			extensionSearch = fetchResult.value.includes('vscode_extensions');
			vscodeApiSearch = fetchResult.value.includes('vscode_api');
		} else {
			this.logService.error(`[VSCode Prompt] Failed to refine the question: ${fetchResult.requestId}`);
		}

		const currentSanitized = sanitizeVSCodeVersion(this.envService.getEditorInfo().version); // major.minor
		if (fetchReleaseNotes) {
			// Determine which versions to fetch based on meta response
			const rnMatch = fetchResult.type === ChatFetchResponseType.Success ? fetchResult.value.match(/release_notes(?:@(?<spec>[A-Za-z0-9._-]+))?/i) : undefined;
			const spec = rnMatch?.groups?.['spec']?.toLowerCase();

			let versionsToFetch: string[];
			if (spec === 'last3') {
				versionsToFetch = getLastNMinorVersions(currentSanitized, 3);
			} else {
				versionsToFetch = [currentSanitized];
			}

			const notes = await Promise.all(versionsToFetch.map(async (ver) => {
				const text = await this.releaseNotesService.fetchReleaseNotesForVersion(ver);
				return text ? { version: ver, notes: text } : undefined;
			}));

			const filtered = notes.filter((n): n is { version: string; notes: string } => !!n);
			return { settings: [], commands: [], releaseNotes: filtered, query: this.props.promptContext.query, currentVersion: currentSanitized };
		}

		if (extensionSearch || vscodeApiSearch) {
			return { settings: [], commands: [], query: this.props.promptContext.query };
		}

		if (token.isCancellationRequested) {
			return { settings: [], commands: [], query: userQuery };
		}

		const embeddingResult = await this.embeddingsComputer.computeEmbeddings(EmbeddingType.text3small_512, [userQuery], {}, undefined);
		if (token.isCancellationRequested) {
			return { settings: [], commands: [], query: userQuery };
		}

		const nClosestValuesPromise = progress
			? reportProgressOnSlowPromise(progress, new ChatResponseProgressPart(l10n.t("Searching command and setting index....")), this.combinedEmbeddingIndex.nClosestValues(embeddingResult.values[0], shouldIncludeDocsSearch ? 5 : 25), 500)
			: this.combinedEmbeddingIndex.nClosestValues(embeddingResult.values[0], shouldIncludeDocsSearch ? 5 : 25);

		const results = await Promise.allSettled([
			nClosestValuesPromise,
		]);

		const embeddingResults = results[0].status === 'fulfilled' ? results[0].value : { commands: [], settings: [] };

		return { settings: embeddingResults.settings, commands: embeddingResults.commands, query: userQuery, currentVersion: currentSanitized };
	}

	override render(state: VscodePromptState) {
		const operatingSystem = this.envService.OS;
		return (
			<>
				<SystemMessage priority={1000}>
					You are a Visual Studio Code assistant. Your job is to assist users in using Visual Studio Code by providing knowledge to accomplish their task. This knowledge should focus on settings, commands, keybindings but also includes documentation. <br />
					{state.query.length < 1 && <>
						If the user does not include a question, respond with: I am your Visual Studio Code assistant. I can help you with settings, commands, keybindings, extensions, and documentation. Ask me anything about using or configuring Visual Studio Code.<br />
					</>}
					<CopilotIdentityRules />
					<SafetyRules />
					<InstructionMessage>
						Additional Rules<br />
						If a command or setting references another command or setting, you must respond with both the original and the referenced commands or settings.<br />
						Prefer a setting over a command if the user's request can be achieved by a setting change.<br />
						If answering with a keybinding, please still include the command bound to the keybinding.<br />
						If a keybinding contains a backtick you must escape it. For example the keybinding Ctrl + backtick would be written as ``ctrl + ` ``<br />
						If you believe the context given to you is incorrect or not relevant you may ignore it.<br />
						Always respond with a numbered list of steps to be taken to achieve the desired outcome if multiple steps are necessary.<br />
						If an extension might help the user, you may suggest a search query for the extension marketplace. You must also include the command **Search marketplace** (`workbench.extensions.search`) with args set to the suggested query in the commands section at the end of your response. The query can also contain the tags "@popular", "@recommended", or "@featured" to filter the results.<br />
						The user is working on a {operatingSystem} machine. Please respond with system specific commands if applicable.<br />
						If a command or setting is not a valid answer, but it still relates to Visual Studio Code, please still respond.<br />
						If the question is about release notes, you must also include the command **Show release notes** (`update.showCurrentReleaseNotes`) in the commands section at the end of your response.<br />
						If the response includes a command, only reference the command description in the description. Do not include the actual command in the description.<br />
						All responses for settings and commands code blocks must strictly adhere to the template shown below:<br />
						<Tag name='responseTemplate'>
							<UnsafeCodeBlock code={`
{
	"type": "array",
	"items": {
	"type": "object",
	"properties": {
	  "type": {
		"type": "string",
		"enum": ["command", "setting"]
	  },
	  "details": {
		"type": "object",
		"properties": {
		  "key": { "type": "string" },
		  "value": { "type": "string" }
		},
		"required": ["key"]
	  }
	},
	"required": ["type", "details"],
	"additionalProperties": false
	}
}
								`} languageId='json'></UnsafeCodeBlock>
							<br />
							where the `type` is either `setting`, `command`.<br />
							- `setting` is used for responding with a setting to set.<br />
							- `command` is used for responding with a command to execute<br />
							where the `details` is an optional object that contains the setting/command objects.<br />
							- `key` is the setting | command value to use .<br />
							- `value` is the setting value in case of a setting.<br />
							- `value` is the optional arguments to the command in case of a command.<br />
						</Tag>
						<Tag name='examples'>
							Below you will find a set of examples of what you should respond with. Please follow these examples as closely as possible.<br />
							<Tag name='singleSettingExample'>
								Question: How do I disable telemetry?<br />
								Response:<br />
								Use the **telemetry.telemetryLevel** setting to disable telemetry.<br />
								<UnsafeCodeBlock code={`
[
	{
		"type": "setting",
		"details": {
			"key": "telemetry.telemetryLevel",
			"value": "off"
		}
	}
]
										`} languageId='json'></UnsafeCodeBlock>
							</Tag>
							<Tag name='singleCommandExample'>
								Question: How do I open a specific walkthrough?<br />
								Use the **Welcome: Open Walkthrough...** command to open walkthroughs.<br />
								Response:<br />
								<UnsafeCodeBlock code={`
[
	{
		"type": "command",
		"details": {
			"key": "workbench.action.openWalkthrough",
		}
	}
]
										`} languageId='json'></UnsafeCodeBlock>
							</Tag>
							<Tag name='multipleSettingsExample'>
								If you are referencing multiple settings, first describe each setting and then include all settings in a single JSON markdown code block, as shown in the template below:<br />
								Question: How can I change the font size in all areas of Visual Studio Code, including the editor, terminal?<br />
								Response:<br />
								The **editor.fontsize** setting adjusts the font size within the editor.<br />
								The **terminal.integrated.fontSize** setting changes the font size in the integrated terminal.<br />
								This **window.zoomLevel** setting controls the zoom level of the entire Visual Studio Code interface.<br />
								<UnsafeCodeBlock code={`
[
	{
		"type": "setting",
		"details": {
			"key": "editor.fontSize",
			"value": "18"
		}
	},
	{
		"type": "setting",
		"details": {
			"key": "terminal.integrated.fontSize",
			"value": "14"
		}
	},
	{
		"type": "setting",
		"details": {
			"key": "window.zoomLevel",
			"value": "1"
		}
	}
]
										`} languageId='json'></UnsafeCodeBlock>
							</Tag>
							<Tag name='multipleCommandsExample'>
								If you are referencing multiple commands, do not combine all the commands into the same JSON markdown code block.<br />
								Instead, describe each command and include the JSON markdown code block in a numbered list, as shown in the template below:<br />
								Question: How can I setup a python virtual environment in Visual Studio Code?<br />
								Response:<br />
								Use the **Python: Create Environment** command to create a new python environment.<br />
								<UnsafeCodeBlock code={`
[
	{
		"type": "command",
		"details": {
			"key": "python.createEnvironment"
		}
	}
]
									`} languageId='json'></UnsafeCodeBlock>
								Select the environment type (Venv or Conda) from the list.<br />
								If creating a Venv environment, select the interpreter to use as a base for the new virtual environment.<br />
								Wait for the environment creation process to complete. A notification will show the progress.<br />
								Ensure your new environment is selected by using the **Python: Select Interpreter** command.<br />
								<UnsafeCodeBlock code={`
[
	{
		"type": "command",
		"details": {
			"key": "python.setInterpreter"
		}
	}
]
									`} languageId='json'></UnsafeCodeBlock>
							</Tag>
							<Tag name='noSuchCommandExample'>
								Question: How do I move the terminal to a new window?<br />
								Response:<br />
								There is no such command.<br />
							</Tag>
							<Tag name='invalidQuestionExample'>
								Question: How do I bake a potato?<br />
								Response:<br />
								Sorry this question isn't related to Visual Studio Code.<br />
							</Tag>
							<Tag name='marketplaceSearchExample'>
								Question: How do I add PHP support?<br />
								Response:<br />
								You can use the **Search marketplace** command to search for extensions that add PHP support.<br />
								<UnsafeCodeBlock code={`
[
	{
		"type": "command",
		"details": {
			"key": "workbench.extensions.search",
			"value": "php"
		}
	}
]
										`} languageId='json'></UnsafeCodeBlock>
								<br />
							</Tag>
						</Tag>
						<Tag name='extensionSearchResponseRules'>
							If you referene any extensions, you must respond with with the identifiers as a comma seperated string inside ```vscode-extensions code block. <br />
							Do not describe the extension. Simply return the response in the format shown above.<br />
							<Tag name='extensionResponseExample'>
								Question: What are some popular python extensions?<br />
								Response:<br />
								Here are some popular python extensions.<br />
								<UnsafeCodeBlock code={`
ms-python.python,ms-python.vscode-pylance
								`} languageId='vscode-extensions'></UnsafeCodeBlock>
							</Tag>
						</Tag>
						<ResponseTranslationRules />
					</InstructionMessage>
				</SystemMessage>
				<ConversationHistoryWithTools flexGrow={1} priority={700} promptContext={this.props.promptContext} />
				<UserMessage flexGrow={1} priority={800}>
					Use the examples above to help you formulate your response and follow the examples as closely as possible.
					Below is a list of information we found which might be relevant to the question. For view related commands "Toggle" often means Show or Hide. A setting may reference another setting, that will appear as \`#setting.id#\`, you must return the referenced setting as well. You may use this context to help you formulate your response, but are not required to.<br />
					{state.commands.length > 0 && <><Tag name='command'>
						Here are some possible commands:<br />
						{state.commands.map(c => <TextChunk>- {c.label} ("{c.key}") (Keybinding: "{c.keybinding}")</TextChunk>)}
					</Tag>
					</>}
					{state.settings.length > 0 && <><Tag name='settings'>
						Here are some possible settings:<br />
						{state.settings.map(c => <TextChunk>{settingItemToContext(c)}</TextChunk>)}
					</Tag>
					</>}
					{state.currentVersion && <><Tag name='currentVSCodeVersion'>
						Current VS Code version (major.minor): {state.currentVersion}
					</Tag><br /></>}
					{state.releaseNotes && state.releaseNotes.length > 0 && <><Tag name='releaseNotes'>
						Below are release notes which might be relevant to the question. <br />
						{state.releaseNotes.map(rn => <><TextChunk>Version {rn.version}:</TextChunk><br /><TextChunk>{rn.notes}</TextChunk></>)}
					</Tag>
					</>}
					<Tag name='vscodeAPIToolUseInstructions'>
						Always call the tool {ToolName.VSCodeAPI} to get documented references and examples when before responding to questions about VS Code Extension Development.<br />
					</Tag>
					<Tag name='searchExtensionToolUseInstructions'>
						Always call the tool 'vscode_searchExtensions_internal' to first search for extensions in the VS Code Marketplace before responding about extensions.<br />
					</Tag>
					<Tag name='vscodeCmdToolUseInstructions'>
						Call the tool {ToolName.RunVscodeCmd} to run commands in Visual Studio Code, only use as part of a new workspace creation process. <br />
						You must use the command name as the `name` field and the command ID as the `commandId` field in the tool call input with any arguments for the command in a `map` array.<br />
						For example, to run the command `workbench.action.openWith`, you would use the following input:<br />
						<UnsafeCodeBlock code={`{
						"name": "workbench.action.openWith",
						"commandId": "workbench.action.openWith",
						"args": ["file:///path/to/file.txt", "default"]
					}
					`}></UnsafeCodeBlock>
					</Tag>
				</UserMessage>
				<ChatToolReferences priority={850} flexGrow={2} promptContext={{ ...this.props.promptContext, query: state.query }} embeddedInsideUserMessage={false} />
				<ChatToolCalls priority={899} flexGrow={2} promptContext={this.props.promptContext} toolCallRounds={this.props.promptContext.toolCallRounds} toolCallResults={this.props.promptContext.toolCallResults} />
				<ChatVariablesAndQuery flexGrow={2} priority={900} chatVariables={this.props.promptContext.chatVariables} query={this.props.promptContext.query} embeddedInsideUserMessage={false} />
			</>);
	}
}

interface VscodeMetaPromptProps extends BasePromptElementProps {
	history?: readonly Turn[];
	query: string;
}

class VscodeMetaPrompt extends PromptElement<VscodeMetaPromptProps> {

	override render(state: void, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		return <>
			<SystemMessage priority={1000}>
				You are a Visual Studio Code assistant who helps the user create well-formed and unambiguous queries about their Visual Studio Code development environment.<br />
				Specifically, you help users rewrite questions about how to use Visual Studio Code's Commands and Settings.
			</SystemMessage>
			<HistoryWithInstructions historyPriority={500} passPriority history={this.props.history || []}>
				<InstructionMessage priority={1000}>
					Evaluate the question to determine the user's intent. <br />
					Determine if the user's question is about the editor, terminal, activity bar, side bar, status bar, panel or other parts of Visual Studio Code's workbench and include those keyword in the rewrite.<br />
					Determine if the user is asking about Visual Studio Code's Commands and/or Settings and explicitly include those keywords during the rewrite. <br />
					If the question does not clearly indicate whether it pertains to a command or setting, categorize it as an ‘Other Question’ <br />
					If the user is asking about Visual Studio Code Release Notes, respond using this exact protocol and do not rephrase the question: <br />
					- Respond with only one of the following: `release_notes@latest` or `release_notes@last3`.<br />
					- If the user does not specify a timeframe, respond with: `release_notes@latest`.<br />
					- If the request is vague about a timeframe (e.g., "recent changes"), respond with: `release_notes@last3` to consider the last three versions (major.minor).<br />
					- If the user asks to find or locate a specific change/feature in the release notes, respond with: `release_notes@last3` to search across the last three versions (major.minor).<br />
					If the user is asking about Extensions available in Visual Studio Code, simply respond with "vscode_extensions"<br />
					If the user is asking about Visual Studio Code API or Visual Studio Code Extension Development, simply respond with "vscode_api"<br />
					Remove any references to "What" or "How" and instead rewrite the question as a description of the command or setting that the user is trying to find. <br />
					Respond in Markdown. Under a `# Question` header, output a rephrased version of the user's question that resolves all pronouns and ambiguous words like 'this' to the specific nouns they stand for.<br />
					If it is not clear what the user is asking for or if the question appears to be unrelated to Visual Studio Code, do not try to rephrase the question and simply return the original question. <br />
					DO NOT ask the user for additional information or clarification.<br />
					DO NOT answer the user's question directly.<br />
					<br />
					# Additional Rules<br />
					<br />
					2. If the question contains pronouns such as 'it' or 'that', try to understand what the pronoun refers to by looking at the rest of the question and the conversation history.<br />
					3. If the question contains an ambiguous word such as 'this', try to understand what 'this' refers to by looking at the rest of the question and the conversation history.<br />
					4. After a `# Question` header, output a precise version of the question that resolves all pronouns and ambiguous words like 'this' to the specific nouns they stand for. Be sure to preserve the exact meaning of the question.<br />
					<br />
					Examples<br />
					<br />
					User: opne cmmand palete<br />
					<br />
					Assistant:<br />
					# Question<br />
					Command to open command palette<br />
					<br />
					<br />
					User: How do I change change font size in the editor?<br />
					<br />
					Assistant:<br />
					# Question<br />
					Command or setting to change the font size in the editor<br />
					<br />
					User: What is the setting to move editor and pin it<br />
					Assistant: <br />
					# Question<br />
					Settings to move and pin editor<br />
					<br />
					User: latest released features<br />
					<br />
					Assistant:<br />
					release_notes@latest<br />
					<br />
					User: What are the recent changes?<br />
					<br />
					Assistant:<br />
					release_notes@last3<br />
					<br />
					User: set up python<br />
					<br />
					Assistant:<br />
					# Other Question<br />
					Set up python development in Visual Studio Code<br />
					<br />
					User: Show me popular extensions<br />
					<br />
					Assistant:<br />
					vscode_extensions<br />
					<br />
					User: How do I contribute a command to my extension?<br />
					<br />
					Assistant:<br />
					vscode_api<br />
					<br />
					<ResponseTranslationRules />
				</InstructionMessage>
			</HistoryWithInstructions>
			<UserMessage priority={700}>{this.props.query}</UserMessage>
		</>;
	}
}

function parseMetaPromptResponse(originalQuestion: string, response: string): string {
	const match = response.match(/#+\s*(Question|Other Question)\n(?<question>.+)/si);
	if (!match?.groups) {
		return originalQuestion.trim();
	}
	return match.groups['question'].trim();
}

function getLastNMinorVersions(current: string, n: number): string[] {
	const m = /^(\d+)\.(\d+)$/.exec(current);
	if (!m) {
		return [current];
	}
	const major = parseInt(m[1], 10);
	let minor = parseInt(m[2], 10);
	const out: string[] = [];
	for (let i = 0; i < n && minor >= 0; i++, minor--) {
		out.push(`${major}.${minor}`);
	}
	return out;
}
