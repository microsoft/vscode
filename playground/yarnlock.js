// Adapted from:
// https://github.com/yarnpkg/yarn/blob/master/src/lockfile/parse.js
// https://github.com/yarnpkg/yarn/blob/master/src/lockfile/stringify.js

const util = require('util');
const stripBOM = require('strip-bom');
const xdiff = require('xdiff');

function invariant(value, message) {
	if (!value) {
		throw new Error(message);
	}
}

function map(obj = {}) {
	if (Array.isArray(obj)) {
		for (const item of obj) {
			nullify(item);
		}
	} else if ((obj !== null && typeof obj === 'object') || typeof obj === 'function') {
		Object.setPrototypeOf(obj, null);

		// for..in can only be applied to 'object', not 'function'
		if (typeof obj === 'object') {
			for (const key in obj) {
				nullify(obj[key]);
			}
		}
	}

	return obj;
}

const VERSION_REGEX = /^yarn lockfile v(\d+)$/;

const TOKEN_TYPES = {
	boolean: 'BOOLEAN',
	string: 'STRING',
	identifier: 'IDENTIFIER',
	eof: 'EOF',
	colon: 'COLON',
	newline: 'NEWLINE',
	comment: 'COMMENT',
	indent: 'INDENT',
	invalid: 'INVALID',
	number: 'NUMBER',
	comma: 'COMMA',
};

const VALID_PROP_VALUE_TOKENS = [TOKEN_TYPES.boolean, TOKEN_TYPES.string, TOKEN_TYPES.number];

function isValidPropValueToken(token) {
	return VALID_PROP_VALUE_TOKENS.indexOf(token.type) >= 0;
}

function* tokenise(input) {
	let lastNewline = false;
	let line = 1;
	let col = 0;

	function buildToken(type, value) {
		return { line, col, type, value };
	}

	while (input.length) {
		let chop = 0;

		if (input[0] === '\n' || input[0] === '\r') {
			chop++;
			// If this is a \r\n line, ignore both chars but only add one new line
			if (input[1] === '\n') {
				chop++;
			}
			line++;
			col = 0;
			yield buildToken(TOKEN_TYPES.newline);
		} else if (input[0] === '#') {
			chop++;

			let nextNewline = input.indexOf('\n', chop);
			if (nextNewline === -1) {
				nextNewline = input.length;
			}
			const val = input.substring(chop, nextNewline);
			chop = nextNewline;
			yield buildToken(TOKEN_TYPES.comment, val);
		} else if (input[0] === ' ') {
			if (lastNewline) {
				let indentSize = 1;
				for (let i = 1; input[i] === ' '; i++) {
					indentSize++;
				}

				if (indentSize % 2) {
					throw new TypeError('Invalid number of spaces');
				} else {
					chop = indentSize;
					yield buildToken(TOKEN_TYPES.indent, indentSize / 2);
				}
			} else {
				chop++;
			}
		} else if (input[0] === '"') {
			let i = 1;
			for (; i < input.length; i++) {
				if (input[i] === '"') {
					const isEscaped = input[i - 1] === '\\' && input[i - 2] !== '\\';
					if (!isEscaped) {
						i++;
						break;
					}
				}
			}
			const val = input.substring(0, i);

			chop = i;

			try {
				yield buildToken(TOKEN_TYPES.string, JSON.parse(val));
			} catch (err) {
				if (err instanceof SyntaxError) {
					yield buildToken(TOKEN_TYPES.invalid);
				} else {
					throw err;
				}
			}
		} else if (/^[0-9]/.test(input)) {
			const val = /^[0-9]+/.exec(input)[0];
			chop = val.length;

			yield buildToken(TOKEN_TYPES.number, +val);
		} else if (/^true/.test(input)) {
			yield buildToken(TOKEN_TYPES.boolean, true);
			chop = 4;
		} else if (/^false/.test(input)) {
			yield buildToken(TOKEN_TYPES.boolean, false);
			chop = 5;
		} else if (input[0] === ':') {
			yield buildToken(TOKEN_TYPES.colon);
			chop++;
		} else if (input[0] === ',') {
			yield buildToken(TOKEN_TYPES.comma);
			chop++;
		} else if (/^[a-zA-Z\/.-]/g.test(input)) {
			let i = 0;
			for (; i < input.length; i++) {
				const char = input[i];
				if (char === ':' || char === ' ' || char === '\n' || char === '\r' || char === ',') {
					break;
				}
			}
			const name = input.substring(0, i);
			chop = i;

			yield buildToken(TOKEN_TYPES.string, name);
		} else {
			yield buildToken(TOKEN_TYPES.invalid);
		}

		if (!chop) {
			// will trigger infinite recursion
			yield buildToken(TOKEN_TYPES.invalid);
		}

		col += chop;
		lastNewline = input[0] === '\n' || (input[0] === '\r' && input[1] === '\n');
		input = input.slice(chop);
	}

	yield buildToken(TOKEN_TYPES.eof);
}

