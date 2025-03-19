/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from '../../../../base/common/iterator.js';
import { isLinux, isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { ConfiguredInput } from './configurationResolver.js';

/** A replacement found in the object, as ${name} or ${name:arg} */
export type Replacement = {
	/** ${name:arg} */
	id: string;
	/** The `name:arg` in ${name:arg} */
	inner: string;
	/** The `name` in ${name:arg} */
	name: string;
	/** The `arg` in ${name:arg} */
	arg?: string;
};

interface IConfigurationResolverExpression<T> {
	/**
	 * Gets the replacements which have not yet been
	 * resolved.
	 */
	unresolved(): Iterable<Replacement>;

	/**
	 * Gets the replacements which have been resolved.
	 */
	resolved(): Iterable<[Replacement, IResolvedValue]>;

	/**
	 * Resolves a replacement into the string value.
	 * If the value is undefined, the original variable text will be preserved.
	 */
	resolve(replacement: Replacement, data: string | IResolvedValue): void;

	/**
	 * Returns the complete object. Any unresolved replacements are left intact.
	 */
	toObject(): T;
}

type PropertyLocation = {
	object: any;
	propertyName: string | number;
};

export interface IResolvedValue {
	value: string | undefined;

	/** Present when the variable is resolved from an input field. */
	input?: ConfiguredInput;
}

interface IReplacementLocation {
	replacement: Replacement;
	locations: PropertyLocation[];
	resolved?: IResolvedValue;
}

export class ConfigurationResolverExpression<T> implements IConfigurationResolverExpression<T> {
	public static readonly VARIABLE_LHS = '${';

	private locations = new Map<string, IReplacementLocation>();
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

	/**
	 * Creates a new {@link ConfigurationResolverExpression} from an object.
	 * Note that platform-specific keys (i.e. `windows`, `osx`, `linux`) are
	 * applied during parsing.
	 */
	public static parse<T>(object: T): ConfigurationResolverExpression<T> {
		if (object instanceof ConfigurationResolverExpression) {
			return object;
		}

		const expr = new ConfigurationResolverExpression<T>(object);
		expr.applyPlatformSpecificKeys();
		expr.parseObject(expr.root);
		return expr;
	}

	private applyPlatformSpecificKeys() {
		const config = this.root as any; // already cloned by ctor, safe to change
		const key = isWindows ? 'windows' : isMacintosh ? 'osx' : isLinux ? 'linux' : undefined;
		if (key === undefined || !config || typeof config !== 'object' || !config.hasOwnProperty(key)) {
			return;
		}

		Object.keys(config[key]).forEach(k => config[k] = config[key][k]);

		delete config.windows;
		delete config.osx;
		delete config.linux;
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
			return { replacement: { id, name: inner, inner }, end };
		}

		return {
			replacement: {
				id,
				inner,
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
		return Iterable.map(Iterable.filter(this.locations.values(), l => l.resolved === undefined), l => l.replacement);
	}

	public resolved(): Iterable<[Replacement, IResolvedValue]> {
		return Iterable.map(Iterable.filter(this.locations.values(), l => !!l.resolved), l => [l.replacement, l.resolved!]);
	}

	public resolve(replacement: Replacement, data: string | IResolvedValue): void {
		if (typeof data !== 'object') {
			data = { value: String(data) };
		}

		const location = this.locations.get(replacement.id);
		if (!location) {
			return;
		}

		if (data.value !== undefined) {
			for (const { object, propertyName } of location.locations || []) {
				const newValue = object[propertyName].replaceAll(replacement.id, data.value);
				object[propertyName] = newValue;
			}
		}

		location.resolved = data;
	}

	public toObject(): T {
		// If we wrapped a string, unwrap it
		if (this.stringRoot) {
			return (this.root as any).value as T;
		}

		return this.root;
	}
}
