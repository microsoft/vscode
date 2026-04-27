/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { AssistantMessage, BasePromptElementProps, Chunk, PrioritizedList, PromptElement, PromptReference, PromptSizing, SystemMessage, TextChunk, UserMessage } from '@vscode/prompt-tsx';
import { ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { NotebookDocumentSnapshot } from '../../../../platform/editing/common/notebookDocumentSnapshot';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { modelPrefersInstructionsAfterHistory } from '../../../../platform/endpoint/common/chatModelCapabilities';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { IPromptPathRepresentationService } from '../../../../platform/prompts/common/promptPathRepresentationService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { filepathCodeBlockMarker } from '../../../../util/common/markdown';
import { isLocation, isUri } from '../../../../util/common/types';
import { ResourceMap } from '../../../../util/vs/base/common/map';
import { Schemas } from '../../../../util/vs/base/common/network';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { Range, Uri } from '../../../../vscodeTypes';
import { GenericBasePromptElementProps } from '../../../context/node/resolvers/genericPanelIntentInvocation';
import { IEditStepBuildPromptContext, PreviousEditCodeStep } from '../../../intents/node/editCodeStep';
import { ChatVariablesCollection } from '../../../prompt/common/chatVariablesCollection';
import { Turn } from '../../../prompt/common/conversation';
import { INotebookWorkingSetEntry, isTextDocumentWorkingSetEntry, ITextDocumentWorkingSetEntry, IWorkingSet, WorkingSetEntryState } from '../../../prompt/common/intents';
import { CompositeElement } from '../base/common';
import { CopilotIdentityRules } from '../base/copilotIdentity';
import { InstructionMessage } from '../base/instructionMessage';
import { ResponseTranslationRules } from '../base/responseTranslationRules';
import { LegacySafetyRules } from '../base/safetyRules';
import { Tag } from '../base/tag';
import { DocumentSummarizer, NotebookDocumentSummarizer } from '../inline/summarizedDocument/summarizeDocumentHelpers';
import { ChatToolReferences, ChatVariables, UserQuery } from './chatVariables';
import { EXISTING_CODE_MARKER } from './codeBlockFormattingRules';
import { CustomInstructions } from './customInstructions';
import { fileVariableCostFn } from './fileVariable';
import { NotebookFormat, NotebookReminderInstructions } from './notebookEditCodePrompt';
import { ProjectLabels } from './projectLabels';
import { CodeBlock, ExampleCodeBlock } from './safeElements';
import { ChatToolCalls } from './toolCalling';

export interface EditCodePromptProps extends GenericBasePromptElementProps {
	readonly promptContext: IEditStepBuildPromptContext;
	readonly endpoint: IChatEndpoint;
	readonly location: ChatLocation;
}

export class EditCodePrompt extends PromptElement<EditCodePromptProps> {
	constructor(
		props: EditCodePromptProps,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}
	async render(state: void, sizing: PromptSizing) {
		const tsExampleFilePath = '/Users/someone/proj01/example.ts';

		const instructionsAfterHistory = modelPrefersInstructionsAfterHistory(this.props.endpoint.family);
		const hasFilesInWorkingSet = this.props.promptContext.workingSet.length > 0;
		const instructions = <InstructionMessage priority={900}>
			{hasFilesInWorkingSet
				? <>The user has a request for modifying one or more files.<br /></>
				: <>If the user asks a question, then answer it.<br />
					If you need to change existing files and it's not clear which files should be changed, then refuse and answer with "Please add the files to be modified to the working set{(this.configurationService.getConfig(ConfigKey.CodeSearchAgentEnabled) || this.configurationService.getConfig(ConfigKey.Advanced.CodeSearchAgentEnabled)) ? ', or use `#codebase` in your request to automatically discover working set files.' : ''}".<br />
					The only exception is if you need to create new files. In that case, follow the following instructions.<br /></>}
			1. Please come up with a solution that you first describe step-by-step.<br />
			2. Group your changes by file. Use the file path as the header.<br />
			3. For each file, give a short summary of what needs to be changed followed by a code block that contains the code changes.<br />
			4. The code block should start with four backticks followed by the language.<br />
			5. On the first line of the code block add a comment containing the filepath. This includes Markdown code blocks.<br />
			6. Use a single code block per file that needs to be modified, even if there are multiple changes for a file.<br />
			7. The user is very smart and can understand how to merge your code blocks into their files, you just need to provide minimal hints.<br />
			8. Avoid repeating existing code, instead use comments to represent regions of unchanged code. The user prefers that you are as concise as possible. For example: <br />
			<ExampleCodeBlock languageId='languageId' examplePath={'/path/to/file'} includeFilepath={true} minNumberOfBackticks={4}
				code={
					[
						`// ${EXISTING_CODE_MARKER}`,
						`{ changed code }`,
						`// ${EXISTING_CODE_MARKER}`,
						`{ changed code }`,
						`// ${EXISTING_CODE_MARKER}`
					].join('\n')
				}
			/><br />

			<br />
			<ResponseTranslationRules />
			Here is an example of how you should format a code block belonging to the file example.ts in your response:<br />
			<Tag name='example'>
				### {this.promptPathRepresentationService.getExampleFilePath(tsExampleFilePath)}<br />
				<br />
				Add a new property 'age' and a new method 'getAge' to the class Person.<br />
				<br />
				<ExampleCodeBlock languageId='typescript' examplePath={tsExampleFilePath} includeFilepath={true} minNumberOfBackticks={4}
					code={
						[
							`class Person {`,
							`	// ${EXISTING_CODE_MARKER}`,
							`	age: number;`,
							`	// ${EXISTING_CODE_MARKER}`,
							`	getAge() {`,
							`		return this.age;`,
							`	}`,
							`}`,
						].join('\n')
					}
				/><br />
			</Tag>
		</InstructionMessage>;

		return (
			<>
				<SystemMessage priority={1000}>
					You are an AI programming assistant.<br />
					<CopilotIdentityRules />
					<LegacySafetyRules />
				</SystemMessage>
				{instructionsAfterHistory ? undefined : instructions}
				<EditCodeConversationHistory flexGrow={1} priority={700} workingSet={this.props.promptContext.workingSet} history={this.props.promptContext.history} promptInstructions={this.props.promptContext.promptInstructions} chatVariables={this.props.promptContext.chatVariables} />
				{instructionsAfterHistory ? instructions : undefined}
				<EditCodeUserMessage flexGrow={2} priority={900} {...this.props} />
				<ChatToolCalls priority={899} flexGrow={3} promptContext={this.props.promptContext} toolCallRounds={this.props.promptContext.toolCallRounds} toolCallResults={this.props.promptContext.toolCallResults} />
			</>
		);
	}
}

interface EditCodeReadonlyInstructionsProps extends BasePromptElementProps {
	readonly chatVariables: ChatVariablesCollection;
	readonly workingSet: IWorkingSet;
}

export class EditCodeReadonlyInstructions extends PromptElement<EditCodeReadonlyInstructionsProps> {
	constructor(
		props: EditCodeReadonlyInstructionsProps,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}

	override render() {
		const { readonlyUris } = this;

		if (!readonlyUris.length) {
			return <></>;
		}

		return <TextChunk>
			{'<fileRestrictions>'}<br />
			The following files are readonly. Making edits to any of these file paths is FORBIDDEN. If you cannot accomplish the task without editing the files, briefly explain why, but NEVER edit any of these files:<br />
			{readonlyUris.map(uri => `\t- ${this.promptPathRepresentationService.getFilePath(uri)}`).join('\n')}<br />
			{'</fileRestrictions>'}
		</TextChunk>;
	}

	/**
	 * List of {@link Uri}s for all `readonly` variables, if any.
	 */
	private get readonlyUris(): Uri[] {

		// get list of URIs for readonly variables inside the working set
		const readonlyUris = [];
		for (const entry of this.props.workingSet) {
			if (entry.isMarkedReadonly) {
				readonlyUris.push(entry.document.uri);
			}
		}
		for (const variable of this.props.chatVariables) {
			if (variable.isMarkedReadonly) {
				if (isUri(variable.value)) {
					readonlyUris.push(variable.value);
				} else if (isLocation(variable.value)) {
					readonlyUris.push(variable.value.uri);
				}
			}
		}
		return readonlyUris;
	}
}

interface EditCodeConversationHistoryProps extends BasePromptElementProps {
	readonly workingSet: IWorkingSet;
	readonly promptInstructions: readonly TextDocumentSnapshot[];
	readonly chatVariables: ChatVariablesCollection;
	readonly history: readonly Turn[];
	readonly priority: number;
}

class EditCodeConversationHistory extends PromptElement<EditCodeConversationHistoryProps> {

	constructor(
		props: EditCodeConversationHistoryProps,
		@IPromptPathRepresentationService private readonly _promptPathRepresentationService: IPromptPathRepresentationService
	) {
		super(props);
	}


	override async render(state: void, sizing: PromptSizing) {
		// Here we will keep track of which [file,version] pairs that are already in the prompt
		const includedFilesAtVersions = new ResourceMap<number[]>();

		// Populate with the current state
		for (const entry of this.props.workingSet) {
			includedFilesAtVersions.set(entry.document.uri, [entry.document.version]);
		}

		// Ditto for prompt instruction files
		const includedPromptInstructions = new ResourceMap<number[]>();
		for (const promptInstruction of this.props.promptInstructions) {
			includedPromptInstructions.set(promptInstruction.uri, [promptInstruction.version]);
		}

		const history: (UserMessage | AssistantMessage)[] = [];
		for (const turn of this.props.history) {
			const editCodeStep = PreviousEditCodeStep.fromTurn(turn);
			if (editCodeStep) {
				history.push(this._renderUserMessageWithoutFiles(editCodeStep, includedFilesAtVersions, includedPromptInstructions));
				history.push(this._renderAssistantMessageWithoutFileTags(editCodeStep.response));
			}
		}

		return (<PrioritizedList priority={this.props.priority} descending={false}>{history}</PrioritizedList>);
	}

	private _renderAssistantMessageWithoutFileTags(message: string): AssistantMessage {
		message = message.replace(/<\/?file>/g, '');
		return (
			<AssistantMessage>{message}</AssistantMessage>
		);
	}

	private _renderUserMessageWithoutFiles(editCodeStep: PreviousEditCodeStep, includedFilesAtVersion: ResourceMap<number[]>, includedPromptInstructions: ResourceMap<number[]>): UserMessage {
		const filesToRemove: Uri[] = [];
		for (const entry of editCodeStep.workingSet) {
			const versions = includedFilesAtVersion.get(entry.document.uri) ?? [];
			const isAlreadyIncluded = versions.some(version => version === entry.document.version);
			if (isAlreadyIncluded) {
				filesToRemove.push(entry.document.uri);
			} else {
				versions.push(entry.document.version);
				includedFilesAtVersion.set(entry.document.uri, versions);
			}
		}

		const promptInstructionsToRemove: Uri[] = [];
		for (const entry of editCodeStep.promptInstructions) {
			const versions = includedPromptInstructions.get(entry.document.uri) ?? [];
			const isAlreadyIncluded = versions.some(version => version === entry.document.version);
			if (isAlreadyIncluded) {
				promptInstructionsToRemove.push(entry.document.uri);
			}
		}

		let userMessage = this._removePromptInstructionsFromPastUserMessage(editCodeStep.request, promptInstructionsToRemove);
		userMessage = this._removeFilesFromPastUserMessage(userMessage, filesToRemove);
		userMessage = this._removeReminders(userMessage);
		return (
			<UserMessage>{userMessage}</UserMessage>
		);
	}

	private _removePromptInstructionsFromPastUserMessage(userMessage: string, shouldRemove: Uri[]) {
		const interestingFilePaths = shouldRemove.map(uri => this._promptPathRepresentationService.getFilePath(uri));
		return userMessage.replace(/<instructions>[\s\S]*?<\/instructions>/g, (match) => {
			if (interestingFilePaths.some(path => match.includes(path))) {
				return '';
			}
			return match;
		});
	}

	private _removeFilesFromPastUserMessage(userMessage: string, shouldRemove: Uri[]) {
		const interestingFilePaths = shouldRemove.map(uri => `${filepathCodeBlockMarker} ${this._promptPathRepresentationService.getFilePath(uri)}`);
		return userMessage.replace(/<file(-selection)?>[\s\S]*?<\/file(-selection)?>/g, (match) => {
			if (interestingFilePaths.some(path => match.includes(path))) {
				return '';
			}
			return match;
		});
	}

	private _removeReminders(userMessage: string) {
		return userMessage.replace(/^<reminder>[\s\S]*?^<\/reminder>/gm, (match) => {
			return '';
		});
	}
}

export class EditCodeUserMessage extends PromptElement<EditCodePromptProps> {
	constructor(
		props: EditCodePromptProps,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const { query, chatVariables, workingSet } = this.props.promptContext;
		const useProjectLabels = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.ProjectLabelsChat, this.experimentationService);
		return (
			<>
				<UserMessage>
					{useProjectLabels && <ProjectLabels flexGrow={1} priority={600} />}
					<CustomInstructions flexGrow={6} priority={750} languageId={undefined} chatVariables={chatVariables} />
					<NotebookFormat flexGrow={5} priority={810} chatVariables={workingSet} query={query} />
					<ChatToolReferences flexGrow={4} priority={898} promptContext={this.props.promptContext} documentContext={this.props.documentContext} />
					<ChatVariables flexGrow={3} priority={898} chatVariables={chatVariables} />
					<WorkingSet flexGrow={3} flexReserve={sizing.tokenBudget * 0.8} priority={810} workingSet={workingSet} /><br />
					<Tag name='reminder' flexGrow={2} priority={899} >
						Avoid repeating existing code, instead use a line comment with `{EXISTING_CODE_MARKER}` to represent regions of unchanged code.<br />
						The code block for each file being edited must start with a comment containing the filepath. This includes Markdown code blocks.<br />
						For existing files, make sure the filepath exactly matches the filepath of the original file.<br />
						<NotebookReminderInstructions chatVariables={chatVariables} query={query} />
						<NewFilesLocationHint />
					</Tag>
					{query && <Tag name='prompt'><UserQuery flexGrow={7} priority={900} chatVariables={chatVariables} query={query} /></Tag>}
					<EditCodeReadonlyInstructions chatVariables={chatVariables} workingSet={workingSet} />
				</UserMessage>
			</>
		);
	}
}

