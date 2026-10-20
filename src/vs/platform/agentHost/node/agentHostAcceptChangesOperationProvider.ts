/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import type { IChangesetOperationContext, IChangesetOperationContribution, IChangesetOperationRegistry } from '../common/agentHostChangesetOperationService.js';
import { ChangesetKind } from '../common/changesetUri.js';
import { ChangesetOperationScope, ChangesetOperationStatus, type ChangesetOperation } from '../common/state/sessionState.js';
import { AgentHostAcceptChangesOperationHandler } from './agentHostAcceptChangesOperationHandler.js';

/** Offers accepting a file's changes on Working Set changesets. */
export class AgentHostAcceptChangesOperationContribution extends Disposable implements IChangesetOperationContribution {

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	registerHandlers(registry: IChangesetOperationRegistry): IDisposable {
		const handler = this._instantiationService.createInstance(AgentHostAcceptChangesOperationHandler);
		return registry.registerChangesetOperationHandler(AgentHostAcceptChangesOperationHandler.OPERATION_ACCEPT_CHANGES, handler);
	}

	getOperations({ changesetKind }: IChangesetOperationContext): ChangesetOperation[] {
		if (changesetKind !== ChangesetKind.WorkingSet) {
			return [];
		}
		return [{
			id: AgentHostAcceptChangesOperationHandler.OPERATION_ACCEPT_CHANGES,
			label: localize('agentHost.changeset.acceptChanges', "Accept Changes"),
			icon: 'check',
			scopes: [ChangesetOperationScope.Resource],
			status: ChangesetOperationStatus.Idle,
		} satisfies ChangesetOperation];
	}
}
