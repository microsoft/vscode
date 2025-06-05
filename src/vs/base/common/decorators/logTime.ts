/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertDefined } from '../types.js';

/**
 * Type for a function that logs a message.
 */
export type TLogFunction = (message: string, ...args: any[]) => void;

/**
 * Type for an object that contains a `logger` property
 * with the logging methods.
 */
type TObjectWithLogFunction<T extends object> = T & { logTime: TLogFunction };

/**
 * Decorator allows to log execution time of any method of a class.
 * The class must have the `logTime` method that provides logs
 * a provided message.
 *
 * The decorated method can be asynchronous or synchronous, but
 * the timing message is logged only if it finishes *successfully*.
 *
 * ## Examples
 *
 * ```typescript
 * class MyClass {
 *     public readonly logTime: TLogFunction;

 *     constructor(
 *         // because we have the interface restrictions on the class
 *         // which does not support 'private'/'protected' fields, we are
 *         // forced to use the 'public' modifier here
 *         \@ILogService public readonly logService: ILogService,
 *     ) {
 *           this.logTime = logService.info.bind(logService);
 *     }
 *
 *     @logTime()
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
export function logTime() {
	return function logExecutionTimeDecorator<
		TObject extends TObjectWithLogFunction<object>,
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
				this.logTime.bind(this),
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
	logger: TLogFunction,
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
 * Internal helper to log the timing message with
 * provided details and logger.
 */
const log = (
	methodName: string,
	timeMs: number,
	logger: TLogFunction,
): void => {
	return logger(
		// allow-any-unicode-next-line
		`[⏱][${methodName}] took ${timeMs.toFixed(2)} ms`,
	);
};