interface WorkingSetPromptProps extends BasePromptElementProps {
	readonly workingSet: IWorkingSet;
}

export class WorkingSet extends PromptElement<WorkingSetPromptProps> {
	public override render(state: void, sizing: PromptSizing) {
		const { workingSet } = this.props;
		return (
			workingSet.length ?
				<>
					The user has provided the following files as input. Always make changes to these files unless the user asks to create a new file.<br />
					Untitled files are files that are not yet named. Make changes to them like regular files.<br />
					{workingSet.map((entry, index) => (
						isTextDocumentWorkingSetEntry(entry) ?
							<TextDocumentWorkingSetEntry entry={entry} flexGrow={index} /> :
							<NotebookWorkingSetEntry entry={entry} flexGrow={index} />
					))}
				</> :
				<></>
		);
	}
}

export class NewFilesLocationHint extends PromptElement {
	constructor(
		props: BasePromptElementProps,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
		@IPromptPathRepresentationService private readonly _promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}

	public override render(state: void, sizing: PromptSizing) {
		const workspaceFolders = this._workspaceService.getWorkspaceFolders();
		if (workspaceFolders.length === 1) {
			return <>When suggesting to create new files, pick a location inside `{this._promptPathRepresentationService.getFilePath(workspaceFolders[0])}`.</>;
		} else if (workspaceFolders.length > 0) {
			return <>When suggesting to create new files, pick a location inside one of these root folders: {workspaceFolders.map(f => `${this._promptPathRepresentationService.getFilePath(f)}`).join(', ')}.</>;
		} else {
			const untitledRoot = Uri.from({ scheme: Schemas.untitled, authority: 'untitled' });
			return <>When suggesting to create new files, pick a location inside `{this._promptPathRepresentationService.getFilePath(untitledRoot)}`.</>;
		}
	}
}

