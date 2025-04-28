/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../assert.js';
import { assertDefined } from '../types.js';

/**
 * Type for supported log levels.
 */
export type TLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

/**
 * Interface for an object that provides logging methods.
 */
export interface ILogger {
	trace(message: string, ...args: any[]): void;
	debug(message: string, ...args: any[]): void;
	info(message: string, ...args: any[]): void;
	warn(message: string, ...args: any[]): void;
	error(message: string | Error, ...args: any[]): void;
}

/**
 * Type for an object that contains a `logService` property
 * with the logging methods.
 */
type TObjectWithLogger<T extends object> = T & { logService: ILogger };

/**
 * Decorator allows to log execution time of any method of a class.
 * The class must have the `logService` property that provides
 * logging methods that the decorator can call.
 *
 * The decorated method can be asynchronous or synchronous, but
 * the timing message is logged only it finishes *successfully*.
 *
 * @param logLevel Log level to use for the time message.
 *
 * ## Examples
 *
 * ```typescript
 * class MyClass {
 *     constructor(
 *         // because we have the interface restrictions on the class
 *         // which does not support 'private'/'protected' fields, we are
 *         // forced to use the 'public' modifier here
 *         \@ILogService public readonly logService: ILogService,
 *     ) {}
 *
 *     @logTime('info')
 *     public async myMethod(): Promise<string> {
 *         // some artificial delay
 *         await new Promise((resolve) => setTimeout(resolve, 10));
 *
 *         return 'haalou!';
 *     }
 * }
 *
 * const myObject = instantiationService.createInstance(MyClass);
 *
 * // once the method completes successfully, the information
 * // message '[MyClass.myMethod] took 10.00 ms' is logged
 * await myObject.myMethod();
 * ```
 */
export function logTime(
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

		// override the decorated method
		descriptor.value = function (
			this: TObject,
			...args: Parameters<typeof originalMethod>
		): ReturnType<typeof originalMethod> {
			const startTime = performance.now();
			const result = originalMethod.call(this, ...args);
			const syncTimeMs = performance.now() - startTime;

			// handle asynchronous decorated methods
			if (result instanceof Promise) {
				return result.then((resolved) => {
					const asyncTimeMs = performance.now() - startTime;

					log({
						methodName: `${this.constructor.name}.${methodName}`,
						logLevel,
						timeMs: asyncTimeMs,
					}, this.logService);
					return resolved;
				});
			}

			// handle synchronous decorated methods
			log({
				methodName: `${this.constructor.name}.${methodName}`,
				logLevel,
				timeMs: syncTimeMs,
			}, this.logService);
			return result;
		};

		return descriptor;
	};
}

/**
 * Options of the {@link log} function.
 */
interface ILogOptions {
	/**
	 * Method execution time, milliseconds.
	 */
	timeMs: number;

	/**
	 * Name of the decorated method.
	 */
	methodName: string;

	/**
	 * Log level to use for the timing message.
	 */
	logLevel: TLogLevel;
}

/**
 * Internal helper to log the timing message with
 * provided details and log level.
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
