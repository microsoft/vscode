/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Environment-variable reference resolution for portable MCP configuration
 * values. This is a port of the Copilot runtime's `env_var_resolution`
 * primitive and must stay in sync with it.
 *
 * Supports:
 * - `$VAR`, `${VAR}`, and `${VAR:-default}` syntaxes
 * - ASCII-only identifier characters (`[A-Za-z_][A-Za-z0-9_]*`)
 * - A default ends at its matching `}`, tracking `${...}` and `$(...)` nesting
 *   so neither ends it early. Only nesting and unquoted `\}` escapes carry
 *   the scan past a `}`: quoting spans braces in bash, so honouring it here
 *   would let an apostrophe in one default swallow the text and references
 *   that follow it. Quoting is still tracked, to tell whether a `${`, `$(`
 *   or `)` is structural. Syntax outside that set (a quoted `}`, comments,
 *   backticks, heredocs) is not modelled: the default then ends at the
 *   first `}`.
 * - When the variable is unset and no default is supplied, the reference
 *   is left in place verbatim. A variable that is set to an empty string
 *   resolves to that empty string, not to its default.
 * - A default is substituted literally and never expanded again, so any
 *   references it contains reach the caller untouched
 * - Strings longer than {@link MAX_ENV_VAR_RESOLVE_LENGTH} UTF-16 code units
 *   are returned unchanged, bounding the work any single value can cost
 *
 * VS Code variables with an argument, such as `${env:X}` or `${input:x}`, do
 * not match this grammar and are left untouched.
 */

/**
 * Maximum string length, in UTF-16 code units, for which environment-variable
 * expansion is attempted. Above this, the input is returned unchanged.
 */
export const MAX_ENV_VAR_RESOLVE_LENGTH = 1000;

/** An environment, such as `process.env`. Entries whose value is `undefined` are treated as unset. */
export type EnvVarEnvironment = Readonly<Record<string, string | undefined>>;

/** Restricts which references are resolved. By default, all references are resolved, as in the Copilot runtime. */
export interface IEnvVarResolverOptions {
	/** Whether bare `$VAR` references are resolved. Defaults to `true`. */
	readonly bareReferences?: boolean;
}

const enum Char {
	Dollar = 0x24, // $
	OpenBrace = 0x7B, // {
	CloseBrace = 0x7D, // }
	OpenParen = 0x28, // (
	CloseParen = 0x29, // )
	Colon = 0x3A, // :
	Dash = 0x2D, // -
	Backslash = 0x5C, // \
	SingleQuote = 0x27, // '
	DoubleQuote = 0x22, // "
	Hash = 0x23, // #
	Backtick = 0x60, // `
	LessThan = 0x3C, // <
	Underscore = 0x5F, // _
}

const enum ShellQuoting {
	Unquoted,
	Single,
	Double,
}

const enum ShellGroup {
	Brace,
	Parenthesis,
}

interface IEnvVarReference {
	readonly name: string;
	readonly defaultValue: string | undefined;
	/** The full source text of the reference, kept when it cannot be resolved. */
	readonly verbatim: string;
}

function isAsciiAlpha(code: number): boolean {
	return (code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A);
}

function isAsciiDigit(code: number): boolean {
	return code >= 0x30 && code <= 0x39;
}

function identifierEnd(value: string, start: number): number | undefined {
	const first = value.charCodeAt(start);
	if (!isAsciiAlpha(first) && first !== Char.Underscore) {
		return undefined;
	}
	let end = start + 1;
	while (end < value.length) {
		const code = value.charCodeAt(end);
		if (!isAsciiAlpha(code) && !isAsciiDigit(code) && code !== Char.Underscore) {
			break;
		}
		end++;
	}
	return end;
}

/**
 * Finds the `}` that closes a default starting at `start`, or `undefined` if
 * the default uses syntax that is not modelled or is unbalanced.
 */
function balancedCloseBrace(value: string, start: number): number | undefined {
	let quoting = ShellQuoting.Unquoted;
	const open: [ShellGroup, ShellQuoting][] = [];
	const openGroup = (group: ShellGroup) => {
		open.push([group, quoting]);
		quoting = ShellQuoting.Unquoted;
	};

	let cursor = start;
	while (cursor < value.length) {
		const code = value.charCodeAt(cursor);
		const next = value.charCodeAt(cursor + 1);
		let consumed = 1;

		if (quoting === ShellQuoting.Single) {
			if (code === Char.SingleQuote) {
				quoting = ShellQuoting.Unquoted;
			} else if (code === Char.CloseBrace) {
				return undefined;
			}
		} else if (code === Char.Backslash) {
			if (quoting === ShellQuoting.Double && next === Char.CloseBrace) {
				return undefined;
			}
			consumed = 2;
		} else if (quoting === ShellQuoting.Double) {
			if (code === Char.CloseBrace) {
				return undefined;
			} else if (code === Char.DoubleQuote) {
				quoting = ShellQuoting.Unquoted;
			} else if (code === Char.Dollar && next === Char.OpenBrace) {
				openGroup(ShellGroup.Brace);
				consumed = 2;
			} else if (code === Char.Dollar && next === Char.OpenParen) {
				openGroup(ShellGroup.Parenthesis);
				consumed = 2;
			}
		} else {
			const top = open.at(-1);
			switch (code) {
				case Char.SingleQuote:
					quoting = ShellQuoting.Single;
					break;
				case Char.DoubleQuote:
					quoting = ShellQuoting.Double;
					break;
				case Char.Hash:
				case Char.Backtick:
					return undefined;
				case Char.Dollar:
					if (next === Char.SingleQuote || next === Char.DoubleQuote) {
						return undefined;
					} else if (next === Char.OpenBrace) {
						openGroup(ShellGroup.Brace);
						consumed = 2;
					} else if (next === Char.OpenParen) {
						openGroup(ShellGroup.Parenthesis);
						consumed = 2;
					}
					break;
				case Char.LessThan:
					if (next === Char.LessThan) {
						return undefined;
					}
					break;
				case Char.OpenParen:
					if (top?.[0] === ShellGroup.Parenthesis) {
						open.push([ShellGroup.Parenthesis, quoting]);
					}
					break;
				case Char.CloseParen:
					if (top?.[0] === ShellGroup.Parenthesis) {
						quoting = top[1];
						open.pop();
					}
					break;
				case Char.CloseBrace:
					if (!top) {
						return cursor;
					}
					if (top[0] === ShellGroup.Brace) {
						quoting = top[1];
						open.pop();
					}
					break;
			}
		}
		cursor += consumed;
	}
	return undefined;
}

