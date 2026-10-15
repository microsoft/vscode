/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extname, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { isAddArtifactOrReferenceTool } from '../../../../platform/agentHost/common/serverToolNames.js';
import { parseSessionArtifactInputs } from '../../../../platform/agentHost/common/sessionArtifactCollection.js';
import { SessionArtifactType } from '../../../../platform/agentHost/common/sessionArtifacts.js';
import { AgentHostCompletionReferenceKind, getAgentHostCompletionReferenceKind } from './attachments/chatVariableEntries.js';
import { IChatToolInvocation, type IChatToolInvocationSerialized } from './chatService/chatService.js';
import type { IChatRequestModel } from './model/chatModel.js';
import { isToolResultInputOutputDetails } from './tools/languageModelToolsService.js';

/** What a media preview shows. */
export const enum ChatMediaKind {
	Video = 'video',
	Deck = 'deck',
}

/** A video or slide deck that an agent recorded as an artifact of its turn. */
export interface IChatMediaItem {
	readonly kind: ChatMediaKind;
	readonly uri: URI;
	readonly label: string;
}

const kindByExtension: ReadonlyMap<string, ChatMediaKind> = new Map([
	['.mp4', ChatMediaKind.Video],
	['.webm', ChatMediaKind.Video],
	['.pdf', ChatMediaKind.Deck],
]);

/** The WebM rendition of a video, which is what VS Code's window can play: the file itself, or one beside it. */
export function getChatMediaWebm(uri: URI): URI {
	return uri.with({ path: uri.path.replace(/\.[^./]*$/, '.webm') });
}

function parseJson(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}

/** The tool call's arguments, wherever the harness that made the call keeps them. */
function readToolInput(invocation: IChatToolInvocation | IChatToolInvocationSerialized): unknown {
	if (invocation.toolSpecificData?.kind === 'input') {
		const rawInput: unknown = invocation.toolSpecificData.rawInput;
		return typeof rawInput === 'string' ? parseJson(rawInput) : rawInput;
	}
	if (invocation.toolSpecificData?.kind === 'simpleToolInvocation' && invocation.toolSpecificData.input) {
		return parseJson(invocation.toolSpecificData.input);
	}
	const details = IChatToolInvocation.resultDetails(invocation);
	return isToolResultInputOutputDetails(details) ? parseJson(details.input) : undefined;
}

function isToolInvocation(part: { readonly kind: string }): part is IChatToolInvocation | IChatToolInvocationSerialized {
	return part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized';
}

/** The videos and decks recorded as artifacts by a response's finished `add_artifact_or_reference` calls, once each. */
export function getChatMediaItems(parts: ReadonlyArray<{ readonly kind: string }>): IChatMediaItem[] {
	const items: IChatMediaItem[] = [];
	for (const part of parts) {
		if (!isToolInvocation(part) || !isAddArtifactOrReferenceTool(part.toolId) || !IChatToolInvocation.isComplete(part) || IChatToolInvocation.resultError(part)) {
			continue;
		}
		const details = IChatToolInvocation.resultDetails(part);
		if (isToolResultInputOutputDetails(details) && details.isError) {
			continue;
		}
		let inputs;
		try {
			inputs = parseSessionArtifactInputs(readToolInput(part), part.toolId);
		} catch {
			continue;
		}
		for (const input of inputs) {
			if (input.type !== SessionArtifactType.File || !input.isArtifact || !input.uri) {
				continue;
			}
			const uri = URI.parse(input.uri);
			const kind = kindByExtension.get(extname(uri).toLowerCase());
			const key = kind === ChatMediaKind.Video ? getChatMediaWebm(uri) : uri;
			if (kind && !items.some(item => isEqual(item.kind === ChatMediaKind.Video ? getChatMediaWebm(item.uri) : item.uri, key))) {
				items.push({ kind, uri, label: input.label });
			}
		}
	}
	return items;
}

/** What {@link isChatMediaPreviewTurn} reads from a request. */
export type IChatMediaPreviewRequest = Pick<IChatRequestModel, 'id' | 'message' | 'variableData'>;

/** The skills a request runs: the one its text starts with (`/<skill> …`), and any attached as a skill reference. */
function getRequestSkills(request: IChatMediaPreviewRequest): string[] {
	const skills: string[] = [];
	const leading = /^\/(?<name>\S+)/.exec(request.message.text.trimStart())?.groups?.name;
	if (leading) {
		skills.push(leading);
	}
	for (const entry of request.variableData.variables) {
		if (getAgentHostCompletionReferenceKind(entry) === AgentHostCompletionReferenceKind.Skill) {
			skills.push(entry.name.replace(/^\//, ''));
		}
	}
	return skills.map(skill => skill.toLowerCase());
}

/** Whether the turn of {@link requestId}, or an earlier turn of its chat, ran one of {@link skills} (named without the slash). */
export function isChatMediaPreviewTurn(requests: readonly IChatMediaPreviewRequest[], requestId: string, skills: readonly string[]): boolean {
	const wanted = new Set(skills.map(skill => skill.toLowerCase()));
	if (!wanted.size) {
		return false;
	}
	for (const request of requests) {
		if (getRequestSkills(request).some(skill => wanted.has(skill))) {
			return true;
		}
		if (request.id === requestId) {
			return false;
		}
	}
	return false;
}
