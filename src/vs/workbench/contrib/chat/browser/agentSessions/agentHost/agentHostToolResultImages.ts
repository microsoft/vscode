/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AGENT_HOST_SCHEME } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { getInlineToolInput, ResponsePartKind, ToolCallStatus, ToolResultContentType, type ChatState, type ResponsePart } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { getAttachableImageExtension } from '../../../common/model/chatModel.js';

const imagePathArguments = ['path', 'filePath', 'file_path', 'filename', 'fileName', 'screenshotPath', 'screenshot_path'];

/**
 * Resolves sandbox image paths from tool-result snapshots when the host cannot read the original file.
 * Path inference is temporary until hosts provide stable image resource identities.
 */
export function resolveAgentHostToolResultImage(chat: Pick<ChatState, 'turns' | 'activeTurn'> | undefined, href: string, resolve: (href: string) => string): string | undefined {
	if (!chat || !href.startsWith(`${AGENT_HOST_SCHEME}:`)) {
		return undefined;
	}
	const fromParts = (parts: readonly ResponsePart[]): string | undefined => {
		for (let index = parts.length - 1; index >= 0; index--) {
			const part = parts[index];
			if (part.kind !== ResponsePartKind.ToolCall) {
				continue;
			}
			const call = part.toolCall;
			if (call.status !== ToolCallStatus.Completed && call.status !== ToolCallStatus.Running) {
				continue;
			}
			const images = call.content?.filter(block => block.type === ToolResultContentType.EmbeddedResource && getAttachableImageExtension(block.contentType) && block.data.length > 0);
			if (images?.length !== 1) {
				continue;
			}
			const input = getInlineToolInput(call.toolInput);
			if (!input) {
				continue;
			}
			let args: Record<string, unknown>;
			try {
				args = JSON.parse(input);
			} catch {
				// Tool inputs need not be JSON.
				continue;
			}
			if (!args || typeof args !== 'object' || Array.isArray(args)) {
				continue;
			}
			const paths = new Set(imagePathArguments.flatMap(key => typeof args[key] === 'string' ? [resolve(args[key])] : []));
			if (paths.size === 1 && paths.has(href)) {
				const image = images[0];
				if (image.type === ToolResultContentType.EmbeddedResource) {
					return `data:${image.contentType};base64,${image.data}`;
				}
			}
		}
		return undefined;
	};
	const active = chat.activeTurn && fromParts(chat.activeTurn.responseParts);
	if (active) {
		return active;
	}
	for (let index = chat.turns.length - 1; index >= 0; index--) {
		const image = fromParts(chat.turns[index].responseParts);
		if (image) {
			return image;
		}
	}
	return undefined;
}
