/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { mapFindFirst } from '../../../util/vs/base/common/arraysFind';
import { roleToString } from '../../chat/common/globalStringUtils';
import { rawPartAsStatefulMarker } from '../../endpoint/common/statefulMarkerContainer';
import { rawPartAsThinkingData } from '../../endpoint/common/thinkingDataContainer';

export function messageToMarkdown(message: Raw.ChatMessage, ignoreStatefulMarker?: boolean, skipFencing?: boolean): string {
	const role = roleToString(message.role);
	const capitalizedRole = role.charAt(0).toUpperCase() + role.slice(1);
	let str = skipFencing ? `### ${capitalizedRole}\n` : `### ${capitalizedRole}\n~~~md\n`;
	if (message.role === Raw.ChatRole.Tool) {
		str += `🛠️ ${message.toolCallId}`;
		if (message.content) {
			str += '\n';
		}
	}

	if (Array.isArray(message.content)) {
		str += message.content.map(item => {
			if (item.type === Raw.ChatCompletionContentPartKind.Text) {
				return item.text;
			} else if (item.type === Raw.ChatCompletionContentPartKind.Image) {
				return JSON.stringify(item);
			} else if (item.type === Raw.ChatCompletionContentPartKind.Opaque) {
				const asThinking = rawPartAsThinkingData(item);
				if (asThinking) {
					const parts: string[] = [];
					if (asThinking.text) {
						const thinkingText = Array.isArray(asThinking.text) ? asThinking.text.join('\n') : asThinking.text;
						parts.push(`reasoning: ${thinkingText}`);
					}
					if (asThinking.encrypted?.length) {
						parts.push(`encrypted_content=${asThinking.encrypted.length} chars`);
					}

					if (parts.length) {
						return parts.join('\n');
					}
				}
			}
		}).join('\n');
	} else {
		str += message.content;
	}

	if (message.role === Raw.ChatRole.Assistant && message.toolCalls?.length) {
		if (message.content) {
			str += '\n';
		}
		str += message.toolCalls.map(c => {
			let argsStr = c.function.arguments;
			try {
				const parsedArgs = JSON.parse(c.function.arguments);
				argsStr = JSON.stringify(parsedArgs, undefined, 2)
					.replace(/(?<!\\)\\n/g, '\n')
					.replace(/(?<!\\)\\t/g, '\t');
			} catch (e) { }
			return `🛠️ ${c.function.name} (${c.id}) ${argsStr}`;
		}).join('\n');
	}

	if (message.content.some(part => part.type === Raw.ChatCompletionContentPartKind.CacheBreakpoint)) {
		str += `\n[copilot_cache_control: { type: 'ephemeral' }]`;
	}

	const statefulMarker = mapFindFirst(message.content, c => c.type === Raw.ChatCompletionContentPartKind.Opaque ? rawPartAsStatefulMarker(c) : undefined);
	if (statefulMarker && !ignoreStatefulMarker) {
		str += `\n[response_id: ${statefulMarker.marker} with ${statefulMarker.modelId}]`;
	}

	if (!skipFencing) {
		str += '\n~~~\n';
	} else {
		str += '\n';
	}

	return str;
}
