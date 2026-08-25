/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Normalizes the automation settings that every Code OSS instance launched by
// this skill needs. Shared by `launch.sh` and `launch.ps1` so the JSONC merge
// logic only exists once.
//
//   files.simpleDialog.enable  Native OS file dialogs cannot be driven over CDP.
//   editor.editContext         `Code.editContextEnabled` is unconditionally true
//                              for a dev build, so a profile that disables this
//                              renders a `textarea` while the page objects keep
//                              waiting for `.native-edit-context`.
//
// Data-preserving text merge: inserts/updates each key without reparsing the
// whole file, so user comments and string values containing `//` survive. Fails
// loudly if the file exists but has no recognizable JSON object shape - it never
// silently overwrites with `{}`.

import * as fs from 'node:fs';
import process from 'node:process';
const f = process.argv[2];
if (!f) {
	console.error('[normalize-automation-settings] usage: node normalize-automation-settings.ts <settings.json>');
	process.exit(2);
}
const ENTRIES: [string, string][] = [
	['files.simpleDialog.enable', 'true'],
	['editor.editContext', 'true'],
];

let text: string;
try { text = fs.readFileSync(f, 'utf8'); }
catch (e) {
	const error = e as NodeJS.ErrnoException;
	if (error.code === 'ENOENT') {
		text = '';
	} else {
		console.error('[normalize-automation-settings] cannot read ' + f + ': ' + error.message);
		process.exit(1);
	}
}

// Empty file -> write a fresh object with every key.
if (text.trim() === '') {
	const body = ENTRIES.map(([k, v]) => '  "' + k + '": ' + v).join(',\n');
	fs.writeFileSync(f, '{\n' + body + '\n}\n');
	process.exit(0);
}

// Blank out comments while preserving offsets, so a commented-out occurrence
// such as `// "editor.editContext": false` is never mistaken for the real
// setting and `//` inside a string (e.g. a proxy URL) is not treated as one.
function codeMask(src: string): string {
	const out = src.split('');
	let inString = false, inLine = false, inBlock = false;
	for (let i = 0; i < src.length; i++) {
		const c = src[i], n = src[i + 1];
		if (inLine) {
			if (c === '\n') { inLine = false; } else { out[i] = ' '; }
			continue;
		}
		if (inBlock) {
			if (c === '*' && n === '/') { out[i] = ' '; out[i + 1] = ' '; i++; inBlock = false; }
			else if (c !== '\n') { out[i] = ' '; }
			continue;
		}
		if (inString) {
			if (c === '\\') { i++; }
			else if (c === '"') { inString = false; }
			continue;
		}
		if (c === '"') { inString = true; }
		else if (c === '/' && n === '/') { out[i] = ' '; inLine = true; }
		else if (c === '/' && n === '*') { out[i] = ' '; out[i + 1] = ' '; i++; inBlock = true; }
	}
	return out.join('');
}

// Locate `"key": <primitive>` pairs, tracking nesting and string state so an
// occurrence embedded in a string value is never mistaken for the real setting.
//
// Root-level and nested occurrences are both reported, because a nested one is
// not inert: every `editor.*` setting is LANGUAGE_OVERRIDABLE, so a
// `"[typescript]": { "editor.editContext": false }` block still renders a
// `textarea` in TypeScript editors while the page objects wait on
// `.native-edit-context`. In a throwaway automation profile the only safe
// reading is that no override may contradict the automation value.
//
// For the root level the LAST occurrence is the effective one, which is what
// Code OSS honours when a profile contains duplicate keys.
interface Span { valueStart: number; valueLength: number }

