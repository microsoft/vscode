/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../assert.js';
import { assertDefined } from '../types.js';

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
 * Type for an object that contains a `logger` property
 * with the logging methods.
 */
type TObjectWithLogger<T extends object> = T & { logger: ILogger };

/**
 * Decorator allows to log execution time of any method of a class.
 * The class must have the `logger` property that provides
 * logging methods that the decorator can call.
 *
 * The decorated method can be asynchronous or synchronous, but
 * the timing message is logged only if it finishes *successfully*.
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
 * const result = await myObject.myMethod();
 *
 * assert.strictEqual(
 *     result,
 *     'haalou!',
 *     'Must yield original return value',
 * );
 * ```
 */
export function logTime(
	logLevel: keyof ILogger = 'trace',
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

		// override the decorated method with the one that logs
		// a timing message after the original method finishes execution
		descriptor.value = function (
			this: TObject,
			...args: Parameters<typeof originalMethod>
		): ReturnType<typeof originalMethod> {
			return logExecutionTime(
				`${this.constructor.name}.${methodName}`,
				originalMethod.bind(this, ...args),
				getLogFunction(logLevel, this.logger),
			);
		};

		return descriptor;
	};
}


/**
 * Helper allows to log execution time of code block or function.
 *
 * The code block or function can be asynchronous or synchronous, but
 * the timing message is logged only if it finishes *successfully*.
 *
 * ## Examples
 *
 * ```typescript
 * const result = logExecutionTime(
 *     'my asynchronous block',
 *     async () => {
 *         // some artificial delay
 *         await new Promise((resolve) => setTimeout(resolve, 10));
 *
 *         return 'haalou!';
 *     },
 *     this.logService.info,
 * }
 *
 * // once the callback completes successfully, the information
 * // message '[MyClass.myMethod] took 10.00 ms' is logged
 * assert.strictEqual(
 *     result,
 *     'haalou!',
 *     'Must yield original return value',
 * );
 * ```
 */
export const logExecutionTime = <T>(
	blockName: string,
	callback: () => T | Promise<T>,
	logger: ILogger[keyof ILogger],
): ReturnType<typeof callback> => {
	const startTime = performance.now();
	const result = callback();
	const syncTimeMs = performance.now() - startTime;

	// handle asynchronous decorated methods
	if (result instanceof Promise) {
		return result.then((resolved) => {
			const asyncTimeMs = performance.now() - startTime;

			log(
				blockName,
				asyncTimeMs,
				logger,
			);
			return resolved;
		});
	}

	// handle synchronous decorated methods
	log(
		blockName,
		syncTimeMs,
		logger,
	);

	return result;
};

/**
 * Gets method of {@link logger} by the provided {@link logLevel}.
 */
const getLogFunction = <T extends keyof ILogger>(
	logLevel: T,
	logger: ILogger,
): ILogger[T] => {
	if (logLevel === 'trace') {
		return logger.trace.bind(logger);
	}

	if (logLevel === 'debug') {
		return logger.debug.bind(logger);
	}

	if (logLevel === 'info') {
		return logger.info.bind(logger);
	}

	if (logLevel === 'warn') {
		return logger.warn.bind(logger);
	}

	if (logLevel === 'error') {
		return logger.error.bind(logger);
	}

	assertNever(
		logLevel,
		`Unknown log level '${logLevel}'.`,
	);
};

/**
 * Internal helper to log the timing message with
 * provided details and logger.
 */
const log = (
	methodName: string,
	timeMs: number,
	logger: ILogger[keyof ILogger],
): void => {
	return logger(
		// allow-any-unicode-next-line
		`[⏱][${methodName}] took ${timeMs.toFixed(2)} ms`,
	);
};