class Parser {
	constructor(input, fileLoc = 'lockfile') {
		this.comments = [];
		this.tokens = tokenise(input);
		this.fileLoc = fileLoc;
	}

	fileLoc;
	token;
	tokens;
	comments;

	onComment(token) {
		const value = token.value;
		invariant(typeof value === 'string', 'expected token value to be a string');

		const comment = value.trim();

		const versionMatch = comment.match(VERSION_REGEX);
		if (versionMatch) {
			const version = +versionMatch[1];
			if (version > 1) {
				throw new Error(
					`Can't install from a lockfile of version ${version} as you're on an old yarn version that only supports ` +
					`versions up to 1. Run \`$ yarn self-update\` to upgrade to the latest version.`,
				);
			}
		}

		this.comments.push(comment);
	}

	next() {
		const item = this.tokens.next();
		invariant(item, 'expected a token');

		const { done, value } = item;
		if (done || !value) {
			throw new Error('No more tokens');
		} else if (value.type === TOKEN_TYPES.comment) {
			this.onComment(value);
			return this.next();
		} else {
			return (this.token = value);
		}
	}

	unexpected(msg = 'Unexpected token') {
		throw new SyntaxError(`${msg} ${this.token.line}:${this.token.col} in ${this.fileLoc}`);
	}

	expect(tokType) {
		if (this.token.type === tokType) {
			this.next();
		} else {
			this.unexpected();
		}
	}

	eat(tokType) {
		if (this.token.type === tokType) {
			this.next();
			return true;
		} else {
			return false;
		}
	}

	parse(indent = 0) {
		const obj = map();

		while (true) {
			const propToken = this.token;

			if (propToken.type === TOKEN_TYPES.newline) {
				const nextToken = this.next();
				if (!indent) {
					// if we have 0 indentation then the next token doesn't matter
					continue;
				}

				if (nextToken.type !== TOKEN_TYPES.indent) {
					// if we have no indentation after a newline then we've gone down a level
					break;
				}

				if (nextToken.value === indent) {
					// all is good, the indent is on our level
					this.next();
				} else {
					// the indentation is less than our level
					break;
				}
			} else if (propToken.type === TOKEN_TYPES.indent) {
				if (propToken.value === indent) {
					this.next();
				} else {
					break;
				}
			} else if (propToken.type === TOKEN_TYPES.eof) {
				break;
			} else if (propToken.type === TOKEN_TYPES.string) {
				// property key
				const key = propToken.value;
				invariant(key, 'Expected a key');

				const keys = [key];
				this.next();

				// support multiple keys
				while (this.token.type === TOKEN_TYPES.comma) {
					this.next(); // skip comma

					const keyToken = this.token;
					if (keyToken.type !== TOKEN_TYPES.string) {
						this.unexpected('Expected string');
					}

					const key = keyToken.value;
					invariant(key, 'Expected a key');
					keys.push(key);
					this.next();
				}

				const wasColon = this.token.type === TOKEN_TYPES.colon;
				if (wasColon) {
					this.next();
				}

				if (isValidPropValueToken(this.token)) {
					// plain value
					for (const key of keys) {
						obj[key] = this.token.value;
					}

					this.next();
				} else if (wasColon) {
					// parse object
					const val = this.parse(indent + 1);

					for (const key of keys) {
						obj[key] = val;
					}

					if (indent && this.token.type !== TOKEN_TYPES.indent) {
						break;
					}
				} else {
					this.unexpected('Invalid value type');
				}
			} else {
				this.unexpected(`Unknown token: ${util.inspect(propToken)}`);
			}
		}

		return obj;
	}
}

