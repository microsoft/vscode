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

export interface IPlanReviewFeedbackItem {
	readonly id: string;
	readonly line: number;
	readonly column: number;
	readonly text: string;
}

export interface IPlanReviewFeedbackRegistration {
	readonly actions: readonly IChatPlanApprovalAction[];
	readonly hasOverallFeedback: () => boolean;
	readonly submitFeedback: () => Promise<void>;
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
	submitAllFeedback(planUri: URI): Promise<void>;
	submitPlanAction(planUri: URI, action: IChatPlanApprovalAction): Promise<void>;
	rejectPlan(planUri: URI): Promise<void>;
}

interface IPlanReviewRegistration {
	readonly review: IPlanReviewFeedbackRegistration;
	readonly items: IPlanReviewFeedbackItem[];
	navigationAnchor: string | undefined;
}

export class PlanReviewFeedbackService extends Disposable implements IPlanReviewFeedbackService {

	declare readonly _serviceBrand: undefined;

	private readonly _registrations = new Map<string, IPlanReviewRegistration>();

	private readonly _onDidChangeFeedback = this._register(new Emitter<URI>());
	readonly onDidChangeFeedback: Event<URI> = this._onDidChangeFeedback.event;

	private readonly _onDidChangeNavigation = this._register(new Emitter<URI>());
	readonly onDidChangeNavigation: Event<URI> = this._onDidChangeNavigation.event;

	private readonly _onDidChangeRegistrations = this._register(new Emitter<void>());
	readonly onDidChangeRegistrations: Event<void> = this._onDidChangeRegistrations.event;

	registerPlanReview(planUri: URI, review: IPlanReviewFeedbackRegistration): IDisposable {
		const key = planUri.toString();
		this._registrations.set(key, { review, items: [], navigationAnchor: undefined });
		this._onDidChangeRegistrations.fire();
		return toDisposable(() => {
			this._registrations.delete(key);
			this._onDidChangeRegistrations.fire();
		});
	}

	isActivePlanReview(uri: URI): boolean {
		return this._registrations.has(uri.toString());
	}

	getPlanReview(uri: URI): IPlanReviewFeedbackRegistration | undefined {
		return this._registrations.get(uri.toString())?.review;
	}

	notifyFeedbackChanged(planUri: URI): void {
		if (this.isActivePlanReview(planUri)) {
			this._onDidChangeFeedback.fire(planUri);
		}
	}

	addFeedback(planUri: URI, line: number, column: number, text: string): string {
		const key = planUri.toString();
		const registration = this._registrations.get(key);
		if (!registration) {
			return '';
		}

		const id = generateUuid();
		registration.items.push({ id, line, column, text });
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
			registration.items[idx] = { id: old.id, line: old.line, column: old.column, text: newText };
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
			this._onDidChangeNavigation.fire(planUri);
		}
	}

	submitAllFeedback(planUri: URI): Promise<void> {
		const key = planUri.toString();
		const registration = this._registrations.get(key);
		if (!registration || (registration.items.length === 0 && !registration.review.hasOverallFeedback())) {
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
}
