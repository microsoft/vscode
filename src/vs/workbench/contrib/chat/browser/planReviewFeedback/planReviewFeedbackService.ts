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
import { IAgentEditorComment, IAgentEditorCommentsBridge, IAgentEditorCommentsProvider, IAgentEditorReview } from '../../../../services/agentEditorComments/common/agentEditorComments.js';

export interface IPlanReviewFeedbackItem {
	readonly id: string;
	readonly line: number;
	readonly column: number;
	readonly endLine: number;
	readonly endColumn: number;
	readonly text: string;
}

export interface IPlanReviewFeedbackRegistration {
	readonly actions: readonly IChatPlanApprovalAction[];
	readonly canProvideFeedback: boolean;
	readonly submitFeedback: (overallFeedback?: string) => Promise<void>;
	readonly submitAction: (action: IChatPlanApprovalAction) => Promise<void>;
	readonly reject: () => Promise<void>;
}

export const IPlanReviewFeedbackService = createDecorator<IPlanReviewFeedbackService>('planReviewFeedbackService');

export interface IPlanReviewFeedbackService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeFeedback: Event<URI>;
	readonly onDidChangeNavigation: Event<URI>;
	readonly onDidChangeRegistrations: Event<void>;

	registerPlanReview(planUri: URI, registration: IPlanReviewFeedbackRegistration): IDisposable;
	isActivePlanReview(uri: URI): boolean;
	canProvideFeedback(uri: URI): boolean;
	getPlanReview(uri: URI): IPlanReviewFeedbackRegistration | undefined;
	addFeedback(planUri: URI, line: number, column: number, text: string): string;
	addFeedbackForRange(planUri: URI, range: IRange, text: string): string;
	removeFeedback(planUri: URI, feedbackId: string): void;
	updateFeedback(planUri: URI, feedbackId: string, newText: string): void;
	updateFeedbackRanges(planUri: URI, updates: readonly { id: string; range: IRange }[]): void;
	getFeedback(planUri: URI): readonly IPlanReviewFeedbackItem[];
	clearFeedback(planUri: URI): void;
	getNextFeedback(planUri: URI, next: boolean): IPlanReviewFeedbackItem | undefined;
	getNavigationBearing(planUri: URI): { activeIdx: number; totalCount: number };
	setNavigationAnchor(planUri: URI, itemId: string | undefined): void;
	submitAllFeedback(planUri: URI): Promise<void>;
	submitPlanAction(planUri: URI, action: IChatPlanApprovalAction): Promise<void>;
	rejectPlan(planUri: URI): Promise<void>;
}

interface IPlanReviewRegistration {
	readonly review: IPlanReviewFeedbackRegistration;
	readonly items: IPlanReviewFeedbackItem[];
	navigationAnchor: string | undefined;
	navigationRequestId: number;
}

export class PlanReviewFeedbackService extends Disposable implements IPlanReviewFeedbackService, IAgentEditorCommentsProvider {

	declare readonly _serviceBrand: undefined;

	private readonly _registrations = new Map<string, IPlanReviewRegistration>();

	private readonly _onDidChangeFeedback = this._register(new Emitter<URI>());
	readonly onDidChangeFeedback: Event<URI> = this._onDidChangeFeedback.event;

	private readonly _onDidChangeNavigation = this._register(new Emitter<URI>());
	readonly onDidChangeNavigation: Event<URI> = this._onDidChangeNavigation.event;

	private readonly _onDidChangeRegistrations = this._register(new Emitter<void>());
	readonly onDidChangeRegistrations: Event<void> = this._onDidChangeRegistrations.event;

	readonly onDidChangeComments = Event.any(Event.signal(this.onDidChangeFeedback), Event.signal(this.onDidChangeNavigation), this.onDidChangeRegistrations);
	readonly onDidRevealComment = Event.None;

	constructor(
		@IAgentEditorCommentsBridge bridge: IAgentEditorCommentsBridge,
	) {
		super();
		this._register(bridge.registerProvider(this));
	}

	registerPlanReview(planUri: URI, review: IPlanReviewFeedbackRegistration): IDisposable {
		const key = planUri.toString();
		this._registrations.set(key, { review, items: [], navigationAnchor: undefined, navigationRequestId: 0 });
		this._onDidChangeRegistrations.fire();
		return toDisposable(() => {
			this._registrations.delete(key);
			this._onDidChangeRegistrations.fire();
		});
	}

	isActivePlanReview(uri: URI): boolean {
		return this._registrations.has(uri.toString());
	}

	canProvideFeedback(uri: URI): boolean {
		return this._registrations.get(uri.toString())?.review.canProvideFeedback ?? false;
	}

	getPlanReview(uri: URI): IPlanReviewFeedbackRegistration | undefined {
		return this._registrations.get(uri.toString())?.review;
	}

	addFeedback(planUri: URI, line: number, column: number, text: string): string {
		return this.addFeedbackForRange(planUri, {
			startLineNumber: line,
			startColumn: column,
			endLineNumber: line,
			endColumn: column,
		}, text);
	}

