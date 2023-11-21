/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from 'vs/base/common/types';

interface IVerifier<T> {
	verify(value: unknown): T;
}

abstract class Verifier<T> implements IVerifier<T> {

	constructor(protected readonly defaultValue: T) { }

	verify(value: unknown): T {
		if (!this.isType(value)) {
			return this.defaultValue;
		}

		return value;
	}

	protected abstract isType(value: unknown): value is T;
}

export class BooleanVerifier extends Verifier<boolean> {
	protected isType(value: unknown): value is boolean {
		return typeof value === 'boolean';
	}
}

export class NumberVerifier extends Verifier<number> {
	protected isType(value: unknown): value is number {
		return typeof value === 'number';
	}
}

export class SetVerifier<T> extends Verifier<Set<T>> {
	protected isType(value: unknown): value is Set<T> {
		return value instanceof Set;
	}
}

export class EnumVerifier<T> extends Verifier<T> {
	private readonly allowedValues: ReadonlyArray<T>;

	constructor(defaultValue: T, allowedValues: ReadonlyArray<T>) {
		super(defaultValue);
		this.allowedValues = allowedValues;
	}

	protected isType(value: unknown): value is T {
		return this.allowedValues.includes(value as T);
	}
}

export class ObjectVerifier<T extends Object> extends Verifier<T> {

	constructor(defaultValue: T, private readonly verifier: { [K in keyof T]: IVerifier<T[K]> }) {
		super(defaultValue);
	}

	override verify(value: unknown): T {
		if (!this.isType(value)) {
			return this.defaultValue;
		}
		return verifyObject<T>(this.verifier, value);
	}

	protected isType(value: unknown): value is T {
		return isObject(value);
	}
}

export function verifyObject<T extends Object>(verifiers: { [K in keyof T]: IVerifier<T[K]> }, value: Object): T {
	const result = Object.create(null);

	for (const key in verifiers) {
		if (Object.hasOwnProperty.call(verifiers, key)) {
			const verifier = verifiers[key];
			result[key] = verifier.verify((value as any)[key]);
		}
	}

	return result;
}
