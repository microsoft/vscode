/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import type { IReasoningTiming } from '../../common/sessionDataService.js';
import { ActionType, type ChatReasoningAction } from '../../common/state/sessionActions.js';

interface IReasoningInterval {
	readonly turnId: string;
	readonly startedAt: string;
	readonly content: string[];
	duration: number;
	active?: { readonly reasoningId: string; readonly partId: string; readonly startedAt: string; readonly clock: StopWatch };
}

/** Measures live fragments and associates their total with the SDK's durable assistant message. */
export class CopilotReasoningTiming extends Disposable {
	private readonly _intervals = new Map<string | undefined, IReasoningInterval>();

	constructor(
		private readonly _emit: (action: ChatReasoningAction, parentToolCallId: string | undefined) => void,
		private readonly _persist: (turnId: string, responseId: string, timing: IReasoningTiming) => void,
	) {
		super();
	}

	activePartId(turnId: string, reasoningId: string, parentToolCallId: string | undefined): string | undefined {
		const interval = this._intervals.get(parentToolCallId);
		return interval?.turnId === turnId && interval.active?.reasoningId === reasoningId ? interval.active.partId : undefined;
	}

	start(turnId: string, reasoningId: string, partId: string, parentToolCallId: string | undefined): string {
		this.finish(parentToolCallId);
		const startedAt = new Date().toISOString();
		if (this._intervals.get(parentToolCallId)?.turnId !== turnId) {
			this._intervals.set(parentToolCallId, { turnId, startedAt, content: [], duration: 0 });
		}
		const interval = this._intervals.get(parentToolCallId)!;
		interval.active = { reasoningId, partId, startedAt, clock: StopWatch.create() };
		return startedAt;
	}

	append(content: string, parentToolCallId: string | undefined): void {
		this._intervals.get(parentToolCallId)?.content.push(content);
	}

	finish(parentToolCallId: string | undefined, reasoningId?: string): void {
		const interval = this._intervals.get(parentToolCallId);
		if (!interval?.active || (reasoningId !== undefined && reasoningId !== interval.active.reasoningId)) {
			return;
		}
		const { partId, startedAt, clock } = interval.active;
		const duration = Math.max(0, Math.round(clock.elapsed()));
		interval.active = undefined;
		interval.duration += duration;
		this._emit({ type: ActionType.ChatReasoning, turnId: interval.turnId, partId, content: '', startedAt, duration }, parentToolCallId);
	}

	completeMessage(responseId: string, reasoningText: string | undefined, parentToolCallId: string | undefined): boolean {
		this.finish(parentToolCallId);
		const interval = this._intervals.get(parentToolCallId);
		const recorded = interval !== undefined && !!reasoningText && interval.content.join('') === reasoningText;
		if (recorded) {
			this._persist(interval.turnId, responseId, { startedAt: interval.startedAt, duration: interval.duration });
		}
		this.clear(parentToolCallId);
		return recorded;
	}

	clear(parentToolCallId: string | undefined): void {
		this._intervals.delete(parentToolCallId);
	}

	override dispose(): void {
		this._intervals.clear();
		super.dispose();
	}
}
