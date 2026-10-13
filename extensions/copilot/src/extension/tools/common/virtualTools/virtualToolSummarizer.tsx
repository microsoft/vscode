/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptRenderer, RenderPromptResult, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import * as JSONC from 'jsonc-parser';
import type { LanguageModelToolInformation } from 'vscode';
import { ChatFetchResponseType, ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { ObjectJsonSchema } from '../../../../platform/configuration/common/jsonSchema';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { extractCodeBlocks } from '../../../../util/common/markdown';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { ISummarizedToolCategory } from './virtualToolTypes';
import { MAX_GROUPS_PER_CHUNK } from './virtualToolsConstants';

function normalizeGroupName(name: string): string {
	return name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
}

/**
 * Bulk describe multiple tool groups in a single LLM call for efficiency.
 * The index of summarized categories in the output corresponds to the index
 * of the input `toolGroups`. Missing or failed descriptions result in `undefined`.
 */
export async function describeBulkToolGroups(endpoint: IChatEndpoint, toolGroups: LanguageModelToolInformation[][], token: CancellationToken): Promise<(ISummarizedToolCategory | undefined)[]> {
	const results: Promise<(ISummarizedToolCategory | undefined)[]>[] = [];

	// Process in chunks of max 16 groups
	for (let i = 0; i < toolGroups.length; i += MAX_GROUPS_PER_CHUNK) {
		const chunk = toolGroups.slice(i, i + MAX_GROUPS_PER_CHUNK);
		const chunkResults = describeToolGroupsChunk(endpoint, chunk, token);
		results.push(chunkResults.catch(() => chunk.map(() => undefined)));
	}

	return (await Promise.all(results)).flat();
}

/**
 * Process a single chunk of tool groups
 */
async function describeToolGroupsChunk(
	endpoint: IChatEndpoint,
	toolGroups: LanguageModelToolInformation[][],
	token: CancellationToken
): Promise<(ISummarizedToolCategory | undefined)[]> {
	const renderer = new PromptRenderer(endpoint, BulkGroupDescriptorPrompt, { toolGroups }, endpoint.acquireTokenizer());
	const result = await renderer.render(undefined, token);
	const json = await getJsonResponse(endpoint, result, token);

	const output = Array.from<never, ISummarizedToolCategory | undefined>({ length: toolGroups.length }, () => undefined);
	if (!json || !Array.isArray(json)) {
		return output;
	}

	for (const item of json) {
		const index = Number(item.groupIndex) - 1;
		if (!isNaN(index) && toolGroups[index] && typeof item.groupName === 'string' && typeof item.summary === 'string') {
			output[index] = {
				name: normalizeGroupName(item.groupName),
				summary: item.summary,
				tools: toolGroups[index]
			};
		}
	}

	return output;
}


class ToolInformation extends PromptElement<BasePromptElementProps & { tool: LanguageModelToolInformation }> {
	render() {
		const { tool } = this.props;
		return <>{`<tool name=${JSON.stringify(tool.name)}>${tool.description}</tool>`}<br /></>;
	}
}

class BulkGroupDescriptorPrompt extends PromptElement<BasePromptElementProps & { toolGroups: LanguageModelToolInformation[][] }> {
	render() {
		return <>
			<SystemMessage>
				Context: You are given multiple groups of tools that have been clustered together based on semantic similarity. Your task is to provide a descriptive name and summary for each group that accurately reflects the common functionality and purpose of the tools within that group.<br />
				<br />
				For each group, analyze the tools and determine what they have in common, what domain or functionality they serve, and how they might be used together. Create a concise but descriptive name and a comprehensive summary for each group.<br />
			</SystemMessage>
			<UserMessage>
				You will be given {this.props.toolGroups.length} groups of tools. For each group, provide a name and summary that describes the group's purpose and capabilities.<br />
				<br />
				{this.props.toolGroups.map((group, index) => {
					const groupIndex = index + 1; // 1-indexed
					return (
						<>
							{`<group index="${groupIndex}">`}<br />
							{group.map(tool => <ToolInformation tool={tool} />)}
							{`</group>`}<br />
						</>
					);
				})}<br />
				Your response must follow the JSON schema:<br />
				<br />
				```<br />
				{JSON.stringify({
					type: 'array',
					items: {
						type: 'object',
						required: ['groupIndex', 'groupName', 'summary'],
						properties: {
							groupIndex: {
								type: 'integer',
								description: 'The index of the group as provided above (e.g., "1", "2", etc.)',
								example: 1
							},
							groupName: {
								type: 'string',
								description: 'A short, descriptive name for the group. It may only contain the characters a-z, A-Z, 0-9, and underscores.',
								example: 'file_management_tools'
							},
							summary: {
								type: 'string',
								description: 'A comprehensive summary of the group capabilities, including what the tools do and how they can be used together. This may be up to five paragraphs long, be careful not to leave out important details.',
								example: 'These tools provide comprehensive file management capabilities including reading, writing, searching, and organizing files and directories.'
							}
						}
					} satisfies ObjectJsonSchema
				}, null, 2)}<br />
				```<br />
				<br />
				Provide descriptions for the groups presented above. You must include the exact groupIndex as shown in the input. You must generate a description for every group and each groupName must be unique.<br />
			</UserMessage>
		</>;
	}
}

async function getJsonResponse(endpoint: IChatEndpoint, rendered: RenderPromptResult, token: CancellationToken): Promise<unknown | undefined> {

	const result = await endpoint.makeChatRequest(
		'summarizeVirtualTools',
		rendered.messages,
		undefined,
		token,
		ChatLocation.Other
	);

	if (result.type !== ChatFetchResponseType.Success) {
		return undefined;
	}

	for (const block of extractCodeBlocks(result.value)) {
		try {
			return JSONC.parse(block.code);
		} catch {
			// ignored
		}
	}

	const idx = result.value.indexOf('{');
	return JSONC.parse(result.value.slice(idx)) || undefined;
}
