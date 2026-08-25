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
	return JSON.parse(out.replace(/^\uFEFF/, '').replace(/,(\s*[}\]])/g, '$1'));
}

/** `undefined` content means "no settings.json at all", exercising the ENOENT path. */
function normalize(content: string | undefined): { status: number; text: string } {
	const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nas-')), 'settings.json');
	if (content !== undefined) {
		fs.writeFileSync(file, content);
	}
	let status = 0;
	try {
		execFileSync(process.execPath, [script, file], { stdio: 'pipe' });
	} catch (e) {
		status = (e as { status?: number }).status ?? 1;
	}
	return { status, text: fs.readFileSync(file, 'utf8') };
}

/**
 * Asserts that no `[language]` override contradicts the automation values.
 *
 * Only top-level override keys are checked, because those are the only nested
 * objects VS Code treats as overrides (`OVERRIDE_PROPERTY_REGEX`). A matching
 * key anywhere else is unrelated data and must be preserved, not rewritten.
 */
function assertNoContradictingOverride(root: Record<string, unknown>): void {
	for (const [key, value] of Object.entries(root)) {
		if (!/^(\[[^\]]+\])+$/.test(key) || !value || typeof value !== 'object') { continue; }
		for (const [nestedKey, nestedValue] of Object.entries(value)) {
			if (KEYS.includes(nestedKey)) {
				assert.strictEqual(nestedValue, true, `${key}.${nestedKey} still overrides the automation value`);
			}
		}
	}
}

const valid: [name: string, content: string | undefined][] = [
	['missing file', undefined],
	['empty file', ''],
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
	['multi-language override key', '{ "[typescript][javascript]": { "editor.editContext": false } }'],
	['array value at the root', '{ "a": [1, 2] }'],
	['unicode-escaped override key', '{ "\\u005btypescript\\u005d": { "editor.editContext": false } }'],
	['BOM before the root object', '\uFEFF{ "a": 1 }'],
];

for (const [name, content] of valid) {
	test(`normalizes: ${name}`, () => {
		const { status, text } = normalize(content);
		assert.strictEqual(status, 0, `expected success, got exit ${status}`);
		const parsed = parseJsonc(text);
		for (const key of KEYS) {
			assert.strictEqual(parsed[key], true, `${key} did not resolve to true in:\n${text}`);
		}
		assertNoContradictingOverride(parsed);
	});
}

const malformed: [name: string, content: string][] = [
	['truncated after a nested object', '{ "a": 1,\n "b": { "c": 2 }\n'],
	['unclosed root', '{ "a": 1'],
	['trailing content after the root', '{ "a": 1 } junk'],
	['two root objects', '{ "a": 1 } { "b": 2 }'],
	['no braces at all', 'no braces at all'],
	['mismatched closing delimiter', '{]'],
	['mismatched nested delimiter', '{ "a": [1, 2} }'],
	['content before the root object', 'junk { "a": 1 }'],
	// Both keys already present means every entry takes the rewrite path, so the
	// structural check has to run before any of them rather than lazily.
	['malformed but both keys already present', '{ "files.simpleDialog.enable": false, "editor.editContext": false, "b": { "c": 2 }\n'],
];

for (const [name, content] of malformed) {
	test(`fails closed: ${name}`, () => {
		const { status, text } = normalize(content);
		assert.notStrictEqual(status, 0, 'expected a non-zero exit');
		assert.strictEqual(text, content, 'the file must be left unmodified');
	});
}

// A same-named key that is *not* inside a top-level `[language]` block belongs
// to some other consumer. VS Code only treats direct children of an override
// key as overrides, so rewriting anything else would corrupt unrelated data.
test('leaves non-override nested objects alone', () => {
	const { status, text } = normalize('{ "some.extension": { "editor.editContext": false } }');
	assert.strictEqual(status, 0);
	const parsed = parseJsonc(text) as Record<string, unknown> & { 'some.extension': Record<string, unknown> };
	assert.strictEqual(parsed['some.extension']['editor.editContext'], false);
	assert.strictEqual(parsed['editor.editContext'], true);
});

test('rewrites language overrides', () => {
	const { status, text } = normalize('{ "[typescript]": { "editor.editContext": false } }');
	assert.strictEqual(status, 0);
	const parsed = parseJsonc(text) as { '[typescript]': Record<string, unknown> };
	assert.strictEqual(parsed['[typescript]']['editor.editContext'], true);
});

// `rsync -a` preserves symlinks, so a profile whose settings.json points at a
// dotfiles checkout would otherwise be written through to the user's real file.
test('never writes through a symlink', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nas-link-'));
	const real = path.join(dir, 'real.json');
	const link = path.join(dir, 'settings.json');
	fs.writeFileSync(real, '{ "a": 1 }\n');
	fs.symlinkSync(real, link);

	execFileSync(process.execPath, [script, link], { stdio: 'pipe' });

	assert.strictEqual(fs.readFileSync(real, 'utf8'), '{ "a": 1 }\n', 'the link target must be untouched');
	assert.strictEqual(fs.lstatSync(link).isSymbolicLink(), false, 'the link must be materialized');
	assert.strictEqual(parseJsonc(fs.readFileSync(link, 'utf8'))['editor.editContext'], true);
});

// `"\u005btypescript\u005d"` decodes to `[typescript]`, so it is a real language
// override even though its source spelling contains no brackets.
test('recognizes a unicode-escaped override key', () => {
	const { status, text } = normalize('{ "\\u005btypescript\\u005d": { "editor.editContext": false } }');
	assert.strictEqual(status, 0);
	const parsed = parseJsonc(text) as Record<string, Record<string, unknown>>;
	assert.strictEqual(parsed['[typescript]']['editor.editContext'], true);
});

// A dangling link must be replaced rather than written through, or the write
// would create its target outside the throwaway profile.
test('replaces a dangling symlink instead of creating its target', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nas-dangling-'));
	const target = path.join(dir, 'missing.json');
	const link = path.join(dir, 'settings.json');
	fs.symlinkSync(target, link);

	execFileSync(process.execPath, [script, link], { stdio: 'pipe' });

	assert.strictEqual(fs.existsSync(target), false, 'the link target must not be created');
	assert.strictEqual(fs.lstatSync(link).isSymbolicLink(), false, 'the link must be materialized');
	assert.strictEqual(parseJsonc(fs.readFileSync(link, 'utf8'))['editor.editContext'], true);
});
