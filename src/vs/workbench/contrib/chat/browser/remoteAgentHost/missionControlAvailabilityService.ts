/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { GitHubEnvironmentsAvailabilityTreatment, GitHubEnvironmentsAvailableContext, IMissionControlAvailabilityService } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';

export class MissionControlAvailabilityService extends Disposable implements IMissionControlAvailabilityService {
	declare readonly _serviceBrand: undefined;
	readonly available = observableValue<boolean | undefined>(this, undefined);
	private _generation = 0;

	constructor(
		@IWorkbenchAssignmentService private readonly _assignments: IWorkbenchAssignmentService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		const availableContext = GitHubEnvironmentsAvailableContext.bindTo(contextKeyService);
		this._register(autorun(reader => availableContext.set(this.available.read(reader) === true)));
		this._register(this._assignments.onDidRefetchAssignments(() => this._refresh()));
		this._refresh();
	}

	private _refresh(): void {
		void this._readTreatment(++this._generation);
	}

	private async _readTreatment(generation: number): Promise<void> {
		try {
			const treatment = await this._assignments.getTreatment<boolean>(GitHubEnvironmentsAvailabilityTreatment);
			if (!this._store.isDisposed && generation === this._generation) {
				this.available.set(treatment !== false, undefined);
			}
		} catch (error) {
			if (!this._store.isDisposed && generation === this._generation) {
				this.available.set(false, undefined);
			}
			this._logService.error('Failed to resolve Mission Control experiment availability', error);
		}
	}
}
