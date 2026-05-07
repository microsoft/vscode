/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { FetchSuccess } from '../../../platform/chat/common/commonTypes';
import { OpenAIContextManagementResponse } from '../../../platform/networking/common/openai';
import { isEncryptedThinkingDelta, ThinkingData, ThinkingDelta } from '../../../platform/thinking/common/thinking';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IToolCall, IToolCallRound } from './intents';


/**
 * Represents a round of tool calling from the AI assistant.
 * Each round contains the assistant's response text, any tool calls it made,
 * and retry information if there were input validation issues.
 */
export class ToolCallRound implements IToolCallRound {
	public summary: string | undefined;
	public phase?: string;
	public phaseModelId?: string;

	/**
	 * Creates a ToolCallRound from an existing IToolCallRound object.
	 * Prefer this over using a constructor overload to keep construction explicit.
	 */
	public static create(params: Omit<IToolCallRound, 'id'> & { id?: string }): ToolCallRound {
		const round = new ToolCallRound(
			params.response,
			params.toolCalls,
			params.toolInputRetry,
			params.id,
			params.statefulMarker,
			params.thinking,
			params.timestamp,
			params.compaction,
		);
		round.summary = params.summary;
		round.phase = params.phase;
		round.phaseModelId = params.phaseModelId;
		return round;
	}

	/**
	 * @param response The text response from the assistant
	 * @param toolCalls The tool calls made by the assistant
	 * @param toolInputRetry The number of times this round has been retried due to tool input validation failures
	 * @param id A stable identifier for this round
	 * @param statefulMarker Optional stateful marker used with the responses API
	 * @param thinking Optional thinking/reasoning data
	 * @param timestamp Epoch millis when this round started (defaults to `Date.now()`)
	 */
	constructor(
		public readonly response: string,
		public readonly toolCalls: IToolCall[] = [],
		public readonly toolInputRetry: number = 0,
		public readonly id: string = ToolCallRound.generateID(),
		public readonly statefulMarker?: string,
		public readonly thinking?: ThinkingData,
		public readonly timestamp: number = Date.now(),
		public readonly compaction?: OpenAIContextManagementResponse,
	) { }

	private static generateID(): string {
		return generateUuid();
	}
}

export class ThinkingDataItem implements ThinkingData {
	public text: string | string[] = '';
	public metadata?: { [key: string]: any };
	public tokens?: number;
	public encrypted?: string;

	static createOrUpdate(item: ThinkingDataItem | undefined, delta: ThinkingDelta) {
		if (!item) {
			item = new ThinkingDataItem(delta.id ?? generateUuid());
		}

		item.update(delta);
		return item;
	}

	constructor(
		public id: string
	) { }

	public update(delta: ThinkingDelta): void {
		if (delta.id && this.id !== delta.id) {
			this.id = delta.id;
		}
		if (isEncryptedThinkingDelta(delta)) {
			this.encrypted = delta.encrypted;
		}
		if (delta.text !== undefined) {

			// handles all possible text states
			if (Array.isArray(delta.text)) {
				if (Array.isArray(this.text)) {
					this.text.push(...delta.text);
				} else if (this.text) {
					this.text = [this.text, ...delta.text];
				} else {
					this.text = [...delta.text];
				}
			} else {
				if (Array.isArray(this.text)) {
					this.text.push(delta.text);
				} else {
					this.text += delta.text;
				}
			}
		}
		if (delta.metadata) {
			this.metadata = delta.metadata;
		}
	}

	public updateWithFetchResult(fetchResult: FetchSuccess<unknown>): void {
		this.tokens = fetchResult.usage?.completion_tokens_details?.reasoning_tokens;
	}
}