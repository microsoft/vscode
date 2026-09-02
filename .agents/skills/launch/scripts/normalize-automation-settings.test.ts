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
// language override contradicts `editor.editContext`. Textual presence is not
// enough - duplicate keys mean the last one wins, and `editor.*` settings are
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
import { after, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(scriptDir, 'normalize-automation-settings.ts');
const KEYS = ['files.simpleDialog.enable', 'editor.editContext'];
const OVERRIDABLE_KEYS = ['editor.editContext'];

const fixtureRoots: string[] = [];
function fixtureRoot(prefix: string): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	fixtureRoots.push(root);
	return root;
}

after(() => {
	for (const root of fixtureRoots) { fs.rmSync(root, { recursive: true, force: true }); }
});

function isJsoncLineBreak(c: string): boolean {
	return c === '\n' || c === '\r' || c === '\u2028' || c === '\u2029';
}

function isJsoncWhitespace(c: string): boolean {
	const ch = c.charCodeAt(0);
	return ch === 0x20 || ch === 0x09 || ch === 0x0b || ch === 0x0c ||
		ch === 0x00a0 || ch === 0x1680 || (ch >= 0x2000 && ch <= 0x200b) ||
		ch === 0x202f || ch === 0x205f || ch === 0x3000 || ch === 0xfeff;
}

/** Minimal JSONC reader: strips comments and trailing commas, then JSON.parse. */
function parseJsonc(text: string): Record<string, unknown> {
	let out = '';
	let inString = false, inLine = false, inBlock = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i], n = text[i + 1];
		if (inLine) { if (isJsoncLineBreak(c)) { inLine = false; out += isJsoncWhitespace(c) || c === '\u2028' || c === '\u2029' ? ' ' : c; } continue; }
		if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
		if (inString) {
			out += c;
			if (c === '\\') { out += text[++i] ?? ''; } else if (c === '"') { inString = false; }
			continue;
		}
		if (c === '/' && n === '/') { inLine = true; i++; continue; }
		if (c === '/' && n === '*') { inBlock = true; i++; continue; }
		if (c === '"') { inString = true; }
		// U+2028/U+2029 and the Unicode space set are trivia to VS Code's scanner
		// but rejected by JSON.parse, so fold them to a plain space.
		out += !inString && (isJsoncLineBreak(c) || isJsoncWhitespace(c)) && c !== '\n' && c !== '\r' && c !== ' ' && c !== '\t' ? ' ' : c;
	}
	const normalized = out.replace(/^\uFEFF/, '').replace(/,(\s*[}\]])/g, '$1');
	return normalized.trim() === '' ? {} : JSON.parse(normalized);
}

/** `undefined` content means "no settings.json at all", exercising the ENOENT path. */
function normalize(content: string | undefined): { status: number; text: string } {
	const file = path.join(fixtureRoot('nas-'), 'settings.json');
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

function workspaceCheckStatus(args: string[]): number {
	try {
		execFileSync(process.execPath, [script, '--check-workspace-args', ...args], { stdio: 'pipe' });
		return 0;
	} catch (error) {
		return (error as { status?: number }).status ?? 1;
	}
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
			if (OVERRIDABLE_KEYS.includes(nestedKey)) {
				assert.strictEqual(nestedValue, true, `${key}.${nestedKey} still overrides the automation value`);
			}
		}
	}
}

