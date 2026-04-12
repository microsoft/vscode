/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../base/common/event.js';
import { mockObject } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MemoryRegion } from '../../common/debugModel.js';
suite('Debug - Memory', () => {
    const dapResponseCommon = {
        command: 'someCommand',
        type: 'response',
        seq: 1,
        request_seq: 1,
        success: true,
    };
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('MemoryRegion', () => {
        let memory;
        let unreadable;
        let invalidateMemoryEmitter;
        let session;
        let region;
        setup(() => {
            const memoryBuf = new Uint8Array(1024);
            for (let i = 0; i < memoryBuf.length; i++) {
                memoryBuf[i] = i; // will be 0-255
            }
            memory = VSBuffer.wrap(memoryBuf);
            invalidateMemoryEmitter = new Emitter();
            unreadable = 0;
            session = mockObject()({
                onDidInvalidateMemory: invalidateMemoryEmitter.event
            });
            session.readMemory.callsFake((ref, fromOffset, count) => {
                const res = ({
                    ...dapResponseCommon,
                    body: {
                        address: '0',
                        data: encodeBase64(memory.slice(fromOffset, fromOffset + Math.max(0, count - unreadable))),
                        unreadableBytes: unreadable
                    }
                });
                unreadable = 0;
                return Promise.resolve(res);
            });
            session.writeMemory.callsFake((ref, fromOffset, data) => {
                const decoded = decodeBase64(data);
                for (let i = 0; i < decoded.byteLength; i++) {
                    memory.buffer[fromOffset + i] = decoded.buffer[i];
                }
                return ({
                    ...dapResponseCommon,
                    body: {
                        bytesWritten: decoded.byteLength,
                        offset: fromOffset,
                    }
                });
            });
            // eslint-disable-next-line local/code-no-any-casts
            region = new MemoryRegion('ref', session);
        });
        teardown(() => {
            region.dispose();
        });
        test('reads a simple range', async () => {
            assert.deepStrictEqual(await region.read(10, 14), [
                { type: 0 /* MemoryRangeType.Valid */, offset: 10, length: 4, data: VSBuffer.wrap(new Uint8Array([10, 11, 12, 13])) }
            ]);
        });
        test('reads a non-contiguous range', async () => {
            unreadable = 3;
            assert.deepStrictEqual(await region.read(10, 14), [
                { type: 0 /* MemoryRangeType.Valid */, offset: 10, length: 1, data: VSBuffer.wrap(new Uint8Array([10])) },
                { type: 1 /* MemoryRangeType.Unreadable */, offset: 11, length: 3 },
            ]);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdNZW1vcnkudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL3Rlc3QvYnJvd3Nlci9kZWJ1Z01lbW9yeS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsWUFBWSxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM1RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBYyxNQUFNLHlDQUF5QyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5HLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUcxRCxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFO0lBQzVCLE1BQU0saUJBQWlCLEdBQUc7UUFDekIsT0FBTyxFQUFFLGFBQWE7UUFDdEIsSUFBSSxFQUFFLFVBQVU7UUFDaEIsR0FBRyxFQUFFLENBQUM7UUFDTixXQUFXLEVBQUUsQ0FBQztRQUNkLE9BQU8sRUFBRSxJQUFJO0tBQ2IsQ0FBQztJQUVGLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsS0FBSyxDQUFDLGNBQWMsRUFBRSxHQUFHLEVBQUU7UUFDMUIsSUFBSSxNQUFnQixDQUFDO1FBQ3JCLElBQUksVUFBa0IsQ0FBQztRQUN2QixJQUFJLHVCQUEyRCxDQUFDO1FBQ2hFLElBQUksT0FBeUQsQ0FBQztRQUM5RCxJQUFJLE1BQW9CLENBQUM7UUFFekIsS0FBSyxDQUFDLEdBQUcsRUFBRTtZQUNWLE1BQU0sU0FBUyxHQUFHLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3ZD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