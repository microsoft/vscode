#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const focusChatScript = join(scriptDirectory, '..', 'playwrightScripts', 'focus-chat-input.ts');
const require = createRequire(import.meta.url);
let playwrightCli;

let append = false;
let verify = true;
let session = process.env.PW_SESSION ?? '';
let text;

const fail = (message, exitCode = 1, details) => {
	process.stdout.write(`${JSON.stringify({ ok: false, error: message })}\n`);
	if (details) {
		process.stderr.write(details);
	}
	process.exit(exitCode);
};

for (let index = 2; index < process.argv.length; index++) {
	const argument = process.argv[index];
	switch (argument) {
		case '--append':
			append = true;
			break;
		case '--no-verify':
			verify = false;
			break;
		case '--session':
			if (index + 1 >= process.argv.length) {
				fail('missing value for --session', 2);
			}
			session = process.argv[++index];
			break;
		case '--': {
			const remainingArguments = process.argv.slice(index + 1);
			if (remainingArguments.length > 0) {
				text = remainingArguments.join(' ');
			}
			index = process.argv.length;
			break;
		}
		case '--help':
		case '-h':
			process.stdout.write(`Usage: monaco-paste.mjs [--append] [--no-verify] [--session NAME] [text]

Pastes text into the focused Code OSS Chat input through an attached
@playwright/cli session. If text is omitted, it is read from stdin.
`);
			process.exit(0);
		default:
			if (argument.startsWith('--session=')) {
				session = argument.slice('--session='.length);
			} else if (argument.startsWith('-')) {
				fail(`unknown flag ${argument}`, 2);
			} else if (text === undefined) {
				text = argument;
			} else {
				fail('only one text argument is supported; use stdin for arbitrary text', 2);
			}
	}
}

if (text === undefined) {
	text = readFileSync(0, 'utf8');
}
if (!text) {
	fail('empty input', 2);
}

const sessionArguments = session ? [`-s=${session}`] : [];
const runCli = args => {
	try {
		playwrightCli ??= require.resolve('@playwright/cli/playwright-cli.js');
	} catch (error) {
		fail(`could not resolve @playwright/cli from the launch skill: ${error.message}`, 1);
	}
	const result = spawnSync(process.execPath, [playwrightCli, ...sessionArguments, ...args], {
		encoding: 'utf8',
		windowsHide: true,
	});
	if (result.error) {
		fail(`failed to run @playwright/cli: ${result.error.message}`, 1);
	}
	return result;
};

const focusResult = runCli(['run-code', `--filename=${focusChatScript}`]);
if (focusResult.status !== 0) {
	fail('failed to focus a visible chat input', 1, focusResult.stderr || focusResult.stdout);
}

if (!append) {
	const selectAllModifier = process.platform === 'darwin' ? 'Meta' : 'Control';
	const selectAllResult = runCli(['press', `${selectAllModifier}+a`]);
	if (selectAllResult.status !== 0) {
		fail('failed to select existing chat input', 1, selectAllResult.stderr || selectAllResult.stdout);
	}
	const deleteResult = runCli(['press', 'Backspace']);
	if (deleteResult.status !== 0) {
		fail('failed to clear existing chat input', 1, deleteResult.stderr || deleteResult.stdout);
	}
}

const code = `async page => page.evaluate(async ({ text, verify }) => {
	const selectors = [
		'.session-view.is-active .new-chat-input-area :is(.native-edit-context, textarea.inputarea)',
		'.session-view.is-active .sessions-chat-editor :is(.native-edit-context, textarea.inputarea)',
		'.session-view.is-active .interactive-session .chat-input-container :is(.native-edit-context, textarea.inputarea)',
		'.monaco-workbench .interactive-session .chat-input-container :is(.native-edit-context, textarea.inputarea)'
	];
	const isEligible = element => {
		if (!element?.matches?.('.native-edit-context, textarea.inputarea')) {
			return false;
		}
		if (!element.closest('.new-chat-input-area, .sessions-chat-editor, .interactive-session .chat-input-container')) {
			return false;
		}
		if (element.closest('.inline-chat-widget, .automation-form-prompt-host')) {
			return false;
		}
		const style = getComputedStyle(element);
		return element.isConnected
			&& element.getClientRects().length > 0
			&& style.display !== 'none'
			&& style.visibility !== 'hidden';
	};
	let root = isEligible(document.activeElement) ? document.activeElement : undefined;
	for (const selector of selectors) {
		root ||= Array.from(document.querySelectorAll(selector)).find(isEligible);
	}
	if (!root) {
		return { ok: false, error: 'no visible chat input editing surface found on page' };
	}
	root.focus();
	const data = new DataTransfer();
	data.setData('text/plain', text);
	root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
	const editor = root.closest('.monaco-editor');
	if (!editor) {
		return { ok: false, error: 'chat input is not inside a Monaco editor' };
	}
	const normalize = value => value.replace(/\\u00A0/g, ' ').replace(/\\r?\\n/g, '');
	const expected = normalize(text);
	const expectedPrefix = expected.slice(0, Math.min(40, expected.length));
	let viewLines = [];
	let actual = '';
	let prefixMatched = false;
	for (let attempt = 0; attempt < 20; attempt++) {
		await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		viewLines = Array.from(editor.querySelectorAll('.view-line')).map(line => line.textContent ?? '');
		actual = normalize(viewLines.join(''));
		prefixMatched = actual.startsWith(expectedPrefix) || actual.includes(expectedPrefix.slice(0, 20));
		if (!verify || prefixMatched) {
			break;
		}
		await new Promise(resolve => setTimeout(resolve, 100));
	}
	return {
		ok: !verify || prefixMatched,
		actualLength: actual.length,
		expectedLength: text.length,
		viewLineCount: viewLines.length,
		firstViewLine: (viewLines[0] ?? '').slice(0, 80),
		error: (!verify || prefixMatched) ? undefined : 'paste read-back did not match expected prefix'
	};
}, { text: ${JSON.stringify(text)}, verify: ${verify} })`;

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'code-oss-monaco-paste-'));
const codeFile = join(temporaryDirectory, 'paste.js');
let pasteResult;
try {
	writeFileSync(codeFile, code);
	pasteResult = runCli(['run-code', `--filename=${codeFile}`]);
} finally {
	rmSync(temporaryDirectory, { recursive: true, force: true });
}
if (pasteResult.status !== 0) {
	fail('@playwright/cli run-code failed', 1, pasteResult.stderr || pasteResult.stdout);
}

const resultMatch = pasteResult.stdout.match(/### Result\r?\n([^\r\n]+)/);
if (!resultMatch) {
	fail('no ### Result section in run-code output', 1, pasteResult.stdout);
}

let result;
try {
	result = JSON.parse(resultMatch[1]);
	if (typeof result === 'string') {
		result = JSON.parse(result);
	}
} catch (error) {
	fail(`failed to parse result line: ${error.message}`, 1, pasteResult.stdout);
}

process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(result.ok ? 0 : 1);
