/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IUriTemplateVariable {
	readonly explodable: boolean;
	readonly name: string;
	readonly optional: boolean;
	readonly prefixLength?: number;
	readonly repeatable: boolean;
}

interface IUriTemplateComponent {
	readonly expression: string;
	readonly operator: string;
	readonly variables: readonly IUriTemplateVariable[];
}

/**
 * Represents an RFC 6570 URI Template.
 */
export class UriTemplate {
	/**
	 * The parsed template components (expressions).
	 */
	public readonly components: ReadonlyArray<IUriTemplateComponent | string>;

	private constructor(
		public readonly template: string,
		components: ReadonlyArray<IUriTemplateComponent | string>
	) {
		this.template = template;
		this.components = components;
	}

	/**
	 * Parses a URI template string into a UriTemplate instance.
	 */
	public static parse(template: string): UriTemplate {
		const components: Array<IUriTemplateComponent | string> = [];
		const regex = /\{([^{}]+)\}/g;
		let match: RegExpExecArray | null;
		let lastPos = 0;
		while ((match = regex.exec(template))) {
			const [expression, inner] = match;
			components.push(template.slice(lastPos, match.index));
			lastPos = match.index + expression.length;

			// Handle escaped braces: treat '{{' and '}}' as literals, not expressions
			if (template[match.index - 1] === '{' || template[lastPos] === '}') {
				components.push(inner);
				continue;
			}

			let operator = '';
			let rest = inner;
			if (rest.length > 0 && UriTemplate._isOperator(rest[0])) {
				operator = rest[0];
				rest = rest.slice(1);
			}
			const variables = rest.split(',').map((v): IUriTemplateVariable => {
				let name = v;
				let explodable = false;
				let repeatable = false;
				let prefixLength: number | undefined = undefined;
				let optional = false;
				if (name.endsWith('*')) {
					explodable = true;
					repeatable = true;
					name = name.slice(0, -1);
				}
				const prefixMatch = name.match(/^(.*?):(\d+)$/);
				if (prefixMatch) {
					name = prefixMatch[1];
					prefixLength = parseInt(prefixMatch[2], 10);
				}
				if (name.endsWith('?')) {
					optional = true;
					name = name.slice(0, -1);
				}
				return { explodable, name, optional, prefixLength, repeatable };
			});
			components.push({ expression, operator, variables });
		}
		components.push(template.slice(lastPos));

		return new UriTemplate(template, components);
	}

	private static _operators = ['+', '#', '.', '/', ';', '?', '&'] as const;
	private static _isOperator(ch: string): boolean {
		return (UriTemplate._operators as readonly string[]).includes(ch);
	}

	/**
	 * Resolves the template with the given variables.
	 */
	public resolve(variables: Record<string, unknown>): string {
		let result = '';
		for (const comp of this.components) {
			if (typeof comp === 'string') {
				result += comp;
			} else {
				result += this._expand(comp, variables);
			}
		}
		return result;
	}

