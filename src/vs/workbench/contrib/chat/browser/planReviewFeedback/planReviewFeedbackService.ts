/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatPlanApprovalAction } from '../../common/chatService/chatService.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { IAgentEditorComment, IAgentEditorCommentsBridge, IAgentEditorCommentsProvider } from '../../../../services/agentEditorComments/common/agentEditorComments.js';

export interface IPlanReviewFeedbackItem {
	readonly id: string;
	readonly resource: URI;
	readonly range: IRange;
	readonly line: number;
	readonly column: number;
	readonly text: string;
}

export interface IPlanReviewFeedbackRegistration {
	readonly sessionResource: URI;
	readonly actions: readonly IChatPlanApprovalAction[];
	readonly hasOverallFeedback: () => boolean;
	readonly submitFeedback: () => Promise<boolean>;
	readonly submitAction: (action: IChatPlanApprovalAction) => Promise<void>;
	readonly reject: () => Promise<void>;
}

export const IPlanReviewFeedbackService = createDecorator<IPlanReviewFeedbackService>('planReviewFeedbackService');

export interface IPlanReviewFeedbackService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeFeedback: Event<URI>;
	readonly onDidChangeNavigation: Event<URI>;
	readonly onDidChangeRegistrations: Event<void>;
	readonly onDidChangePlanReviewScope: Event<{ readonly planUri: URI; readonly sessionResource: URI; readonly active: boolean }>;

	registerPlanReview(planUri: URI, registration: IPlanReviewFeedbackRegistration): IDisposable;
	isActivePlanReview(uri: URI): boolean;
	getPlanReview(uri: URI): IPlanReviewFeedbackRegistration | undefined;
	notifyFeedbackChanged(planUri: URI): void;
	addFeedback(planUri: URI, line: number, column: number, text: string): string;
	removeFeedback(planUri: URI, feedbackId: string): void;
	updateFeedback(planUri: URI, feedbackId: string, newText: string): void;
	getFeedback(planUri: URI): readonly IPlanReviewFeedbackItem[];
	clearFeedback(planUri: URI): void;
	getNextFeedback(planUri: URI, next: boolean): IPlanReviewFeedbackItem | undefined;
	getNavigationBearing(planUri: URI): { activeIdx: number; totalCount: number };
	setNavigationAnchor(planUri: URI, itemId: string | undefined): void;
	submitAllFeedback(planUri: URI): Promise<boolean>;
	submitPlanAction(planUri: URI, action: IChatPlanApprovalAction): Promise<void>;
	rejectPlan(planUri: URI): Promise<void>;
}

interface IPlanReviewRegistration {
	readonly review: IPlanReviewFeedbackRegistration;
	readonly items: IPlanReviewFeedbackItem[];
	readonly existingCommentIds: Set<string>;
	navigationAnchor: string | undefined;
}

export class PlanReviewFeedbackService extends Disposable implements IPlanReviewFeedbackService, IAgentEditorCommentsProvider {

	declare readonly _serviceBrand: undefined;
	readonly priority = 0;

	private readonly _registrations = new Map<string, IPlanReviewRegistration[]>();

	private readonly _onDidChangeFeedback = this._register(new Emitter<URI>());
	readonly onDidChangeFeedback: Event<URI> = this._onDidChangeFeedback.event;

	private readonly _onDidChangeNavigation = this._register(new Emitter<URI>());
	readonly onDidChangeNavigation: Event<URI> = this._onDidChangeNavigation.event;

	private readonly _onDidChangeRegistrations = this._register(new Emitter<void>());
	readonly onDidChangeRegistrations: Event<void> = this._onDidChangeRegistrations.event;
	private readonly _onDidChangePlanReviewScope = this._register(new Emitter<{ readonly planUri: URI; readonly sessionResource: URI; readonly active: boolean }>());
	readonly onDidChangePlanReviewScope = this._onDidChangePlanReviewScope.event;
	readonly onDidChangeComments = Event.signal(Event.any(this.onDidChangeFeedback, this.onDidChangeRegistrations));
	readonly onDidRevealComment = Event.None;