	addFeedbackForRange(planUri: URI, range: IRange, text: string): string {
		const key = planUri.toString();
		const registration = this._registrations.get(key);
		if (!registration?.review.canProvideFeedback) {
			return '';
		}

		const id = generateUuid();
		registration.items.push({
			id,
			line: range.startLineNumber,
			column: range.startColumn,
			endLine: range.endLineNumber,
			endColumn: range.endColumn,
			text,
		});
		// Keep items sorted by line number
		registration.items.sort((a, b) => a.line - b.line || a.column - b.column);
		this._onDidChangeFeedback.fire(planUri);
		return id;
	}

	removeFeedback(planUri: URI, feedbackId: string): void {
		const key = planUri.toString();
		const registration = this._registrations.get(key);
		if (!registration) {
			return;
		}

		const idx = registration.items.findIndex(item => item.id === feedbackId);
		if (idx >= 0) {
			registration.items.splice(idx, 1);
			this._onDidChangeFeedback.fire(planUri);
		}
	}

	updateFeedback(planUri: URI, feedbackId: string, newText: string): void {
		const key = planUri.toString();
		const registration = this._registrations.get(key);
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

	updateFeedbackRanges(planUri: URI, updates: readonly { id: string; range: IRange }[]): void {
		const registration = this._registrations.get(planUri.toString());
		if (!registration) {
			return;
		}

		const rangesById = new Map(updates.map(update => [update.id, update.range]));
		let didChange = false;
		for (let index = 0; index < registration.items.length; index++) {
			const item = registration.items[index];
			const range = rangesById.get(item.id);
			if (!range
				|| item.line === range.startLineNumber
				&& item.column === range.startColumn
				&& item.endLine === range.endLineNumber
				&& item.endColumn === range.endColumn) {
				continue;
			}
			registration.items[index] = {
				...item,
				line: range.startLineNumber,
				column: range.startColumn,
				endLine: range.endLineNumber,
				endColumn: range.endColumn,
			};
			didChange = true;
		}
		if (didChange) {
			registration.items.sort((a, b) => a.line - b.line || a.column - b.column);
			this._onDidChangeFeedback.fire(planUri);
		}
	}

	getFeedback(planUri: URI): readonly IPlanReviewFeedbackItem[] {
		const key = planUri.toString();
		return this._registrations.get(key)?.items ?? [];
	}

	clearFeedback(planUri: URI): void {
		const key = planUri.toString();
		const registration = this._registrations.get(key);
		if (!registration || registration.items.length === 0) {
			return;
		}
		registration.items.length = 0;
		registration.navigationAnchor = undefined;
		this._onDidChangeFeedback.fire(planUri);
	}

	getNextFeedback(planUri: URI, next: boolean): IPlanReviewFeedbackItem | undefined {
		const key = planUri.toString();
		const registration = this._registrations.get(key);
		if (!registration || registration.items.length === 0) {
			return undefined;
		}

		const items = registration.items;
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
		return target;
	}

	getNavigationBearing(planUri: URI): { activeIdx: number; totalCount: number } {
		const key = planUri.toString();
		const registration = this._registrations.get(key);
		if (!registration) {
			return { activeIdx: -1, totalCount: 0 };
		}

		const totalCount = registration.items.length;
		if (!registration.navigationAnchor) {
			return { activeIdx: -1, totalCount };
		}

		const activeIdx = registration.items.findIndex(item => item.id === registration.navigationAnchor);
		return { activeIdx, totalCount };
	}

	setNavigationAnchor(planUri: URI, itemId: string | undefined): void {
		const key = planUri.toString();
		const registration = this._registrations.get(key);
		if (registration) {
			registration.navigationAnchor = itemId;
			registration.navigationRequestId++;
			this._onDidChangeNavigation.fire(planUri);
		}
	}

	submitAllFeedback(planUri: URI): Promise<void> {
		const key = planUri.toString();
		const registration = this._registrations.get(key);
		if (!registration || registration.items.length === 0) {
			return Promise.resolve();
		}

		return registration.review.submitFeedback();
	}

	submitPlanAction(planUri: URI, action: IChatPlanApprovalAction): Promise<void> {
		return this._registrations.get(planUri.toString())?.review.submitAction(action) ?? Promise.resolve();
	}

	rejectPlan(planUri: URI): Promise<void> {
		return this._registrations.get(planUri.toString())?.review.reject() ?? Promise.resolve();
	}

	acceptsComments(resource: URI): boolean {
		return this.canProvideFeedback(resource);
	}

	getComments(resource: URI): readonly IAgentEditorComment[] {
		return this.getFeedback(resource).map(item => ({
			id: item.id,
			range: {
				startLineNumber: item.line,
				startColumn: item.column,
				endLineNumber: item.endLine,
				endColumn: item.endColumn,
			},
			body: item.text,
		}));
	}

	addComment(resource: URI, range: IRange, body: string): void {
		this.addFeedbackForRange(resource, range, body);
	}

	updateCommentRange(resource: URI, id: string, range: IRange): void {
		this.updateFeedbackRanges(resource, [{ id, range }]);
	}

	deleteComment(resource: URI, id: string): void {
		this.removeFeedback(resource, id);
	}

	getReview(resource: URI): IAgentEditorReview | undefined {
		const registration = this._registrations.get(resource.toString());
		if (!registration) {
			return undefined;
		}
		return {
			activeFeedbackId: registration.navigationAnchor,
			activeFeedbackRequestId: registration.navigationRequestId,
		};
	}
}
