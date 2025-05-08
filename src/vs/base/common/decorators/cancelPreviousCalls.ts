/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertDefined } from '../types.js';
import { Disposable, DisposableMap } from '../lifecycle.js';
import { CancellationTokenSource, CancellationToken } from '../cancellation.js';

/**
 * Helper type that represents a function that has an optional {@linkcode CancellationToken}
 * argument argument at the end of the arguments list.
 *
 * @typeparam `TFunction` - Type of the function arguments list of which will be extended
 * 							with an optional {@linkcode CancellationToken} argument.
 */
type TWithOptionalCancellationToken<TFunction extends Function> = TFunction extends (...args: infer TArgs) => infer TReturn
	? (...args: [...TArgs, cancellatioNToken?: CancellationToken]) => TReturn
	: never;

/**
 * Decorator that provides a mechanism to cancel previous calls of the decorated method
 * by providing a `cancellation token` as the last argument of the method, which gets
 * cancelled immediately on subsequent call of the decorated method.
 *
 * Therefore to use this decorator, the two conditions must be met:
 *
 * - the decorated method must have an *optional* {@linkcode CancellationToken} argument at
 * 	 the end of the arguments list
 * - the object that the decorated method belongs to must implement the {@linkcode Disposable};
 *   this requirement comes from the internal implementation of the decorator that
 *   creates new resources that need to be eventually disposed by someone
 *
 * @typeparam `TObject` - Object type that the decorated method belongs to.
 * @typeparam `TArgs` - Argument list of the decorated method.
 * @typeparam `TReturn` - Return value type of the decorated method.
 *
 * ### Examples
 *
 * ```typescript
 * // let's say we have a class that implements the `Disposable` interface that we want
 * // to use the decorator on
 * class Example extends Disposable {
 * 		async doSomethingAsync(arg1: number, arg2: string): Promise<void> {
 * 			// do something async..
 * 			await new Promise(resolve => setTimeout(resolve, 1000));
 * 		}
 * }
 * ```
 *
 * ```typescript
 * // to do that we need to add the `CancellationToken` argument to the end of args list
 * class Example extends Disposable {
 * 		@cancelPreviousCalls
 * 		async doSomethingAsync(arg1: number, arg2: string, cancellationToken?: CancellationToken): Promise<void> {
 * 			console.log(`call with args ${arg1} and ${arg2} initiated`);
 *
 * 			// the decorator will create the cancellation token automatically
 * 			assertDefined(
 * 				cancellationToken,
 * 				`The method must now have the `CancellationToken` passed to it.`,
 * 			);
 *
 * 			cancellationToken.onCancellationRequested(() => {
 * 				console.log(`call with args ${arg1} and ${arg2} was cancelled`);
 * 			});
 *
 * 			// do something async..
 * 			await new Promise(resolve => setTimeout(resolve, 1000));
 *
 * 			// check cancellation token state after the async operations
 * 			console.log(
 * 				`call with args ${arg1} and ${arg2} completed, canceled?: ${cancellationToken.isCancellationRequested}`,
 * 			);
 * 		}
 * }
 *
 * const example = new Example();
 * // call the decorate method first time
 * example.doSomethingAsync(1, 'foo');
 * // wait for 500ms which is less than 1000ms of the async operation in the first call
 * await new Promise(resolve => setTimeout(resolve, 500));
 * // calling the decorate method second time cancels the token passed to the first call
 * example.doSomethingAsync(2, 'bar');
 * ```
 */
export function cancelPreviousCalls<
	TObject extends Disposable,
	TArgs extends unknown[],
	TReturn extends unknown,
>(
	_proto: TObject,
	methodName: string,
	descriptor: TypedPropertyDescriptor<TWithOptionalCancellationToken<(...args: TArgs) => TReturn>>,
) {
	const originalMethod = descriptor.value;

	assertDefined(
		originalMethod,
		`Method '${methodName}' is not defined.`,
	);

	// we create the global map that contains `TObjectRecord` for each object instance that
	// uses this decorator, which itself contains a `{method name} -> TMethodRecord` mapping
	// for each decorated method on the object; the `TMethodRecord` record stores current
	// `cancellationTokenSource`, token of which was passed to the previous call of the method
	const objectRecords = new WeakMap<TObject, DisposableMap<string, CancellationTokenSource>>();

	// decorate the original method with the following logic that upon a new invocation
	// of the method cancels the cancellation token that was passed to a previous call
	descriptor.value = function (
		this: TObject,
		...args: Parameters<typeof originalMethod>
	): TReturn {
		// get or create a record for the current object instance
		// the creation is done once per each object instance
		let record = objectRecords.get(this);
		if (!record) {
			record = new DisposableMap();
			objectRecords.set(this, record);

			this._register({
				dispose: () => {
					objectRecords.get(this)?.dispose();
					objectRecords.delete(this);
				},
			});
		}

		// when the decorated method is called again and there is a cancellation token
		// source exists from a previous call, cancel and dispose it, then remove it
		record.get(methodName)?.dispose(true);

		// now we need to provide a cancellation token to the original method
		// as the last argument, there are two cases to consider:
		// 	- (common case) the arguments list does not have a cancellation token
		// 	   as the last argument, - in this case we need to add a new one
		//  - (possible case) - the arguments list already has a cancellation token
		//    as the last argument, - in this case we need to reuse the token when
		//    we create ours, and replace the old token with the new one
		// therefore,

		// get the last argument of the arguments list and if it is present,
		// reuse it as the token for the new cancellation token source
		const lastArgument = (args.length > 0)
			? args[args.length - 1]
			: undefined;
		const token = CancellationToken.isCancellationToken(lastArgument)
			? lastArgument
			: undefined;

		const cancellationSource = new CancellationTokenSource(token);
		record.set(methodName, cancellationSource);

		// then update or add cancelaltion token at the end of the arguments list
		if (CancellationToken.isCancellationToken(lastArgument)) {
			args[args.length - 1] = cancellationSource.token;
		} else {
			args.push(cancellationSource.token);
		}

		// finally invoke the original method passing original arguments and
		// the new cancellation token at the end of the arguments list
		return originalMethod.call(this, ...args);
	};

	return descriptor;
}