interface TextDocumentWorkingSetEntryPromptProps extends BasePromptElementProps {
	readonly entry: ITextDocumentWorkingSetEntry;
}

class TextDocumentWorkingSetEntry extends PromptElement<TextDocumentWorkingSetEntryPromptProps> {
	constructor(
		props: TextDocumentWorkingSetEntryPromptProps,
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const { document, range: selection, state: workingSetEntryState } = this.props.entry;

		const isIgnored = await this._ignoreService.isCopilotIgnored(document.uri);
		if (isIgnored) {
			return <ignoredFiles value={[document.uri]} />;
		}

		const s = this.instantiationService.createInstance(DocumentSummarizer);
		const summarized = await s.summarizeDocument(document, undefined, selection, sizing.tokenBudget, {
			costFnOverride: fileVariableCostFn,
		});

		const promptReferenceOptions = !summarized.isOriginal
			? { status: { description: l10n.t('Part of this file was not sent to the model due to context window limitations. Try attaching specific selections from your file instead.'), kind: 2 } }
			: undefined;

		let userActionStateFragment = '';
		if (workingSetEntryState === WorkingSetEntryState.Accepted) {
			userActionStateFragment = 'I applied your suggestions for this file and accepted them. Here is the updated file:';
		} else if (workingSetEntryState === WorkingSetEntryState.Rejected) {
			userActionStateFragment = 'I considered your suggestions for this file but rejected them. Here is the file:';
		} else if (workingSetEntryState === WorkingSetEntryState.Undecided) {
			userActionStateFragment = 'I applied your suggestions for this file but haven\'t decided yet if I accept or reject them. Here is the updated file:';
		}

		return (
			<CompositeElement priority={this.props.priority}>
				<Chunk priority={2}>
					<Tag name='file'>
						{
							userActionStateFragment && <>
								<br />
								&lt;status&gt;
								{userActionStateFragment}
								&lt;/status&gt;
								<br />
							</>
						}
						<CodeBlock includeFilepath={true} languageId={document.languageId} uri={document.uri} references={[new PromptReference(document.uri, undefined, promptReferenceOptions)]} code={summarized.text} />
					</Tag>
				</Chunk>
				{!!selection && <FileSelection document={document} selection={selection} priority={1} />}
			</CompositeElement>
		);
	}
}

