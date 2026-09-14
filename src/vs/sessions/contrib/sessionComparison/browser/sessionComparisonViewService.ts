/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, IReader, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../services/sessions/common/sessionComparison.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { SessionComparisonEditorInput } from './sessionComparisonEditorInput.js';

export const ISessionComparisonViewService = createDecorator<ISessionComparisonViewService>('sessionComparisonViewService');

export interface ISessionComparisonViewService {
	readonly _serviceBrand: undefined;
	open(comparisonId: string): Promise<void>;
}

export class SessionComparisonViewService extends Disposable implements ISessionComparisonViewService {
	declare readonly _serviceBrand: undefined;

	private readonly catalog = observableSignalFromEvent(this, this.managementService.onDidChangeSessions);
	private readonly liveComparisonId = observableValue<string | undefined>(this, undefined);
	private readonly transitionScheduler = this._register(new RunOnceScheduler(() => {
		void this.transitionToResults().catch(onUnexpectedError);
	}, 0));

	constructor(
		@ISessionComparisonService private readonly comparisonService: ISessionComparisonService,
		@ISessionsManagementService private readonly managementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();
		this._register(autorun(reader => {
			const comparisonId = this.liveComparisonId.read(reader);
			if (!comparisonId) {
				return;
			}
			this.catalog.read(reader);
			const comparison = this.comparisonService.comparisons.read(reader).find(candidate => candidate.id === comparisonId);
			if (this.sessionsService.sessionGridLayout.read(reader) !== 'grid'
				|| !comparison
				|| !this.hasInProgressAttempts(comparison, reader)) {
				this.transitionScheduler.schedule();
			}
		}));
	}

	async open(comparisonId: string): Promise<void> {
		const comparison = this.requireComparison(comparisonId);
		if (!this.hasInProgressAttempts(comparison)) {
			await this.openResults(comparison);
			return;
		}
		const sessions = comparison.participants.flatMap(participant => {
			if (participant.role !== SessionComparisonParticipantRole.Attempt || !participant.sessionResource) {
				return [];
			}
			const session = this.managementService.getSession(participant.sessionResource);
			return session ? [session] : [];
		});
		if (!sessions.length) {
			await this.openResults(comparison);
			return;
		}
		await this.sessionsService.openSessionsInGrid(sessions);
		this.liveComparisonId.set(comparison.id, undefined);
	}

	private requireComparison(comparisonId: string): ISessionComparison {
		const comparison = this.comparisonService.getComparison(comparisonId);
		if (!comparison) {
			throw new Error(localize('sessionComparison.missing', "This comparison is no longer available."));
		}
		return comparison;
	}

	private hasInProgressAttempts(comparison: ISessionComparison, reader?: IReader): boolean {
		return comparison.participants.some(participant => {
			if (participant.role !== SessionComparisonParticipantRole.Attempt || participant.launchError) {
				return false;
			}
			if (!participant.sessionResource) {
				return true;
			}
			const status = this.managementService.getSession(participant.sessionResource)?.status.read(reader);
			return status !== SessionStatus.Completed && status !== SessionStatus.Error;
		});
	}

	private async transitionToResults(): Promise<void> {
		const comparisonId = this.liveComparisonId.get();
		if (!comparisonId) {
			return;
		}
		if (this.sessionsService.sessionGridLayout.get() !== 'grid') {
			this.liveComparisonId.set(undefined, undefined);
			return;
		}
		const comparison = this.comparisonService.getComparison(comparisonId);
		if (!comparison) {
			this.liveComparisonId.set(undefined, undefined);
			this.sessionsService.resetSessionGridLayout();
			return;
		}
		if (this.hasInProgressAttempts(comparison)) {
			return;
		}
		await this.openResults(comparison);
	}

	private async openResults(comparison: ISessionComparison): Promise<void> {
		this.liveComparisonId.set(undefined, undefined);
		this.sessionsService.resetSessionGridLayout();
		const input = this.instantiationService.createInstance(SessionComparisonEditorInput, comparison.id);
		await this.editorService.openEditor(input, { pinned: true });
	}
}
