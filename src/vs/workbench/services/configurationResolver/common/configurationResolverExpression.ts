/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from '../../../../base/common/iterator.js';

/** A replacement found in the object, as ${name} or ${name:arg} */
export type Replacement = { id: string; name: string; arg?: string };

interface IConfigurationResolverExpression<T> {
	/**
	 * Gets the replacements which have not yet been
	 * resolved.
	 */
	unresolved(): Iterable<Replacement>;

	/**
	 * Resolves a replacement into the string value.
	 * If the value is undefined, the original variable text will be preserved.
	 */
	resolve(replacement: Replacement, value: string | undefined): void;

	/**
	 * Returns the complete object. Any unresolved replacements are left intact.
	 */
	toObject(): T;
}

type PropertyLocation = {
	object: any;
	propertyName: string | number;
};

export class ConfigurationResolverExpression<T> implements IConfigurationResolverExpression<T> {
	private locations = new Map<string, { replacement: Replacement; locations: PropertyLocation[]; resolved?: string }>();
	private root: T;
	private stringRoot: boolean;

	private constructor(object: T) {
		// If the input is a string, wrap it in an object so we can use the same logic
		if (typeof object === 'string') {
			this.stringRoot = true;
			this.root = { value: object } as any;
		} else {
			this.stringRoot = false;
			this.root = structuredClone(object);
		}
	}

	public static parse<T>(object: T): ConfigurationResolverExpression<T> {
		if (object instanceof ConfigurationResolverExpression) {
			return object;
		}

		const expr = new ConfigurationResolverExpression<T>(object);
		expr.parseObject(expr.root);
		return expr;
	}

	private parseVariable(str: string, start: number): { replacement: Replacement; end: number } | undefined {
		if (str[start] !== '$' || str[start + 1] !== '{') {
			return undefined;
		}

		let end = start + 2;
		let braceCount = 1;
		while (end < str.length) {
			if (str[end] === '{') {
				braceCount++;
			} else if (str[end] === '}') {
				braceCount--;
				if (braceCount === 0) {
					break;
				}
			}
			end++;
		}

		if (braceCount !== 0) {
			return undefined;
		}

		const id = str.slice(start, end + 1);
		const inner = str.substring(start + 2, end);
		const colonIdx = inner.indexOf(':');
		if (colonIdx === -1) {
			return { replacement: { id, name: inner }, end };
		}

		return {
			replacement: {
				id,
				name: inner.slice(0, colonIdx),
				arg: inner.slice(colonIdx + 1)
			},
			end
		};
	}

	private parseObject(obj: any): void {
		if (typeof obj !== 'object' || obj === null) {
			return;
		}

		if (Array.isArray(obj)) {
			for (let i = 0; i < obj.length; i++) {
				const value = obj[i];
				if (typeof value === 'string') {
					this.parseString(obj, i, value);
				} else {
					this.parseObject(value);
				}
			}
			return;
		}

		for (const [key, value] of Object.entries(obj)) {
			if (typeof value === 'string') {
				this.parseString(obj, key, value);
			} else {
				this.parseObject(value);
			}
		}
	}

	private parseString(object: any, propertyName: string | number, value: string): void {
		let pos = 0;
		while (pos < value.length) {
			const match = value.indexOf('${', pos);
			if (match === -1) {
				break;
			}
			const parsed = this.parseVariable(value, match);
			if (parsed) {
				const locations = this.locations.get(parsed.replacement.id) || { locations: [], replacement: parsed.replacement };
				locations.locations.push({ object, propertyName });
				this.locations.set(parsed.replacement.id, locations);
				pos = parsed.end + 1;
			} else {
				pos = match + 2;
			}
		}
	}

	public unresolved(): Iterable<Replacement> {
		return Iterable.map(Iterable.filter(this.locations.values(), (location) => location.resolved === undefined), (location) => location.replacement);
	}

	public resolve(replacement: Replacement, value: string | undefined): void {
		if (value === undefined) {
			return; // Preserve original text by not updating anything
		}

		const location = this.locations.get(replacement.id);
		if (!location) {
			return;
		}

		for (const { object, propertyName } of location.locations || []) {
			const newValue = object[propertyName].replaceAll(replacement.id, value);
			object[propertyName] = newValue;
		}
		location.resolved = value;
	}

	public toObject(): T {
		// If we wrapped a string, unwrap it
		if (this.stringRoot) {
			return (this.root as any).value as T;
		}

		return this.root;
	}
}