	private _expand(comp: IUriTemplateComponent, variables: Record<string, unknown>): string {
		const op = comp.operator;
		const varSpecs = comp.variables;
		if (varSpecs.length === 0) {
			return comp.expression;
		}
		const vals: string[] = [];
		const isNamed = op === ';' || op === '?' || op === '&';
		const isReserved = op === '+' || op === '#';
		const isFragment = op === '#';
		const isLabel = op === '.';
		const isPath = op === '/';
		const isForm = op === '?';
		const isFormCont = op === '&';
		const isParam = op === ';';

		let prefix = '';
		if (op === '+') { prefix = ''; }
		else if (op === '#') { prefix = '#'; }
		else if (op === '.') { prefix = '.'; }
		else if (op === '/') { prefix = ''; }
		else if (op === ';') { prefix = ';'; }
		else if (op === '?') { prefix = '?'; }
		else if (op === '&') { prefix = '&'; }

		for (const v of varSpecs) {
			const value = variables[v.name];
			const defined = Object.prototype.hasOwnProperty.call(variables, v.name);
			if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
				if (isParam) {
					if (defined && (value === null || value === undefined)) {
						vals.push(v.name);
					}
					continue;
				}
				if (isForm || isFormCont) {
					if (defined) {
						vals.push(UriTemplate._formPair(v.name, '', isNamed));
					}
					continue;
				}
				continue;
			}
			if (typeof value === 'object' && !Array.isArray(value)) {
				if (v.explodable) {
					const pairs: string[] = [];
					for (const k in value) {
						if (Object.prototype.hasOwnProperty.call(value, k)) {
							const thisVal = String((value as Record<string, unknown>)[k]);
							if (isParam) {
								pairs.push(k + '=' + thisVal);
							} else if (isForm || isFormCont) {
								pairs.push(k + '=' + thisVal);
							} else if (isLabel) {
								pairs.push(k + '=' + thisVal);
							} else if (isPath) {
								pairs.push('/' + k + '=' + UriTemplate._encode(thisVal, isReserved));
							} else {
								pairs.push(k + '=' + UriTemplate._encode(thisVal, isReserved));
							}
						}
					}
					if (isLabel) {
						vals.push(pairs.join('.'));
					} else if (isPath) {
						vals.push(pairs.join(''));
					} else if (isParam) {
						vals.push(pairs.join(';'));
					} else if (isForm || isFormCont) {
						vals.push(pairs.join('&'));
					} else {
						vals.push(pairs.join(','));
					}
				} else {
					// Not explodable: join as k1,v1,k2,v2,... and assign to variable name
					const pairs: string[] = [];
					for (const k in value) {
						if (Object.prototype.hasOwnProperty.call(value, k)) {
							pairs.push(k);
							pairs.push(String((value as Record<string, unknown>)[k]));
						}
					}
					// For label, param, form, join as keys=semi,;,dot,.,comma,, (no encoding of , or ;)
					const joined = pairs.join(',');
					if (isLabel) {
						vals.push(joined);
					} else if (isParam || isForm || isFormCont) {
						vals.push(v.name + '=' + joined);
					} else {
						vals.push(joined);
					}
				}
				continue;
			}
			if (Array.isArray(value)) {
				if (v.explodable) {
					if (isLabel) {
						vals.push(value.join('.'));
					} else if (isPath) {
						vals.push(value.map(x => '/' + UriTemplate._encode(x, isReserved)).join(''));
					} else if (isParam) {
						vals.push(value.map(x => v.name + '=' + String(x)).join(';'));
					} else if (isForm || isFormCont) {
						vals.push(value.map(x => v.name + '=' + String(x)).join('&'));
					} else {
						vals.push(value.map(x => UriTemplate._encode(x, isReserved)).join(','));
					}
				} else {
					if (isLabel) {
						vals.push(value.join(','));
					} else if (isParam) {
						vals.push(v.name + '=' + value.join(','));
					} else if (isForm || isFormCont) {
						vals.push(v.name + '=' + value.join(','));
					} else {
						vals.push(value.map(x => UriTemplate._encode(x, isReserved)).join(','));
					}
				}
				continue;
			}
			let str = String(value);
			if (v.prefixLength !== undefined) {
				str = str.substring(0, v.prefixLength);
			}
			// For simple expansion, encode ! as well (not reserved)
			// Only + and # are reserved
			const enc = UriTemplate._encode(str, op === '+' || op === '#');
			if (isParam) {
				vals.push(v.name + '=' + enc);
			} else if (isForm || isFormCont) {
				vals.push(v.name + '=' + enc);
			} else if (isLabel) {
				vals.push(enc);
			} else if (isPath) {
				vals.push('/' + enc);
			} else {
				vals.push(enc);
			}
		}

		let joined = '';
		if (isLabel) {
			// Remove trailing dot for missing values
			const filtered = vals.filter(v => v !== '');
			joined = filtered.length ? prefix + filtered.join('.') : '';
		} else if (isPath) {
			// Remove empty segments for undefined/null
			const filtered = vals.filter(v => v !== '');
			joined = filtered.length ? filtered.join('') : '';
			if (joined && !joined.startsWith('/')) {
				joined = '/' + joined;
			}
		} else if (isParam) {
			// For param, if value is empty string, just append ;name
			joined = vals.length ? prefix + vals.map(v => v.replace(/=\s*$/, '')).join(';') : '';
		} else if (isForm) {
			joined = vals.length ? prefix + vals.join('&') : '';
		} else if (isFormCont) {
			joined = vals.length ? prefix + vals.join('&') : '';
		} else if (isFragment) {
			joined = prefix + vals.join(',');
		} else if (isReserved) {
			joined = vals.join(',');
		} else {
			joined = vals.join(',');
		}
		return joined;
	}

	private static _encode(str: string, reserved: boolean): string {
		return reserved ? encodeURI(str) : pctEncode(str);
	}

	private static _formPair(k: string, v: unknown, named: boolean): string {
		return named ? k + '=' + encodeURIComponent(String(v)) : encodeURIComponent(String(v));
	}
}

function pctEncode(str: string): string {
	let out = '';
	for (let i = 0; i < str.length; i++) {
		const chr = str.charCodeAt(i);
		if (
			// alphanum ranges:
			(chr >= 0x30 && chr <= 0x39 || chr >= 0x41 && chr <= 0x5a || chr >= 0x61 && chr <= 0x7a) ||
			// unreserved characters:
			(chr === 0x2d || chr === 0x2e || chr === 0x5f || chr === 0x7e)
		) {
			out += str[i];
		} else {
			out += '%' + chr.toString(16).toUpperCase();
		}
	}
	return out;
}
