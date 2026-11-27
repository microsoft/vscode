/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/arrays.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchAssignmentService } from './assignmentService.js';

/**
 * Reads treatments initially and on refetch, retaining resolved values on failure and ignoring stale results.
 * Invalid values are logged and treated as undefined. `onChange` receives the first values, then only values
 * that differ from the previous ones; `onPendingChange` tracks the latest lookup.
 */
export function registerExperimentTreatments<T extends string | number | boolean = string>(
	treatments: readonly string[],
	logPrefix: string,
	onChange: (values: readonly (T | undefined)[]) => void,
	assignmentService: IWorkbenchAssignmentService,
	logService: ILogService,
	isValid: (value: T, name: string) => boolean = value => typeof value === 'string' && value.trim().length > 0,
	onPendingChange?: (pending: boolean) => void,
): IDisposable {
	const store = new DisposableStore();
	let treatmentRequest = 0;
	let resolvedValues: readonly (T | undefined)[] | undefined;
	const getTreatmentValue = (name: string, value: T | undefined): T | undefined => {
		if (value === undefined || isValid(value, name)) {
			return value;
		}
		logService.warn(`[${logPrefix}] Ignoring invalid ${name} treatment`);
		return undefined;
	};
	const update = async (): Promise<void> => {
		const request = ++treatmentRequest;
		onPendingChange?.(true);
		const finish = () => {
			if (!store.isDisposed && request === treatmentRequest) {
				onPendingChange?.(false);
			}
		};
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
			if (resolvedValues) {
				finish();
				return;
			}
			values = treatments.map(() => undefined);
		}
		if (store.isDisposed || request !== treatmentRequest) {
			return;
		}
		const validValues = values.map((value, index) => getTreatmentValue(treatments[index], value));
		if (!resolvedValues || !equals(resolvedValues, validValues)) {
			resolvedValues = validValues;
			onChange(validValues);
		}
		finish();
	};
	store.add(assignmentService.onDidRefetchAssignments(() => void update()));
	void update();
	return store;
}
