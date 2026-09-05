/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { UriComponents } from '../../../../../../base/common/uri.js';
import { IChatPlanApprovalAction, IChatPlanReview, IChatPlanReviewResult } from '../../chatService/chatService.js';
import { ToolDataSource } from '../../tools/languageModelToolsService.js';

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

	public draftFeedback: string | undefined;
	public draftCollapsed: boolean | undefined;

	constructor(
		public title: string,
		public content: string,
		public actions: IChatPlanApprovalAction[],
		public canProvideFeedback: boolean,
		public planUri?: UriComponents,
		public resolveId?: string,
		public data?: IChatPlanReviewResult,
		public isUsed?: boolean,
		public source?: ToolDataSource,
		public isOutdated?: boolean,
	) { }

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
