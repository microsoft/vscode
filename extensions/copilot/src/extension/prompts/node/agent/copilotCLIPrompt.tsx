/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptSizing, UserMessage } from '@vscode/prompt-tsx';
import { ChatCompletionContentPartKind, ChatRole } from '@vscode/prompt-tsx/dist/base/output/rawTypes';
import type { ChatRequestEditedFileEvent } from 'vscode';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { IPromptPathRepresentationService } from '../../../../platform/prompts/common/promptPathRepresentationService';
import { isLocation } from '../../../../util/common/types';
import { Schemas } from '../../../../util/vs/base/common/network';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatReferenceBinaryData, ChatRequest, FileType } from '../../../../vscodeTypes';
import { ChatVariablesCollection, isPromptFile, isSessionReference, PromptVariable, sessionReferenceAttachmentAttrs } from '../../../prompt/common/chatVariablesCollection';
import { renderPromptElement } from '../base/promptRenderer';
import { Tag } from '../base/tag';
import { SummarizedDocumentLineNumberStyle } from '../inline/summarizedDocument/implementation';
import { renderChatVariables } from '../panel/chatVariables';
import { FilePathMode, FileVariable } from '../panel/fileVariable';
import { EditedFileEvents } from './agentPrompt';
import './allAgentPrompts';

export interface AgentUserMessageProps extends BasePromptElementProps {
	readonly request: string;
	readonly endpoint: IChatEndpoint;
	readonly chatVariables: ChatVariablesCollection;
	readonly editedFileEvents?: readonly ChatRequestEditedFileEvent[];
	readonly sessionId?: string;
}

/**
 * Is sent with each user message. Includes the user message and also any ambient context that we want to update with each request.
 * Uses frozen content if available, for prompt caching and to avoid being updated by any agent action below this point in the conversation.
 */
class CopilotCLIAgentUserMessage extends PromptElement<AgentUserMessageProps> {
	constructor(
		props: AgentUserMessageProps,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const query = this.props.request;
		const shouldUseUserQuery = this.props.endpoint.family.startsWith('grok-code');

		// Files & folders will not be added as regular attachments, as those will be handed by SDK.
		// We merely add a <attachments> tag to signal that there are file/folder attachments.
		// This is because we want to avoid adding all fo the content of the file into the prompt.
		// We leave that for Copilot CLI SDK to handle.
		const isResourceVariable = (variable: PromptVariable) =>
			!isScmEntry(variable.value) && (URI.isUri(variable.value) || isLocation(variable.value));
		const isImageReference = (variable: PromptVariable) => variable.value && variable.value instanceof ChatReferenceBinaryData;
		const isImageReferenceWithUri = (variable: PromptVariable) => variable.value && variable.value instanceof ChatReferenceBinaryData && !!variable.value.reference ? true : false;

		const resourceVariables = this.props.chatVariables.filter(variable => isResourceVariable(variable) || isImageReferenceWithUri(variable));
		const nonResourceVariables = this.props.chatVariables.filter(variable => !isResourceVariable(variable) && !isImageReference(variable));
		const [nonResourceAttachments, resourceAttachments] = await Promise.all([
			renderChatVariables(nonResourceVariables, this.fileSystemService, true, false, false, true, false),
			renderResourceVariables(resourceVariables, this.fileSystemService, this.promptPathRepresentationService)
		]);

		const hasVariables = resourceVariables.hasVariables() || nonResourceVariables.hasVariables();
		const hasEditedFileEvents = (this.props.editedFileEvents?.length ?? 0) > 0;
		const hasCustomContext = hasVariables || hasEditedFileEvents;
		const promptVariable = resourceVariables.find(v => isPromptFile(v));
		// If we have a prompt file, we want to direct the model to follow instructions in that file.
		// Otherwise we add a generic reminder to only use the context if its relevant.
		// Also today we have a generic prompt that reads `Implement this.` and we have attachments.
		// Thats not sufficient to direct the model to use prompt instructions.
		// In regular chat we have `Follow instructions in #<file>` & thats very effective as the prompt is very sepcfici about what to do. `Implement this.` is not.
		const instructions = promptVariable && promptVariable.reference.name !== 'prompt:plan.prompt.md' ?
			`Follow instructions in #${promptVariable.reference.name}` :
			'IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task';
		return (
			<UserMessage>
				{/**
				 * We need to ensure the user request is first, else CLI will not be able parse this for display in summary.
				 * The `<reminder>` tag is a hack so that we can add additional context without interfering with the main user request.
				 * CLI will ignore `<reminder>` content for summary purposes.
				 * This is why we place it after the main user request.
				*/}
				<>{this.props.request}</>
				{
					hasCustomContext && (
						<>
							<br /> {/** Add an empty line after user prompt to ensure `<reminder>` tag is on a new line */}
							<Tag name='reminder'>
								{instructions}
							</Tag>
						</>
					)
				}
				{
					hasVariables &&
					<Tag name='attachments' priority={this.props.priority}>
						{...nonResourceAttachments}
						{...resourceAttachments}
					</Tag>
				}
				{
					hasEditedFileEvents &&
					<Tag name='context'>
						<EditedFileEvents editedFileEvents={this.props.editedFileEvents} />
					</Tag>
				}
				{hasCustomContext && <Tag name={shouldUseUserQuery ? 'user_query' : 'userRequest'} priority={900} flexGrow={7}>{query}</Tag>}
			</UserMessage>
		);
	}
}

