/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { AssistantMessage, PromptElement, PromptElementProps, SystemMessage, ToolMessage, UserMessage } from '@vscode/prompt-tsx';
import * as vscode from 'vscode';
import { LanguageModelTextPart } from 'vscode';
import { CustomDataPartMimeTypes } from '../../../platform/endpoint/common/endpointTypes';
import { decodeStatefulMarker, StatefulMarkerContainer } from '../../../platform/endpoint/common/statefulMarkerContainer';
import { ThinkingDataContainer } from '../../../platform/endpoint/common/thinkingDataContainer';
import { SafetyRules } from '../../prompts/node/base/safetyRules';
import { EditorIntegrationRules } from '../../prompts/node/panel/editorIntegrationRules';
import { imageDataPartToTSX, ToolResult } from '../../prompts/node/panel/toolCalling';
import { isImageDataPart } from '../common/languageModelChatMessageHelpers';

export type Props = PromptElementProps<{
	noSafety: boolean;
	messages: Array<vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2>;
}>;

export class LanguageModelAccessPrompt extends PromptElement<Props> {
	async render() {

		const systemMessages: string[] = [];
		const chatMessages: (UserMessage | AssistantMessage)[] = [];

		for (const message of this.props.messages) {
			if (message.role === vscode.LanguageModelChatMessageRole.System) {
				// Filter out DataPart since it does not share the same value type and does not have callId, function, etc.
				const filteredContent = message.content.filter(part => !(part instanceof vscode.LanguageModelDataPart));
				systemMessages.push(filteredContent
					.filter(part => part instanceof vscode.LanguageModelTextPart)
					.map(part => part.value).join(''));

			} else if (message.role === vscode.LanguageModelChatMessageRole.Assistant) {
				const statefulMarkerPart = message.content.find(part => part instanceof vscode.LanguageModelDataPart && part.mimeType === CustomDataPartMimeTypes.StatefulMarker) as vscode.LanguageModelDataPart | undefined;
				const statefulMarker = statefulMarkerPart && decodeStatefulMarker(statefulMarkerPart.data);
				const filteredContent = message.content.filter(part => !(part instanceof vscode.LanguageModelDataPart));
				// There should only be one string part per message
				const content = filteredContent.find(part => part instanceof LanguageModelTextPart);
				const toolCalls = filteredContent.filter(part => part instanceof vscode.LanguageModelToolCallPart);
				const thinking = filteredContent.find(part => part instanceof vscode.LanguageModelThinkingPart);

				const statefulMarkerElement = statefulMarker && <StatefulMarkerContainer statefulMarker={statefulMarker} />;
				const thinkingElement = thinking && thinking.id && <ThinkingDataContainer thinking={{ id: thinking.id, text: thinking.value, metadata: thinking.metadata }} />;
				chatMessages.push(<AssistantMessage name={message.name} toolCalls={toolCalls.map(tc => ({ id: tc.callId, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.input) } }))}>{statefulMarkerElement}{content?.value}{thinkingElement}</AssistantMessage>);
			} else if (message.role === vscode.LanguageModelChatMessageRole.User) {
				for (const part of message.content) {
					if (part instanceof vscode.LanguageModelToolResultPart2 || part instanceof vscode.LanguageModelToolResultPart) {
						chatMessages.push(
							<ToolMessage toolCallId={part.callId}>
								<ToolResult content={part.content} toolCallId={part.callId} />
							</ToolMessage>
						);
					} else if (isImageDataPart(part)) {
						const imageElement = await imageDataPartToTSX(part);
						chatMessages.push(<UserMessage priority={0}>{imageElement}</UserMessage>);
					} else if (part instanceof vscode.LanguageModelTextPart) {
						chatMessages.push(<UserMessage name={message.name}>{part.value}</UserMessage>);
					}
				}
			}
		}

		return (
			<>
				<SystemMessage>
					{this.props.noSafety
						// Only custom system message
						? systemMessages
						// Our and custom system message
						: <>
							<SafetyRules />
							<EditorIntegrationRules />
							<br />
							{systemMessages.join('\n')}
						</>}
				</SystemMessage>
				{chatMessages}
			</>
		);
	}
}
