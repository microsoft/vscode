/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { isEqual } from '../../../../base/common/resources.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { getSessionComparisonChat, getSessionComparisonParticipantsInDisplayOrder, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../../workbench/contrib/sessions/common/sessionComparison.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';

export const ISessionComparisonViewService = createDecorator<ISessionComparisonViewService>('sessionComparisonViewService');

export interface ISessionComparisonViewService {
	readonly _serviceBrand: undefined;
	open(comparisonId: string): Promise<void>;
}

export class SessionComparisonViewService implements ISessionComparisonViewService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ISessionComparisonService private readonly comparisonService: ISessionComparisonService,
		@ISessionsManagementService private readonly managementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
	) { }

	async open(comparisonId: string): Promise<void> {
		const comparison = this.comparisonService.getComparison(comparisonId);
		if (!comparison) {
			throw new Error(localize('sessionComparison.missing', "This comparison is no longer available."));
		}
		const availableAttempts = getSessionComparisonParticipantsInDisplayOrder(comparison.participants).flatMap(participant => {
			if (participant.role !== SessionComparisonParticipantRole.Attempt) {
				return [];
			}
			if (!participant.sessionResource) {
				return [];
			}
			const session = this.managementService.getSession(participant.sessionResource);
			const chat = getSessionComparisonChat(participant, session);
			return session && chat ? [{ session, chatResource: chat.resource }] : [];
		});
		if (!availableAttempts.length) {
			throw new Error(localize('sessionComparison.noAttempts', "No comparison attempts are available to open."));
		}
		// SessionComparisonGridController hides and later restores the side pane once
		// the grid is actually shown, so a cancelled or single-attempt open leaves it alone.
		if (availableAttempts.some(attempt => !isEqual(attempt.chatResource, attempt.session.mainChat.get().resource))) {
			await this.sessionsService.openChatsInGrid(availableAttempts);
		} else {
			await this.sessionsService.openSessionsInGrid(availableAttempts.map(attempt => attempt.session));
		}
	}
}
