/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { IAssignmentFilter, ITreatmentWithAssignment, IWorkbenchAssignmentService } from '../../common/assignmentService.js';

export class NullWorkbenchAssignmentService implements IWorkbenchAssignmentService {
	_serviceBrand: undefined;

	readonly onDidRefetchAssignments: Event<void> = Event.None;

	async getCurrentExperiments(): Promise<string[] | undefined> {
		return [];
	}

	async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
		return undefined;
	}

	async getTreatmentWithAssignment<T extends string | number | boolean>(name: string): Promise<ITreatmentWithAssignment<T>> {
		return { value: await this.getTreatment<T>(name), hasAssignment: Promise.resolve(false) };
	}

	addTelemetryAssignmentFilter(filter: IAssignmentFilter): void { }
}