export async function generateUserPrompt(request: ChatRequest, prompt: string | undefined, chatVariables: ChatVariablesCollection, instantiationService: IInstantiationService): Promise<string> {
	const endpoint = await instantiationService.invokeFunction((accessor) => accessor.get(IEndpointProvider).getChatEndpoint(request));
	const { messages } = await renderPromptElement(instantiationService, endpoint, CopilotCLIAgentUserMessage, {
		chatVariables,
		endpoint,
		request: prompt ?? request.prompt,
		editedFileEvents: request.editedFileEvents,
	});
	if (messages.length === 1 && messages[0].role === ChatRole.User && messages[0].content.length === 1 && messages[0].content[0].type === ChatCompletionContentPartKind.Text) {
		return messages[0].content[0].text;
	}
	throw new Error(`[CopilotCLISession] Unexpected generated prompt structure.`);

}

async function renderResourceVariables(chatVariables: ChatVariablesCollection, fileSystemService: IFileSystemService, promptPathRepresentationService: IPromptPathRepresentationService): Promise<PromptElement[]> {
	const elements: PromptElement[] = [];
	await Promise.all(Array.from(chatVariables).map(async variable => {
		if (isSessionReference(variable)) {
			elements.push(<Tag name='attachment' attrs={sessionReferenceAttachmentAttrs(variable)} />);
			return;
		}
		if (variable.value instanceof ChatReferenceBinaryData) {
			if (variable.value.reference) {
				const attrs: Record<string, string> = {};
				const variableName = variable.uniqueName;
				if (variableName) {
					attrs.id = variableName;
				}
				attrs.filePath = promptPathRepresentationService.getFilePath(variable.value.reference);
				elements.push(<Tag name='attachment' attrs={attrs} />);
			}
			return;
		}
		const location = variable.value;
		if (isLocation(location)) {
			// If its an untitled document, we always include a summary, as CLI cannot read untitled documents.
			const alwaysIncludeSummary = location.uri.scheme === Schemas.untitled;
			elements.push(<FileVariable
				alwaysIncludeSummary={alwaysIncludeSummary}
				filePathMode={FilePathMode.AsComment}
				variableName={variable.uniqueName}
				variableValue={location}
				description={variable.reference.modelDescription}
				lineNumberStyle={SummarizedDocumentLineNumberStyle.OmittedRanges}
			/>);
			return;
		}
		const uri = variable.value;
		if (!URI.isUri(uri)) {
			return;
		}
		if (uri.scheme === Schemas.untitled || isPromptFile(variable) || isScmEntry(uri)) {
			// If its an untitled document, we always include a summary, as CLI cannot read untitled documents.
			// Similarly prompt file contents need to be included in the prompt.
			// Except when its attached as a regular file (but in that case `isPromptFile` would return false).
			elements.push(<FileVariable
				alwaysIncludeSummary={true}
				filePathMode={FilePathMode.AsComment}
				variableName={variable.uniqueName}
				variableValue={uri}
				description={variable.reference.modelDescription}
				lineNumberStyle={SummarizedDocumentLineNumberStyle.OmittedRanges}
			/>);
			return;
		}
		// Check if the variable is a directory
		let isDirectory = false;
		try {
			const stat = await fileSystemService.stat(uri);
			isDirectory = stat.type === FileType.Directory;
		} catch { }
		const attrs: Record<string, string> = {};
		const variableName = variable.uniqueName;
		if (variableName) {
			attrs.id = variableName;
		}
		if (isDirectory) {
			attrs.folderPath = promptPathRepresentationService.getFilePath(uri);
		} else {
			attrs.filePath = promptPathRepresentationService.getFilePath(uri);
		}
		elements.push(<Tag name='attachment' attrs={attrs} />);
	}));
	return elements;
}

function isScmEntry(item: unknown): item is URI {
	if (URI.isUri(item) && item.scheme === 'scm-history-item') {
		return true;
	}
	return false;
}
