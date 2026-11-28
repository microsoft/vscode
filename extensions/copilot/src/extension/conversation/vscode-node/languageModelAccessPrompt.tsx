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
import { thinkingOriginFromMetadata } from '../../../platform/thinking/common/thinking';
import { SafetyRules } from '../../prompts/node/base/safetyRules';
import { EditorIntegrationRules } from '../../prompts/node/panel/editorIntegrationRules';
import { imageDataPartToTSX, ToolResult } from '../../prompts/node/panel/toolCalling';
import { isImageDataPart } from '../common/languageModelChatMessageHelpers';

export type Props = PromptElementProps<{
	noSafety: boolean;
	messages: Array<vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2>;
}>;

interface IThinkingGroup {
	readonly id: string;
	readonly text: string[];
	readonly metadata: Record<string, unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasContinuationMetadata(metadata: Readonly<Record<string, unknown>> | undefined): boolean {
	if (!metadata) {
		return false;
	}
	return typeof metadata.signature === 'string'
		|| typeof metadata.encrypted_content === 'string'
		|| typeof metadata.redactedData === 'string'
		|| isPlainObject(metadata.toolExtraContent);
}

function groupThinkingParts(parts: readonly vscode.LanguageModelThinkingPart[]): IThinkingGroup[] {
	const groups = new Map<string, IThinkingGroup>();
	for (const part of parts) {
		const text = Array.isArray(part.value) ? part.value : [part.value];
		const nonEmptyText = text.filter(value => value.length > 0);
		if (!part.id && nonEmptyText.length === 0 && !hasContinuationMetadata(part.metadata)) {
			continue;
		}
		const id = part.id ?? '';
		const previous = groups.get(id);
		const mergedToolExtraContent = isPlainObject(previous?.metadata.toolExtraContent) || isPlainObject(part.metadata?.toolExtraContent)
			? {
				...(isPlainObject(previous?.metadata.toolExtraContent) ? previous.metadata.toolExtraContent : {}),
				...(isPlainObject(part.metadata?.toolExtraContent) ? part.metadata.toolExtraContent : {}),
			}
			: undefined;
		groups.set(id, {
			id,
			text: [...previous?.text ?? [], ...(nonEmptyText.length > 0 || !hasContinuationMetadata(part.metadata) ? text : [])],
			metadata: {
				...previous?.metadata,
				...part.metadata,
				...(mergedToolExtraContent ? { toolExtraContent: mergedToolExtraContent } : {}),
			},
		});
	}
	return [...groups.values()];
}

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
				const content = filteredContent.filter(part => part instanceof LanguageModelTextPart).map(part => part.value).join('');
				const toolCalls = filteredContent.filter(part => part instanceof vscode.LanguageModelToolCallPart);
				const thinkingParts = filteredContent.filter(part => part instanceof vscode.LanguageModelThinkingPart);
				const thinkingGroups = groupThinkingParts(thinkingParts);

				const statefulMarkerElement = statefulMarker && <StatefulMarkerContainer statefulMarker={statefulMarker} />;
				const thinkingElements = thinkingGroups.map(group => {
					const encrypted = typeof group.metadata.encrypted_content === 'string' ? group.metadata.encrypted_content : undefined;
					// Read the per-part provenance metadata back onto the envelope.
					return <ThinkingDataContainer thinking={{ id: group.id, text: group.text, metadata: group.metadata, encrypted }} originApi={thinkingOriginFromMetadata(group.metadata)} />;
				});
				chatMessages.push(<AssistantMessage name={message.name} toolCalls={toolCalls.map(tc => ({ id: tc.callId, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.input) } }))}>{statefulMarkerElement}{content}{thinkingElements}</AssistantMessage>);
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
