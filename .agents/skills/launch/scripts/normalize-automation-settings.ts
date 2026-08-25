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
const f = process.argv[2];
if (!f) {
	console.error('[normalize-automation-settings] usage: node normalize-automation-settings.ts <settings.json>');
	process.exit(2);
}
const ENTRIES = [
	['files.simpleDialog.enable', 'true'],
	['editor.editContext', 'true'],
];

let text;
try { text = fs.readFileSync(f, 'utf8'); }
catch (e) {
	if (e.code === 'ENOENT') text = '';
	else { console.error('[normalize-automation-settings] cannot read ' + f + ': ' + e.message); process.exit(1); }
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
function codeMask(src) {
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

// Locate a root-level `"key": <primitive>` pair, tracking nesting and string
// state so a nested occurrence (e.g. inside a `"[typescript]"` block) or one
// embedded in a string value is never mistaken for the real setting. Returns
// the LAST match, which is the one Code OSS honours when a profile contains
// duplicate keys.
function findRootProperty(masked, key) {
	let depth = 0, inString = false, found = null;
	let keyStart = -1, pendingKey = null, expectValue = false;
	for (let i = 0; i < masked.length; i++) {
		const c = masked[i];
		if (inString) {
			if (c === '\\') { i++; continue; }
			if (c === '"') {
				inString = false;
				if (depth === 1) { pendingKey = masked.slice(keyStart + 1, i); }
			}
			continue;
		}
		// The value check must come before the generic string branch below, or a
		// quoted value such as `"editor.editContext": "false"` would be consumed
		// as a string and never recognised as the property's value.
		if (expectValue && depth === 1 && !/\s/.test(c)) {
			// Start of a root-level value. Only primitives are rewritable; an
			// object or array value is skipped and the key is appended instead.
			// Full JSON number grammar, including exponents: a partial match
			// (e.g. `1` out of `1e2`) would leave `truee2` behind.
			// The string alternative must consume escapes, or a value such as
			// `"a\"b"` would match only through `"a\"` and leave `trueb"`.
			const m = /^(true|false|null|"(?:[^"\\\n]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(masked.slice(i));
			if (pendingKey === key) {
				// Always reflect the LAST occurrence. If this one is not a
				// primitive (an object or array value), drop any earlier hit:
				// rewriting that one would leave the effective value unchanged.
				found = m ? { valueStart: i, valueLength: m[1].length } : null;
			}
			expectValue = false;
			pendingKey = null;
			if (m) { i += m[1].length - 1; continue; }
			// Not a primitive: fall through so `{`/`[`/`"` is handled below.
		}
		if (c === '"') { inString = true; keyStart = i; continue; }
		if (c === '{' || c === '[') { depth++; expectValue = false; continue; }
		if (c === '}' || c === ']') { depth--; expectValue = false; continue; }
		if (c === ':' && depth === 1 && pendingKey !== null) { expectValue = true; continue; }
		if (c === ',' && depth === 1) { pendingKey = null; expectValue = false; continue; }
	}
	return found;
}

for (const [key, value] of ENTRIES) {
	const masked = codeMask(text);

	// Key already present at the root (with any primitive value) -> rewrite
	// its value slot only. Offsets line up with the original, so comments
	// are left untouched.
	const hit = findRootProperty(masked, key);
	if (hit) {
		text = text.slice(0, hit.valueStart) + value + text.slice(hit.valueStart + hit.valueLength);
		continue;
	}

	const lastBrace = masked.lastIndexOf('}');
	if (lastBrace === -1) {
		console.error('[normalize-automation-settings] settings.json has no closing brace - refusing to clobber it: ' + f);
		process.exit(1);
	}
	const firstBrace = masked.indexOf('{');
	if (firstBrace === -1 || firstBrace >= lastBrace) {
		console.error('[normalize-automation-settings] settings.json has no opening brace - refusing to clobber it: ' + f);
		process.exit(1);
	}

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