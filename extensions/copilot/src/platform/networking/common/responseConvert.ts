/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../util/vs/base/common/assert';
import { IResponseDelta, ResponsePart, ResponsePartKind } from './fetch';

/**
 * Converts a ResponsePart to an IResponseDelta.
 * For non-content parts, the text is set to an empty string.
 * @param part The ResponsePart to convert
 */
export const toResponseDelta = (part: ResponsePart): IResponseDelta => {
	switch (part.kind) {
		case ResponsePartKind.ContentDelta:
			return { text: part.delta };
		case ResponsePartKind.Content:
			return { text: part.content, logprobs: part.logProbs };
		case ResponsePartKind.Annotation:
			return {
				text: '',
				codeVulnAnnotations: part.codeVulnAnnotations,
				ipCitations: part.ipCitations,
				copilotReferences: part.copilotReferences
			};
		case ResponsePartKind.Confirmation:
			return {
				text: '',
				copilotConfirmation: part,
			};
		case ResponsePartKind.Error:
			return {
				text: '',
				copilotErrors: [part.error]
			};
		case ResponsePartKind.ToolCallDelta:
			return {
				text: '',
				copilotToolCalls: [{
					name: part.name,
					arguments: part.delta,
					id: part.partId
				}]
			};
		case ResponsePartKind.ToolCall:
			return {
				text: '',
				copilotToolCalls: [{
					name: part.name,
					arguments: part.arguments,
					id: part.id
				}]
			};
		case ResponsePartKind.ThinkingDelta:
			return { text: '' };
		case ResponsePartKind.Thinking:
			return { text: '' }; // todo@karthiknadig/@connor4312: do we still need this back-compat with responses API?
		default:
			assertNever(part);
	}
};

const staticContentUUID = '8444605d-6c67-42c5-bbcb-a04b83f9f76e';


/**
 * Converts an IResponseDelta to a ResponsePart.
 * For non-content deltas, the text is ignored.
 * @param delta The IResponseDelta to convert
 */
export function* fromResponseDelta(delta: IResponseDelta): Iterable<ResponsePart> {
	if (delta.text && delta.text.length > 0) {
		yield {
			kind: ResponsePartKind.ContentDelta,
			partId: staticContentUUID,
			delta: delta.text
		};
	}
	if (delta.codeVulnAnnotations?.length || delta.ipCitations?.length || delta.copilotReferences?.length) {
		yield {
			kind: ResponsePartKind.Annotation,
			codeVulnAnnotations: delta.codeVulnAnnotations,
			ipCitations: delta.ipCitations,
			copilotReferences: delta.copilotReferences
		};
	}
	if (delta.copilotErrors && delta.copilotErrors.length > 0) {
		yield {
			kind: ResponsePartKind.Error,
			error: delta.copilotErrors[0]
		};
	}
	if (delta.copilotToolCalls && delta.copilotToolCalls.length > 0) {
		for (const toolCall of delta.copilotToolCalls) {
			yield {
				kind: ResponsePartKind.ToolCall,
				partId: toolCall.id,
				name: toolCall.name,
				arguments: toolCall.arguments,
				id: toolCall.id
			};
		}
	}
	if (delta.thinking) {
		yield {
			kind: ResponsePartKind.ThinkingDelta,
			partId: '', // Unknown, must be set by caller if needed
			delta: delta.thinking
		};
	}
	if (delta.copilotConfirmation) {
		yield {
			kind: ResponsePartKind.Confirmation,
			title: delta.copilotConfirmation.title,
			message: delta.copilotConfirmation.message,
			confirmation: delta.copilotConfirmation.confirmation
		};
	}
}