	constructor(
		@IAgentEditorCommentsBridge private readonly _commentsBridge: IAgentEditorCommentsBridge,
	) {
		super();
		this._register(this._commentsBridge.registerProvider(this));
	}

	registerPlanReview(planUri: URI, review: IPlanReviewFeedbackRegistration): IDisposable {
		const key = planUri.toString();
		const registrations = this._registrations.get(key) ?? [];
		const previous = registrations.at(-1);
		if (previous) {
			this._onDidChangePlanReviewScope.fire({ planUri, sessionResource: previous.review.sessionResource, active: false });
		}
		const registration: IPlanReviewRegistration = {
			review,
			items: [],
			existingCommentIds: new Set(),
			navigationAnchor: undefined,
		};
		registrations.push(registration);
		this._registrations.set(key, registrations);
		this._onDidChangePlanReviewScope.fire({ planUri, sessionResource: review.sessionResource, active: true });
		for (const commentId of this._commentsBridge.getCommentIds(planUri, true)) {
			registration.existingCommentIds.add(commentId);
		}
		this._onDidChangeRegistrations.fire();
		return toDisposable(() => {
			const index = registrations.indexOf(registration);
			if (index === -1) {
				return;
			}
			const wasActive = index === registrations.length - 1;
			registrations.splice(index, 1);
			if (registrations.length === 0) {
				this._registrations.delete(key);
			}
			if (wasActive) {
				this._onDidChangePlanReviewScope.fire({ planUri, sessionResource: review.sessionResource, active: false });
				const active = registrations.at(-1);
				if (active) {
					this._onDidChangePlanReviewScope.fire({ planUri, sessionResource: active.review.sessionResource, active: true });
				}
			}
			this._onDidChangeRegistrations.fire();
		});
	}

	isActivePlanReview(uri: URI): boolean {
		return this._getRegistration(uri) !== undefined;
	}

	getPlanReview(uri: URI): IPlanReviewFeedbackRegistration | undefined {
		return this._getRegistration(uri)?.review;
	}

	notifyFeedbackChanged(planUri: URI): void {
		if (this.isActivePlanReview(planUri)) {
			this._onDidChangeFeedback.fire(planUri);
		}
	}

	addFeedback(planUri: URI, line: number, column: number, text: string): string {
		return this._addFeedback(planUri, {
			startLineNumber: line,
			startColumn: column,
			endLineNumber: line,
			endColumn: column,
		}, text);
	}

	private _addFeedback(planUri: URI, range: IRange, text: string): string {
		const registration = this._getRegistration(planUri);
		if (!registration) {
			return '';
		}

		const id = generateUuid();
		registration.items.push({
			id,
			resource: planUri,
			range,
			line: range.startLineNumber,
			column: range.startColumn,
			text,
		});
		registration.items.sort((a, b) => a.line - b.line || a.column - b.column);
		this._onDidChangeFeedback.fire(planUri);
		return id;
	}

	removeFeedback(planUri: URI, feedbackId: string): void {
		const registration = this._getRegistration(planUri);
		if (!registration) {
			return;
		}

		const idx = registration.items.findIndex(item => item.id === feedbackId);
		if (idx >= 0) {
			registration.items.splice(idx, 1);
			this._onDidChangeFeedback.fire(planUri);
			return;
		}
		const item = this.getFeedback(planUri).find(candidate => candidate.id === feedbackId);
		if (item) {
			this._commentsBridge.deleteComment(planUri, item.id);
		}
	}

	updateFeedback(planUri: URI, feedbackId: string, newText: string): void {
		const registration = this._getRegistration(planUri);
		if (!registration) {
			return;
		}

		const idx = registration.items.findIndex(item => item.id === feedbackId);
		if (idx >= 0) {
			const old = registration.items[idx];
			registration.items[idx] = { ...old, text: newText };
			this._onDidChangeFeedback.fire(planUri);
		}
	}