const valid: [name: string, content: string | undefined][] = [
	['missing file', undefined],
	['empty file', ''],
	['line-comment-only file', '// keep this comment'],
	['block-comment-only file', '/* keep this block */'],
	['comments separated by Unicode trivia', '// first\u2028\u200b/* second */'],
	['Unicode-trivia-only file', '\u00a0\u2003\u200b'],
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
	['nested root values', '{ "files": { "simpleDialog": { "enable": false } }, "editor": { "editContext": false } }'],
	['direct setting before nested namespace', '{ "editor.editContext": false, "editor": { "editContext": false } }'],
	['nested namespace before direct setting', '{ "editor": { "editContext": false }, "editor.editContext": false }'],
	['null value', '{ "files.simpleDialog.enable": null }'],
	['quoted value', '{ "editor.editContext": "false" }'],
	['exponent value', '{ "editor.editContext": 1e2 }'],
	['signed fractional exponent', '{ "editor.editContext": -1.5e-3 }'],
	['escaped quote in a preceding string', '{ "a": "a\\"b", "editor.editContext": false }'],
	['trailing backslash in a preceding string', '{ "a": "x\\\\", "editor.editContext": false }'],
	['duplicate key, object last', '{ "editor.editContext": false, "editor.editContext": { "x": 1 } }'],
	['duplicate key, primitive last', '{ "editor.editContext": { "x": 1 }, "editor.editContext": false }'],
	['language override only', '{ "[typescript]": { "editor.editContext": false } }'],
	['window setting inside a language block is inert', '{ "[typescript]": { "files.simpleDialog.enable": false } }'],
	['nested language override', '{ "[typescript]": { "editor": { "editContext": false } } }'],
	['nested window setting inside a language block is inert', '{ "[typescript]": { "files": { "simpleDialog": { "enable": false } } } }'],
	['language override and root', '{ "[typescript]": { "editor.editContext": false }, "editor.editContext": false }'],
	['two language overrides', '{ "[typescript]": { "editor.editContext": false }, "[python]": { "editor.editContext": 0 } }'],
	['override alongside another setting', '{ "[md]": { "editor.editContext": "no", "editor.tabSize": 2 } }'],
	['deeply nested occurrence', '{ "a": { "b": { "editor.editContext": false } } }'],
	['occurrence inside an array', '{ "a": [1, 2, { "editor.editContext": false }] }'],
	['multi-language override key', '{ "[typescript][javascript]": { "editor.editContext": false } }'],
	['array value at the root', '{ "a": [1, 2] }'],
	['unicode-escaped override key', '{ "\\u005btypescript\\u005d": { "editor.editContext": false } }'],
	['BOM before the root object', '\uFEFF{ "a": 1 }'],
	// A bare CR ends a line comment for VS Code's scanner, so this file is valid
	// and must not be masked away as one giant comment.
	['CR-only line endings with a comment', '{\r // note\r "a": 1\r}'],
	// VS Code's scanner ends a line comment at U+2028/U+2029 too, so a file using
	// them is valid JSONC even though JSON.parse would choke on the raw text.
	['U+2028 terminating a line comment', '{\u2028\t// note\u2028\t"a": 1\u2028}'],
	['U+2029 terminating a line comment', '{\u2029\t// note\u2029\t"a": 1\u2029}'],
	// ...and it accepts the full Unicode 3.0 space set as whitespace.
	['Unicode whitespace between tokens', '{\u00a0"a":\u2003 1,\u3000"b": 2\u200b}'],
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

		// Asserting only the two injected keys would also pass an implementation
		// that threw the file away and wrote `{ ...KEYS }`, which is the one thing
		// this script must never do. Everything the input had, other than the keys
		// being normalized, must survive untouched.
		const before = (content ?? '').trim() === '' ? {} : parseJsonc(content);
		for (const [key, value] of Object.entries(before)) {
			if (KEYS.includes(key)) {
				continue;
			}
			const isOverride = OVERRIDE_KEY.test(key);
			const normalizedPaths = isOverride ? [['editor.editContext'], ['editor', 'editContext']] :
				key === 'editor' ? [['editContext']] :
					key === 'files' ? [['simpleDialog', 'enable']] : [];
			assert.deepStrictEqual(stripPaths(parsed[key], normalizedPaths), stripPaths(value, normalizedPaths),
				`${key} was not preserved in:\n${text}`);
		}
		// Comments are data too, and a reparse-and-rewrite would silently drop them.
		// Only count `//` that actually starts a comment - a URL inside a string
		// value is not one, and neither is a key that merely looks like one.
		// Block comments count too: dropping `/* ... */` is just as lossy as
		// dropping `//`, and only checking one of them lets the other regress.
		const comments = collectComments(content ?? '');
		const survivingComments = collectComments(text);
		for (const comment of comments) {
			assert.ok(survivingComments.includes(comment), `comment ${comment} was dropped from:\n${text}`);
		}
	});
}

