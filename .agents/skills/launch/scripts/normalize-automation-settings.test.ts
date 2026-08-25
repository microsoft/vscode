/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Fixture-driven coverage for `normalize-automation-settings.ts`.
//
//   node --test .agents/skills/launch/scripts/normalize-automation-settings.test.ts
//
// Each valid fixture is normalized and then re-parsed as JSONC to assert what
// actually matters: both automation keys resolve to `true` at the root, and no
// override at any depth contradicts them. Textual presence is not enough -
// duplicate keys mean the last one wins, and `editor.*` settings are
// LANGUAGE_OVERRIDABLE, so a `"[typescript]"` block outranks the root value.
//
// Malformed fixtures must fail closed: non-zero exit and the file left byte
// for byte unchanged.

import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(scriptDir, 'normalize-automation-settings.ts');
const KEYS = ['files.simpleDialog.enable', 'editor.editContext'];

/** Minimal JSONC reader: strips comments and trailing commas, then JSON.parse. */
function parseJsonc(text: string): Record<string, unknown> {
	let out = '';
	let inString = false, inLine = false, inBlock = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i], n = text[i + 1];
		if (inLine) { if (c === '\n') { inLine = false; out += c; } continue; }
		if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
		if (inString) {
			out += c;
			if (c === '\\') { out += text[++i] ?? ''; } else if (c === '"') { inString = false; }
			continue;
		}
		if (c === '/' && n === '/') { inLine = true; i++; continue; }
		if (c === '/' && n === '*') { inBlock = true; i++; continue; }
		if (c === '"') { inString = true; }
		out += c;
	}
	return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

function normalize(content: string): { status: number; text: string } {
	const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nas-')), 'settings.json');
	fs.writeFileSync(file, content);
	let status = 0;
	try {
		execFileSync(process.execPath, [script, file], { stdio: 'pipe' });
	} catch (e) {
		status = (e as { status?: number }).status ?? 1;
	}
	return { status, text: fs.readFileSync(file, 'utf8') };
}

/** Asserts no nested override contradicts the automation values. */
function assertNoContradictingOverride(value: unknown, keyPath: string): void {
	if (!value || typeof value !== 'object') { return; }
	for (const [key, nested] of Object.entries(value)) {
		if (KEYS.includes(key)) {
			assert.strictEqual(nested, true, `${keyPath}.${key} still overrides the automation value`);
		} else {
			assertNoContradictingOverride(nested, `${keyPath}.${key}`);
		}
	}
}

const valid: [name: string, content: string][] = [
	['missing file', ''],
	['empty object', '{}'],
	['object on its own lines', '{\n}\n'],
	['unrelated key', '{ "a": 1 }'],
	['trailing line comment', '{\n  "a": 1\n  // keep this\n}\n'],
	['leading comment', '// lead\n{ "a": 1 }'],
	['block comment mentioning the key', '{\n /* "editor.editContext": false */\n "a": 1\n}'],
	['commented-out key is not the real one', '{\n // "editor.editContext": false\n "a": 1\n}'],
	['inline block comment', '{ "a": 1 /* t */ }'],
	['trailing comma', '{ "a": 1, }'],
	['url value containing //', '{ "url": "http://x//y", "a": 1 }'],
	['key that looks like a comment', '{ "// not a comment": 1 }'],
	['brace inside a string', '{ "s": "}" }'],
	['open brace inside a string', '{ "s": "{" , "a": 1 }'],
	['already correct', '{ "editor.editContext": true }'],
	['boolean value', '{ "editor.editContext": false }'],
	['null value', '{ "files.simpleDialog.enable": null }'],
	['quoted value', '{ "editor.editContext": "false" }'],
	['exponent value', '{ "editor.editContext": 1e2 }'],
	['signed fractional exponent', '{ "editor.editContext": -1.5e-3 }'],
	['escaped quote in a preceding string', '{ "a": "a\\"b", "editor.editContext": false }'],
	['trailing backslash in a preceding string', '{ "a": "x\\\\", "editor.editContext": false }'],
	['duplicate key, object last', '{ "editor.editContext": false, "editor.editContext": { "x": 1 } }'],
	['duplicate key, primitive last', '{ "editor.editContext": { "x": 1 }, "editor.editContext": false }'],
	['language override only', '{ "[typescript]": { "editor.editContext": false } }'],
	['language override and root', '{ "[typescript]": { "editor.editContext": false }, "editor.editContext": false }'],
	['two language overrides', '{ "[typescript]": { "editor.editContext": false }, "[python]": { "editor.editContext": 0 } }'],
	['override alongside another setting', '{ "[md]": { "editor.editContext": "no", "editor.tabSize": 2 } }'],
	['deeply nested occurrence', '{ "a": { "b": { "editor.editContext": false } } }'],
	['occurrence inside an array', '{ "a": [1, 2, { "editor.editContext": false }] }'],
];

for (const [name, content] of valid) {
	test(`normalizes: ${name}`, () => {
		const { status, text } = normalize(content);
		assert.strictEqual(status, 0, `expected success, got exit ${status}`);
		const parsed = parseJsonc(text);
		for (const key of KEYS) {
			assert.strictEqual(parsed[key], true, `${key} did not resolve to true in:\n${text}`);
		}
		assertNoContradictingOverride(parsed, 'root');
	});
}

const malformed: [name: string, content: string][] = [
	['truncated after a nested object', '{ "a": 1,\n "b": { "c": 2 }\n'],
	['unclosed root', '{ "a": 1'],
	['trailing content after the root', '{ "a": 1 } junk'],
	['two root objects', '{ "a": 1 } { "b": 2 }'],
	['no braces at all', 'no braces at all'],
];

for (const [name, content] of malformed) {
	test(`fails closed: ${name}`, () => {
		const { status, text } = normalize(content);
		assert.notStrictEqual(status, 0, 'expected a non-zero exit');
		assert.strictEqual(text, content, 'the file must be left unmodified');
	});
}