interface NotebookWorkingSetEntryPromptProps extends BasePromptElementProps {
	readonly entry: INotebookWorkingSetEntry;
}

class NotebookWorkingSetEntry extends PromptElement<NotebookWorkingSetEntryPromptProps> {
	constructor(
		props: NotebookWorkingSetEntryPromptProps,
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const { document, range: selection, state: workingSetEntryState } = this.props.entry;

		const isIgnored = await this._ignoreService.isCopilotIgnored(document.uri);
		if (isIgnored) {
			return <ignoredFiles value={[document.uri]} />;
		}

		// TODO@rebornix ensure notebook is open
		const s = this.instantiationService.createInstance(NotebookDocumentSummarizer);
		const summarized = await s.summarizeDocument(document, undefined, selection, sizing.tokenBudget, {
			costFnOverride: fileVariableCostFn,
		});

		const promptReferenceOptions = !summarized.isOriginal
			? { status: { description: l10n.t('Part of this file was not sent to the model due to context window limitations. Try attaching specific selections from your file instead.'), kind: 2 } }
			: undefined;

		let userActionStateFragment = '';
		if (workingSetEntryState === WorkingSetEntryState.Accepted) {
			userActionStateFragment = 'I applied your suggestions for this file and accepted them. Here is the updated file:';
		} else if (workingSetEntryState === WorkingSetEntryState.Rejected) {
			userActionStateFragment = 'I considered your suggestions for this file but rejected them. Here is the file:';
		} else if (workingSetEntryState === WorkingSetEntryState.Undecided) {
			userActionStateFragment = 'I applied your suggestions for this file but haven\'t decided yet if I accept or reject them. Here is the updated file:';
		}
		// Kernel variables are useful only if we're in inline chat mode.
		// This is the logic we used to have with inline chat for notebooks.
		return (
			<CompositeElement priority={this.props.priority}>
				<Chunk priority={2}>
					This is a notebook file: <br />
					<Tag name='file'>
						{
							userActionStateFragment && <>
								<br />
								&lt;status&gt;
								{userActionStateFragment}
								&lt;/status&gt;
								<br />
							</>
						}
						<CodeBlock includeFilepath={true} languageId={document.languageId} uri={document.uri} references={[new PromptReference(document.uri, undefined, promptReferenceOptions)]} code={summarized.text} />
					</Tag>
				</Chunk>
				{!!selection && <FileSelection document={document} selection={selection} priority={1} />}
			</CompositeElement>
		);
	}
}