	getFeedback(planUri: URI): readonly IPlanReviewFeedbackItem[] {
		const registration = this._getRegistration(planUri);
		if (!registration) {
			return [];
		}
		return this._commentsBridge.getComments(planUri, true)
			.filter(comment => !registration.existingCommentIds.has(comment.id))
			.map(comment => ({
				id: comment.id,
				resource: comment.resource,
				range: comment.range,
				line: comment.range.startLineNumber,
				column: comment.range.startColumn,
				text: comment.body,
			}));
	}

	clearFeedback(planUri: URI): void {
		const registration = this._getRegistration(planUri);
		if (!registration) {
			return;
		}
		const feedback = this.getFeedback(planUri);
		const localIds = new Set(registration.items.map(item => item.id));
		registration.items.length = 0;
		registration.navigationAnchor = undefined;
		for (const item of feedback) {
			if (!localIds.has(item.id)) {
				this._commentsBridge.deleteComment(planUri, item.id);
			}
		}
		this._onDidChangeFeedback.fire(planUri);
	}

	getNextFeedback(planUri: URI, next: boolean): IPlanReviewFeedbackItem | undefined {
		const registration = this._getRegistration(planUri);
		const items = this.getFeedback(planUri);
		if (!registration || items.length === 0) {
			return undefined;
		}

		const anchorIdx = registration.navigationAnchor
			? items.findIndex(item => item.id === registration.navigationAnchor)
			: -1;

		let targetIdx: number;
		if (anchorIdx === -1) {
			targetIdx = next ? 0 : items.length - 1;
		} else {
			targetIdx = next
				? (anchorIdx + 1) % items.length
				: (anchorIdx - 1 + items.length) % items.length;
		}

		const target = items[targetIdx];
		this.setNavigationAnchor(planUri, target.id);
		this._commentsBridge.revealComment(target.resource, target.id);
		return target;
	}

	getNavigationBearing(planUri: URI): { activeIdx: number; totalCount: number } {
		const registration = this._getRegistration(planUri);
		if (!registration) {
			return { activeIdx: -1, totalCount: 0 };
		}

		const items = this.getFeedback(planUri);
		const totalCount = items.length;
		if (!registration.navigationAnchor) {
			return { activeIdx: -1, totalCount };
		}

		const activeIdx = items.findIndex(item => item.id === registration.navigationAnchor);
		return { activeIdx, totalCount };
	}

	setNavigationAnchor(planUri: URI, itemId: string | undefined): void {
		const registration = this._getRegistration(planUri);
		if (registration) {
			registration.navigationAnchor = itemId;
			this._onDidChangeNavigation.fire(planUri);
		}
	}

	async submitAllFeedback(planUri: URI): Promise<boolean> {
		const registration = this._getRegistration(planUri);
		if (!registration || (this.getFeedback(planUri).length === 0 && !registration.review.hasOverallFeedback())) {
			return false;
		}

		return registration.review.submitFeedback();
	}

	submitPlanAction(planUri: URI, action: IChatPlanApprovalAction): Promise<void> {
		return this._getRegistration(planUri)?.review.submitAction(action) ?? Promise.resolve();
	}

	rejectPlan(planUri: URI): Promise<void> {
		return this._getRegistration(planUri)?.review.reject() ?? Promise.resolve();
	}

	acceptsComments(resource: URI): boolean {
		return this.isActivePlanReview(resource);
	}

	getComments(resource: URI): readonly IAgentEditorComment[] {
		return this._getRegistration(resource)?.items.map(item => ({
			id: item.id,
			resource,
			range: item.range,
			body: item.text,
		})) ?? [];
	}

	getCommentIds(resource: URI): readonly string[] {
		return this._getRegistration(resource)?.items.map(item => item.id) ?? [];
	}

	addComment(resource: URI, range: IRange, body: string): void {
		this._addFeedback(resource, range, body);
	}

	deleteComment(resource: URI, id: string): void {
		this.removeFeedback(resource, id);
	}

	private _getRegistration(planUri: URI): IPlanReviewRegistration | undefined {
		return this._registrations.get(planUri.toString())?.at(-1);
	}
}
