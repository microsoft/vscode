/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCancellationError } from '../../../../../base/common/errors.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';

/**
 * Reads the given treatments now and whenever assignments are refetched, and calls `onChange` with their values in the same order.
 * Invalid values, by default anything but a non-empty string, are logged and passed as `undefined`. When reading fails, `onChange`
 * gets `undefined` values unless an earlier read succeeded, and results of outdated reads are ignored.
 */
export function registerAgentsWindowTreatments<T extends string | number | boolean = string>(
	treatments: readonly string[],
	logPrefix: string,
	onChange: (values: readonly (T | undefined)[]) => void,
	assignmentService: IWorkbenchAssignmentService,
	logService: ILogService,
	isValid: (value: T, name: string) => boolean = value => typeof value === 'string' && value.trim().length > 0,
): IDisposable {
	const store = new DisposableStore();
	let treatmentRequest = 0;
	let hasResolved = false;
	const getTreatmentValue = (name: string, value: T | undefined): T | undefined => {
		if (value === undefined || isValid(value, name)) {
			return value;
		}
		logService.warn(`[${logPrefix}] Ignoring invalid ${name} treatment`);
		return undefined;
	};
	const update = async (): Promise<void> => {
		const request = ++treatmentRequest;
		let values: (T | undefined)[];
		try {
			values = await Promise.all(treatments.map(name => assignmentService.getTreatment<T>(name)));
		} catch (error) {
			if (store.isDisposed || request !== treatmentRequest) {
				return;
			}
			if (!isCancellationError(error)) {
				logService.warn(`[${logPrefix}] Failed to resolve treatments`, error);
			}
			if (hasResolved) {
				return;
			}
			values = treatments.map(() => undefined);
		}
		if (store.isDisposed || request !== treatmentRequest) {
			return;
		}
		hasResolved = true;
		onChange(values.map((value, index) => getTreatmentValue(treatments[index], value)));
	};
	store.add(assignmentService.onDidRefetchAssignments(() => void update()));
	void update();
	return store;
}
