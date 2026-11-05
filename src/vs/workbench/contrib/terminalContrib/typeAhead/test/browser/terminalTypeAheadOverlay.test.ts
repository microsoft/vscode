/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { Terminal } from '@xterm/xterm';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { writeP } from '../../../../terminal/browser/terminalTestHelpers.js';
import type { IXtermCore } from '../../../../terminal/browser/xterm-private.js';
import { TypeAheadOverlay } from '../../browser/terminalTypeAheadOverlay.js';

suite('Workbench - Terminal Typeahead Overlay', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let TerminalCtor: typeof Terminal;

	setup(async () => {
		TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
	});

	const core = (terminal: Terminal) => (terminal as Terminal & { _core: IXtermCore })._core;

	async function createTerminal() {
		const host = mainWindow.document.createElement('div');
		host.style.cssText = 'position:absolute;top:0;left:0;width:600px;height:120px';
		mainWindow.document.body.appendChild(host);
		store.add(toDisposable(() => host.remove()));
		const terminal = store.add(new TerminalCtor({ cols: 10, rows: 3, allowProposedApi: true, minimumContrastRatio: 1, cursorBlink: false }));
		terminal.open(host);
		// xterm only draws the cursor after focus or a keypress.
		core(terminal).coreService.isCursorInitialized = true;
		await render(terminal);
		return { terminal, host };
	}

	function render(terminal: Terminal, change: () => void = () => terminal.refresh(0, terminal.rows - 1)): Promise<void> {
		return new Promise<void>(resolve => {
			const listener = store.add(terminal.onRender(() => {
				listener.dispose();
				resolve();
			}));
			change();
		});
	}

	function rowElement(host: HTMLElement, y = 0): HTMLElement {
		return host.querySelectorAll<HTMLElement>('.xterm-rows > div')[y];
	}

	function cellElement(host: HTMLElement, x: number): HTMLSpanElement {
		for (const span of rowElement(host).querySelectorAll<HTMLSpanElement>('span')) {
			const length = span.textContent?.length ?? 0;
			if (x < length) {
				return span;
			}
			x -= length;
		}
		throw new Error('Missing rendered cell');
	}

	function cursorColumn(host: HTMLElement, y = 0): number | undefined {
		let column = 0;
		for (const span of rowElement(host, y).querySelectorAll<HTMLSpanElement>('span')) {
			if (span.classList.contains('xterm-cursor')) {
				return column;
			}
			column += span.textContent?.length ?? 0;
		}
		return undefined;
	}

	function snapshot(terminal: Terminal, host: HTMLElement) {
		return {
			text: rowElement(host).textContent,
			buffer: terminal.buffer.active.getLine(0)?.translateToString(true),
			cursor: cursorColumn(host),
			bufferCursor: terminal.buffer.active.cursorX
		};
	}

	test('composites copied, predicted and erased cells with pen attributes without changing the buffer', async () => {
		const { terminal, host } = await createTerminal();
		await writeP(terminal, 'A\x1b[1;38;2;17;34;51;48;2;68;85;102mB\x1b[0mCDE\x1b[3;38;2;101;102;103;48;2;32;48;64m');
		const pen = core(terminal)._inputHandler._curAttrData;
		const penBefore = [pen.fg, pen.bg, pen.extended.underlineStyle];
		const getLine = core(terminal)._bufferService.buffer.lines.get;
		const overlay = store.add(new TypeAheadOverlay(terminal, '#123456'));
		await render(terminal, () => overlay.set({
			y: 0, startX: 1, cursorX: 3,
			cells: [{ kind: 'copy', x: 4 }, { kind: 'char', char: 'q' }, { kind: 'copy', x: 1 }, { kind: 'blank' }]
		}));
		const predicted = cellElement(host, 2);
		const copied = cellElement(host, 3);
		const blank = cellElement(host, 4);
		assert.deepStrictEqual({
			...snapshot(terminal, host),
			predicted: [predicted.style.color, predicted.style.backgroundColor, predicted.classList.contains('xterm-italic')],
			copied: [copied.style.color, copied.style.backgroundColor, copied.classList.contains('xterm-bold')],
			blank: [blank.style.backgroundColor, blank.classList.contains('xterm-italic')],
			pen: [pen.fg, pen.bg, pen.extended.underlineStyle],
			getterRestored: core(terminal)._bufferService.buffer.lines.get === getLine
		}, {
			text: 'AEqB ', buffer: 'ABCDE', cursor: 3, bufferCursor: 5,
			predicted: ['rgb(18, 52, 86)', 'rgb(32, 48, 64)', true],
			copied: ['rgb(17, 34, 51)', 'rgb(68, 85, 102)', true],
			blank: ['rgb(32, 48, 64)', false], pen: penBefore, getterRestored: true
		});
	});

	test('repaints style changes and preserves the authoritative pen', async () => {
		const { terminal, host } = await createTerminal();
		await writeP(terminal, 'abc\x1b[3;38;2;18;52;86m');
		const overlay = store.add(new TypeAheadOverlay(terminal, 'bold'));
		await render(terminal, () => overlay.set({ y: 0, startX: 1, cursorX: 1, cells: [{ kind: 'char', char: 'x' }] }));
		const results = [];
		for (const style of ['bold', 'dim', 'invalid hex', '#gggggg']) {
			await render(terminal, () => overlay.setStyle(style));
			const cell = cellElement(host, 1);
			results.push({
				style,
				bold: cell.classList.contains('xterm-bold'),
				dim: cell.classList.contains('xterm-dim'),
				italic: cell.classList.contains('xterm-italic'),
				color: cell.style.color,
				penColor: core(terminal)._inputHandler._curAttrData.getFgColor()
			});
		}
		assert.deepStrictEqual(results, [
			{ style: 'bold', bold: true, dim: false, italic: true, color: 'rgb(18, 52, 86)', penColor: 0x123456 },
			{ style: 'dim', bold: false, dim: true, italic: true, color: 'rgb(18, 52, 86)', penColor: 0x123456 },
			{ style: 'invalid hex', bold: false, dim: false, italic: true, color: 'rgb(255, 0, 0)', penColor: 0x123456 },
			{ style: '#gggggg', bold: false, dim: false, italic: true, color: 'rgb(255, 0, 0)', penColor: 0x123456 }
		]);
	});

	test('removal and disposal restore rendering, cursor and patched methods', async () => {
		const { terminal, host } = await createTerminal();
		await writeP(terminal, 'abc');
		const service = core(terminal)._renderService;
		const renderer = service._renderer.value!;
		const renderRows = renderer.renderRows;
		const setRenderer = service.setRenderer;
		const overlay = store.add(new TypeAheadOverlay(terminal, 'dim'));
		const prediction = { y: 0, startX: 1, cursorX: 1, cells: [{ kind: 'char' as const, char: 'x' }] };
		await render(terminal, () => overlay.set(prediction));
		const predicted = snapshot(terminal, host);
		await render(terminal, () => overlay.set(undefined));
		const removed = snapshot(terminal, host);
		await render(terminal, () => overlay.set(prediction));
		await render(terminal, () => overlay.dispose());
		assert.deepStrictEqual({
			predicted, removed, disposed: snapshot(terminal, host),
			methodsRestored: renderer.renderRows === renderRows && service.setRenderer === setRenderer,
			renderOwnProperty: Object.hasOwn(renderer, 'renderRows')
		}, {
			predicted: { text: 'axc', buffer: 'abc', cursor: 1, bufferCursor: 3 },
			removed: { text: 'abc ', buffer: 'abc', cursor: 3, bufferCursor: 3 },
			disposed: { text: 'abc ', buffer: 'abc', cursor: 3, bufferCursor: 3 },
			methodsRestored: true, renderOwnProperty: false
		});
	});

	test('only draws visible normal-buffer rows, clips columns and respects cursor visibility', async () => {
		const { terminal, host } = await createTerminal();
		await writeP(terminal, 'abc\x1b[?25l');
		const overlay = store.add(new TypeAheadOverlay(terminal, 'dim'));
		const prediction = { y: 0, startX: 0, cursorX: 1, cells: [{ kind: 'char' as const, char: 'x' }] };
		await render(terminal, () => overlay.set(prediction));
		const hidden = snapshot(terminal, host);
		await render(terminal, () => overlay.set({ ...prediction, y: 1000 }));
		const outsideViewport = snapshot(terminal, host);
		await render(terminal, () => overlay.set(prediction));
		await writeP(terminal, '\x1b[?1049h\x1b[Halt');
		await render(terminal);
		const alternate = snapshot(terminal, host);
		await writeP(terminal, '\x1b[?1049l');
		await render(terminal);
		const normal = snapshot(terminal, host);
		await render(terminal, () => overlay.set({
			...prediction, startX: -1, cursorX: 1000,
			cells: [{ kind: 'char', char: 'ignored' }, { kind: 'char', char: 'z' }, { kind: 'copy', x: 1000 }, { kind: 'blank' }]
		}));
		assert.deepStrictEqual({ hidden, outsideViewport, alternate, normal, clipped: snapshot(terminal, host) }, {
			hidden: { text: 'xbc', buffer: 'abc', cursor: undefined, bufferCursor: 3 },
			outsideViewport: { text: 'abc ', buffer: 'abc', cursor: undefined, bufferCursor: 3 },
			alternate: { text: 'alt ', buffer: 'alt', cursor: undefined, bufferCursor: 3 },
			normal: { text: 'xbc', buffer: 'abc', cursor: undefined, bufferCursor: 3 },
			clipped: { text: 'zb        ', buffer: 'abc', cursor: undefined, bufferCursor: 3 }
		});
	});

	test('rewraps replacement renderers and restores the previous renderer hook', async () => {
		const { terminal, host } = await createTerminal();
		await writeP(terminal, 'abc');
		const xtermCore = core(terminal);
		const service = xtermCore._renderService;
		const previous = service._renderer.value!;
		const renderRows = previous.renderRows;
		const overlay = store.add(new TypeAheadOverlay(terminal, 'dim'));
		await render(terminal, () => overlay.set({ y: 0, startX: 0, cursorX: 0, cells: [{ kind: 'char', char: 'x' }] }));
		const replacement = xtermCore._createRenderer!();
		const replacementRenderRows = replacement.renderRows;
		await render(terminal, () => service.setRenderer!(replacement));
		const replaced = snapshot(terminal, host);
		await render(terminal, () => overlay.dispose());
		assert.deepStrictEqual({
			replaced, disposed: snapshot(terminal, host),
			previousRestored: previous.renderRows === renderRows,
			replacementRestored: replacement.renderRows === replacementRenderRows
		}, {
			replaced: { text: 'xbc', buffer: 'abc', cursor: 0, bufferCursor: 3 },
			disposed: { text: 'abc ', buffer: 'abc', cursor: 3, bufferCursor: 3 },
			previousRestored: true, replacementRestored: true
		});
	});

	test('is harmless without opening the terminal', async () => {
		const terminal = store.add(new TerminalCtor({ cols: 10, rows: 3, allowProposedApi: true }));
		await writeP(terminal, 'abc');
		const overlay = store.add(new TypeAheadOverlay(terminal, 'bold'));
		overlay.set({ y: 0, startX: 1, cursorX: 1, cells: [{ kind: 'char', char: 'x' }] });
		overlay.setStyle('dim');
		overlay.set(undefined);
		overlay.dispose();
		assert.deepStrictEqual({ text: terminal.buffer.active.getLine(0)?.translateToString(true), cursor: terminal.buffer.active.cursorX }, { text: 'abc', cursor: 3 });
	});
});
