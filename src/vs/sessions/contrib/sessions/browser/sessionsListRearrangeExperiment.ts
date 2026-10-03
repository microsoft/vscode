/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchAssignmentService } from '../../../../workbench/services/assignment/common/assignmentService.js';

export const SESSIONS_LIST_REARRANGE_TREATMENT = 'sessions.list.rearrage';

export class SessionsListRearrangeExperimentState extends Disposable {

	readonly rearrangeList = observableValue(this, false);
	private request = 0;

	constructor(
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		const assignmentsChanged = observableSignalFromEvent(this, this.assignmentService.onDidRefetchAssignments);
		this._register(autorun(reader => {
			assignmentsChanged.read(reader);
			this.refresh();
		}));
	}

	refresh(): void {
		const request = ++this.request;
		this.assignmentService.getTreatment<boolean>(SESSIONS_LIST_REARRANGE_TREATMENT).then(value => {
			if (!this._store.isDisposed && request === this.request) {
				this.rearrangeList.set(value === true, undefined);
			}
		}, error => {
			if (!this._store.isDisposed && request === this.request) {
				this.rearrangeList.set(false, undefined);
				this.logService.warn('[SessionsListRearrangeExperimentState] Failed to resolve the Sessions list rearrangement treatment; using the control layout.', error);
			}
		});
	}
}
