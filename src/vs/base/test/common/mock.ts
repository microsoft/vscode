/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SinonStub, stub } from 'sinon';

export interface Ctor<T> {
	new(): T;
}

export function mock<T>(): Ctor<T> {
	return function () { } as any;
}

export type MockObject<T, ExceptProps = never> = { [K in keyof T]: K extends ExceptProps ? T[K] : SinonStub };

// Creates an object object that returns sinon mocks for every property. Optionally
// takes base properties.
export const mockObject = <T extends object>() => <TP extends Partial<T> = {}>(properties?: TP): MockObject<T, keyof TP> => {
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
