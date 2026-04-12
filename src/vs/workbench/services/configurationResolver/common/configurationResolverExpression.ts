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
	replaceKeyName?: boolean;
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

	private readonly locations = new Map<string, IReplacementLocation>();
	private root: T;
	private stringRoot: boolean;
	/**
	 * Callbacks when a new replacement is made, so that nested resolutions from
	 * `expr.unresolved()` can be fulfilled in the same iteration.
	 */
	private newReplacementNotifiers = new Set<(r: Replacement) => void>();

	private constructor(object: T) {
		// If the input is a string, wrap it in an object so we can use the same logic
		if (typeof object === 'string') {
			this.stringRoot = true;
			// eslint-disable-next-line local/code-no-any-casts
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
		// eslint-disable-next-line local/code-no-any-casts
		const config = this.root as any; // already cloned by ctor, safe to change
		const key = isWindows ? 'windows' : isMacintosh ? 'osx' : isLinux ? 'linux' : undefined;

		if (key && config && typeof config === 'object' && config.hasOwnProperty(key)) {
			Object.keys(config[key]).forEach(k => config[k] = config[key][k]);
		}

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
			this.parseString(obj, key, key, true); // parse key

			if (typeof value === 'string') {
				this.parseString(obj, key, value);
			} else {
				this.parseObject(value);
			}
		}
	}

	private parseString(object: any, propertyName: string | number, value: string, replaceKeyName?: boolean, replacementPath?: string[]): void {
		let pos = 0;
		while (pos < value.length) {
			const match = value.indexOf('${', pos);
			if (match === -1) {
				break;
			}
			const parsed = this.parseVariable(value, match);
			if (parsed) {
				pos = parsed.end + 1;
				if (replacementPath?.includes(parsed.replacement.id)) {
					continue;
				}

				const locations = this.locations.get(parsed.replacement.id) || { locations: [], replacement: parsed.replacement };
				const newLocation: PropertyLocation = { object, propertyName, replaceKeyName };
				locations.locations.push(newLocation);
				this.locations.set(parsed.replacement.id, locations);

				if (locations.resolved) {
					this._resolveAtLocation(parsed.replacement, newLocation, locations.resolved, replacementPath);
				} else {
					this.newReplacementNotifiers.forEach(n => n(parsed.replacement));
				}
			} else {
				pos = match + 2;
			}
		}
	}

	public *unresolved(): Iterable<Replacement> {
		const newReplacements = new Map<string, Replacement>();
		const notifier = (replacement: Replacement) => {
			newReplacements.set(replacement.id, replacement);
		};

		for (const location of this.locations.values()) {
			if (location.resolved === undefined) {
				newReplacements.set(location.replacement.id, location.replacement);
			}
		}

		this.newReplacementNotifiers.add(notifier);

		while (true) {
			const next = Iterable.first(newReplacements);
			if (!next) {
				break;
			}

			const [key, value] = next;
			yield value;
			newReplacements.delete(key);
		}

		this.newReplacementNotifiers.delete(notifier);
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

		location.resolved = data;

		if (data.value !== undefined) {
			for (const l of location.locations || Iterable.empty()) {
				this._resolveAtLocation(replacement, l, data);
			}
		}
	}

	private _resolveAtLocation(replacement: Replacement, { replaceKeyName, propertyName, object }: PropertyLocation, data: IResolvedValue, path: string[] = []) {
		if (data.value === undefined) {
			return;
		}

		// avoid recursive resolution, e.g. ${env:FOO} -> ${env:BAR}=${env:FOO}
		path.push(replacement.id);

		// note: in nested `this.parseString`, parse only the new substring for any replacements, don't reparse the whole string
		if (replaceKeyName && typeof propertyName === 'string') {
			const value = object[propertyName];
			const newKey = propertyName.replaceAll(replacement.id, data.value);
			delete object[propertyName];
			object[newKey] = value;
			this._renameKeyInLocations(object, propertyName, newKey);
			this.parseString(object, newKey, data.value, true, path);
		} else {
			object[propertyName] = object[propertyName].replaceAll(replacement.id, data.value);
			this.parseString(object, propertyName, data.value, false, path);
		}

		path.pop();
	}

	private _renameKeyInLocations(obj: object, oldKey: string, newKey: string) {
		for (const location of this.locations.values()) {
			for (const loc of location.locations) {
				if (loc.object === obj && loc.propertyName === oldKey) {
					loc.propertyName = newKey;
				}
			}
		}
	}

	public toObject(): T {
		// If we wrapped a string, unwrap it
		if (this.stringRoot) {
			// eslint-disable-next-line local/code-no-any-casts
			return (this.root as any).value as T;
		}

		return this.root;
	}
}
