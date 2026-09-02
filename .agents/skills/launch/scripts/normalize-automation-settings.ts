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
import * as path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ENTRIES: [key: string, value: string, rewriteLanguageOverrides: boolean][] = [
	['files.simpleDialog.enable', 'true', false],
	['editor.editContext', 'true', true],
];

function isJsoncLineBreak(c: string): boolean {
	return c === '\n' || c === '\r' || c === '\u2028' || c === '\u2029';
}

function isJsoncWhitespace(c: string): boolean {
	const ch = c.charCodeAt(0);
	return ch === 0x20 || ch === 0x09 || ch === 0x0b || ch === 0x0c ||
		ch === 0x00a0 || ch === 0x1680 || (ch >= 0x2000 && ch <= 0x200b) ||
		ch === 0x202f || ch === 0x205f || ch === 0x3000 || ch === 0xfeff;
}

function codeMask(src: string, source: string): string {
	const out = src.split('');
	let inString = false, inLine = false, inBlock = false;
	for (let i = 0; i < src.length; i++) {
		const c = src[i], n = src[i + 1];
		if (inLine) {
			if (isJsoncLineBreak(c)) { i--; inLine = false; } else { out[i] = ' '; }
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
		if (isJsoncLineBreak(c) && c !== '\n' && c !== '\r') { out[i] = ' '; }
		else if (isJsoncWhitespace(c) && c !== ' ' && c !== '\t') { out[i] = ' '; }
		else if (c === '"') { inString = true; }
		else if (c === '/' && n === '/') { out[i] = ' '; inLine = true; }
		else if (c === '/' && n === '*') { out[i] = ' '; out[i + 1] = ' '; i++; inBlock = true; }
	}
	if (inBlock || inString) {
		console.error('[normalize-automation-settings] ' + source + ' is not valid JSONC (unterminated ' +
			(inBlock ? 'block comment' : 'string') + ') - refusing to continue');
		process.exit(1);
	}
	return out.join('');
}

function removeTrailingCommas(masked: string): string {
	const out = masked.split('');
	let inString = false;
	for (let i = 0; i < out.length; i++) {
		const c = out[i];
		if (inString) {
			if (c === '\\') { i++; }
			else if (c === '"') { inString = false; }
			continue;
		}
		if (c === '"') { inString = true; continue; }
		if (c !== ',') { continue; }
		let next = i + 1;
		while (next < out.length && /\s/.test(out[next])) { next++; }
		if (out[next] === '}' || out[next] === ']') { out[i] = ' '; }
	}
	return out.join('');
}

function parseJsonc(text: string, source: string): unknown {
	const masked = codeMask(text, source).replace(/^\uFEFF/, '');
	if (masked.trim() === '') { return {}; }
	try {
		return JSON.parse(removeTrailingCommas(masked));
	} catch (error) {
		console.error('[normalize-automation-settings] ' + source + ' is not valid JSONC (' +
			(error as Error).message + ') - refusing to continue');
		process.exit(1);
	}
}

function configurationValue(raw: Record<string, unknown>, key: string): { exists: boolean; value?: unknown } {
	const tree: Record<string, unknown> = Object.create(null);
	for (const [rawKey, value] of Object.entries(raw)) {
		const segments = rawKey.split('.');
		const last = segments.pop()!;
		let current = tree;
		let conflict = false;
		for (const segment of segments) {
			let child = current[segment];
			if (child === undefined) {
				child = current[segment] = Object.create(null);
			} else if (child === null || typeof child !== 'object') {
				conflict = true;
				break;
			}
			current = child as Record<string, unknown>;
		}
		if (!conflict) { current[last] = value; }
	}
	let current: unknown = tree;
	for (const segment of key.split('.')) {
		if (!current || typeof current !== 'object' || !Object.hasOwn(current, segment)) {
			return { exists: false };
		}
		current = (current as Record<string, unknown>)[segment];
	}
	return { exists: true, value: current };
}

function assertSimpleDialogForWorkspaceArgs(args: string[]): void {
	const candidates = new Set<string>();
	const positional: string[] = [];
	const launcherOwnedOptions = new Set([
		'--debugBrkPluginHost', '--debugPluginHost', '--extensionHomePath', '--extensions-dir',
		'--inspect', '--inspect-agenthost', '--inspect-brk',
		'--inspect-brk-agenthost', '--inspect-brk-extensions', '--inspect-extensions',
		'--remote-debugging-port', '--shared-data-dir', '--transient', '--user-data-dir'
	]);
	// Keep this aligned with string/string[] entries in
	// `src/vs/platform/environment/node/argv.ts`. Their separated values are not
	// positional workspaces even when they happen to name an existing directory.
	const optionsWithPathValue = new Set([
		'--add-mcp', '--agent-plugins-dir', '--agents-extensions-dir', '--agents-user-data-dir',
		'--builtin-extensions-dir', '--category', '--continueOn', '--crash-reporter-directory',
		'--crash-reporter-id', '--debugId', '--disable-extension', '--editSessionId',
		'--enable-proposed-api', '--enable-tracing', '--export-default-configuration',
		'--export-default-keybindings', '--export-policy-data', '--extensionDevelopmentKind',
		'--extensionDevelopmentPath', '--extensionEnvironment', '--extensions-download-dir',
		'--extensionTestsPath', '--force-device-scale-factor', '--install-builtin-extension',
		'--install-extension', '--install-source', '--inspect-brk-ptyhost',
		'--inspect-brk-sharedprocess', '--inspect-ptyhost', '--inspect-sharedprocess',
		'--js-flags', '--locate-extension', '--locate-shell-integration-path', '--locale', '--log',
		'--log-net-log', '--logsPath', '--ozone-platform', '--password-store',
		'--prof-append-timers', '--prof-duration-markers', '--prof-duration-markers-file',
		'--prof-startup-prefix', '--proxy-bypass-list', '--proxy-pac-url', '--proxy-server', '--remote',
		'--sync', '--telemetry-level', '--trace-category-filter', '--trace-options',
		'--trace-startup-duration', '--trace-startup-file', '--trace-startup-format',
		'--unresponsive-sample-interval', '--unresponsive-sample-period', '--vmodule',
		'--waitMarkerFilePath', '--xdg-portal-required-version'
	]);
	const isValueToken = (value: string | undefined): value is string =>
		value !== undefined && value !== '--' && (value === '-' || !value.startsWith('-'));
	for (let i = 0; i < args.length; i++) {
		const argument = args[i];
		if (argument === '--') {
			console.error('[normalize-automation-settings] a forwarded `--` would hide launcher safety flags; remove it');
			process.exit(1);
		}
		const optionName = argument.split('=', 1)[0];
		if (launcherOwnedOptions.has(optionName)) {
			console.error('[normalize-automation-settings] forwarded ' + optionName +
				' would override launcher isolation or debug ports; remove it');
			process.exit(1);
		}
		if (argument === '--profile' || argument.startsWith('--profile=') ||
			argument === '--profile-temp' || argument.startsWith('--profile-temp=')) {
			console.error('[normalize-automation-settings] forwarded profile creation is not supported: ' + argument +
				'. Remove it so every launched profile can be normalized before Code OSS starts');
			process.exit(1);
		}
		if (argument === '--folder-uri' || argument === '--file-uri') {
			const kind = argument;
			const next = args[i + 1];
			if (isValueToken(next)) {
				i++;
				const uri = next;
				if (!uri.startsWith('file:')) { continue; }
				const localPath = fileURLToPath(uri);
				if (kind === '--folder-uri' || localPath.endsWith('.code-workspace')) { candidates.add(localPath); }
			}
			continue;
		}
		const uriOption = /^(--folder-uri|--file-uri)=(.*)$/.exec(argument);
		if (uriOption) {
			const uri = uriOption[2];
			if (uri.startsWith('file:')) {
				const localPath = fileURLToPath(uri);
				if (uriOption[1] === '--folder-uri' || localPath.endsWith('.code-workspace')) { candidates.add(localPath); }
			}
			continue;
		}
		if (optionsWithPathValue.has(argument)) {
			if (isValueToken(args[i + 1])) { i++; }
			continue;
		}
		if (argument.startsWith('-')) { continue; }
		positional.push(argument);
	}
	const forceOpenWorkspaceAsFile =
		(args.includes('--diff') || args.includes('-d')) && positional.length === 2 ||
		(args.includes('--merge') || args.includes('-m')) && positional.length === 4;
	for (const argument of positional) {
		let isDirectory = false;
		try { isDirectory = fs.statSync(argument).isDirectory(); } catch { }
		if (isDirectory || (!forceOpenWorkspaceAsFile && argument.endsWith('.code-workspace'))) {
			candidates.add(path.resolve(argument));
		}
	}

	for (const candidate of candidates) {
		let workspaceFile = false;
		try { workspaceFile = fs.statSync(candidate).isFile() && candidate.endsWith('.code-workspace'); }
		catch { continue; }
		const settingsFile = workspaceFile ? candidate : path.join(candidate, '.vscode', 'settings.json');
		let text: string;
		try { text = fs.readFileSync(settingsFile, 'utf8'); }
		catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') { continue; }
			console.error('[normalize-automation-settings] cannot read ' + settingsFile + ': ' + (error as Error).message);
			process.exit(1);
		}
		const root = parseJsonc(text, settingsFile);
		if (!root || typeof root !== 'object' || Array.isArray(root)) {
			console.error('[normalize-automation-settings] ' + settingsFile + ' must contain a JSON object');
			process.exit(1);
		}
		const settings = workspaceFile ? (root as Record<string, unknown>).settings : root;
		if (!settings || typeof settings !== 'object' || Array.isArray(settings)) { continue; }
		const values = settings as Record<string, unknown>;
		const simpleDialog = configurationValue(values, 'files.simpleDialog.enable');
		if (simpleDialog.exists && simpleDialog.value !== true) {
			console.error('[normalize-automation-settings] ' + settingsFile +
				' overrides files.simpleDialog.enable; set it to true or remove it so automation never opens a native dialog');
			process.exit(1);
		}
	}
}

