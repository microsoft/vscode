/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../assert.js';
import { assertDefined } from '../types.js';

/**
 * TODO: @legomushroom
 */
export type TLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

/**
 * TODO: @legomushroom
 */
export interface ILogger {
	trace(message: string, ...args: any[]): void;
	debug(message: string, ...args: any[]): void;
	info(message: string, ...args: any[]): void;
	warn(message: string, ...args: any[]): void;
	error(message: string | Error, ...args: any[]): void;
}

/**
 * TODO: @legomushroom
 */
type TObjectWithLogger<T extends object> = T & { logService: ILogger };

// /**
//  * TODO: @legomushroom
//  */
// interface IOptions {
// 	readonly name?: string;
// 	readonly logLevel: TLogLevel;
// }

// /**
//  * TODO: @legomushroom
//  */
// const DEFAULT_OPTIONS: IOptions = {
// 	logLevel: 'trace',
// };

/**
 * TODO: @legomushroom
 */
export function logTime(
	// TODO: @legomushroom
	logLevel: TLogLevel = 'trace',
) {
	return function logExecutionTimeDecorator<
		TObject extends TObjectWithLogger<object>,
	>(
		_proto: TObject,
		methodName: string,
		descriptor: TypedPropertyDescriptor<(...args: any[]) => any | Promise<any>>,
	) {
		const originalMethod = descriptor.value;

		assertDefined(
			originalMethod,
			`Method '${methodName}' is not defined.`,
		);

		descriptor.value = function (
			this: TObject,
			...args: Parameters<typeof originalMethod>
		): ReturnType<typeof originalMethod> {
			const startTime = performance.now();
			const result = originalMethod.call(this, ...args);
			const timeMs = performance.now() - startTime;

			const logOptions: ILogOptions = {
				methodName: `${this.constructor.name}.${methodName}`,
				logLevel,
				timeMs,
			};

			// TODO: @legomushroom
			if (result instanceof Promise) {
				return result.then((resolved) => {
					log(logOptions, this.logService);
					return resolved;
				});
			}

			log(logOptions, this.logService);
			return result;
		};

		return descriptor;
	};
}

/**
 * TODO: @legomushroom
 */
interface ILogOptions {
	timeMs: number;
	methodName: string;
	logLevel: TLogLevel;
}

/**
 * TODO: @legomushroom
 */
const log = (
	options: ILogOptions,
	logger: ILogger,
): void => {
	const { logLevel, methodName, timeMs } = options;

	// allow-any-unicode-next-line
	const message = `[⏱][${methodName}] took ${timeMs.toFixed(2)} ms`;

	if (logLevel === 'trace') {
		return logger.trace(message);
	}

	if (logLevel === 'debug') {
		return logger.debug(message);
	}

	if (logLevel === 'info') {
		return logger.info(message);
	}

	if (logLevel === 'warn') {
		return logger.warn(message);
	}

	if (logLevel === 'error') {
		return logger.error(message);
	}

	assertNever(
		logLevel,
		`Unknown log level '${logLevel}'.`,
	);
};