// Collect both comment forms. `//` runs to the end of the line (VS Code's scanner
// treats CR, LF and the Unicode line separators as terminators) and `/* */` runs
// to its closing delimiter.
function collectComments(text: string): string[] {
	return stripStrings(text).match(/\/\/[^\n\r\u2028\u2029]*|\/\*[\s\S]*?\*\//g) ?? [];
}

// Blank out string contents so `//` inside a value is not mistaken for the start
// of a comment.
function stripStrings(text: string): string {
	return text.replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

// Creating file symlinks on Windows needs elevation, so the cases that depend on
// them are skipped there rather than failing the suite for the Windows launcher.
// This mirrors what the repository's own watcher tests do.
const posixOnly = { skip: process.platform === 'win32' ? 'symlinks require elevation on Windows' : false };

// Remove only the exact setting paths normalization may change. Recursing with
// an empty path list still compares every unrelated nested value.
function stripPaths(value: unknown, paths: string[][]): unknown {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return value;
	}
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		const matching = paths.filter(path => path[0] === k);
		if (matching.some(path => path.length === 1)) { continue; }
		out[k] = stripPaths(v, matching.map(path => path.slice(1)));
	}
	return out;
}

const OVERRIDE_KEY = /^(\[[^\]]+\])+$/;

const malformed: [name: string, content: string][] = [
	['truncated after a nested object', '{ "a": 1,\n "b": { "c": 2 }\n'],
	['unclosed root', '{ "a": 1'],
	['trailing content after the root', '{ "a": 1 } junk'],
	['two root objects', '{ "a": 1 } { "b": 2 }'],
	['no braces at all', 'no braces at all'],
	// Balanced delimiters are not enough - these all pass a bracket count but
	// are not parseable, and used to be rewritten and reported as success.
	['balanced but missing a comma', '{ "a": 1 "b": 2 }'],
	['balanced but missing a colon', '{ "a" 1 }'],
	['balanced but has an invalid escape', '{ "a": "bad \\x escape" }'],
	['balanced but has an unquoted key', '{ a: 1 }'],
	['mismatched closing delimiter', '{]'],
	// Masking an unterminated comment or string to EOF leaves text that parses
	// fine, so these have to be rejected by the scanner state, not by JSON.parse.
	['unterminated block comment', '{ "a": 1 } /* unterminated'],
	['unterminated block comment inside the root', '{ "a": 1, /* oops\n "b": 2 }'],
	['unterminated string', '{ "a": "unterminated }'],
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
test('never writes through a symlink', posixOnly, () => {
	const dir = fixtureRoot('nas-link-');
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
test('replaces a dangling symlink instead of creating its target', posixOnly, () => {
	const dir = fixtureRoot('nas-dangling-');
	const target = path.join(dir, 'missing.json');
	const link = path.join(dir, 'settings.json');
	fs.symlinkSync(target, link);

	execFileSync(process.execPath, [script, link], { stdio: 'pipe' });

	assert.strictEqual(fs.existsSync(target), false, 'the link target must not be created');
	assert.strictEqual(fs.lstatSync(link).isSymbolicLink(), false, 'the link must be materialized');
	assert.strictEqual(parseJsonc(fs.readFileSync(link, 'utf8'))['editor.editContext'], true);
});

// The launchers must normalize named profiles too, not just the default one:
// an associated workspace opens with `User/profiles/<id>/settings.json`, and
// leaving that file alone reintroduces exactly the failure this script exists
// to prevent. Exercise the discovery both launchers perform, against a real
// profile layout, so the multi-file contract cannot regress silently.
test('normalizes independent profiles and skips only inheriting ones', () => {
	const root = fixtureRoot('nas-profiles-');
	const userDir = path.join(root, 'User');
	const named = path.join(userDir, 'profiles', 'autotest');
	// An independent profile that simply has nothing saved yet: `createProfile`
	// only makes the directory, so an absent settings.json is normal and must
	// still be normalized - otherwise the workspace gets the defaults.
	const fresh = path.join(userDir, 'profiles', 'fresh');
	const inheriting = path.join(userDir, 'profiles', 'inherits');
	for (const dir of [named, fresh, inheriting]) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.mkdirSync(path.join(userDir, 'globalStorage'), { recursive: true });
	fs.writeFileSync(path.join(userDir, 'settings.json'), '{}\n');
	fs.writeFileSync(path.join(named, 'settings.json'), '{ "editor.editContext": false }\n');
	fs.writeFileSync(path.join(userDir, 'globalStorage', 'storage.json'), JSON.stringify({
		userDataProfiles: [
			{ location: 'autotest', name: 'AutoTest' },
			{ location: 'fresh', name: 'Fresh' },
			{ location: 'inherits', name: 'Inherits', useDefaultFlags: { settings: true } }
		]
	}));

	// Drive the real entry point both launchers use, rather than reimplementing
	// the discovery here - otherwise the launchers could change and this would
	// stay green. It also keeps the suite runnable without a POSIX shell.
	const count = execFileSync(process.execPath, [script, '--user-data-dir', root], { encoding: 'utf8' }).trim();

	const enabled = (file: string) => KEYS.map(k => [k, parseJsonc(fs.readFileSync(file, 'utf8'))[k]]);
	assert.deepStrictEqual({
		discovered: Number(count),
		named: enabled(path.join(named, 'settings.json')),
		fresh: enabled(path.join(fresh, 'settings.json')),
		default: enabled(path.join(userDir, 'settings.json')),
		inheritingUntouched: fs.existsSync(path.join(inheriting, 'settings.json'))
	}, {
		discovered: 3,
		named: KEYS.map(k => [k, true]),
		fresh: KEYS.map(k => [k, true]),
		default: KEYS.map(k => [k, true]),
		inheritingUntouched: false
	});
});

test('materializes but does not normalize an inheriting profile settings link', posixOnly, () => {
	const root = fixtureRoot('nas-inherited-settings-link-');
	const userDir = path.join(root, 'User');
	const inheriting = path.join(userDir, 'profiles', 'inherits');
	const settingsFile = path.join(inheriting, 'settings.json');
	const outside = path.join(root, 'outside-settings.json');
	const original = '{ "editor.editContext": false }\n';
	fs.mkdirSync(inheriting, { recursive: true });
	fs.mkdirSync(path.join(userDir, 'globalStorage'), { recursive: true });
	fs.writeFileSync(path.join(userDir, 'settings.json'), '{}\n');
	fs.writeFileSync(outside, original);
	fs.symlinkSync(outside, settingsFile);
	fs.writeFileSync(path.join(userDir, 'globalStorage', 'storage.json'), JSON.stringify({
		userDataProfiles: [{ location: 'inherits', useDefaultFlags: { settings: true } }]
	}));

	const count = execFileSync(process.execPath, [script, '--user-data-dir', root], { encoding: 'utf8' }).trim();

	assert.deepStrictEqual({
		count,
		outside: fs.readFileSync(outside, 'utf8'),
		inheriting: fs.readFileSync(settingsFile, 'utf8'),
		stillLinked: fs.lstatSync(settingsFile).isSymbolicLink()
	}, {
		count: '1',
		outside: original,
		inheriting: original,
		stillLinked: false
	});
});

test('remaps a legacy URI profile location into the cloned profile', () => {
	const root = fixtureRoot('nas-uri-profile-');
	const userDir = path.join(root, 'User');
	const named = path.join(userDir, 'profiles', 'legacy');
	const storageFile = path.join(userDir, 'globalStorage', 'storage.json');
	fs.mkdirSync(named, { recursive: true });
	fs.mkdirSync(path.dirname(storageFile), { recursive: true });
	fs.writeFileSync(path.join(userDir, 'settings.json'), '{}\n');
	fs.writeFileSync(path.join(named, 'settings.json'), '{ "editor.editContext": false }\n');
	fs.writeFileSync(storageFile, JSON.stringify({
		userDataProfiles: [{
			location: { scheme: 'file', path: '/source/User/profiles/legacy' },
			name: 'Legacy'
		}]
	}));

	const count = execFileSync(process.execPath, [script, '--user-data-dir', root], { encoding: 'utf8' }).trim();
	const stored = JSON.parse(fs.readFileSync(storageFile, 'utf8')) as {
		userDataProfiles: { location: unknown }[];
	};

	assert.deepStrictEqual({
		count,
		location: stored.userDataProfiles[0].location,
		enabled: KEYS.map(key => parseJsonc(fs.readFileSync(path.join(named, 'settings.json'), 'utf8'))[key])
	}, {
		count: '2',
		location: 'legacy',
		enabled: [true, true]
	});
});


test('materializes linked profile state before remapping a legacy URI', posixOnly, () => {
	const root = fixtureRoot('nas-uri-state-link-');
	const userDir = path.join(root, 'User');
	const named = path.join(userDir, 'profiles', 'legacy');
	const storageDir = path.join(userDir, 'globalStorage');
	const storageFile = path.join(storageDir, 'storage.json');
	const outside = path.join(root, 'outside-storage.json');
	fs.mkdirSync(named, { recursive: true });
	fs.mkdirSync(storageDir, { recursive: true });
	fs.writeFileSync(path.join(userDir, 'settings.json'), '{}\n');
	fs.writeFileSync(path.join(named, 'settings.json'), '{}\n');
	const original = JSON.stringify({ userDataProfiles: [{ location: { scheme: 'file', path: '/source/User/profiles/legacy' } }] });
	fs.writeFileSync(outside, original);
	fs.symlinkSync(outside, storageFile);

	execFileSync(process.execPath, [script, '--user-data-dir', root], { stdio: 'pipe' });
	const clonedState = JSON.parse(fs.readFileSync(storageFile, 'utf8')) as { userDataProfiles: { location: unknown }[] };

	assert.deepStrictEqual({
		outside: fs.readFileSync(outside, 'utf8'),
		stillLinked: fs.lstatSync(storageFile).isSymbolicLink(),
		clonedLocation: clonedState.userDataProfiles[0].location
	}, { outside: original, stillLinked: false, clonedLocation: 'legacy' });
});

test('rejects a linked profile-state ancestor before remapping', posixOnly, () => {
	const root = fixtureRoot('nas-uri-state-dir-');
	const userDir = path.join(root, 'User');
	const named = path.join(userDir, 'profiles', 'legacy');
	const outside = path.join(root, 'outside-globalStorage');
	fs.mkdirSync(named, { recursive: true });
	fs.mkdirSync(outside, { recursive: true });
	fs.writeFileSync(path.join(userDir, 'settings.json'), '{}\n');
	const storageFile = path.join(outside, 'storage.json');
	const original = JSON.stringify({ userDataProfiles: [{ location: { scheme: 'file', path: '/source/User/profiles/legacy' } }] });
	fs.writeFileSync(storageFile, original);
	fs.symlinkSync(outside, path.join(userDir, 'globalStorage'), 'dir');

	let status = 0;
	try { execFileSync(process.execPath, [script, '--user-data-dir', root], { stdio: 'pipe' }); }
	catch (error) { status = (error as { status?: number }).status ?? 1; }

	assert.deepStrictEqual({ status, outside: fs.readFileSync(storageFile, 'utf8') }, { status: 1, outside: original });
});
test('accepts the nested built-in Agents profile without treating builtin as a profile', () => {
	const root = fixtureRoot('nas-agents-profile-');
	const userDir = path.join(root, 'User');
	const agentsDir = path.join(userDir, 'profiles', 'builtin', 'agents');
	const storageFile = path.join(userDir, 'globalStorage', 'storage.json');
	fs.mkdirSync(agentsDir, { recursive: true });
	fs.mkdirSync(path.dirname(storageFile), { recursive: true });
	fs.writeFileSync(path.join(userDir, 'settings.json'), '{}\n');
	fs.writeFileSync(storageFile, JSON.stringify({
		userDataProfiles: [{ location: 'builtin/agents', name: 'Agents' }]
	}));

	const count = execFileSync(process.execPath, [script, '--user-data-dir', root], { encoding: 'utf8' }).trim();

	assert.deepStrictEqual({
		count,
		parentSettingsCreated: fs.existsSync(path.join(userDir, 'profiles', 'builtin', 'settings.json')),
		agentsSettingsCreated: fs.existsSync(path.join(agentsDir, 'settings.json'))
	}, {
		count: '1',
		parentSettingsCreated: false,
		agentsSettingsCreated: false
	});
});

test('rejects a folder workspace that disables the simple dialog', () => {
	const root = fixtureRoot('nas-workspace-folder-');
	const settingsFile = path.join(root, '.vscode', 'settings.json');
	fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
	const original = '{ "files.simpleDialog.enable": false }\n';
	fs.writeFileSync(settingsFile, original);

	assert.deepStrictEqual({
		status: workspaceCheckStatus([root]),
		settings: fs.readFileSync(settingsFile, 'utf8')
	}, { status: 1, settings: original });
});


test('resolves dotted and nested workspace settings in source order', () => {
	const cases: [content: string, expectedStatus: number][] = [
		['{ "files": { "simpleDialog": { "enable": false } } }', 1],
		['{ "files.simpleDialog.enable": true, "files": { "simpleDialog": { "enable": false } } }', 1],
		['{ "files": { "simpleDialog": { "enable": false } }, "files.simpleDialog.enable": true }', 0]
	];
	const statuses = cases.map(([content], index) => {
		const root = fixtureRoot('nas-workspace-order-' + index + '-');
		const settingsFile = path.join(root, '.vscode', 'settings.json');
		fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
		fs.writeFileSync(settingsFile, content);
		return workspaceCheckStatus([root]);
	});
	assert.deepStrictEqual(statuses, cases.map(([, expectedStatus]) => expectedStatus));
});
test('accepts comment-only workspace settings as an empty configuration', () => {
	const root = fixtureRoot('nas-workspace-comment-');
	const settingsFile = path.join(root, '.vscode', 'settings.json');
	fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
	fs.writeFileSync(settingsFile, '// project settings\n');

	assert.strictEqual(workspaceCheckStatus([root]), 0);
});

test('checks opened workspaces but not code-workspace diff or merge inputs', () => {
	const root = fixtureRoot('nas-code-workspace-');
	const workspaceFile = path.join(root, 'automation.code-workspace');
	fs.writeFileSync(workspaceFile, '{\n // keep\n "folders": [],\n "settings": { "files.simpleDialog.enable": false, },\n}\n');

	assert.deepStrictEqual([
		workspaceCheckStatus(['--new-window', workspaceFile]),
		workspaceCheckStatus(['--file-uri=' + pathToFileURL(workspaceFile).href]),
		workspaceCheckStatus(['--diff', workspaceFile, workspaceFile]),
		workspaceCheckStatus(['-d', workspaceFile, workspaceFile]),
		workspaceCheckStatus(['--merge', workspaceFile, workspaceFile, workspaceFile, workspaceFile]),
		workspaceCheckStatus(['-m', workspaceFile, workspaceFile, workspaceFile, workspaceFile])
	], [1, 1, 0, 0, 0, 0]);
});

test('accepts an enabled simple dialog through a folder URI', () => {
	const root = fixtureRoot('nas-workspace-uri-');
	const settingsFile = path.join(root, '.vscode', 'settings.json');
	fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
	fs.writeFileSync(settingsFile, '{ "files.simpleDialog.enable": true }\n');

	assert.strictEqual(workspaceCheckStatus(['--folder-uri', pathToFileURL(root).href]), 0);
});

test('does not mistake separated directory-valued options for the opened workspace', () => {
	const root = fixtureRoot('nas-extension-dev-');
	const settingsFile = path.join(root, '.vscode', 'settings.json');
	fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
	fs.writeFileSync(settingsFile, '{ "files.simpleDialog.enable": false }\n');

	const options = [
		'--extensionDevelopmentPath', '--crash-reporter-directory',
		'--builtin-extensions-dir', '--agent-plugins-dir'
	];
	assert.deepStrictEqual(options.map(option => workspaceCheckStatus([option, root])), [0, 0, 0, 0]);
});

test('rejects forwarded profile creation after normalization', () => {
	assert.deepStrictEqual([
		workspaceCheckStatus(['--profile', 'new-profile']),
		workspaceCheckStatus(['--profile=new-profile']),
		workspaceCheckStatus(['--profile-temp'])
	], [1, 1, 1]);
});

test('rejects both forms of every launcher-owned forwarded option', () => {
	const options = [
		'--debugBrkPluginHost', '--debugPluginHost', '--extensionHomePath', '--extensions-dir',
		'--inspect', '--inspect-agenthost', '--inspect-brk',
		'--inspect-brk-agenthost', '--inspect-brk-extensions', '--inspect-extensions',
		'--remote-debugging-port', '--shared-data-dir', '--transient', '--user-data-dir'
	];
	const statuses = options.flatMap(option => [
		workspaceCheckStatus([option, 'override']),
		workspaceCheckStatus([option + '=override'])
	]);
	assert.deepStrictEqual(statuses, options.flatMap(() => [1, 1]));
});

test('does not let missing option values swallow a protected option', () => {
	assert.deepStrictEqual([
		workspaceCheckStatus(['--locale', '--user-data-dir', '/outside']),
		workspaceCheckStatus(['--folder-uri', '--user-data-dir', '/outside']),
		workspaceCheckStatus(['--file-uri', '--user-data-dir', '/outside'])
	], [1, 1, 1]);
});

test('rejects a forwarded option delimiter that would hide launcher safety flags', () => {
	assert.strictEqual(workspaceCheckStatus(['--', '--sync=on']), 1);
});

// `rsync -a` preserves symlinked *directories* too, so a linked `User` or
// `User/profiles/<id>` reaches the merge with an ordinary-looking file path that
// still resolves outside the throwaway profile. Writing there would edit the
// user's real settings, which is the isolation this launcher promises.
test('refuses to write through a symlinked profile directory', posixOnly, () => {
	const root = fixtureRoot('nas-linkdir-');
	const real = path.join(root, 'real');
	const udd = path.join(root, 'udd');
	fs.mkdirSync(real, { recursive: true });
	fs.mkdirSync(udd, { recursive: true });
	const original = '{ "editor.editContext": false }\n';
	fs.writeFileSync(path.join(real, 'settings.json'), original);
	fs.symlinkSync(real, path.join(udd, 'User'), 'dir');

	let status = 0;
	try {
		execFileSync(process.execPath, [script, '--user-data-dir', udd], { stdio: 'pipe' });
	} catch (error) {
		status = (error as { status?: number }).status ?? 1;
	}

	assert.deepStrictEqual({
		status,
		realFile: fs.readFileSync(path.join(real, 'settings.json'), 'utf8')
	}, { status: 1, realFile: original });
});

// A linked `User/profiles` that resolves to an empty (or missing) directory
// yields no entries to walk, and a linked profile marked as inheriting would be
// skipped - in both cases the clone keeps a directory pointing outside the
// throwaway profile for Code OSS to write through later. The link must be
// refused before either shortcut applies.
for (const [name, linkPath, setUp] of [
	['empty target', 'profiles', (udd: string, outside: string) => {
		fs.mkdirSync(outside, { recursive: true });
		fs.symlinkSync(outside, path.join(udd, 'User', 'profiles'), 'dir');
	}],
	['dangling target', 'profiles', (udd: string, outside: string) => {
		fs.symlinkSync(outside, path.join(udd, 'User', 'profiles'), 'dir');
	}],
	['inheriting child', 'profiles/p1', (udd: string, outside: string) => {
		fs.mkdirSync(outside, { recursive: true });
		fs.mkdirSync(path.join(udd, 'User', 'profiles'), { recursive: true });
		fs.symlinkSync(outside, path.join(udd, 'User', 'profiles', 'p1'), 'dir');
		fs.mkdirSync(path.join(udd, 'User', 'globalStorage'), { recursive: true });
		fs.writeFileSync(path.join(udd, 'User', 'globalStorage', 'storage.json'),
			JSON.stringify({ userDataProfiles: [{ location: 'p1', useDefaultFlags: { settings: true } }] }));
	}]
] as [string, string, (udd: string, outside: string) => void][]) {
	test(`refuses a symlinked profiles directory: ${name}`, posixOnly, () => {
		const root = fixtureRoot('nas-linkprof-');
		const udd = path.join(root, 'udd');
		fs.mkdirSync(path.join(udd, 'User'), { recursive: true });
		fs.writeFileSync(path.join(udd, 'User', 'settings.json'), '{}\n');
		setUp(udd, path.join(root, 'outside'));

		let status = 0;
		try {
			execFileSync(process.execPath, [script, '--user-data-dir', udd], { stdio: 'pipe' });
		} catch (error) {
			status = (error as { status?: number }).status ?? 1;
		}

		assert.deepStrictEqual({
			status,
			stillLinked: fs.lstatSync(path.join(udd, 'User', ...linkPath.split('/'))).isSymbolicLink()
		}, { status: 1, stillLinked: true });
	});
}

// A stray file sitting in `User/profiles` is not a profile, so it must not be
// turned into a settings.json.
test('ignores non-directory entries under profiles', () => {
	const root = fixtureRoot('nas-strayfile-');
	fs.mkdirSync(path.join(root, 'User', 'profiles'), { recursive: true });
	fs.writeFileSync(path.join(root, 'User', 'settings.json'), '{}\n');
	fs.writeFileSync(path.join(root, 'User', 'profiles', 'notes.txt'), 'hi\n');

	const count = execFileSync(process.execPath, [script, '--user-data-dir', root], { encoding: 'utf8' }).trim();

	assert.deepStrictEqual({
		count,
		strayUntouched: fs.readFileSync(path.join(root, 'User', 'profiles', 'notes.txt'), 'utf8'),
		noSettingsCreated: fs.existsSync(path.join(root, 'User', 'profiles', 'notes.txt', 'settings.json'))
	}, { count: '1', strayUntouched: 'hi\n', noSettingsCreated: false });
});

// `existsSync` follows links, so a *dangling* settings symlink looks absent and
// would be skipped as an inheriting profile - leaving the link in the clone for
// VS Code to write through later, outside the throwaway profile.
test('discovers a named profile whose settings.json is a dangling symlink', posixOnly, () => {
	const root = fixtureRoot('nas-dangling-');
	const named = path.join(root, 'User', 'profiles', 'p1');
	fs.mkdirSync(named, { recursive: true });
	fs.writeFileSync(path.join(root, 'User', 'settings.json'), '{}\n');
	const outside = path.join(root, 'outside.json');
	fs.symlinkSync(outside, path.join(named, 'settings.json'));

	const count = execFileSync(process.execPath, [script, '--user-data-dir', root], { encoding: 'utf8' }).trim();

	assert.deepStrictEqual({
		discovered: Number(count),
		stillALink: fs.lstatSync(path.join(named, 'settings.json')).isSymbolicLink(),
		targetCreated: fs.existsSync(outside),
		enabled: KEYS.map(k => [k, parseJsonc(fs.readFileSync(path.join(named, 'settings.json'), 'utf8'))[k]])
	}, {
		discovered: 2,
		stillALink: false,
		targetCreated: false,
		enabled: KEYS.map(k => [k, true])
	});
});

// Only ENOENT proves a link is dangling. An unreadable target still has
// settings behind it, so replacing it with an empty file would discard them.
test('fails closed when a symlinked settings file cannot be read', posixOnly, () => {
	const root = fixtureRoot('nas-unreadable-');
	fs.mkdirSync(path.join(root, 'User'), { recursive: true });
	const target = path.join(root, 'target');
	fs.mkdirSync(target);
	fs.symlinkSync(target, path.join(root, 'User', 'settings.json'));

	let status = 0;
	try {
		execFileSync(process.execPath, [script, '--user-data-dir', root], { stdio: 'pipe' });
	} catch (error) {
		status = (error as { status?: number }).status ?? 1;
	}

	assert.deepStrictEqual({ status, targetStillADirectory: fs.statSync(target).isDirectory() },
		{ status: 1, targetStillADirectory: true });
});
