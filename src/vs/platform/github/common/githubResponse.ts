/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GitHubRequestError } from './githubTransport.js';

export function nextLink(link: string | undefined): string | undefined {
	if (!link) {
		return undefined;
	}
	for (const part of link.split(',')) {
		const match = /^\s*<(?<url>[^>]+)>\s*;\s*rel="(?<rel>[^"]+)"/.exec(part);
		if (match?.groups?.rel.split(/\s+/).includes('next')) {
			return match.groups.url;
		}
	}
	return undefined;
}

export function objectAt(value: unknown, ...path: readonly string[]): object {
	let current = asObject(value, 'GitHub response was malformed');
	for (const part of path) {
		current = objectProperty(current, part);
	}
	return current;
}

export function asObject(value: unknown, message: string): object {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new GitHubRequestError(message, 'malformedResponse');
	}
	return value;
}

export function asArray(value: unknown, message: string): readonly unknown[] {
	if (!Array.isArray(value)) {
		throw new GitHubRequestError(message, 'malformedResponse');
	}
	return value;
}

export function objectProperty(value: object, key: string): object {
	return asObject(Reflect.get(value, key), `GitHub response property ${key} was malformed`);
}

export function optionalObjectProperty(value: object, key: string): object | undefined {
	const property = Reflect.get(value, key);
	return property === null || property === undefined ? undefined : asObject(property, `GitHub response property ${key} was malformed`);
}

export function arrayProperty(value: object, key: string): readonly unknown[] {
	return asArray(Reflect.get(value, key), `GitHub response property ${key} was not an array`);
}

export function requiredString(value: object, key: string): string {
	const property = stringProperty(value, key);
	if (property === undefined) {
		throw new GitHubRequestError(`GitHub response property ${key} was not a string`, 'malformedResponse');
	}
	return property;
}

export function stringProperty(value: object, key: string): string | undefined {
	const property = Reflect.get(value, key);
	return typeof property === 'string' ? property : undefined;
}

export function nullableStringProperty(value: object, key: string): string | undefined {
	const property = Reflect.get(value, key);
	return property === null ? undefined : typeof property === 'string' ? property : undefined;
}

export function normalizedEnumProperty(value: object, key: string): string | undefined {
	return nullableStringProperty(value, key)?.toUpperCase();
}

export function numberProperty(value: object, key: string): number | undefined {
	const property = Reflect.get(value, key);
	return typeof property === 'number' && Number.isFinite(property) ? property : undefined;
}

export function requiredNumber(value: object, key: string): number {
	const property = numberProperty(value, key);
	if (property === undefined) {
		throw new GitHubRequestError(`GitHub response property ${key} was not a number`, 'malformedResponse');
	}
	return property;
}

export function booleanProperty(value: object, key: string): boolean | undefined {
	const property = Reflect.get(value, key);
	return typeof property === 'boolean' ? property : undefined;
}

export function idProperty(value: object, key: string): string | undefined {
	const property = Reflect.get(value, key);
	return typeof property === 'string' || typeof property === 'number' ? String(property) : undefined;
}

export function requiredId(value: object, ...keys: readonly string[]): string {
	for (const key of keys) {
		const id = idProperty(value, key);
		if (id) {
			return id;
		}
	}
	throw new GitHubRequestError(`GitHub response did not contain ${keys.join(' or ')}`, 'malformedResponse');
}
