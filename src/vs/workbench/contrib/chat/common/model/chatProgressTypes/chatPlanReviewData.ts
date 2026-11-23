/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { derived, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI, UriComponents } from '../../../../../../base/common/uri.js';
import { IRange } from '../../../../../../editor/common/core/range.js';
import { IChatPlanApprovalAction, IChatPlanReview, IChatPlanReviewResult } from '../../chatService/chatService.js';
import { ToolDataSource } from '../../tools/languageModelToolsService.js';

/** A comment on a line of the plan under review. */
export interface IChatPlanReviewFeedbackItem {
	readonly id: string;
	readonly resource: URI;
	readonly range: IRange;
	readonly line: number;
	readonly column: number;
	readonly text: string;
}

/**
 * The comments on the plan of one review, whichever widget shows it, as each that shows its chat can render it: in its
 * input, or in its list.
 */
export class ChatPlanReviewFeedback {
	readonly items: IChatPlanReviewFeedbackItem[] = [];
	/** The comments the plan already had as the review started, which are not its own. */
	readonly existingCommentIds = new Set<string>();
	navigationAnchor: string | undefined;
}

/**
 * Runtime representation of a plan review widget with a {@link DeferredPromise}
 * that is resolved when the user approves or rejects the plan. {@link toJSON}
 * strips the completion so only serialisable data is persisted.
 */
export class ChatPlanReviewData implements IChatPlanReview {
	public readonly kind = 'planReview' as const;
	public readonly completion = new DeferredPromise<IChatPlanReviewResult | undefined>();
	private readonly _onDidDismiss = new Emitter<void>();
	readonly onDidDismiss: Event<void> = this._onDidDismiss.event;
	private readonly _isUsed = observableValue<boolean | undefined>(this, undefined);
	/** Whether the review is settled: answered or dismissed, through any widget that shows its chat, or elsewhere. */
	public readonly used: IObservable<boolean> = derived(this, reader => !!this._isUsed.read(reader));
	get isUsed(): boolean | undefined { return this._isUsed.get(); }
	set isUsed(value: boolean | undefined) { this._isUsed.set(value, undefined); }

	/** The comments on the plan, and the overall comment ({@link draftFeedback}), shared by every widget that shows the review. */
	public readonly feedback = new ChatPlanReviewFeedback();

	public draftFeedback: string | undefined;
	public draftCollapsed: boolean | undefined;

	/**
	 * Set to `true` only when a person settled the review through its own UI. A voice answer and a dismissal
	 * caused by cancellation or disposal leave it unset. Not persisted.
	 */
	public submittedByUser?: boolean;

	constructor(
		public title: string,
		public content: string,
		public actions: IChatPlanApprovalAction[],
		public canProvideFeedback: boolean,
		public planUri?: UriComponents,
		public resolveId?: string,
		public data?: IChatPlanReviewResult,
		isUsed?: boolean,
		public source?: ToolDataSource,
		public isOutdated?: boolean,
	) {
		this.isUsed = isUsed;
	}

	/** Dismiss without a user choice (e.g. the response was cancelled). */
	dismiss(): void {
		if (this.isUsed) {
			return;
		}
		this.isUsed = true;
		this.draftFeedback = undefined;
		this.draftCollapsed = undefined;
		void this.completion.complete(undefined);
		this._onDidDismiss.fire();
	}

	toJSON(): IChatPlanReview {
		return {
			kind: this.kind,
			title: this.title,
			content: this.content,
			actions: this.actions,
			canProvideFeedback: this.canProvideFeedback,
			planUri: this.planUri,
			resolveId: this.resolveId,
			data: this.data,
			isUsed: this.isUsed,
			isOutdated: this.isOutdated,
			source: this.source,
		};
	}
}
