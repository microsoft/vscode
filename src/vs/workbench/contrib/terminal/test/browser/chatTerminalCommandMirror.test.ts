/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal } from '@xterm/xterm';
import { strictEqual } from 'assert';
import { importAMDNodeModule } from '../../../../../amdX.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TerminalCapabilityStore } from '../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { XtermTerminal } from '../../browser/xterm/xtermTerminal.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestXtermAddonImporter } from './xterm/xtermTestUtils.js';
import { computeMaxBufferColumnWidth } from '../../browser/chatTerminalCommandMirror.js';

const defaultTerminalConfig = {
	fontFamily: 'monospace',
	fontWeight: 'normal',
	fontWeightBold: 'normal',
	gpuAcceleration: 'off',
	scrollback: 10,
	fastScrollSensitivity: 2,
	mouseWheelScrollSensitivity: 1,
	unicodeVersion: '6'
};

suite('Workbench - ChatTerminalCommandMirror', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('VT mirroring with XtermTerminal', () => {
		let instantiationService: TestInstantiationService;
		let configurationService: TestConfigurationService;
		let XTermBaseCtor: typeof Terminal;

		async function createXterm(cols = 80, rows = 10, scrollback = 10): Promise<XtermTerminal> {
			const capabilities = store.add(new TerminalCapabilityStore());
			return store.add(instantiationService.createInstance(XtermTerminal, undefined, XTermBaseCtor, {
				cols,
				rows,
				xtermColorProvider: { getBackgroundColor: () => undefined },
				capabilities,
				disableShellIntegrationReporting: true,
				xtermAddonImporter: new TestXtermAddonImporter(),
			}, undefined));
		}

		function write(xterm: XtermTerminal, data: string): Promise<void> {
			return new Promise<void>(resolve => xterm.write(data, resolve));
		}

		function getBufferText(xterm: XtermTerminal): string {
			const buffer = xterm.raw.buffer.active;
			const lines: string[] = [];
			for (let i = 0; i < buffer.length; i++) {
				const line = buffer.getLine(i);
				lines.push(line?.translateToString(true) ?? '');
			}
			// Trim trailing empty lines
			while (lines.length > 0 && lines[lines.length - 1] === '') {
				lines.pop();
			}
			return lines.join('\n');
		}

		async function mirrorViaVT(source: XtermTerminal, startLine = 0): Promise<XtermTerminal> {
			const startMarker = source.raw.registerMarker(startLine - source.raw.buffer.active.baseY - source.raw.buffer.active.cursorY);
			const vt = await source.getRangeAsVT(startMarker ?? undefined, undefined, true);
			startMarker?.dispose();

			const mirror = await createXterm(source.raw.cols, source.raw.rows);
			if (vt) {
				await write(mirror, vt);
			}
			return mirror;
		}

		setup(async () => {
			configurationService = new TestConfigurationService({
				editor: {
					fastScrollSensitivity: 2,
					mouseWheelScrollSensitivity: 1
				} as Partial<IEditorOptions>,
				files: {},
				terminal: {
					integrated: defaultTerminalConfig
				},
			});

			instantiationService = workbenchInstantiationService({
				configurationService: () => configurationService
			}, store);

			XTermBaseCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
		});

		test('single character', async () => {
			const source = await createXterm();
			await write(source, 'X');

			const mirror = await mirrorViaVT(source);

			strictEqual(getBufferText(mirror), getBufferText(source));
		});

		test('single line', async () => {
			const source = await createXterm();
			await write(source, 'hello world');

			const mirror = await mirrorViaVT(source);

			strictEqual(getBufferText(mirror), getBufferText(source));
		});

		test('multiple lines', async () => {
			const source = await createXterm();
			await write(source, 'line 1\r\nline 2\r\nline 3');

			const mirror = await mirrorViaVT(source);

			strictEqual(getBufferText(mirror), getBufferText(source));
		});

		test('wrapped line', async () => {
			const source = await createXterm(20, 10); // narrow terminal
			const longLine = 'a'.repeat(50); // exceeds 20 cols
			await write(source, longLine);

			const mirror = await mirrorViaVT(source);

			strictEqual(getBufferText(mirror), getBufferText(source));
		});

		test('content with special characters', async () => {
			const source = await createXterm();
			await write(source, 'hello\ttab\r\nspaces   here\r\n$pecial!@#%^&*');

			const mirror = await mirrorViaVT(source);

			strictEqual(getBufferText(mirror), getBufferText(source));
		});

		test('content with ANSI colors', async () => {
			const source = await createXterm();
			await write(source, '\x1b[31mred\x1b[0m \x1b[32mgreen\x1b[0m \x1b[34mblue\x1b[0m');

			const mirror = await mirrorViaVT(source);

			strictEqual(getBufferText(mirror), getBufferText(source));
		});

		test('content filling visible area', async () => {
			const source = await createXterm(80, 5);
			for (let i = 1; i <= 5; i++) {
				await write(source, `line ${i}\r\n`);
			}

			const mirror = await mirrorViaVT(source);

			strictEqual(getBufferText(mirror), getBufferText(source));
		});

		test('content with scrollback (partial buffer)', async () => {
			const source = await createXterm(80, 5, 5); // 5 rows visible, 5 scrollback = 10 total
			// Write enough to push into scrollback
			for (let i = 1; i <= 12; i++) {
				await write(source, `line ${i}\r\n`);
			}

			const mirror = await mirrorViaVT(source);

			strictEqual(getBufferText(mirror), getBufferText(source));
		});

		test('empty content', async () => {
			const source = await createXterm();

			const mirror = await mirrorViaVT(source);

			strictEqual(getBufferText(mirror), getBufferText(source));
		});

		test('content from marker to cursor', async () => {
			const source = await createXterm();
			await write(source, 'before\r\n');
			const startMarker = source.raw.registerMarker(0)!;
			await write(source, 'output line 1\r\noutput line 2');

			const vt = await source.getRangeAsVT(startMarker, undefined, true);
			const mirror = await createXterm();
			if (vt) {
				await write(mirror, vt);
			}
			startMarker.dispose();

			// Mirror should contain just the content from marker onwards
			const mirrorText = getBufferText(mirror);
			strictEqual(mirrorText.includes('output line 1'), true);
			strictEqual(mirrorText.includes('output line 2'), true);
			strictEqual(mirrorText.includes('before'), false);
		});

		test('incremental mirroring appends correctly', async () => {
			const source = await createXterm();
			const marker = source.raw.registerMarker(0)!;
			await write(source, 'initial\r\n');

			// First mirror with initial content
			const vt1 = await source.getRangeAsVT(marker, undefined, true) ?? '';
			const mirror = await createXterm();
			await write(mirror, vt1);

			// Add more content to source
			await write(source, 'added\r\n');
			const vt2 = await source.getRangeAsVT(marker, undefined, true) ?? '';

			// Append only the new part to mirror
			const appended = vt2.slice(vt1.length);
			if (appended) {
				await write(mirror, appended);
			}

			// Create a fresh mirror with full VT to compare against
			const freshMirror = await createXterm();
			await write(freshMirror, vt2);

			marker.dispose();

			// Incremental mirror should match fresh mirror
			strictEqual(getBufferText(mirror), getBufferText(freshMirror));
		});
	});

	suite('computeMaxBufferColumnWidth', () => {

		/**
		 * Creates a mock buffer with the given lines.
		 * Each string represents a line; characters are cells, spaces are empty cells.
		 */
		function createMockBuffer(lines: string[], cols: number = 80): { readonly length: number; getLine(y: number): { readonly length: number; getCell(x: number): { getChars(): string } | undefined } | undefined } {
			return {
				length: lines.length,
				getLine(y: number) {
					if (y < 0 || y >= lines.length) {
						return undefined;
					}
					const lineContent = lines[y];
					return {
						length: Math.max(lineContent.length, cols),
						getCell(x: number) {
							if (x < 0 || x >= lineContent.length) {
								return { getChars: () => '' };
							}
							const char = lineContent[x];
							return { getChars: () => char === ' ' ? '' : char };
						}
					};
				}
			};
		}

		test('returns 0 for empty buffer', () => {
			const buffer = createMockBuffer([]);
			strictEqual(computeMaxBufferColumnWidth(buffer, 80), 0);
		});

		test('returns 0 for buffer with only empty lines', () => {
			const buffer = createMockBuffer(['', '', '']);
			strictEqual(computeMaxBufferColumnWidth(buffer, 80), 0);
		});

		test('returns correct width for single character', () => {
			const buffer = createMockBuffer(['X']);
			strictEqual(computeMaxBufferColumnWidth(buffer, 80), 1);
		});

		test('returns correct width for single line', () => {
			const buffer = createMockBuffer(['hello']);
			strictEqual(computeMaxBufferColumnWidth(buffer, 80), 5);
		});

		test('returns max width across multiple lines', () => {
			const buffer = createMockBuffer([
				'short',
				'much longer line',
				'mid'
			]);
			strictEqual(computeMaxBufferColumnWidth(buffer, 80), 16);
		});

		test('ignores trailing spaces (empty cells)', () => {
			// Spaces are treated as empty cells in our mock
			const buffer = createMockBuffer(['hello     ']);
			strictEqual(computeMaxBufferColumnWidth(buffer, 80), 5);
		});

		test('respects cols parameter to clamp line length', () => {
			const buffer = createMockBuffer(['abcdefghijklmnop']); // 16 chars, no spaces
			strictEqual(computeMaxBufferColumnWidth(buffer, 10), 10);
		});

		test('handles lines with content at different positions', () => {
			const buffer = createMockBuffer([
				'a',           // width 1
				'  b',         // content at col 2, but width is 3
				'    c',       // content at col 4, but width is 5
				'      d'      // content at col 6, width is 7
			]);
			strictEqual(computeMaxBufferColumnWidth(buffer, 80), 7);
		});

		test('handles buffer with undefined lines gracefully', () => {
			const buffer = {
				length: 3,
				getLine(y: number) {
					if (y === 1) {
						return undefined;
					}
					return {
						length: 5,
						getCell(x: number) {
							return x < 3 ? { getChars: () => 'X' } : { getChars: () => '' };
						}
					};
				}
			};
			strictEqual(computeMaxBufferColumnWidth(buffer, 80), 3);
		});

		test('handles line with all empty cells', () => {
			const buffer = createMockBuffer(['     ']); // all spaces = empty cells
			strictEqual(computeMaxBufferColumnWidth(buffer, 80), 0);
		});

		test('handles mixed empty and non-empty lines', () => {
			const buffer = createMockBuffer([
				'',
				'content',
				'',
				'more',
				''
			]);
			strictEqual(computeMaxBufferColumnWidth(buffer, 80), 7);
		});

		test('returns correct width for line exactly at 80 cols', () => {
			const line80 = 'a'.repeat(80);
			const buffer = createMockBuffer([line80]);
			strictEqual(computeMaxBufferColumnWidth(buffer, 80), 80);
		});

		test('returns correct width for line exceeding 80 cols with higher cols value', () => {
			const line100 = 'a'.repeat(100);
			const buffer = createMockBuffer([line100], 120);
			strictEqual(computeMaxBufferColumnWidth(buffer, 120), 100);
		});

		test('handles wide terminal with long content', () => {
			const buffer = createMockBuffer([
				'short',
				'a'.repeat(150),
				'medium content here'
			], 200);
			strictEqual(computeMaxBufferColumnWidth(buffer, 200), 150);
		});

		test('max of multiple lines where longest exceeds default cols', () => {
			const buffer = createMockBuffer([
				'a'.repeat(50),
				'b'.repeat(120),
				'c'.repeat(90)
			], 150);
			strictEqual(computeMaxBufferColumnWidth(buffer, 150), 120);
		});
	});
});