function defaultWordEnd(value: string, start: number): number | undefined {
	const balanced = balancedCloseBrace(value, start);
	if (balanced !== undefined) {
		return balanced;
	}
	const first = value.indexOf('}', start);
	return first === -1 ? undefined : first;
}

function parseBracedReference(value: string, start: number): IEnvVarReference | undefined {
	const nameStart = start + 2;
	const nameEnd = identifierEnd(value, nameStart);
	if (nameEnd === undefined) {
		return undefined;
	}
	const name = value.slice(nameStart, nameEnd);

	if (value.charCodeAt(nameEnd) === Char.CloseBrace) {
		return { name, defaultValue: undefined, verbatim: value.slice(start, nameEnd + 1) };
	}

	if (value.charCodeAt(nameEnd) !== Char.Colon || value.charCodeAt(nameEnd + 1) !== Char.Dash) {
		return undefined;
	}
	const defaultStart = nameEnd + 2;
	const close = defaultWordEnd(value, defaultStart);
	if (close === undefined) {
		return undefined;
	}
	return { name, defaultValue: value.slice(defaultStart, close), verbatim: value.slice(start, close + 1) };
}

/** Parses the reference starting at the `$` at `start`, if any. */
function parseReference(value: string, start: number, options: IEnvVarResolverOptions | undefined): IEnvVarReference | undefined {
	if (value.charCodeAt(start + 1) === Char.OpenBrace) {
		return parseBracedReference(value, start);
	}
	if (options?.bareReferences === false) {
		return undefined;
	}
	const nameEnd = identifierEnd(value, start + 1);
	if (nameEnd === undefined) {
		return undefined;
	}
	return { name: value.slice(start + 1, nameEnd), defaultValue: undefined, verbatim: value.slice(start, nameEnd) };
}

/**
 * Creates a function that resolves environment-variable references in a
 * string against `env`. Use this when resolving several values against the
 * same environment. When `env` is `undefined`, values are returned unchanged.
 *
 * When `caseInsensitive` is `true`, variable names are matched without regard
 * to case. This mirrors Node.js's case-insensitive `process.env` lookups on
 * Windows, where e.g. `${PATH}` must resolve against a `Path` entry.
 */
export function createEnvVarResolver(env: EnvVarEnvironment | undefined, caseInsensitive: boolean, options?: IEnvVarResolverOptions): (value: string) => string {
	if (!env) {
		return value => value;
	}

	const lookup = new Map<string, string>();
	for (const [name, value] of Object.entries(env)) {
		if (typeof value === 'string') {
			lookup.set(caseInsensitive ? name.toLowerCase() : name, value);
		}
	}

	return value => {
		if (value.length > MAX_ENV_VAR_RESOLVE_LENGTH) {
			return value;
		}

		let result = '';
		let cursor = 0;
		for (let start = value.indexOf('$'); start !== -1; start = value.indexOf('$', cursor)) {
			result += value.slice(cursor, start);
			const reference = parseReference(value, start, options);
			if (reference) {
				result += lookup.get(caseInsensitive ? reference.name.toLowerCase() : reference.name) ?? reference.defaultValue ?? reference.verbatim;
				cursor = start + reference.verbatim.length;
			} else {
				result += '$';
				cursor = start + 1;
			}
		}
		return result + value.slice(cursor);
	};
}

/**
 * Resolves environment-variable references in `value`. Returns `value`
 * unchanged if `env` is `undefined` or if the input exceeds
 * {@link MAX_ENV_VAR_RESOLVE_LENGTH}.
 */
export function resolveEnvVars(value: string, env: EnvVarEnvironment | undefined, caseInsensitive: boolean, options?: IEnvVarResolverOptions): string {
	return createEnvVarResolver(env, caseInsensitive, options)(value);
}

/**
 * Reports whether `value` contains references the resolver recognises,
 * independent of any environment. Uses the same length cap and parser as
 * resolution.
 */
export function hasEnvVarReferences(value: string, options?: IEnvVarResolverOptions): boolean {
	if (value.length > MAX_ENV_VAR_RESOLVE_LENGTH) {
		return false;
	}
	for (let start = value.indexOf('$'); start !== -1; start = value.indexOf('$', start + 1)) {
		if (parseReference(value, start, options)) {
			return true;
		}
	}
	return false;
}
