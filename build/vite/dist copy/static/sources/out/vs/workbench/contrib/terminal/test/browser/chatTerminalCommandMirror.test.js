/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEqual } from 'assert';
import { importAMDNodeModule } from '../../../../../amdX.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TerminalCapabilityStore } from '../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { XtermTerminal } from '../../browser/xterm/xtermTerminal.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestXtermAddonImporter } from './xterm/xtermTestUtils.js';
import { computeMaxBufferColumnWidth, vtBoundaryMatches } from '../../browser/chatTerminalCommandMirror.js';
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
        let instantiationService;
        let configurationService;
        let XTermBaseCtor;
        async function createXterm(cols = 80, rows = 10, scrollback = 10) {
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
        function write(xterm, data) {
            return new Promise(resolve => xterm.write(data, resolve));
        }
        function getBufferText(xterm) {
            const buffer = xterm.raw.buffer.active;
            const lines = [];
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
        async function mirrorViaVT(source, startLine = 0) {
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
                },
                files: {},
                terminal: {
                    integrated: defaultTerminalConfig
                },
            });
            instantiationService = workbenchInstantiationService({
                configurationService: () => configurationService
            }, store);
            XTermBaseCtor = (await importAMDNodeModule('@xterm/xterm', 'lib/xterm.js')).Terminal;
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
            const startMarker = source.raw.registerMarker(0);
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
            const startMarker = source.raw.registerMarker(0);
            startMarker.dispose();
            const vt = await source.getRangeAsVT(startMarker, undefined, true);
            strictEqual(typeof vt, 'string');
        });
        test('incremental mirroring appends correctly', async () => {
            const source = await createXterm();
            const marker = source.raw.registerMarker(0);
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
            const marker = source.raw.registerMarker(0);
            // Build up content incrementally, simulating streaming output
            const writes = [];
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
            strictEqual(totalWritten < fullRewriteWouldBe, true, `Append path should write less (${totalWritten}) than full rewrites would (${fullRewriteWouldBe})`);
        });
    });
    suite('computeMaxBufferColumnWidth', () => {
        /**
         * Creates a mock buffer with the given lines.
         * Each string represents a line; characters are cells, spaces are empty cells.
         */
        function createMockBuffer(lines, cols = 80) {
            return {
                length: lines.length,
                getLine(y) {
                    if (y < 0 || y >= lines.length) {
                        return undefined;
                    }
                    const lineContent = lines[y];
                    return {
                        length: Math.max(lineContent.length, cols),
                        getCell(x) {
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
                'a', // width 1
                '  b', // content at col 2, but width is 3
                '    c', // content at col 4, but width is 5
                '      d' // content at col 6, width is 7
            ]);
            strictEqual(computeMaxBufferColumnWidth(buffer, 80), 7);
        });
        test('handles buffer with undefined lines gracefully', () => {
            const buffer = {
                length: 3,
                getLine(y) {
                    if (y === 1) {
                        return undefined;
                    }
                    return {
                        length: 5,
                        getCell(x) {
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
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRlcm1pbmFsQ29tbWFuZE1pcnJvci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvdGVzdC9icm93c2VyL2NoYXRUZXJtaW5hbENvbW1hbmRNaXJyb3IudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQ3JDLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQzdELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5HLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBRXpILE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGlGQUFpRixDQUFDO0FBQzFILE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNsRyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNuRSxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUU1RyxNQUFNLHFCQUFxQixHQUFHO0lBQzdCLFVBQVUsRUFBRSxXQUFXO0lBQ3ZCLFVBQVUsRUFBRSxRQUFRO0lBQ3BCLGNBQWMsRUFBRSxRQUFRO0lBQ3hCLGVBQWUsRUFBRSxLQUFLO0lBQ3RCLFVBQVUsRUFBRSxFQUFFO0lBQ2QscUJBQXFCLEVBQUUsQ0FBQztJQUN4QiwyQkFBMkIsRUFBRSxDQUFDO0lBQzlCLGNBQWMsRUFBRSxHQUFHO0NBQ25CLENBQUM7QUFFRixLQUFLLENBQUMsdUNBQXVDLEVBQUUsR0FBRyxFQUFFO0lBQ25ELE1B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