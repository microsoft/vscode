/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { decodeBase64, encodeBase64, VSBuffer } from 'vs/base/common/buffer';
import { Emitter } from 'vs/base/common/event';
import { mockObject, MockObject } from 'vs/base/test/common/mock';
import { MemoryRangeType } from 'vs/workbench/contrib/debug/common/debug';
import { MemoryRegion } from 'vs/workbench/contrib/debug/common/debugModel';
import { MockSession } from 'vs/workbench/contrib/debug/test/browser/mockDebug';

suite('Debug - Memory', () => {
	const dapResponseCommon = {
		command: 'someCommand',
		type: 'response',
		seq: 1,
		request_seq: 1,
		success: true,
	};

	suite('MemoryRegion', () => {
		let memory: VSBuffer;
		let unreadable: number;
		let invalidateMemoryEmitter: Emitter<DebugProtocol.MemoryEvent>;
		let session: MockObject<MockSession, 'onDidInvalidateMemory'>;
		let region: TestMemoryRegion;

		class TestMemoryRegion extends MemoryRegion {
			public assertNoOverlaps() {
				for (const range of this.ranges) {
					if (this.ranges.some(r => r !== range && r.toOffset > range.fromOffset && r.fromOffset < range.toOffset)) {
						throw new Error(`Discovered overlapping ranges`);
					}
				}
			}
		}

		setup(() => {
			const memoryBuf = new Uint8Array(1024);
			for (let i = 0; i < memoryBuf.length; i++) {
				memoryBuf[i] = i; // will be 0-255
			}
			memory = VSBuffer.wrap(memoryBuf);
			invalidateMemoryEmitter = new Emitter();
			unreadable = 0;

			session = mockObject<MockSession>()({
				onDidInvalidateMemory: invalidateMemoryEmitter.event
			});

			session.readMemory.callsFake((ref: string, fromOffset: number, count: number) => {
				const res: DebugProtocol.ReadMemoryResponse = ({
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

			session.writeMemory.callsFake((ref: string, fromOffset: number, data: string): DebugProtocol.WriteMemoryResponse => {
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

			region = new TestMemoryRegion('ref', session as any);
		});

		teardown(() => {
			region.assertNoOverlaps();
			region.dispose();
		});

		test('reads a simple range', async () => {
			assert.deepStrictEqual(await region.read(10, 14), [
				{ type: MemoryRangeType.Valid, offset: 10, length: 4, data: VSBuffer.wrap(new Uint8Array([10, 11, 12, 13])) }
			]);
		});

		test('reads an end-overlapping range', async () => {
			await region.read(10, 14);
			assert.deepStrictEqual(await region.read(12, 16), [
				{ type: MemoryRangeType.Valid, offset: 10, length: 4, data: VSBuffer.wrap(new Uint8Array([10, 11, 12, 13])) },
				{ type: MemoryRangeType.Valid, offset: 14, length: 2, data: VSBuffer.wrap(new Uint8Array([14, 15])) },
			]);
		});

		test('reads an start-overlapping range', async () => {
			await region.read(10, 14);
			assert.deepStrictEqual(await region.read(8, 12), [
				{ type: MemoryRangeType.Valid, offset: 8, length: 2, data: VSBuffer.wrap(new Uint8Array([8, 9])) },
				{ type: MemoryRangeType.Valid, offset: 10, length: 4, data: VSBuffer.wrap(new Uint8Array([10, 11, 12, 13])) },
			]);
		});

		test('reads an entirely-overlapping range', async () => {
			await region.read(10, 14);
			assert.deepStrictEqual(await region.read(8, 16), [
				{ type: MemoryRangeType.Valid, offset: 8, length: 2, data: VSBuffer.wrap(new Uint8Array([8, 9])) },
				{ type: MemoryRangeType.Valid, offset: 10, length: 4, data: VSBuffer.wrap(new Uint8Array([10, 11, 12, 13])) },
				{ type: MemoryRangeType.Valid, offset: 14, length: 2, data: VSBuffer.wrap(new Uint8Array([14, 15])) },
			]);
		});

		test('reads an entirely-inset range', async () => {
			await region.read(10, 14);
			assert.deepStrictEqual(await region.read(11, 13), [
				{ type: MemoryRangeType.Valid, offset: 10, length: 4, data: VSBuffer.wrap(new Uint8Array([10, 11, 12, 13])) }
			]);
		});

		test('reads a non-contiguous range', async () => {
			unreadable = 3;
			assert.deepStrictEqual(await region.read(10, 14), [
				{ type: MemoryRangeType.Valid, offset: 10, length: 1, data: VSBuffer.wrap(new Uint8Array([10])) },
				{ type: MemoryRangeType.Unreadable, offset: 11, length: 3 },
			]);

			assert.deepStrictEqual(await region.read(10, 16), [
				{ type: MemoryRangeType.Valid, offset: 10, length: 1, data: VSBuffer.wrap(new Uint8Array([10])) },
				{ type: MemoryRangeType.Unreadable, offset: 11, length: 3 },
				{ type: MemoryRangeType.Valid, offset: 14, length: 2, data: VSBuffer.wrap(new Uint8Array([14, 15])) },
			]);
		});

		test('writes memory when overlapping', async () => {
			await region.read(10, 14);
			await region.read(8, 10);
			await region.read(15, 18);

			const readCalls = session.readMemory.callCount;
			await region.write(12, VSBuffer.wrap(new Uint8Array([22, 23, 24, 25])));

			assert.deepStrictEqual(await region.read(8, 18), [
				{ type: MemoryRangeType.Valid, offset: 8, length: 2, data: VSBuffer.wrap(new Uint8Array([8, 9])) },
				{ type: MemoryRangeType.Valid, offset: 10, length: 8, data: VSBuffer.wrap(new Uint8Array([10, 11, 22, 23, 24, 25, 16, 17])) },
			]);
			assert.strictEqual(session.readMemory.callCount, readCalls + 1);
		});

		test('writes memory when inset', async () => {
			await region.read(10, 14);
			await region.read(8, 10);
			await region.read(14, 18);

			await region.write(12, VSBuffer.wrap(new Uint8Array([22])));

			const readCalls = session.readMemory.callCount;
			assert.deepStrictEqual(await region.read(8, 18), [
				{ type: MemoryRangeType.Valid, offset: 8, length: 2, data: VSBuffer.wrap(new Uint8Array([8, 9])) },
				{ type: MemoryRangeType.Valid, offset: 10, length: 4, data: VSBuffer.wrap(new Uint8Array([10, 11, 22, 13])) },
				{ type: MemoryRangeType.Valid, offset: 14, length: 4, data: VSBuffer.wrap(new Uint8Array([14, 15, 16, 17])) },
			]);
			assert.strictEqual(session.readMemory.callCount, readCalls + 1);
		});

		test('writes memory when exact', async () => {
			await region.read(10, 14);
			await region.read(8, 10);
			await region.read(14, 18);

			await region.write(10, VSBuffer.wrap(new Uint8Array([20, 21, 22, 23])));

			const readCalls = session.readMemory.callCount;
			assert.deepStrictEqual(await region.read(8, 18), [
				{ type: MemoryRangeType.Valid, offset: 8, length: 2, data: VSBuffer.wrap(new Uint8Array([8, 9])) },
				{ type: MemoryRangeType.Valid, offset: 10, length: 4, data: VSBuffer.wrap(new Uint8Array([20, 21, 22, 23])) },
				{ type: MemoryRangeType.Valid, offset: 14, length: 4, data: VSBuffer.wrap(new Uint8Array([14, 15, 16, 17])) },
			]);
			assert.strictEqual(session.readMemory.callCount, readCalls + 1);
		});
	});
});