function findProperties(masked: string, key: string): { root: Span | null; nested: Span[] } {
	let depth = 0, inString = false;
	let root: Span | null = null;
	const nested: Span[] = [];
	let keyStart = -1, expectValue = false;
	// One pending key per nesting level, so a nested object does not clobber the
	// enclosing object's pending key.
	const pendingKey: (string | null)[] = [];
	for (let i = 0; i < masked.length; i++) {
		const c = masked[i];
		if (inString) {
			if (c === '\\') { i++; continue; }
			if (c === '"') {
				inString = false;
				if (depth >= 1) { pendingKey[depth] = masked.slice(keyStart + 1, i); }
			}
			continue;
		}
		// The value check must come before the generic string branch below, or a
		// quoted value such as `"editor.editContext": "false"` would be consumed
		// as a string and never recognised as the property's value.
		if (expectValue && depth >= 1 && !/\s/.test(c)) {
			// Only primitives are rewritable; an object or array value is skipped
			// (at the root the key is appended instead).
			// Full JSON number grammar, including exponents: a partial match
			// (e.g. `1` out of `1e2`) would leave `truee2` behind.
			// The string alternative must consume escapes, or a value such as
			// `"a\"b"` would match only through `"a\"` and leave `trueb"`.
			const m = /^(true|false|null|"(?:[^"\\\n]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(masked.slice(i));
			if (pendingKey[depth] === key) {
				if (depth === 1) {
					// Always reflect the LAST occurrence. If this one is not a
					// primitive (an object or array value), drop any earlier hit:
					// rewriting that one would leave the effective value unchanged.
					root = m ? { valueStart: i, valueLength: m[1].length } : null;
				} else if (m) {
					nested.push({ valueStart: i, valueLength: m[1].length });
				}
			}
			expectValue = false;
			pendingKey[depth] = null;
			if (m) { i += m[1].length - 1; continue; }
			// Not a primitive: fall through so `{`/`[`/`"` is handled below.
		}
		if (c === '"') { inString = true; keyStart = i; continue; }
		if (c === '{' || c === '[') { depth++; pendingKey[depth] = null; expectValue = false; continue; }
		if (c === '}' || c === ']') { depth--; expectValue = false; continue; }
		if (c === ':' && depth >= 1 && pendingKey[depth] !== null) { expectValue = true; continue; }
		if (c === ',' && depth >= 1) { pendingKey[depth] = null; expectValue = false; continue; }
	}
	return { root, nested };
}

// Locate the root object and prove it is balanced before rewriting anything.
// `lastIndexOf('}')` alone would happily treat a *nested* closing brace as the
// root close in a truncated file, and the new keys would then be inserted
// inside that nested setting while the launcher reported success.
function findRootObject(masked: string): { open: number; close: number } {
	const open = masked.indexOf('{');
	if (open === -1) {
		console.error('[normalize-automation-settings] settings.json has no opening brace - refusing to clobber it: ' + f);
		process.exit(1);
	}
	let depth = 0, inString = false;
	for (let i = open; i < masked.length; i++) {
		const c = masked[i];
		if (inString) {
			if (c === '\\') { i++; } else if (c === '"') { inString = false; }
			continue;
		}
		if (c === '"') { inString = true; continue; }
		if (c === '{' || c === '[') { depth++; continue; }
		if (c === '}' || c === ']') {
			depth--;
			if (depth === 0) {
				// Nothing but trivia may follow the root object.
				const rest = masked.slice(i + 1).trim();
				if (rest !== '') {
					console.error('[normalize-automation-settings] settings.json has trailing content after the root object - refusing to clobber it: ' + f);
					process.exit(1);
				}
				return { open, close: i };
			}
		}
	}
	console.error('[normalize-automation-settings] settings.json root object is not closed - refusing to clobber it: ' + f);
	process.exit(1);
}

for (const [key, value] of ENTRIES) {
	let masked = codeMask(text);

	const { root, nested } = findProperties(masked, key);

	// Rewrite every nested override (e.g. a `"[typescript]"` block) as well as
	// the root value, since a language override outranks the root one. Apply
	// them last-first so earlier offsets stay valid. Offsets line up with the
	// original, so comments are left untouched.
	const spans = root ? [...nested, root] : nested;
	for (const span of spans.sort((a, b) => b.valueStart - a.valueStart)) {
		text = text.slice(0, span.valueStart) + value + text.slice(span.valueStart + span.valueLength);
	}
	if (root) {
		continue;
	}
	// No root-level occurrence: append one. Any nested overrides were already
	// normalized above, so they cannot contradict it.
	masked = codeMask(text);

	const { open: firstBrace, close: lastBrace } = findRootObject(masked);

	// Decide the separator from real content only.
	const between = masked.slice(firstBrace + 1, lastBrace);
	const trimmed = between.trim();
	const needsComma = trimmed.length !== 0 && !trimmed.endsWith(',');

	// The comma must attach to the last real token, not to whatever happens to
	// sit just before `}`. Appending it at the brace would land it inside a
	// trailing line comment, where JSONC ignores it and the file becomes
	// invalid. So split at the end of the last non-comment character instead.
	let insertAt = lastBrace;
	if (needsComma) {
		insertAt = firstBrace + 1 + between.replace(/\s+$/, '').length;
	}

	const comma = needsComma ? ',' : '';
	// Keep the new key on its own line even when the object was written on
	// a single line (e.g. `{}`).
	const tail = text.slice(insertAt, lastBrace);
	const preceding = text.slice(0, insertAt) + comma + tail;
	const lead = preceding.endsWith('\n') ? '' : '\n';
	text = preceding + lead + '  "' + key + '": ' + value + '\n' + text.slice(lastBrace);
}

fs.writeFileSync(f, text);