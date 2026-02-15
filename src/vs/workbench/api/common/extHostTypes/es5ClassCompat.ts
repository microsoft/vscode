/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @deprecated
 *
 * This utility ensures that old JS code that uses functions for classes still works. Existing usages cannot be removed
 * but new ones must not be added
 */
export function es5ClassCompat(target: Function): any {
	const interceptFunctions = {
		apply: function (...args: any[]): any {
			if (args.length === 0) {
				return Reflect.construct(target, []);
			} else {
				const argsList = args.length === 1 ? [] : args[1];
				return Reflect.construct(target, argsList, args[0].constructor);
			}
		},
		call: function (...args: any[]): any {
			if (args.length === 0) {
				return Reflect.construct(target, []);
			} else {
				const [thisArg, ...restArgs] = args;
				return Reflect.construct(target, restArgs, thisArg.constructor);
			}
		}
	};
	return Object.assign(target, interceptFunctions);
}
