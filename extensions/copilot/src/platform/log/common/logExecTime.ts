/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCancellationError } from '../../../util/vs/base/common/errors';
import { StopWatch } from '../../../util/vs/base/common/stopwatch';
import { ILogService } from './logService';

type MeasureCallBack<R> = (time: number, status: 'success' | 'failed' | 'cancelled', result: R | undefined) => void;

/**
 * Helper that collects how long a block of code takes to execute.
 */

export async function measureExecTime<R>(fn: () => PromiseLike<R>, cb: MeasureCallBack<R>): Promise<R> {
	const sw = new StopWatch();
	try {
		const result = await fn();
		cb(sw.elapsed(), 'success', result);
		return result;
	} catch (error) {
		cb(sw.elapsed(), isCancellationError(error) ? 'cancelled' : 'failed', undefined);
		throw error;
	}
}

/**
 * Helper that logs how long a block of code takes to execute.
 */
export async function logExecTime<R>(logService: ILogService, name: string, fn: () => PromiseLike<R>, measureCb?: MeasureCallBack<R>): Promise<R> {
	return measureExecTime(() => {
		logService.trace(`${name} started`);
		return fn();
	}, (time, status, result) => {
		logService.trace(`${name} ${status}. Elapsed ${time}`);
		measureCb?.(time, status, result);
	});
}

/**
 * Decorator that adds logging for how long the method takes to execute.
 */
export function LogExecTime<T>(
	getLogService: (self: T) => ILogService,
	logName: string,
	measureCb?: (this: T, time: number, status: 'success' | 'failed' | 'cancelled') => void,
) {
	return function (target: T, propertyKey: string, descriptor: PropertyDescriptor) {
		const originalMethod = descriptor.value;
		let idPool = 0;
		descriptor.value = async function (this: T, ...args: any[]) {
			const id = idPool++;
			const logService = getLogService(this);
			return logExecTime(logService, `${logName}#${id}`, () => originalMethod.apply(this, args), measureCb?.bind(this));
		};

		return descriptor;
	};
}


/**
 * Decorator that adds a callback about how long an async method takes to execute.
 */
export function MeasureExecTime<T>(cb: (this: T, time: number, status: 'success' | 'failed' | 'cancelled') => void) {
	return function (target: T, propertyKey: string, descriptor: PropertyDescriptor) {
		const originalMethod = descriptor.value;
		descriptor.value = function (this: T, ...args: any[]) {
			return measureExecTime(() => originalMethod.apply(this, args), cb.bind(this));
		};
		return descriptor;
	};
}