function refuseLinkedAncestors(root: string, file: string): void {
	const relative = path.relative(root, path.dirname(file));
	let dir = root;
	for (const segment of relative.split(path.sep).filter(Boolean)) {
		dir = path.join(dir, segment);
		let isLink = false;
		try { isLink = fs.lstatSync(dir).isSymbolicLink(); } catch { break; }
		if (isLink) {
			console.error('[normalize-automation-settings] refusing to write through symlinked directory ' +
				dir + ' - the cloned profile is not self-contained: ' + file);
			process.exit(1);
		}
	}
}

function materializeLinkedFile(file: string): void {
	try {
		if (!fs.lstatSync(file).isSymbolicLink()) { return; }
		let contents = '';
		try { contents = fs.readFileSync(file, 'utf8'); }
		catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; }
		}
		fs.unlinkSync(file);
		fs.writeFileSync(file, contents);
	} catch (error) {
		const fileError = error as NodeJS.ErrnoException;
		if (fileError.code !== 'ENOENT') {
			console.error('[normalize-automation-settings] cannot materialize ' + file + ': ' + fileError.message);
			process.exit(1);
		}
	}
}

export function normalizeSettingsFile(f: string, root?: string): void {
	// `rsync -a` preserves links. Check only the launcher-owned part of the path;
	// the temp root above it is not ours to judge, and `/tmp` is linked on macOS.
	if (root !== undefined) {
		refuseLinkedAncestors(root, f);
	}
	materializeLinkedFile(f);

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


	// Decode a JSON string body (the text between the quotes) so keys are compared
	// by value rather than by source spelling.
	function decodeJsonString(raw: string): string {
		if (!raw.includes('\\')) { return raw; }
		try { return JSON.parse('"' + raw + '"') as string; } catch { return raw; }
	}

	// Locate `"key": <primitive>` pairs, tracking nesting and string state so an
	// occurrence embedded in a string value is never mistaken for the real setting.
	//
	// Language overrides are reported alongside the root value, because they are
	// not inert: every `editor.*` setting is LANGUAGE_OVERRIDABLE, so a
	// `"[typescript]": { "editor.editContext": false }` block still renders a
	// `textarea` in TypeScript editors while the page objects wait on
	// `.native-edit-context`.
	//
	// Both dotted and nested namespace forms inside a top-level `[language]` block
	// count because `ConfigurationModelParser.toOverrides` runs `toValuesTree`.
	// A same-named key anywhere else belongs to another consumer and must not be touched.
	//
	// For the root level the LAST occurrence is the effective one, which is what
	// Code OSS honours when a profile contains duplicate keys.
	interface Span { valueStart: number; valueLength: number }

	function findProperties(masked: string, key: string): { root: Span | null; rootNested: Span[]; nested: Span[] } {
		let depth = 0, inString = false;
		let root: Span | null = null;
		const nested: Span[] = [];
		const rootNested: Span[] = [];
		let keyStart = -1, expectValue = false;
		// One pending key per nesting level, so a nested object does not clobber the
		// enclosing object's pending key.
		const pendingKey: (string | null)[] = [];
		const containerKeys: (string | null)[] = [];
		const containerKinds: ('object' | 'array')[] = [];
		let enteringKey: string | null = null;
		const isOverrideKey = (k: string | null) => k !== null && /^(\[[^\]]+\])+$/.test(k);
		const segments = key.split('.');
		for (let i = 0; i < masked.length; i++) {
			const c = masked[i];
			if (inString) {
				if (c === '\\') { i++; continue; }
				if (c === '"') {
					inString = false;
					// Compare decoded keys: VS Code parses `"\u005btypescript\u005d"`
					// as `[typescript]`, so the raw source spelling would miss it.
					if (depth >= 1) { pendingKey[depth] = decodeJsonString(masked.slice(keyStart + 1, i)); }
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
				const currentKey = pendingKey[depth];
				if (depth === 1 && currentKey === key) {
					// Always reflect the LAST direct occurrence. If this one is not a
					// primitive, drop any earlier hit: rewriting it would leave the
					// effective value unchanged.
					root = m ? { valueStart: i, valueLength: m[1].length } : null;
				} else if (m && currentKey !== null && depth > 1 &&
					containerKinds.slice(1, depth + 1).every(kind => kind === 'object')) {
					const ancestors = containerKeys.slice(2, depth + 1);
					const first = ancestors[0] ?? null;
					const pathInScope = isOverrideKey(first) ? [...ancestors.slice(1), currentKey] : [...ancestors, currentKey];
					if (pathInScope.every(segment => segment !== null) && pathInScope.join('.') === key) {
						const span = { valueStart: i, valueLength: m[1].length };
						if (isOverrideKey(first)) { nested.push(span); } else { rootNested.push(span); }
					}
				}
				expectValue = false;
				if (!m) { enteringKey = currentKey; }
				pendingKey[depth] = null;
				if (m) { i += m[1].length - 1; continue; }
				// Not a primitive: fall through so `{`/`[`/`"` is handled below.
			}
			if (c === '"') { inString = true; keyStart = i; continue; }
			if (c === '{' || c === '[') {
				depth++;
				containerKeys[depth] = enteringKey;
				containerKinds[depth] = c === '{' ? 'object' : 'array';
				enteringKey = null;
				pendingKey[depth] = null;
				expectValue = false;
				continue;
			}
			if (c === '}' || c === ']') {
				depth--;
				expectValue = false;
				continue;
			}
			if (c === ':' && depth >= 1 && pendingKey[depth] !== null) { expectValue = true; continue; }
			if (c === ',' && depth >= 1) { pendingKey[depth] = null; expectValue = false; continue; }
		}
		return { root, rootNested, nested };
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
		// Nothing but trivia (comments are already blanked) may precede the root
		// object, or `junk { "a": 1 }` would be rewritten and reported as success
		// even though VS Code cannot read it.
		if (masked.slice(0, open).replace(/^\uFEFF/, '').trim() !== '') {
			console.error('[normalize-automation-settings] settings.json has content before the root object - refusing to clobber it: ' + f);
			process.exit(1);
		}
		// Track the delimiter *types*, not just the nesting depth: counting alone
		// would accept `{]` as a balanced root object.
		const stack: string[] = [];
		let inString = false;
		for (let i = open; i < masked.length; i++) {
			const c = masked[i];
			if (inString) {
				if (c === '\\') { i++; } else if (c === '"') { inString = false; }
				continue;
			}
			if (c === '"') { inString = true; continue; }
			if (c === '{' || c === '[') { stack.push(c); continue; }
			if (c === '}' || c === ']') {
				const expected = c === '}' ? '{' : '[';
				if (stack.pop() !== expected) {
					console.error('[normalize-automation-settings] settings.json has mismatched brackets - refusing to clobber it: ' + f);
					process.exit(1);
				}
				if (stack.length === 0) {
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

	// Validate up front. Doing it lazily - only when a key has to be appended -
	// meant a malformed file that already contained both keys took the rewrite path
	// for both and was written back out despite being malformed.
	//
	// Delimiter balance alone is not enough: `{ "a": 1 "b": 2 }` is balanced but
	// invalid, and used to be rewritten and reported as success. Actually parse the
	// file the same way VS Code does (`src/vs/base/common/json.ts`: strip comments,
	// then tolerate trailing commas) so any syntax error fails closed instead. The
	// masked text is reused because it already blanks comments while preserving
	// offsets, which is exactly the input `JSON.parse` needs.
	function assertParses(maskedText: string): void {
		// A leading BOM is accepted elsewhere in this script (and by VS Code), but
		// `JSON.parse` rejects it, so drop it for validation only.
		const masked = maskedText.replace(/^\uFEFF/, '');
		try {
			JSON.parse(masked);
			return;
		} catch {
			// Trailing commas are valid JSONC but not JSON, so retry as VS Code does
			// before concluding the file is actually broken.
		}
		try {
			JSON.parse(removeTrailingCommas(masked));
		} catch (e) {
			console.error('[normalize-automation-settings] settings.json is not valid JSONC (' +
				(e as Error).message + ') - refusing to clobber it: ' + f);
			process.exit(1);
		}
	}

	const maskedForValidation = codeMask(text, f);
	if (maskedForValidation.replace(/^\uFEFF/, '').trim() === '') {
		const body = ENTRIES.map(([key, value]) => '  "' + key + '": ' + value).join(',\n');
		const separator = text === '' || isJsoncLineBreak(text.at(-1) ?? '') ? '' : '\n';
		fs.writeFileSync(f, text + separator + '{\n' + body + '\n}\n');
		return;
	}
	assertParses(maskedForValidation);
	findRootObject(maskedForValidation);

	for (const [key, value, rewriteLanguageOverrides] of ENTRIES) {
		let masked = codeMask(text, f);

		const { root, rootNested, nested } = findProperties(masked, key);

		// Rewrite nested root values, supported language overrides, and the direct
		// root value. Apply spans last-first so earlier offsets stay valid.
		const overrides = rewriteLanguageOverrides ? nested : [];
		const spans = root ? [...rootNested, ...overrides, root] : [...rootNested, ...overrides];
		for (const span of spans.sort((a, b) => b.valueStart - a.valueStart)) {
			text = text.slice(0, span.valueStart) + value + text.slice(span.valueStart + span.valueLength);
		}
		if (root) {
			continue;
		}
		// No root-level occurrence: append one. Any effective language overrides
		// were already normalized above, so they cannot contradict it.
		masked = codeMask(text, f);

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
}

// Both launchers need the same answer to "which settings files matter?", so the
// discovery lives here rather than being written twice in shell. The default
// profile is not necessarily the one a window opens with: the clone preserves
// `userDataProfiles` and `profileAssociations`, and
// `WindowsMainService.resolveProfileForBrowserWindow` hands an associated
// workspace its named profile, which reads `User/profiles/<id>/settings.json`.
// An absent settings.json does not mean the profile inherits: `createProfile`
// makes only the directory, and a normal independent profile simply has nothing
// saved yet. Skipping it would hand an associated workspace the *default*
// `editor.editContext`/`files.simpleDialog.enable`, which is the failure this
// script exists to prevent. So the profile metadata decides: only a profile that
// sets `useDefaultFlags.settings` truly points back at the default resource, and
// only that one is left alone.
// Modern entries store a relative directory name. Older entries can contain a
// serialized file URI that still points at the source profile after the clone;
// rewrite those to the matching directory in the clone before Code OSS sees
// them. A URI with no matching cloned directory is rejected rather than allowing
// the launched instance to escape its throwaway user-data-dir.
function inheritingProfileLocations(userDataDir: string): Set<string> {
	const inheriting = new Set<string>();
	const stateFile = path.join(userDataDir, 'User', 'globalStorage', 'storage.json');
	refuseLinkedAncestors(userDataDir, stateFile);
	materializeLinkedFile(stateFile);
	let state: Record<string, unknown>;
	try {
		state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) as Record<string, unknown>;
	} catch {
		return inheriting;
	}
	const raw = state['userDataProfiles'];
	// The value has been stored both as an array and as a JSON string over time.
	let profiles: unknown;
	try {
		profiles = typeof raw === 'string' ? JSON.parse(raw) : raw;
	} catch {
		return inheriting;
	}
	if (!Array.isArray(profiles)) {
		return inheriting;
	}
	let changed = false;
	for (const profile of profiles) {
		const entry = profile as { location?: unknown; useDefaultFlags?: { settings?: unknown } };
		let location: string;
		if (typeof entry?.location === 'string') {
			location = entry.location;
			const isOrdinaryProfile = location !== '' && location !== '.' && location !== '..' &&
				path.posix.basename(location) === location && path.win32.basename(location) === location;
			const isAgentsProfile = location === 'builtin/agents';
			if (!isOrdinaryProfile && !isAgentsProfile) {
				console.error('[normalize-automation-settings] refusing non-relative profile location ' +
					JSON.stringify(location) + ' in ' + stateFile);
				process.exit(1);
			}
		} else if (entry?.location && typeof entry.location === 'object') {
			const uri = entry.location as { scheme?: unknown; authority?: unknown; path?: unknown; query?: unknown; fragment?: unknown };
			if (uri.scheme !== 'file' || typeof uri.path !== 'string' ||
				(typeof uri.authority === 'string' && uri.authority !== '') ||
				(typeof uri.query === 'string' && uri.query !== '') ||
				(typeof uri.fragment === 'string' && uri.fragment !== '')) {
				console.error('[normalize-automation-settings] refusing unsupported URI profile location in ' + stateFile);
				process.exit(1);
			}
			const segments = uri.path.replace(/\/+$/, '').split('/').filter(Boolean);
			location = segments.slice(-2).join('/') === 'builtin/agents' ? 'builtin/agents' : segments.at(-1) ?? '';
			const clonedLocation = path.join(userDataDir, 'User', 'profiles', ...location.split('/'));
			let isDirectory = false;
			try { isDirectory = fs.lstatSync(clonedLocation).isDirectory(); } catch { }
			if (!location || !isDirectory) {
				console.error('[normalize-automation-settings] URI profile location has no matching cloned directory: ' + uri.path);
				process.exit(1);
			}
			entry.location = location;
			changed = true;
		} else {
			continue;
		}
		// The native profile service forces every built-in Agents profile to inherit
		// settings even though the persisted entry does not carry useDefaultFlags.
		if (location === 'builtin/agents' || entry.useDefaultFlags?.settings === true) {
			inheriting.add(location);
		}
	}
	if (changed) {
		state['userDataProfiles'] = typeof raw === 'string' ? JSON.stringify(profiles) : profiles;
		try { fs.writeFileSync(stateFile, JSON.stringify(state)); }
		catch (error) {
			console.error('[normalize-automation-settings] cannot remap URI profile locations in ' + stateFile + ': ' + (error as Error).message);
			process.exit(1);
		}
	}
	return inheriting;
}

// A linked directory is rejected outright rather than skipped. The per-file
// ancestor walk in `normalizeSettingsFile` only sees paths that made it into the
// returned list, so a linked `User/profiles` that happens to be empty - or a
// linked profile that metadata marks as inheriting - would never be walked and
// the clone would keep a directory pointing outside the throwaway profile, where
// Code OSS is free to write later. The link has to be refused before the
// inheritance skip, not after it.
function refuseLinkedDir(dir: string): void {
	let isLink = false;
	try { isLink = fs.lstatSync(dir).isSymbolicLink(); } catch { return; }
	if (isLink) {
		console.error('[normalize-automation-settings] refusing to use symlinked directory ' +
			dir + ' - the cloned profile is not self-contained');
		process.exit(1);
	}
}

export function findSettingsFiles(userDataDir: string): string[] {
	const files = [path.join(userDataDir, 'User', 'settings.json')];
	const profilesDir = path.join(userDataDir, 'User', 'profiles');
	let entries: fs.Dirent[] = [];
	try { entries = fs.readdirSync(profilesDir, { withFileTypes: true }); } catch { entries = []; }
	refuseLinkedDir(profilesDir);
	const inheriting = inheritingProfileLocations(userDataDir);
	const addProfile = (entry: fs.Dirent, parent: string, location: string): void => {
		if (entry.isSymbolicLink()) {
			refuseLinkedDir(path.join(parent, entry.name));
			return;
		}
		if (!entry.isDirectory()) {
			return;
		}
		const settingsFile = path.join(parent, entry.name, 'settings.json');
		if (inheriting.has(location)) {
			materializeLinkedFile(settingsFile);
			return;
		}
		files.push(settingsFile);
	};
	for (const entry of entries) {
		if (entry.name !== 'builtin') {
			addProfile(entry, profilesDir, entry.name);
			continue;
		}
		// `builtin` is a namespace, not a profile. The Agents profile is stored one
		// level below it, so inspect its children without ever creating
		// `User/profiles/builtin/settings.json`.
		if (entry.isSymbolicLink()) {
			refuseLinkedDir(path.join(profilesDir, entry.name));
			continue;
		}
		if (!entry.isDirectory()) { continue; }
		const builtinDir = path.join(profilesDir, entry.name);
		let builtinEntries: fs.Dirent[] = [];
		try { builtinEntries = fs.readdirSync(builtinDir, { withFileTypes: true }); } catch { }
		for (const builtinEntry of builtinEntries) {
			addProfile(builtinEntry, builtinDir, 'builtin/' + builtinEntry.name);
		}
	}
	return files;
}

const target = process.argv[2];
if (!target) {
	console.error('[normalize-automation-settings] usage: node normalize-automation-settings.ts <settings.json|--user-data-dir <dir>|--check-workspace-args [...]>');
	process.exit(2);
}
if (target === '--check-workspace-args') {
	assertSimpleDialogForWorkspaceArgs(process.argv.slice(3));
} else if (target === '--user-data-dir') {
	const userDataDir = process.argv[3];
	if (!userDataDir) {
		console.error('[normalize-automation-settings] --user-data-dir requires a path');
		process.exit(2);
	}
	const files = findSettingsFiles(userDataDir);
	for (const file of files) {
		normalizeSettingsFile(file, userDataDir);
	}
	console.log(String(files.length));
} else {
	normalizeSettingsFile(target);
}
