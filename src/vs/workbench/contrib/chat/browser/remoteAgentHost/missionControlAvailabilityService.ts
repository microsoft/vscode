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
	readonly available = observableValue(this, false);
	private _generation = 0;
	private _ready: Promise<void> = Promise.resolve();
	get whenReady(): Promise<void> { return this._ready; }

	constructor(
		@IWorkbenchAssignmentService private readonly _assignments: IWorkbenchAssignmentService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		const availableContext = GitHubEnvironmentsAvailableContext.bindTo(contextKeyService);
		this._register(autorun(reader => availableContext.set(this.available.read(reader))));
		this._register(this._assignments.onDidRefetchAssignments(() => this._refresh()));
		this._refresh();
	}

	private _refresh(): void {
		this._ready = this._readTreatment(++this._generation);
		void this._ready.catch(error => this._logService.error('Failed to resolve Mission Control experiment availability', error));
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
			throw error;
		}
	}
}
