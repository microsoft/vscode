/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { isActiveSessionStatus } from '../../../services/sessions/common/session.js';
import { getSessionComparisonParticipantsInDisplayOrder, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../services/sessions/common/sessionComparison.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

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
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) { }

	async open(comparisonId: string): Promise<void> {
		const comparison = this.comparisonService.getComparison(comparisonId);
		if (!comparison) {
			throw new Error(localize('sessionComparison.missing', "This comparison is no longer available."));
		}
		const availableParticipants = getSessionComparisonParticipantsInDisplayOrder(comparison.participants).flatMap(participant => {
			if (!participant.sessionResource) {
				return [];
			}
			const session = this.managementService.getSession(participant.sessionResource);
			return session ? [{ participant, session }] : [];
		});
		if (!availableParticipants.length) {
			throw new Error(localize('sessionComparison.noParticipants', "No comparison sessions are available to open."));
		}
		const synthesis = availableParticipants.find(({ participant, session }) =>
			participant.role === SessionComparisonParticipantRole.Synthesis && isActiveSessionStatus(session.status.get()));
		const judge = availableParticipants.find(({ participant }) => participant.role === SessionComparisonParticipantRole.Judge);
		const latest = synthesis ?? judge;
		if (latest) {
			await this.sessionsService.openSession(latest.session.resource, { source: 'chat' });
		} else {
			await this.sessionsService.openSessionsInGrid(availableParticipants
				.filter(({ participant }) => participant.role === SessionComparisonParticipantRole.Attempt)
				.map(({ session }) => session));
		}
		this.layoutService.setPartHidden(true, Parts.EDITOR_PART);
		this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
	}
}