function parse(str, fileLoc = 'lockfile') {
	str = stripBOM(str);
	const parser = new Parser(str, fileLoc);
	parser.next();
	return parser.parse();
}

function shouldWrapKey(str) {
	return (
		str.indexOf('true') === 0 ||
		str.indexOf('false') === 0 ||
		/[:\s\n\\",\[\]]/g.test(str) ||
		/^[0-9]/g.test(str) ||
		!/^[a-zA-Z]/g.test(str)
	);
}

function maybeWrap(str) {
	if (typeof str === 'boolean' || typeof str === 'number' || shouldWrapKey(str)) {
		return JSON.stringify(str);
	} else {
		return str;
	}
}

const priorities = {
	name: 1,
	version: 2,
	uid: 3,
	resolved: 4,
	integrity: 5,
	registry: 6,
	dependencies: 7,
};

function sortAlpha(a, b) {
	const shortLen = Math.min(a.length, b.length);
	for (let i = 0; i < shortLen; i++) {
		const aChar = a.charCodeAt(i);
		const bChar = b.charCodeAt(i);
		if (aChar !== bChar) {
			return aChar - bChar;
		}
	}
	return a.length - b.length;
}

function priorityThenAlphaSort(a, b) {
	if (priorities[a] || priorities[b]) {
		return (priorities[a] || 100) > (priorities[b] || 100) ? 1 : -1;
	} else {
		return sortAlpha(a, b);
	}
}

function objectEquals(a, b) {
	return !xdiff.diff(a, b);
}

function _stringify(obj, options) {
	if (typeof obj !== 'object') {
		throw new TypeError();
	}

	const indent = options.indent;
	const lines = [];

	// Sorting order needs to be consistent between runs, we run native sort by name because there are no
	// problems with it being unstable because there are no to keys the same
	// However priorities can be duplicated and native sort can shuffle things from run to run
	const keys = Object.keys(obj).sort(priorityThenAlphaSort);

	let addedKeys = [];

	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		const val = obj[key];
		if (val == null || addedKeys.indexOf(key) >= 0) {
			continue;
		}

		const valKeys = [key];

		// get all keys that have the same value equality, we only want this for objects
		if (typeof val === 'object') {
			for (let j = i + 1; j < keys.length; j++) {
				const key = keys[j];
				if (objectEquals(val, obj[key])) {
					valKeys.push(key);
				}
			}
		}

		const keyLine = valKeys.sort(sortAlpha).map(maybeWrap).join(', ');

		if (typeof val === 'string' || typeof val === 'boolean' || typeof val === 'number') {
			lines.push(`${keyLine} ${maybeWrap(val)}`);
		} else if (typeof val === 'object') {
			lines.push(`${keyLine}:\n${_stringify(val, { indent: indent + '  ' })}` + (options.topLevel ? '\n' : ''));
		} else {
			throw new TypeError();
		}

		addedKeys = addedKeys.concat(valKeys);
	}

	return indent + lines.join(`\n${indent}`);
}

function stringify(obj) {
	const lines = [];
	lines.push('# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.');
	lines.push(`# yarn lockfile v1`);
	lines.push('\n');
	lines.push(_stringify(obj, { indent: '', topLevel: true, }));
	return lines.join('\n');
}

exports.parse = parse;
exports.stringify = stringify;
