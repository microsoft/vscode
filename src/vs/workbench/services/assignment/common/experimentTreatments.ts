/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCancellationError } from '../../../../base/common/errors.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchAssignmentService } from './assignmentService.js';

/**
 * Reads treatments initially and on refetch, retaining resolved values on failure and ignoring stale results.
 * Invalid values are logged and treated as undefined; `onPendingChange` tracks the latest lookup.
 * `onChange` is called with the first values that are read, and after that only when a refetch
 * resolves to different values than the last call.
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
	let hasResolved = false;
	let lastValues: readonly (T | undefined)[] | undefined;
	const getTreatmentValue = (name: string, value: T | undefined): T | undefined => {
		if (value === undefined || isValid(value, name)) {
			return value;
		}
		logService.warn(`[${logPrefix}] Ignoring invalid ${name} treatment`);
		return undefined;
	};
	const valuesChanged = (a: readonly (T | undefined)[], b: readonly (T | undefined)[] | undefined): boolean => {
		return b === undefined || a.length !== b.length || a.some((value, index) => value !== b[index]);
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
			if (hasResolved) {
				finish();
				return;
			}
			values = treatments.map(() => undefined);
		}
		if (store.isDisposed || request !== treatmentRequest) {
			return;
		}
		hasResolved = true;
		const resolved = values.map((value, index) => getTreatmentValue(treatments[index], value));
		if (valuesChanged(resolved, lastValues)) {
			lastValues = resolved;
			onChange(resolved);
		}
		finish();
	};
	store.add(assignmentService.onDidRefetchAssignments(() => void update()));
	void update();
	return store;
}
