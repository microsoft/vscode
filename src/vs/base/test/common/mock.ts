/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SinonStub, stub } from 'sinon';
import { DeepPartial } from '../../common/types.js';

export interface Ctor<T> {
	new(): T;
}

export function mock<T>(): Ctor<T> {
	// eslint-disable-next-line local/code-no-any-casts
	return function () { } as any;
}

export type MockObject<T, ExceptProps = never> = { [K in keyof T]: K extends ExceptProps ? T[K] : SinonStub };

// Creates an object object that returns sinon mocks for every property. Optionally
// takes base properties.
export const mockObject = <T extends object>() => <TP extends Partial<T> = {}>(properties?: TP): MockObject<T, keyof TP> => {
	// eslint-disable-next-line local/code-no-any-casts
	return new Proxy({ ...properties } as any, {
		get(target, key) {
			if (!target.hasOwnProperty(key)) {
				target[key] = stub();
			}

			return target[key];
		},
		set(target, key, value) {
			target[key] = value;
			return true;
		},
	});
};

/**
 * Shortcut for type-safe partials in mocks. A shortcut for `obj as Partial<T> as T`.
 */
export function upcastPartial<T>(partial: Partial<T>): T {
	return partial as T;
}
export function upcastDeepPartial<T>(partial: DeepPartial<T>): T {
	return partial as T;
}
