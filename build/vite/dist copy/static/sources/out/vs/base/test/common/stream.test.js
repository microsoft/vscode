/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { timeout } from '../../common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { bufferToReadable, VSBuffer } from '../../common/buffer.js';
import { CancellationTokenSource } from '../../common/cancellation.js';
import { consumeReadable, consumeStream, isReadable, isReadableBufferedStream, isReadableStream, listenStream, newWriteableStream, peekReadable, peekStream, prefixedReadable, prefixedStream, toReadable, toStream, transform } from '../../common/stream.js';
suite('Stream', () => {
    test('isReadable', () => {
        assert.ok(!isReadable(undefined));
        assert.ok(!isReadable(Object.create(null)));
        assert.ok(isReadable(bufferToReadable(VSBuffer.fromString(''))));
    });
    test('isReadableStream', () => {
        assert.ok(!isReadableStream(undefined));
        assert.ok(!isReadableStream(Object.create(null)));
        assert.ok(isReadableStream(newWriteableStream(d => d)));
    });
    test('isReadableBufferedStream', async () => {
        assert.ok(!isReadableBufferedStream(Object.create(null)));
        const stream = newWriteableStream(d => d);
        stream.end();
        const bufferedStream = await peekStream(stream, 1);
        assert.ok(isReadableBufferedStream(bufferedStream));
    });
    test('WriteableStream - basics', () => {
        const stream = newWriteableStream(strings => strings.join());
        let error = false;
        stream.on('error', e => {
            error = true;
        });
        let end = false;
        stream.on('end', () => {
            end = true;
        });
        stream.write('Hello');
        const chunks = [];
        stream.on('data', data => {
            chunks.push(data);
        });
        assert.strictEqual(chunks[0], 'Hello');
        stream.write('World');
        assert.strictEqual(chunks[1], 'World');
        assert.strictEqual(error, false);
        assert.strictEqual(end, false);
        stream.pause();
        stream.write('1');
        stream.write('2');
        stream.write('3');
        assert.strictEqual(chunks.length, 2);
        stream.resume();
        assert.strictEqual(chunks.length, 3);
        assert.strictEqual(chunks[2], '1,2,3');
        stream.error(new Error());
        assert.strictEqual(error, true);
        error = false;
        stream.error(new Error());
        assert.strictEqual(error, true);
        stream.end('Final Bit');
        assert.strictEqual(chunks.length, 4);
        assert.strictEqual(chunks[3], 'Final Bit');
        assert.strictEqual(end, true);
        stream.destroy();
        stream.write('Unexpected');
        assert.strictEqual(chunks.length, 4);
    });
    test('stream with non-reducible messages', () => {
        /**
         * A complex object that cannot be reduced to a single object.
         */
        class TestMessage {
            constructor(value) {
                this.value = value;
            }
        }
        const stream = newWriteableStream(null);
        let error = false;
        stream.on('error', e => {
            error = true;
        });
        let end = false;
        stream.on('end', () => {
            end = true;
        });
        stream.write(new TestMessage('Hello'));
        const chunks = [];
        stream.on('data', data => {
            chunks.push(data);
        });
        assert(chunks[0] instanceof TestMessage, 'Message `0` must be an instance of `TestMessage`.');
        assert.strictEqual(chunks[0].value, 'Hello');
        stream.write(new TestMessage('World'));
        assert(chunks[1] instanceof TestMessage, 'Message `1` must be an instance of `TestMessage`.');
        assert.strictEqual(chunks[1].value, 'World');
        assert.strictEqual(error, false);
        assert.strictEqual(end, false);
        stream.pause();
        stream.write(new TestMessage('1'));
        stream.write(new TestMessage('2'));
        stream.write(new TestMessage('3'));
        assert.strictEqual(chunks.length, 2);
        stream.resume();
        assert.strictEqual(chunks.length, 5);
        assert(chunks[2] instanceof TestMessage, 'Message `2` must be an instance of `TestMessage`.');
        assert.strictEqual(chunks[2].value, '1');
        assert(chunks[3] instanceof TestMessage, 'Message `3` must be an instance of `TestMessage`.');
        assert.strictEqual(chunks[3].value, '2');
        assert(chunks[4] instanceof TestMessage, 'Message `4` must be an instance of `TestMessage`.');
        assert.strictEqual(chunks[4].value, '3');
        stream.error(new Error());
        assert.strictEqual(error, true);
        error = false;
        stream.error(new Error());
        assert.strictEqual(error, true);
        stream.end(new TestMessage('Final Bit'));
        assert.strictEqual(chunks.length, 6);
        assert(chunks[5] instanceof TestMessage, 'Message `5` must be an instance of `TestMessage`.');
        assert.strictEqual(chunks[5].value, 'Final Bit');
        assert.strictEqual(end, true);
        stream.destroy();
        stream.write(new TestMessage('Unexpected'));
        assert.strictEqual(chunks.length, 6);
    });
    test('WriteableStream - end with empty string works', async () => {
        const reducer = (strings) => strings.length > 0 ? strings.join() : 'error';
        const stream = newWriteableStream(reducer);
        stream.end('');
        const result = await consumeStream(stream, reducer);
        assert.strictEqual(result, '');
    });
    test('WriteableStream - end with error works', async () => {
        const reducer = (errors) => errors[0];
        const stream = newWriteableStream(reducer);
        stream.end(new Error('error'));
        const result = await consumeStream(stream, reducer);
        assert.ok(result instanceof Error);
    });
    test('WriteableStream - removeListener', () => {
        const stream = newWriteableStream(strings => strings.join());
        let error = false;
        const errorListener = (e) => {
            error = true;
        };
        stream.on('error', errorListener);
        let data = false;
        const dataListener = () => {
            data = true;
        };
        stream.on('data', dataListener);
        stream.write('Hello');
        assert.strictEqual(data, true);
        data = false;
        stream.removeListener('data', dataListener);
        stream.write('World');
        assert.strictEqual(data, false);
        stream.error(new Error());
        assert.strictEqual(error, true);
        error = false;
        stream.removeListener('error', errorListener);
        // always leave at least one error listener to streams to avoid unexpected errors during test running
        stream.on('error', () => { });
        stream.error(new Error());
        assert.strictEqual(error, false);
    });
    test('WriteableStream - highWaterMark', async () => {
        const stream = newWriteableStream(strings => strings.join(), { highWaterMark: 3 });
        let res = stream.write('1');
        assert.ok(!res);
        res = stream.write('2');
        assert.ok(!res);
        res = stream.write('3');
        assert.ok(!res);
        const promise1 = stream.write('4');
        assert.ok(promise1 instanceof Promise);
        const promise2 = stream.write('5');
        assert.ok(promise2 instanceof Promise);
        let drained1 = false;
        (async () => {
            await promise1;
            drained1 = true;
        })();
        let drained2 = false;
        (async () => {
            await promise2;
            drained2 = true;
        })();
        let data = undefined;
        stream.on('data', chunk => {
            data = chunk;
        });
        assert.ok(data);
        await timeout(0);
        assert.strictEqual(drained1, true);
        assert.strictEqual(drained2, true);
    });
    test('consumeReadable', () => {
        const readable = arrayToReadable(['1', '2', '3', '4', '5']);
        const consumed = consumeReadable(readable, strings => strings.join());
        assert.strictEqual(consumed, '1,2,3,4,5');
    });
    test('peekReadable', () => {
        for (let i = 0; i < 5; i++) {
            const readable = arrayToReadable(['1', '2', '3', '4', '5']);
            const consumedOrReadable = peekReadable(readable, strings => strings.join(), i);
            if (typeof consumedOrReadable === 'string') {
                assert.fail('Unexpected result');
            }
            else {
                const consumed = consumeReadable(consumedOrReadable, strings => strings.join());
                assert.strictEqual(consumed, '1,2,3,4,5');
            }
        }
        let readable = arrayToReadable(['1', '2', '3', '4', '5']);
        let consumedOrReadable = peekReadable(readable, strings => strings.join(), 5);
        assert.strictEqual(consumedOrReadable, '1,2,3,4,5');
        readable = arrayToReadable(['1', '2', '3', '4', '5']);
        consumedOrReadable = peekReadable(readable, strings => strings.join(), 6);
        assert.strictEqual(consumedOrReadable, '1,2,3,4,5');
    });
    test('peekReadable - error handling', async () => {
        // 0 Chunks
        let stream = newWriteableStream(data => data);
        let error = undefined;
        let promise = (async () => {
            try {
                await peekStream(stream, 1);
            }
            catch (err) {
                error = err;
            }
        })();
        stream.error(new Error());
        await promise;
        assert.ok(error);
        // 1 Chunk
        stream = newWriteableStream(data => data);
        error = undefined;
        promise = (async () => {
            try {
                await peekStream(stream, 1);
            }
            catch (err) {
                error = err;
            }
        })();
        stream.write('foo');
        stream.error(new Error());
        await promise;
        assert.ok(error);
        // 2 Chunks
        stream = newWriteableStream(data => data);
        error = undefined;
        promise = (async () => {
            try {
                await peekStream(stream, 1);
            }
            catch (err) {
                error = err;
            }
        })();
        stream.write('foo');
        stream.write('bar');
        stream.error(new Error());
        await promise;
        assert.ok(!error);
        stream.on('error', err => error = err);
        stream.on('data', chunk => { });
        assert.ok(error);
    });
    function arrayToReadable(array) {
        return {
            read: () => array.shift() || null
        };
    }
    function readableToStream(readable) {
        const stream = newWriteableStream(strings => strings.join());
        // Simulate async behavior
        setTimeout(() => {
            let chunk = null;
            while ((chunk = readable.read()) !== null) {
                stream.write(chunk);
            }
            stream.end();
        }, 0);
        return stream;
    }
    test('consumeStream', async () => {
        const stream = readableToStream(arrayToReadable(['1', '2', '3', '4', '5']));
        const consumed = await consumeStream(stream, strings => strings.join());
        assert.strictEqual(consumed, '1,2,3,4,5');
    });
    test('consumeStream - without reducer', async () => {
        const stream = readableToStream(arrayToReadable(['1', '2', '3', '4', '5']));
        const consumed = await consumeStream(stream);
        assert.strictEqual(consumed, undefined);
    });
    test('consumeStream - without reducer and error', async () => {
        const stream = newWriteableStream(strings => strings.join());
        stream.error(new Error());
        const consumed = await consumeStream(stream);
        assert.strictEqual(consumed, undefined);
    });
    test('listenStream', () => {
        const stream = newWriteableStream(strings => strings.join());
        let error = false;
        let end = false;
        let data = '';
        listenStream(stream, {
            onData: d => {
                data = d;
            },
            onError: e => {
                error = true;
            },
            onEnd: () => {
                end = true;
            }
        });
        stream.write('Hello');
        assert.strictEqual(data, 'Hello');
        stream.write('World');
        assert.strictEqual(data, 'World');
        assert.strictEqual(error, false);
        assert.strictEqual(end, false);
        stream.error(new Error());
        assert.strictEqual(error, true);
        stream.end('Final Bit');
        assert.strictEqual(end, true);
    });
    test('listenStream - cancellation', () => {
        const stream = newWriteableStream(strings => strings.join());
        let error = false;
        let end = false;
        let data = '';
        const cts = new CancellationTokenSource();
        listenStream(stream, {
            onData: d => {
                data = d;
            },
            onError: e => {
                error = true;
            },
            onEnd: () => {
                end = true;
            }
        }, cts.token);
        cts.cancel();
        stream.write('Hello');
        assert.strictEqual(data, '');
        stream.write('World');
        assert.strictEqual(data, '');
        stream.error(new Error());
        assert.strictEqual(error, false);
        stream.end('Final Bit');
        assert.strictEqual(end, false);
    });
    test('peekStream', async () => {
        for (let i = 0; i < 5; i++) {
            const stream = readableToStream(arrayToReadable(['1', '2', '3', '4', '5']));
            const result = await peekStream(stream, i);
            assert.strictEqual(stream, result.stream);
            if (result.ended) {
                assert.fail('Unexpected result, stream should not have ended yet');
            }
            else {
                assert.strictEqual(result.buffer.length, i + 1, `maxChunks: ${i}`);
                const additionalResult = [];
                await consumeStream(stream, strings => {
                    additionalResult.push(...strings);
                    return strings.join();
                });
                assert.strictEqual([...result.buffer, ...additionalResult].join(), '1,2,3,4,5');
            }
        }
        let stream = readableToStream(arrayToReadable(['1', '2', '3', '4', '5']));
        let result = await peekStream(stream, 5);
        assert.strictEqual(stream, result.stream);
        assert.strictEqual(result.buffer.join(), '1,2,3,4,5');
        assert.strictEqual(result.ended, true);
        stream = readableToStream(arrayToReadable(['1', '2', '3', '4', '5']));
        result = await peekStream(stream, 6);
        assert.strictEqual(stream, result.stream);
        assert.strictEqual(result.buffer.join(), '1,2,3,4,5');
        assert.strictEqual(result.ended, true);
    });
    test('toStream', async () => {
        const stream = toStream('1,2,3,4,5', strings => strings.join());
        const consumed = await consumeStream(stream, strings => strings.join());
        assert.strictEqual(consumed, '1,2,3,4,5');
    });
    test('toReadable', async () => {
        const readable = toReadable('1,2,3,4,5');
        const consumed = consumeReadable(readable, strings => strings.join());
        assert.strictEqual(consumed, '1,2,3,4,5');
    });
    test('transform', async () => {
        const source = newWriteableStream(strings => strings.join());
        const result = transform(source, { data: string => string + string }, strings => strings.join());
        // Simulate async behavior
        setTimeout(() => {
            source.write('1');
            source.write('2');
            source.write('3');
            source.write('4');
            source.end('5');
        }, 0);
        const consumed = await consumeStream(result, strings => strings.join());
        assert.strictEqual(consumed, '11,22,33,44,55');
    });
    test('events are delivered even if a listener is removed during delivery', () => {
        const stream = newWriteableStream(strings => strings.join());
        let listener1Called = false;
        let listener2Called = false;
        const listener1 = () => { stream.removeListener('end', listener1); listener1Called = true; };
        const listener2 = () => { listener2Called = true; };
        stream.on('end', listener1);
        stream.on('end', listener2);
        stream.on('data', () => { });
        stream.end('');
        assert.strictEqual(listener1Called, true);
        assert.strictEqual(listener2Called, true);
    });
    test('prefixedReadable', () => {
        // Basic
        let readable = prefixedReadable('1,2', arrayToReadable(['3', '4', '5']), val => val.join(','));
        assert.strictEqual(consumeReadable(readable, val => val.join(',')), '1,2,3,4,5');
        // Empty
        readable = prefixedReadable('empty', arrayToReadable([]), val => val.join(','));
        assert.strictEqual(consumeReadable(readable, val => val.join(',')), 'empty');
    });
    test('prefixedStream', async () => {
        // Basic
        let stream = newWriteableStream(strings => strings.join());
        stream.write('3');
        stream.write('4');
        stream.write('5');
        stream.end();
        let prefixStream = prefixedStream('1,2', stream, val => val.join(','));
        assert.strictEqual(await consumeStream(prefixStream, val => val.join(',')), '1,2,3,4,5');
        // Empty
        stream = newWriteableStream(strings => strings.join());
        stream.end();
        prefixStream = prefixedStream('1,2', stream, val => val.join(','));
        assert.strictEqual(await consumeStream(prefixStream, val => val.join(',')), '1,2');
        // Error
        stream = newWriteableStream(strings => strings.join());
        stream.error(new Error('fail'));
        prefixStream = prefixedStream('error', stream, val => val.join(','));
        let error;
        try {
            await consumeStream(prefixStream, val => val.join(','));
        }
        catch (e) {
            error = e;
        }
        assert.ok(error);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyZWFtLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3Rlc3QvY29tbW9uL3N0cmVhbS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDaEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxRQUFRLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUNwRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN2RSxPQUFPLEVBQUUsZUFBZSxFQUFFLGFBQWEsRUFBRSxVQUFVLEVBQUUsd0JBQXdCLEVBQUUsZ0JBQWdCLEVBQUUsWUFBWSxFQUFFLGtCQUFrQixFQUFFLFlBQVksRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLEVBQUUsY0FBYyxFQUE0QixVQUFVLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBRXpSLEtBQUssQ0FBQyxRQUFRLEVBQUUsR0FBRyxFQUFFO0lBRXBCLElBQUksQ0FBQyxZQUFZLEVBQUUsR0FBRyxFQUFFO1FBQ3ZCLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUNsQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEUs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