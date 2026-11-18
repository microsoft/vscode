/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { capText, headAndTail, IdleCoalescer, isNoisyCommand, isPasswordField, isPlainTextField, isSearchField, linesAround, resolveDomTarget, resolveFrame, textAround, TypingBuffer, visibleText } from '../../browser/userActivityCaptureHelpers.js';

suite('userActivity capture helpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function html(markup: string): HTMLElement {
		const root = mainWindow.document.createElement('div');
		root.innerHTML = markup;
		return root;
	}

	test('caps text, and keeps the head and tail of long output', () => {
		assert.strictEqual(capText('abc', 3), 'abc');
		assert.strictEqual(capText('abcdef', 4), 'abc\u2026');
		assert.strictEqual(capText(undefined, 4), undefined);
		assert.strictEqual(headAndTail('short', 10), 'short');
		const long = 'a'.repeat(50) + 'b'.repeat(50);
		const kept = headAndTail(long, 23);
		assert.ok(kept.length <= 23);
		assert.ok(kept.startsWith('aaaa') && kept.endsWith('bbbb') && kept.includes('\u2026'));
	});

	test('reads lines around a range, clamped to the document', () => {
		const lines = ['one', 'two', 'three', 'four', 'five'];
		const source = { getLineCount: () => lines.length, getLineContent: (n: number) => lines[n - 1] };
		assert.strictEqual(linesAround(source, 1, 1, 2), 'one\ntwo\nthree');
		assert.strictEqual(linesAround(source, 3, 4, 1), 'two\nthree\nfour\nfive');
		assert.strictEqual(textAround('x'.repeat(100) + 'needle' + 'y'.repeat(100), 'needle', 20).includes('needle'), true);
	});

	test('a typing buffer takes back what a backspace deletes', () => {
		const buffer = new TypingBuffer();
		assert.strictEqual(buffer.edited, false);
		for (const ch of 'helo') {
			buffer.apply(ch, 0);
		}
		buffer.apply('', 1);
		buffer.apply('lo', 0);
		buffer.apply(' world', 0);
		assert.strictEqual(buffer.text, 'hello world');
		assert.strictEqual(buffer.edited, true);
		buffer.apply('', 100);
		assert.strictEqual(buffer.text, '');
	});

	test('coalesces per key until idle, flushes on demand, drops on dispose', () => {
		const clock = sinon.useFakeTimers();
		try {
			const flushed: [string, string][] = [];
			const coalescer = new IdleCoalescer<string, TypingBuffer>(1000, () => new TypingBuffer(), (key, buffer) => flushed.push([key, buffer.text]));
			coalescer.update('a', b => b.apply('x', 0));
			clock.tick(900);
			coalescer.update('a', b => b.apply('y', 0));
			coalescer.update('b', b => b.apply('z', 0));
			clock.tick(900);
			assert.deepStrictEqual(flushed, []);
			clock.tick(100);
			assert.deepStrictEqual(flushed, [['a', 'xy'], ['b', 'z']]);

			coalescer.update('a', b => b.apply('q', 0));
			coalescer.flush('a');
			assert.deepStrictEqual(flushed.at(-1), ['a', 'q']);
			assert.strictEqual(coalescer.has('a'), false);

			coalescer.update('c', b => b.apply('dropped', 0));
			coalescer.dispose();
			clock.tick(5000);
			assert.strictEqual(flushed.length, 3);
		} finally {
			clock.restore();
		}
	});

	test('filters noisy and internal commands', () => {
		for (const id of ['type', 'deleteLeft', 'cursorDown', 'scrollLineUp', '_internal.thing', 'editor.action.triggerSuggest', 'editor.action.showHover', 'setContext', 'vscode.executeDocumentSymbolProvider', 'list.focusDown']) {
			assert.strictEqual(isNoisyCommand(id), true, id);
		}
		for (const id of ['workbench.action.files.save', 'git.commit', 'workbench.action.chat.open', 'editor.action.formatDocument', 'workbench.action.showCommands', 'editor.action.inlineSuggest.commit']) {
			assert.strictEqual(isNoisyCommand(id), false, id);
		}
	});

	test('resolves the area, view, label and role of a clicked element', () => {
		const root = html(`
			<div class="part sidebar" id="workbench.parts.sidebar">
				<div class="composite" id="workbench.view.explorer">
					<a class="action-label" role="button" aria-label="New File..."><span class="codicon codicon-new-file"></span></a>
					<div class="row"><span class="name">README.md</span></div>
				</div>
			</div>
			<div class="part editor" id="workbench.parts.editor">
				<div class="interactive-session">
					<div class="interactive-input-part"><button title="Send (Enter)"><span class="icon"></span></button></div>
					<p class="long">${'word '.repeat(60)}</p>
				</div>
			</div>
			<div class="part statusbar" id="workbench.parts.statusbar"><div role="button"><span>Ln 4, Col 2</span></div></div>
			<div class="quick-input-widget"><input type="text" aria-label="Type the name of a command"></div>`);

		assert.deepStrictEqual(resolveDomTarget(root.querySelector('.codicon')!), { area: 'explorer', view: 'workbench.view.explorer', label: 'New File...', role: 'button' });
		assert.deepStrictEqual(resolveDomTarget(root.querySelector('.name')!), { area: 'explorer', view: 'workbench.view.explorer', label: 'README.md' });
		assert.deepStrictEqual(resolveDomTarget(root.querySelector('.icon')!), { area: 'chatInput', label: 'Send (Enter)', role: 'button' });
		assert.deepStrictEqual(resolveDomTarget(root.querySelector('.statusbar span')!), { area: 'statusbar', label: 'Ln 4, Col 2', role: 'button' });
		assert.deepStrictEqual(resolveDomTarget(root.querySelector('.quick-input-widget input')!), { area: 'quickInput', label: 'Type the name of a command', role: 'textbox' });

		const long = resolveDomTarget(root.querySelector('.long')!);
		assert.strictEqual(long.area, 'chat');
		assert.ok(long.label!.length <= 120 && long.label!.endsWith('\u2026'));

		// A view the workbench reports wins over the container's id.
		assert.deepStrictEqual(resolveDomTarget(root.querySelector('.name')!, () => 'workbench.explorer.fileView').view, 'workbench.explorer.fileView');
	});

	test('a click says which item it picked and what frames it', () => {
		const root = html(`
			<div class="part sessions" id="workbench.parts.sessions">
				<div class="sessions-list-control">
					<div role="listitem"><span class="title">Ambient system names</span><span aria-hidden="true">Ambient system names</span><span class="age">10 hrs ago</span><span class="diff">+754 -0</span></div>
				</div>
			</div>
			<div class="part editor" id="workbench.parts.editor">
				<div class="interactive-session">
					<div class="chat-confirmation-widget"><div class="title">Run command?</div><code>npm run eval:core -- run --id hc13</code><div class="buttons"><a role="button" class="allow">Allow</a><a role="button">Skip</a></div></div>
				</div>
			</div>`);

		// Text runs keep their breaks, a run repeated for screen readers reads once.
		assert.strictEqual(visibleText(root.querySelector('[role="listitem"]')!), 'Ambient system names 10 hrs ago +754 -0');
		// A click on a row's age names the row.
		assert.deepStrictEqual(resolveDomTarget(root.querySelector('.age')!), { area: 'sessions', label: 'Ambient system names 10 hrs ago +754 -0', role: 'listitem' });
		// An "Allow" says what it allowed.
		const allow = root.querySelector('.allow')!;
		assert.deepStrictEqual(resolveDomTarget(allow), { area: 'chat', label: 'Allow', role: 'button' });
		assert.strictEqual(resolveFrame(allow, 'Allow'), 'Run command? npm run eval:core -- run --id hc13 Allow Skip');
		// A frame that says no more than the label adds nothing.
		assert.strictEqual(resolveFrame(root.querySelector('.age')!, 'Ambient system names 10 hrs ago +754 -0'), undefined);
	});

	test('records plain fields, never passwords or the hidden inputs of editors and terminals', () => {
		const root = html(`
			<input class="text" type="text">
			<input class="password" type="password">
			<input class="checkbox" type="checkbox">
			<textarea class="plain"></textarea>
			<div class="monaco-editor"><textarea class="inputarea"></textarea><div class="native-edit-context"><textarea class="ime-text-area"></textarea></div></div>
			<textarea class="xterm-helper-textarea"></textarea>
			<div class="search-widget"><textarea class="query"></textarea><div class="replace-input"><textarea class="replace"></textarea></div></div>
			<div class="editor-widget find-widget"><div class="find-part"><textarea class="find"></textarea></div></div>`);
		const field = (selector: string) => root.querySelector(selector)!;

		assert.strictEqual(isPlainTextField(field('.text')), true);
		assert.strictEqual(isPlainTextField(field('.plain')), true);
		assert.strictEqual(isPlainTextField(field('.password')), false);
		assert.strictEqual(isPasswordField(field('.password')), true);
		assert.strictEqual(isPlainTextField(field('.checkbox')), false);
		assert.strictEqual(isPlainTextField(field('.inputarea')), false);
		assert.strictEqual(isPlainTextField(field('.ime-text-area')), false);
		assert.strictEqual(isPlainTextField(field('.xterm-helper-textarea')), false);

		assert.strictEqual(isSearchField(field('.query')), true);
		assert.strictEqual(isSearchField(field('.replace')), false);
		assert.strictEqual(isSearchField(field('.find')), true);
		assert.strictEqual(isSearchField(field('.plain')), false);
	});
});
