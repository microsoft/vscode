/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ChangesetKind } from '../common/changesetUri.js';
import type { IChangesetOperationContribution, IChangesetOperationContext, IChangesetOperationRegistry } from '../common/agentHostChangesetOperationService.js';
import { ChangesetOperationScope, ChangesetOperationStatus, type ChangesetOperation } from '../common/state/sessionState.js';
import { AgentHostReviewFileOperationHandler } from './agentHostReviewFileOperationHandler.js';
import { AgentHostStateManager } from './agentHostStateManager.js';

/**
 * Contributes the `mark-as-reviewed` / `mark-as-unreviewed` resource-scoped
 * operations for the **Branch Changes** changeset, backed by
 * {@link AgentHostReviewFileOperationHandler}.
 */
export class AgentHostReviewOperationContribution extends Disposable implements IChangesetOperationContribution {

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	registerHandlers(registry: IChangesetOperationRegistry): IDisposable {
		const store = new DisposableStore();
		const getSessionState = (sessionKey: string) => this._stateManager.getSessionState(sessionKey);
		const markHandler = this._instantiationService.createInstance(AgentHostReviewFileOperationHandler, true, getSessionState);
		const unmarkHandler = this._instantiationService.createInstance(AgentHostReviewFileOperationHandler, false, getSessionState);
		store.add(registry.registerChangesetOperationHandler(AgentHostReviewFileOperationHandler.OPERATION_MARK_AS_REVIEWED, markHandler));
		store.add(registry.registerChangesetOperationHandler(AgentHostReviewFileOperationHandler.OPERATION_MARK_AS_UNREVIEWED, unmarkHandler));
		return store;
	}

	getOperations({ changesetKind }: IChangesetOperationContext): ChangesetOperation[] {
		if (changesetKind !== ChangesetKind.Branch) {
			return [];
		}

		return [
			{
				id: AgentHostReviewFileOperationHandler.OPERATION_MARK_AS_REVIEWED,
				label: localize('agentHost.changeset.markAsReviewed', "Mark as Reviewed"),
				icon: 'check',
				group: 'review',
				scopes: [ChangesetOperationScope.Resource],
				status: ChangesetOperationStatus.Idle,
			},
			{
				id: AgentHostReviewFileOperationHandler.OPERATION_MARK_AS_UNREVIEWED,
				label: localize('agentHost.changeset.markAsUnreviewed', "Mark as Unreviewed"),
				icon: 'check',
				group: 'review',
				scopes: [ChangesetOperationScope.Resource],
				status: ChangesetOperationStatus.Idle,
			},
		] satisfies ChangesetOperation[];
	}
}
