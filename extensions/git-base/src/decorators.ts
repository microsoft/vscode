/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { done } from './util';

export function debounce(delay: number): Function {
	return decorate((fn, key) => {
		const timerKey = `$debounce$${key}`;

		return function (this: any, ...args: any[]) {
			clearTimeout(this[timerKey]);
			this[timerKey] = setTimeout(() => fn.apply(this, args), delay);
		};
	});
}

export const throttle = decorate(_throttle);

function _throttle<T>(fn: Function, key: string): Function {
	const currentKey = `$throttle$current$${key}`;
	const nextKey = `$throttle$next$${key}`;

	const trigger = function (this: any, ...args: any[]) {
		if (this[nextKey]) {
			return this[nextKey];
		}

		if (this[currentKey]) {
			this[nextKey] = done(this[currentKey]).then(() => {
				this[nextKey] = undefined;
				return trigger.apply(this, args);
			});

			return this[nextKey];
		}

		this[currentKey] = fn.apply(this, args) as Promise<T>;

		const clear = () => this[currentKey] = undefined;
		done(this[currentKey]).then(clear, clear);

		return this[currentKey];
	};

	return trigger;
}

function decorate(decorator: (fn: Function, key: string) => Function): Function {
	return function (original: any, context: ClassMethodDecoratorContext) {
		if (context.kind !== 'method') {
			throw new Error('not supported');
		}
		return decorator(original, context.name.toString());
	};
}
