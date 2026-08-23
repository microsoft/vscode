/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal } from '@xterm/xterm';
import { deepStrictEqual, strictEqual } from 'assert';
import { importAMDNodeModule } from '../../../../../amdX.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import type { ITerminalCommand } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalCapabilityStore } from '../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import type { ITerminalFont } from '../../common/terminal.js';
import { ITerminalService, type IDetachedXTermOptions } from '../../browser/terminal.js';
import { XtermTerminal } from '../../browser/xterm/xtermTerminal.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { createFakeDetachedTerminal } from './chatTerminalMirrorTestUtils.js';
import { TestXtermAddonImporter } from './xterm/xtermTestUtils.js';
import { computeChatTerminalMirrorCols, computeMaxBufferColumnWidth, computeSnapshotLineCount, DetachedTerminalCommandMirror, DetachedTerminalSnapshotMirror, vtBoundaryMatches } from '../../browser/chatTerminalCommandMirror.js';

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

		test('disposed start marker does not throw in VT serialization', async () => {
			const source = await createXterm();
			await write(source, 'line 1\r\nline 2');

			const startMarker = source.raw.registerMarker(0)!;
			startMarker.dispose();

			const vt = await source.getRangeAsVT(startMarker, undefined, true);
			strictEqual(typeof vt, 'string');
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

		test('VT divergence detection prevents corruption (Windows scenario)', async () => {
			// This test simulates the Windows issue where VT sequences can differ
			// between calls even for equivalent visual content. On Windows, the
			// serializer can produce different escape sequences (e.g., different
			// line endings or cursor positioning) causing the prefix to diverge.
			//
			// Without boundary checking, blindly slicing would corrupt output:
			// - vt1: "Line1\r\nLine2" (length 13)
			// - vt2: "Line1\nLine2\nLine3" (different format, but starts similarly)
			// - slice(13) on vt2 would give "ine3" instead of the full new content

			const mirror = await createXterm();

			// Simulate first VT snapshot
			const vt1 = 'Line1\r\nLine2';
			await write(mirror, vt1);
			strictEqual(getBufferText(mirror), 'Line1\nLine2');

			// Simulate divergent VT snapshot (different escape sequences for same content)
			// This mimics what can happen on Windows where the VT serializer
			// produces different output between calls
			const vt2 = 'DifferentPrefix' + 'Line3';

			// Use the actual utility function to test boundary checking
			const boundaryMatches = vtBoundaryMatches(vt2, vt1, vt1.length);

			// Boundary should NOT match because the prefix diverged
			strictEqual(boundaryMatches, false, 'Boundary check should detect divergence');

			// Use \x1bc (RIS) + new content in one write to avoid a blank frame
			await write(mirror, `\x1bc${vt2}`);

			// Final content should be the complete new VT, not corrupted
			strictEqual(getBufferText(mirror), 'DifferentPrefixLine3');
		});

		test('boundary check allows append when VT prefix matches', async () => {
			const mirror = await createXterm();

			// First VT snapshot
			const vt1 = 'Line1\r\nLine2\r\n';
			await write(mirror, vt1);

			// Second VT snapshot that properly extends the first
			const vt2 = vt1 + 'Line3\r\n';

			// Use the actual utility function to test boundary checking
			const boundaryMatches = vtBoundaryMatches(vt2, vt1, vt1.length);

			strictEqual(boundaryMatches, true, 'Boundary check should pass when prefix matches');

			// Append should work correctly
			const appended = vt2.slice(vt1.length);
			await write(mirror, appended);

			strictEqual(getBufferText(mirror), 'Line1\nLine2\nLine3');
		});

		test('incremental updates use append path (not full rewrite) in normal operation', async () => {
			// This test verifies that in normal operation (VT prefix matches),
			// we use the efficient append path rather than full rewrite.

			const source = await createXterm();
			const marker = source.raw.registerMarker(0)!;

			// Build up content incrementally, simulating streaming output
			const writes: string[] = [];

			// Step 1: Initial content
			await write(source, 'output line 1\r\n');
			const vt1 = await source.getRangeAsVT(marker, undefined, true) ?? '';

			const mirror = await createXterm();
			await write(mirror, vt1);
			writes.push(vt1);

			// Step 2: Add more content - should use append path
			await write(source, 'output line 2\r\n');
			const vt2 = await source.getRangeAsVT(marker, undefined, true) ?? '';

			// Verify VT extends properly (prefix matches)
			strictEqual(vt2.startsWith(vt1), true, 'VT2 should start with VT1');

			// Append only the new part (this is what the append path does)
			const appended2 = vt2.slice(vt1.length);
			strictEqual(appended2.length > 0, true, 'Should have new content to append');
			strictEqual(appended2.length < vt2.length, true, 'Append should be smaller than full rewrite');
			await write(mirror, appended2);
			writes.push(appended2);

			// Step 3: Add more content - should continue using append path
			await write(source, 'output line 3\r\n');
			const vt3 = await source.getRangeAsVT(marker, undefined, true) ?? '';

			strictEqual(vt3.startsWith(vt2), true, 'VT3 should start with VT2');

			const appended3 = vt3.slice(vt2.length);
			strictEqual(appended3.length > 0, true, 'Should have new content to append');
			strictEqual(appended3.length < vt3.length, true, 'Append should be smaller than full rewrite');
			await write(mirror, appended3);
			writes.push(appended3);

			marker.dispose();

			// Verify final content is correct
			strictEqual(getBufferText(mirror), 'output line 1\noutput line 2\noutput line 3');

			// Verify we used the append path (total bytes written should be roughly
			// equal to total VT, not 3x the total due to full rewrites)
			const totalWritten = writes.reduce((sum, w) => sum + w.length, 0);
			const fullRewriteWouldBe = vt1.length + vt2.length + vt3.length;
			strictEqual(totalWritten < fullRewriteWouldBe, true,
				`Append path should write less (${totalWritten}) than full rewrites would (${fullRewriteWouldBe})`);
		});

		test('snapshot line count reflects rendered rows', async () => {
			async function measure(text: string): Promise<number> {
				const xterm = await createXterm();
				if (text) {
					await write(xterm, text);
				}
				return computeSnapshotLineCount(xterm.raw.buffer.active);
			}

			deepStrictEqual({
				empty: await measure(''),
				short: await measure('hello'),
				exactlyOneRow: await measure('a'.repeat(80)),
				twoWrappedRows: await measure('a'.repeat(81)),
				threeWrappedRows: await measure('a'.repeat(200)),
				multilineWithWrapping: await measure(`${'a'.repeat(81)}\r\nnext`),
				trailingCarriageReturnLineFeed: await measure('line\r\n'),
				trailingLineFeed: await measure('line\n'),
			}, {
				empty: 0,
				short: 1,
				exactlyOneRow: 1,
				twoWrappedRows: 2,
				threeWrappedRows: 3,
				multilineWithWrapping: 3,
				trailingCarriageReturnLineFeed: 1,
				trailingLineFeed: 1,
			});
		});

		test('snapshot line count updates after appends and rewrites', async () => {
			const xterm = await createXterm();
			await write(xterm, 'a'.repeat(81));
			const initial = computeSnapshotLineCount(xterm.raw.buffer.active);

			await write(xterm, 'b'.repeat(120));
			const appended = computeSnapshotLineCount(xterm.raw.buffer.active);

			await write(xterm, '\x1b[2J\x1b[3J\x1b[Hshort');
			const rewritten = computeSnapshotLineCount(xterm.raw.buffer.active);

			deepStrictEqual({ initial, appended, rewritten }, {
				initial: 2,
				appended: 3,
				rewritten: 1,
			});
		});

		test('snapshot line count preserves an explicit value', async () => {
			const xterm = await createXterm();
			await write(xterm, 'a'.repeat(200));

			strictEqual(computeSnapshotLineCount(xterm.raw.buffer.active, 7), 7);
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

	suite('vtBoundaryMatches', () => {

		test('returns true when strings match at boundary', () => {
			const oldVT = 'Line1\r\nLine2\r\n';
			const newVT = oldVT + 'Line3\r\n';
			strictEqual(vtBoundaryMatches(newVT, oldVT, oldVT.length), true);
		});

		test('returns false when strings diverge at boundary', () => {
			const oldVT = 'Line1\r\nLine2';
			const newVT = 'DifferentPrefixLine3';
			strictEqual(vtBoundaryMatches(newVT, oldVT, oldVT.length), false);
		});

		test('returns false when single character differs in window', () => {
			const oldVT = 'AAAAAAAAAA';
			const newVT = 'AAAAABAAAA' + 'NewContent';
			strictEqual(vtBoundaryMatches(newVT, oldVT, oldVT.length), false);
		});

		test('returns true for empty strings', () => {
			strictEqual(vtBoundaryMatches('', '', 0), true);
		});

		test('returns true when slicePoint is 0', () => {
			const oldVT = '';
			const newVT = 'SomeContent';
			strictEqual(vtBoundaryMatches(newVT, oldVT, 0), true);
		});

		test('handles strings shorter than window size', () => {
			const oldVT = 'Short';
			const newVT = 'Short' + 'Added';
			strictEqual(vtBoundaryMatches(newVT, oldVT, oldVT.length), true);
		});

		test('respects custom window size parameter', () => {
			// With default window (50), this would match since the diff is at position 70
			const prefix = 'A'.repeat(80);
			const oldVT = prefix;
			const newVT = 'X' + 'A'.repeat(79) + 'NewContent'; // differs at position 0

			// With window of 50, only checks chars 30-80, which would match
			strictEqual(vtBoundaryMatches(newVT, oldVT, oldVT.length, 50), true);

			// With window of 100, would check chars 0-80, which would NOT match
			strictEqual(vtBoundaryMatches(newVT, oldVT, oldVT.length, 100), false);
		});

		test('detects divergence in escape sequences (Windows scenario)', () => {
			// Simulates Windows issue where VT escape sequences differ
			const oldVT = '\x1b[0m\x1b[1mBold\x1b[0m\r\n';
			const newVT = '\x1b[0m\x1b[22mBold\x1b[0m\r\nMore'; // Different escape code for bold
			strictEqual(vtBoundaryMatches(newVT, oldVT, oldVT.length), false);
		});

		test('handles matching escape sequences', () => {
			const oldVT = '\x1b[31mRed\x1b[0m\r\n';
			const newVT = '\x1b[31mRed\x1b[0m\r\nGreen';
			strictEqual(vtBoundaryMatches(newVT, oldVT, oldVT.length), true);
		});
	});

	suite('computeChatTerminalMirrorCols', () => {

		function makeFont(charWidth?: number, letterSpacing = 0): ITerminalFont {
			return { fontFamily: 'monospace', fontSize: 12, letterSpacing, lineHeight: 1, charWidth, charHeight: 14 };
		}

		test('fills the available width minus the gutter', () => {
			deepStrictEqual({
				wide: computeChatTerminalMirrorCols(1224, makeFont(10), 1),
				floored: computeChatTerminalMirrorCols(1200, makeFont(10), 1),
			}, {
				wide: 120, // floor((1224 - 20) / 10)
				floored: 118, // (1200 - 20) / 10
			});
		});

		test('is stable across device pixel ratios when letter spacing is zero', () => {
			strictEqual(computeChatTerminalMirrorCols(1224, makeFont(10), 2), 120);
		});

		test('accounts for letter spacing in device pixels', () => {
			// floor((1224 - 24) * 2 / (10 * 2 + 1))
			strictEqual(computeChatTerminalMirrorCols(1224, makeFont(10, 1), 2), 114);
		});

		test('falls back to the default cols when width or font is unmeasurable', () => {
			deepStrictEqual({
				zeroWidth: computeChatTerminalMirrorCols(0, makeFont(10), 1),
				nanWidth: computeChatTerminalMirrorCols(NaN, makeFont(10), 1),
				missingCharWidth: computeChatTerminalMirrorCols(1224, makeFont(undefined), 1),
				zeroCharWidth: computeChatTerminalMirrorCols(1224, makeFont(0), 1),
			}, {
				zeroWidth: 80,
				nanWidth: 80,
				missingCharWidth: 80,
				zeroCharWidth: 80,
			});
		});

		test('treats an invalid device pixel ratio as 1', () => {
			strictEqual(computeChatTerminalMirrorCols(1224, makeFont(10), 0), 120);
		});

		test('uses an explicitly measured horizontal chrome over the default', () => {
			deepStrictEqual({
				none: computeChatTerminalMirrorCols(1200, makeFont(10), 1, 0),
				measured: computeChatTerminalMirrorCols(1224, makeFont(10), 1, 24),
			}, {
				none: 120,
				measured: 120,
			});
		});

		test('narrow widths wrap to the fitting column count, minimum one column', () => {
			deepStrictEqual({
				narrow: computeChatTerminalMirrorCols(100, makeFont(10), 1), // (100 - 20) / 10
				tiny: computeChatTerminalMirrorCols(25, makeFont(10), 1),
			}, {
				narrow: 8,
				tiny: 1,
			});
		});
	});

	suite('DetachedTerminalSnapshotMirror.layout', () => {
		let instantiationService: TestInstantiationService;
		let XTermBaseCtor: typeof Terminal;
		let fakes: ReturnType<typeof createFakeDetachedTerminal>[];

		setup(async () => {
			instantiationService = workbenchInstantiationService(undefined, store);
			XTermBaseCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
			fakes = [];
			instantiationService.stub(ITerminalService, {
				createDetachedTerminal: async (options: IDetachedXTermOptions) => {
					const fake = createFakeDetachedTerminal(XTermBaseCtor, options);
					fakes.push(fake);
					return fake.instance;
				}
			} as Partial<ITerminalService>);
		});

		function createSnapshotMirror(output: { text: string; truncated?: boolean; lineCount?: number } | undefined): DetachedTerminalSnapshotMirror {
			return store.add(instantiationService.createInstance(DetachedTerminalSnapshotMirror, output, () => undefined));
		}

		test('resizes the detached terminal to cols computed from the width', async () => {
			const mirror = createSnapshotMirror({ text: 'hello' });
			await mirror.layout(1224); // floor((1224 - 20) / 10) = 120 cols
			strictEqual(fakes.length, 1);
			strictEqual(fakes[0].raw.cols, 120);
		});

		test('first render after layout wraps at the new cols', async () => {
			const mirror = createSnapshotMirror({ text: 'x'.repeat(100) });
			await mirror.layout(1224);
			await mirror.render();
			deepStrictEqual({
				cols: fakes[0].raw.cols,
				lineCount: computeSnapshotLineCount(fakes[0].raw.buffer.active),
				maxColumnWidth: computeMaxBufferColumnWidth(fakes[0].raw.buffer.active, fakes[0].raw.cols),
			}, {
				cols: 120,
				lineCount: 1,
				maxColumnWidth: 100,
			});
		});

		test('re-wraps already rendered output at the new cols without rewriting', async () => {
			const mirror = createSnapshotMirror({ text: 'x'.repeat(100) });
			await mirror.render();
			strictEqual(computeSnapshotLineCount(fakes[0].raw.buffer.active), 2);
			const writeCallsBeforeLayout = fakes[0].counters.writeCalls;
			await mirror.layout(1224);
			deepStrictEqual({
				cols: fakes[0].raw.cols,
				lineCount: computeSnapshotLineCount(fakes[0].raw.buffer.active),
				maxColumnWidth: computeMaxBufferColumnWidth(fakes[0].raw.buffer.active, fakes[0].raw.cols),
				// Re-wrapping must come from xterm's native resize reflow, not a buffer
				// rewrite, which would flash a cleared frame on every resize
				writeCalls: fakes[0].counters.writeCalls,
			}, {
				cols: 120,
				lineCount: 1,
				maxColumnWidth: 100,
				writeCalls: writeCallsBeforeLayout,
			});
		});

		test('repeated layout with the same width does not resize or rewrite', async () => {
			const mirror = createSnapshotMirror({ text: 'x'.repeat(100) });
			await mirror.render();
			await mirror.layout(1224);
			const { resizeCalls, writeCalls } = { ...fakes[0].counters };
			await mirror.layout(1224);
			deepStrictEqual(fakes[0].counters, { resizeCalls, writeCalls });
		});

		test('ignores non-positive widths', async () => {
			const mirror = createSnapshotMirror({ text: 'hello' });
			await mirror.layout(0);
			await mirror.layout(-10);
			strictEqual(fakes[0].raw.cols, 80);
		});

		test('drops a persisted lineCount that reflects the old wrap width', async () => {
			// Producers persist lineCount wrapped at the source terminal's cols; after a
			// width layout the rendered row count is the ground truth for the box height
			const mirror = createSnapshotMirror({ text: 'x'.repeat(100), lineCount: 2 });
			await mirror.layout(1224);
			const result = await mirror.render();
			strictEqual(result?.lineCount, 1);
		});

		test('keeps an explicit lineCount for truncated output', async () => {
			// Truncated snapshots under-represent the real output, so the persisted count wins
			const mirror = createSnapshotMirror({ text: 'short', truncated: true, lineCount: 42 });
			const result = await mirror.render();
			strictEqual(result?.lineCount, 42);
		});

		test('keeps a truncated snapshot height across layout', async () => {
			const mirror = createSnapshotMirror({ text: 'x'.repeat(100), truncated: true, lineCount: 42 });
			const first = await mirror.render();
			const laidOut = await mirror.layout(1224);
			const cached = await mirror.render();
			deepStrictEqual({
				first: first?.lineCount,
				laidOut: laidOut?.lineCount,
				cached: cached?.lineCount,
			}, {
				first: 42,
				laidOut: 42,
				cached: 42,
			});
		});

		test('measures horizontal chrome from the attached element computed padding', async () => {
			const mirror = createSnapshotMirror({ text: 'hello' });
			const container = document.createElement('div');
			document.body.appendChild(container);
			try {
				fakes[0].raw.open(container);
				fakes[0].raw.element!.style.paddingLeft = '4px';
				fakes[0].raw.element!.style.paddingRight = '0px';
				await mirror.layout(1224);
				strictEqual(fakes[0].raw.cols, 122); // floor((1224 - 4) / 10)
			} finally {
				container.remove();
			}
		});
	});

	suite('DetachedTerminalCommandMirror.layout', () => {
		let instantiationService: TestInstantiationService;
		let XTermBaseCtor: typeof Terminal;
		let fakes: ReturnType<typeof createFakeDetachedTerminal>[];

		setup(async () => {
			const configurationService = new TestConfigurationService({
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
			fakes = [];
			instantiationService.stub(ITerminalService, {
				createDetachedTerminal: async (options: IDetachedXTermOptions) => {
					const fake = createFakeDetachedTerminal(XTermBaseCtor, options);
					fakes.push(fake);
					return fake.instance;
				}
			} as Partial<ITerminalService>);
		});

		async function createXterm(cols = 80, rows = 10): Promise<XtermTerminal> {
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

		function lineText(raw: Terminal, y: number): string {
			return raw.buffer.active.getLine(y)?.translateToString(true) ?? '';
		}

		/**
		 * Writes a finished command whose output is a single 100 character line, which soft-wraps
		 * onto two rows in the 80 column source terminal.
		 */
		async function createWrappedCommand(source: XtermTerminal): Promise<ITerminalCommand> {
			const executedMarker = source.raw.registerMarker(0)!;
			await write(source, 'x'.repeat(100) + '\r\n');
			const endMarker = source.raw.registerMarker(0)!;
			return { executedMarker, endMarker } as unknown as ITerminalCommand;
		}

		function createCommandMirror(source: XtermTerminal, command: ITerminalCommand): DetachedTerminalCommandMirror {
			return store.add(instantiationService.createInstance(DetachedTerminalCommandMirror, source, command));
		}

		test('resizes before any render without writing content', async () => {
			const source = await createXterm();
			const command = await createWrappedCommand(source);
			const mirror = createCommandMirror(source, command);
			await mirror.layout(1224); // floor((1224 - 20) / 10) = 120 cols
			deepStrictEqual({
				cols: fakes[0].raw.cols,
				writeCalls: fakes[0].counters.writeCalls,
			}, {
				cols: 120,
				writeCalls: 0,
			});
		});

		test('re-wraps rendered command output at the new cols without rewriting', async () => {
			const source = await createXterm();
			const command = await createWrappedCommand(source);
			const mirror = createCommandMirror(source, command);
			await mirror.renderCommand();
			deepStrictEqual({
				line0: lineText(fakes[0].raw, 0),
				line1: lineText(fakes[0].raw, 1),
			}, {
				line0: 'x'.repeat(80),
				line1: 'x'.repeat(20),
			});
			const writeCallsBeforeLayout = fakes[0].counters.writeCalls;
			const result = await mirror.layout(1224);
			deepStrictEqual({
				cols: fakes[0].raw.cols,
				line0: lineText(fakes[0].raw, 0),
				maxColumnWidth: computeMaxBufferColumnWidth(fakes[0].raw.buffer.active, fakes[0].raw.cols),
				// The reported line count must reflect the re-wrapped mirror rows, not the
				// source terminal's wrap at its own cols, so the box height matches
				lineCount: result?.lineCount,
				// Re-wrapping must come from xterm's native resize reflow, not a buffer
				// rewrite, which would flash a cleared frame on every resize
				writeCalls: fakes[0].counters.writeCalls,
			}, {
				cols: 120,
				line0: 'x'.repeat(100),
				maxColumnWidth: 100,
				lineCount: 1,
				writeCalls: writeCallsBeforeLayout,
			});
		});

		test('repeated layout with the same width does not resize or rewrite', async () => {
			const source = await createXterm();
			const command = await createWrappedCommand(source);
			const mirror = createCommandMirror(source, command);
			await mirror.renderCommand();
			await mirror.layout(1224);
			const { resizeCalls, writeCalls } = { ...fakes[0].counters };
			await mirror.layout(1224);
			deepStrictEqual(fakes[0].counters, { resizeCalls, writeCalls });
		});
	});

	suite('row height metrics', () => {
		let instantiationService: TestInstantiationService;
		let XTermBaseCtor: typeof Terminal;
		let fakes: ReturnType<typeof createFakeDetachedTerminal>[];
		let nextFont: ITerminalFont | undefined;

		setup(async () => {
			const configurationService = new TestConfigurationService({
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
			fakes = [];
			nextFont = undefined;
			instantiationService.stub(ITerminalService, {
				createDetachedTerminal: async (options: IDetachedXTermOptions) => {
					const fake = createFakeDetachedTerminal(XTermBaseCtor, options, nextFont);
					fakes.push(fake);
					return fake.instance;
				}
			} as Partial<ITerminalService>);
		});

		function createSnapshotMirror(output: { text: string } | undefined): DetachedTerminalSnapshotMirror {
			return store.add(instantiationService.createInstance(DetachedTerminalSnapshotMirror, output, () => undefined));
		}

		async function createLaidOutCommandMirror(): Promise<DetachedTerminalCommandMirror> {
			const capabilities = store.add(new TerminalCapabilityStore());
			const source = store.add(instantiationService.createInstance(XtermTerminal, undefined, XTermBaseCtor, {
				cols: 80,
				rows: 10,
				xtermColorProvider: { getBackgroundColor: () => undefined },
				capabilities,
				disableShellIntegrationReporting: true,
				xtermAddonImporter: new TestXtermAddonImporter(),
			}, undefined));
			const mirror = store.add(instantiationService.createInstance(DetachedTerminalCommandMirror, source, {} as ITerminalCommand));
			// layout creates the detached terminal without needing a rendered command
			await mirror.layout(1224);
			return mirror;
		}

		test('snapshot mirror reports the mirror cell height once the terminal exists', async () => {
			const mirror = createSnapshotMirror({ text: 'hello' });
			await mirror.render();
			// charHeight 14 × lineHeight 1 from the fake font
			strictEqual(mirror.getRowHeightPx(), 14);
		});

		test('snapshot mirror reports undefined before the detached terminal resolves', () => {
			const mirror = createSnapshotMirror({ text: 'hello' });
			strictEqual(mirror.getRowHeightPx(), undefined);
		});

		test('uses the exact fractional cell height without per-row rounding', async () => {
			// The DOM renderer paints each row at the exact css cell height; ceiling the
			// per-row value would accumulate across rows and slice the last row
			nextFont = { fontFamily: 'monospace', fontSize: 12, letterSpacing: 0, lineHeight: 1.1, charWidth: 10, charHeight: 14.4 };
			const mirror = createSnapshotMirror({ text: 'hello' });
			await mirror.render();
			strictEqual(mirror.getRowHeightPx(), 14.4 * 1.1);
		});

		test('command mirror reports the mirror cell height', async () => {
			const mirror = await createLaidOutCommandMirror();
			strictEqual(mirror.getRowHeightPx(), 14);
		});

		function createHost(): HTMLElement {
			const host = mainWindow.document.createElement('div');
			mainWindow.document.body.appendChild(host);
			store.add(toDisposable(() => host.remove()));
			return host;
		}

		function nextRender(raw: Terminal): Promise<void> {
			return new Promise<void>(resolve => {
				const listener = raw.onRender(() => {
					listener.dispose();
					resolve();
				});
			});
		}

		function write(raw: Terminal, data: string): Promise<void> {
			return new Promise<void>(resolve => raw.write(data, resolve));
		}

		test('snapshot mirror onDidChangeRowHeight fires once per metrics change, only after attach', async () => {
			nextFont = { fontFamily: 'monospace', fontSize: 12, letterSpacing: 0, lineHeight: 1, charWidth: 10, charHeight: 14 };
			const mirror = createSnapshotMirror({ text: 'hello' });
			let fires = 0;
			store.add(mirror.onDidChangeRowHeight(() => fires++));
			await mirror.render();
			strictEqual(fires, 0, 'rendering content alone must not fire before attach');

			const host = createHost();
			await mirror.attach(host);
			strictEqual(fires, 0, 'attach alone must not fire without a render');

			const raw = fakes[0].raw;
			let rendered = nextRender(raw);
			raw.open(host);
			await rendered;
			strictEqual(fires, 1, 'the first real render announces the metrics');

			rendered = nextRender(raw);
			await write(raw, 'more');
			await rendered;
			strictEqual(fires, 1, 'renders with unchanged metrics must not re-fire');

			nextFont.charHeight = 21;
			rendered = nextRender(raw);
			await write(raw, '!');
			await rendered;
			strictEqual(fires, 2, 'a metrics change fires exactly once more');
		});

		test('command mirror onDidChangeRowHeight fires once per metrics change, only after attach', async () => {
			nextFont = { fontFamily: 'monospace', fontSize: 12, letterSpacing: 0, lineHeight: 1, charWidth: 10, charHeight: 14 };
			const mirror = await createLaidOutCommandMirror();
			let fires = 0;
			store.add(mirror.onDidChangeRowHeight(() => fires++));

			const host = createHost();
			const raw = fakes[0].raw;
			let rendered = nextRender(raw);
			raw.open(host);
			await rendered;
			strictEqual(fires, 0, 'renders before attach must not fire');

			await mirror.attach(host);
			rendered = nextRender(raw);
			await write(raw, 'output');
			await rendered;
			strictEqual(fires, 1, 'the first render after attach announces the metrics');

			rendered = nextRender(raw);
			await write(raw, 'more');
			await rendered;
			strictEqual(fires, 1, 'renders with unchanged metrics must not re-fire');

			nextFont.charHeight = 21;
			rendered = nextRender(raw);
			await write(raw, '!');
			await rendered;
			strictEqual(fires, 2, 'a metrics change fires exactly once more');
		});
	});
});