interface CurrentFileSelectionPromptProps extends BasePromptElementProps {
	document: TextDocumentSnapshot | NotebookDocumentSnapshot | undefined;
	selection: Range | undefined;
}

class FileSelection extends PromptElement<CurrentFileSelectionPromptProps> {
	constructor(
		props: CurrentFileSelectionPromptProps,
		@IIgnoreService private readonly _ignoreService: IIgnoreService
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const { document, selection } = this.props;

		if (!document || !selection) {
			return undefined;
		}

		const isIgnored = await this._ignoreService.isCopilotIgnored(document.uri);
		if (isIgnored) {
			return <ignoredFiles value={[document.uri]} />;
		}

		if (document.lineCount >= 4) {
			const selectionLines: string[] = [];
			const charactersInSelectionLines = () => selectionLines.reduce((acc, line) => acc + line.length, 0);
			let selectionStartLine = Math.min(
				document.lineCount - 1,
				Math.max(0, selection.start.line));
			let selectionEndLine = Math.min(document.lineCount - 1, selection.end.line);
			if (selectionEndLine > selectionStartLine && selection.end.character === 0) {
				selectionEndLine--;
			}
			if (selectionStartLine < selectionEndLine && selection.start.character === document.lineAt(selectionStartLine).text.length) {
				selectionStartLine++;
			}
			for (let i = selectionStartLine; i <= selectionEndLine; i++) {
				const line = document.lineAt(i);
				selectionLines.push(line.text);
			}
			// render at least 4 lines as selected
			let above = selectionStartLine - 1;
			let below = selectionEndLine + 1;
			while (selectionLines.length < 4 && charactersInSelectionLines() < 10) {
				if (above >= 0) {
					selectionLines.unshift(document.lineAt(above).text);
					above--;
				}
				if (below < document.lineCount) {
					selectionLines.push(document.lineAt(below).text);
					below++;
				}
			}

			// TODO@tags: adopt tags here once <Tag> fixes whitespace problems
			return (
				<Chunk>
					&lt;file-selection&gt;
					<CodeBlock includeFilepath={true} languageId={document.languageId} uri={document.uri} references={[new PromptReference(document.uri, undefined)]} code={selectionLines.join('\n')} shouldTrim={false} /><br />
					&lt;/file-selection&gt;
				</Chunk>
			);
		} else {
			return undefined;
		}
	}
}
