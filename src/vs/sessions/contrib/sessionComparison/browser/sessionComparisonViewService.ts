/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { getSessionComparisonParticipantsInDisplayOrder, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../services/sessions/common/sessionComparison.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionTurnTarget, revealSessionTurn } from './sessionComparisonNavigation.js';

/** The custom view that shows a comparison as one conversation. */
export const SESSION_COMPARISON_VIEW_ID = 'sessions.comparison';
const ACTIVE_COMPARISON_STORAGE_KEY = 'sessions.comparisonView.activeComparison';

export const ISessionComparisonViewService = createDecorator<ISessionComparisonViewService>('sessionComparisonViewService');

export interface ISessionComparisonViewService {
	readonly _serviceBrand: undefined;
	/** The comparison the comparison view shows. */
	readonly activeComparisonId: IObservable<string | undefined>;
	/** Shows the comparison as one conversation, in place of the session grid. */
	open(comparisonId: string): Promise<void>;
	/** Opens every available run side by side in the session grid. */
	openSideBySide(comparisonId: string): Promise<void>;
	/**
	 * Opens a participant's session. With a target, also reveals the turn it
	 * points at, so a reference lands where the run did the work.
	 */
	openParticipant(comparisonId: string, participantId: string, target?: ISessionTurnTarget): Promise<void>;
	/** Hides the comparison view when it is showing. */
	close(): void;
}

export class SessionComparisonViewService extends Disposable implements ISessionComparisonViewService {
	declare readonly _serviceBrand: undefined;

	private readonly _activeComparisonId = observableValue<string | undefined>(this, undefined);
	readonly activeComparisonId: IObservable<string | undefined> = this._activeComparisonId;

	constructor(
		@ISessionComparisonService private readonly comparisonService: ISessionComparisonService,
		@ISessionsManagementService private readonly managementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ICustomViewService private readonly customViewService: ICustomViewService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this._activeComparisonId.set(this.storageService.get(ACTIVE_COMPARISON_STORAGE_KEY, StorageScope.WORKSPACE), undefined);
	}

	async open(comparisonId: string): Promise<void> {
		if (!this.comparisonService.getComparison(comparisonId)) {
			throw new Error(localize('sessionComparison.missing', "This comparison is no longer available."));
		}
		this._activeComparisonId.set(comparisonId, undefined);
		this.storageService.store(ACTIVE_COMPARISON_STORAGE_KEY, comparisonId, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		this.customViewService.showCustomView(SESSION_COMPARISON_VIEW_ID);
	}

	async openSideBySide(comparisonId: string): Promise<void> {
		const comparison = this.comparisonService.getComparison(comparisonId);
		if (!comparison) {
			throw new Error(localize('sessionComparison.missing', "This comparison is no longer available."));
		}
		const availableAttempts = getSessionComparisonParticipantsInDisplayOrder(comparison.participants).flatMap(participant => {
			if (participant.role !== SessionComparisonParticipantRole.Attempt || !participant.sessionResource) {
				return [];
			}
			const session = this.managementService.getSession(participant.sessionResource);
			return session ? [session] : [];
		});
		if (!availableAttempts.length) {
			throw new Error(localize('sessionComparison.noAttempts', "No comparison runs are available to open."));
		}
		// SessionComparisonGridController hides and later restores the side pane once
		// the grid is actually shown, so a cancelled or single-run open leaves it alone.
		await this.sessionsService.openSessionsInGrid(availableAttempts);
	}

	async openParticipant(comparisonId: string, participantId: string, target?: ISessionTurnTarget): Promise<void> {
		const participant = this.comparisonService.getComparison(comparisonId)?.participants.find(candidate => candidate.id === participantId);
		if (!participant?.sessionResource) {
			return;
		}
		await this.sessionsService.openSession(participant.sessionResource, { source: 'chat' });
		if (!target) {
			return;
		}
		const chatResource = this.managementService.getSession(participant.sessionResource)?.mainChat.get().resource ?? participant.sessionResource;
		await revealSessionTurn(this.chatWidgetService, chatResource, target);
	}

	close(): void {
		if (this.customViewService.activeCustomView.get()?.id === SESSION_COMPARISON_VIEW_ID) {
			this.customViewService.hideCustomView();
		}
	}
}
