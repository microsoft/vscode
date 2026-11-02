/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { disassemblyNotAvailable, IDisassembledInstructionEntry, shouldReloadDisassembly } from '../../browser/disassemblyView.js';

suite('Debug - DisassemblyView', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('shouldReloadDisassembly', () => {
		function createEntry(instructionReference: string, address: bigint, instructionOffset = 0): IDisassembledInstructionEntry {
			return {
				allowBreakpoint: true,
				isBreakpointSet: false,
				isBreakpointEnabled: false,
				instructionReference,
				instructionReferenceOffset: 0,
				instructionOffset,
				address,
				instruction: {
					address: `0x${address.toString(16)}`,
					instruction: 'nop'
				},
			};
		}

		test('reloads when the instruction reference targets a different memory region (#291640)', () => {
			// e.g. a multi-process session where each process has its own
			// address space: the currently loaded instructions belong to
			// another region, so they must not be spliced next to the new ones.
			const loadedFromOtherRegion = createEntry('process1!0x1000', 0x1000n);
			assert.strictEqual(shouldReloadDisassembly(loadedFromOtherRegion, 'process2!0x1000'), true);
		});

		test('reloads when stepping between frames with different instruction references (#291642)', () => {
			// gdb hands out a different (opaque) instructionReference for every
			// stack frame. Instructions loaded for the previous frame's
			// reference are still cached in the view; navigating to the new
			// frame's reference must trigger a full reload instead of reusing
			// them, even if the underlying bytes overlap.
			const cachedFromPreviousFrame = createEntry('frame-1-ref', 0x4000n);
			assert.strictEqual(shouldReloadDisassembly(cachedFromPreviousFrame, 'frame-2-ref'), true);
		});

		test('does not reload when the instruction reference is unchanged', () => {
			const entry = createEntry('frame-1-ref', 0x4000n);
			assert.strictEqual(shouldReloadDisassembly(entry, 'frame-1-ref'), false);
		});

		test('does not reload when nothing was loaded yet', () => {
			assert.strictEqual(shouldReloadDisassembly(undefined, 'frame-1-ref'), false);
			assert.strictEqual(shouldReloadDisassembly(disassemblyNotAvailable, 'frame-1-ref'), false);
		});
	});
});
