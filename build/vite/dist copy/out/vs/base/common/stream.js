/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { onUnexpectedError } from './errors.js';
import { DisposableStore, toDisposable } from './lifecycle.js';
export function isReadable(obj) {
    const candidate = obj;
    if (!candidate) {
        return false;
    }
    return typeof candidate.read === 'function';
}
export function isReadableStream(obj) {
    const candidate = obj;
    if (!candidate) {
        return false;
    }
    return [candidate.on, candidate.pause, candidate.resume, candidate.destroy].every(fn => typeof fn === 'function');
}
export function isReadableBufferedStream(obj) {
    const candidate = obj;
    if (!candidate) {
        return false;
    }
    return isReadableStream(candidate.stream) && Array.isArray(candidate.buffer) && typeof candidate.ended === 'boolean';
}
export function newWriteableStream(reducer, options) {
    return new WriteableStreamImpl(reducer, options);
}
class WriteableStreamImpl {
    /**
     * @param reducer a function that reduces the buffered data into a single object;
     * 				  because some objects can be complex and non-reducible, we also
     * 				  allow passing the explicit `null` value to skip the reduce step
     * @param options stream options
     */
    constructor(reducer, options) {
        this.reducer = reducer;
        this.options = options;
        this.state = {
            flowing: false,
            ended: false,
            destroyed: false
        };
        this.buffer = {
            data: [],
            error: []
        };
        this.listeners = {
            data: [],
            error: [],
            end: []
        };
        this.pendingWritePromises = [];
    }
    pause() {
        if (this.state.destroyed) {
            return;
        }
        this.state.flowing = false;
    }
    resume() {
        if (this.state.destroyed) {
            return;
        }
        if (!this.state.flowing) {
            this.state.flowing = true;
            // emit buffered events
            this.flowData();
            this.flowErrors();
            this.flowEnd();
        }
    }
    write(data) {
        if (this.state.destroyed) {
            return;
        }
        // flowing: directly send the data to listeners
        if (this.state.flowing) {
            this.emitData(data);
        }
        // not yet flowing: buffer data until flowing
        else {
            this.buffer.data.push(data);
            // highWaterMark: if configured, signal back when buffer reached limits
            if (typeof this.options?.highWaterMark === 'number' && this.buffer.data.length > this.options.highWaterMark) {
                return new Promise(resolve => this.pendingWritePromises.push(resolve));
            }
        }
    }
    error(error) {
        if (this.state.destroyed) {
            return;
        }
        // flowing: directly send the error to listeners
        if (this.state.flowing) {
            this.emitError(error);
        }
        // not yet flowing: buffer errors until flowing
        else {
            this.buffer.error.push(error);
        }
    }
    end(result) {
        if (this.state.destroyed) {
            return;
        }
        // end with data if provided
        if (typeof result !== 'undefined') {
            this.write(result);
        }
        // flowing: send end event to listeners
        if (this.state.flowing) {
            this.emitEnd();
            this.destroy();
        }
        // not yet flowing: remember state
        else {
            this.state.ended = true;
        }
    }
    emitData(data) {
        this.listeners.data.slice(0).forEach(listener => listener(data)); // slice to avoid listener mutation from delivering event
    }
    emitError(error) {
        if (this.listeners.error.length === 0) {
            onUnexpectedError(error); // nobody listened to this error so we log it as unexpected
        }
        else {
            this.listeners.error.slice(0).forEach(listener => listener(error)); // slice to avoid listener mutation from delivering event
        }
    }
    emitEnd() {
        this.listeners.end.slice(0).forEach(listener => listener()); // slice to avoid listener mutation from delivering event
    }
    on(event, callback) {
        if (this.state.destroyed) {
            return;
        }
        switch (event) {
            case 'data':
                this.listeners.data.push(callback);
                // switch into flowing mode as soon as the first 'data'
                // listener is added and we are not yet in flowing mode
                this.resume();
                break;
            case 'end':
                this.listeners.end.push(callback);
                // emit 'end' event directly if we are flowing
                // and the end has already been reached
                //
                // finish() when it went through
                if (this.state.flowing && this.flowEnd()) {
                    this.destroy();
                }
                break;
            case 'error':
                this.listeners.error.push(callback);
                // emit buffered 'error' events unless done already
                // now that we know that we have at least one listener
                if (this.state.flowing) {
                    this.flowErrors();
                }
                break;
        }
    }
    removeListener(event, callback) {
        if (this.state.destroyed) {
            return;
        }
        let listeners = undefined;
        switch (event) {
            case 'data':
                listeners = this.listeners.data;
                break;
            case 'end':
                listeners = this.listeners.end;
                break;
            case 'error':
                listeners = this.listeners.error;
                break;
        }
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index >= 0) {
                listeners.splice(index, 1);
            }
        }
    }
    flowData() {
        // if buffer is empty, nothing to do
        if (this.buffer.data.length === 0) {
            return;
        }
        // if buffer data can be reduced into a single object,
        // emit the reduced data
        if (typeof this.reducer === 'function') {
            const fullDataBuffer = this.reducer(this.buffer.data);
            this.emitData(fullDataBuffer);
        }
        else {
            // otherwise emit each buffered data instance individually
            for (const data of this.buffer.data) {
                this.emitData(data);
            }
        }
        this.buffer.data.length = 0;
        // when the buffer is empty, resolve all pending writers
        const pendingWritePromises = [...this.pendingWritePromises];
        this.pendingWritePromises.length = 0;
        pendingWritePromises.forEach(pendingWritePromise => pendingWritePromise());
    }
    flowErrors() {
        if (this.listeners.error.length > 0) {
            for (const error of this.buffer.error) {
                this.emitError(error);
            }
            this.buffer.error.length = 0;
        }
    }
    flowEnd() {
        if (this.state.ended) {
            this.emitEnd();
            return this.listeners.end.length > 0;
        }
        return false;
    }
    destroy() {
        if (!this.state.destroyed) {
            this.state.destroyed = true;
            this.state.ended = true;
            this.buffer.data.length = 0;
            this.buffer.error.length = 0;
            this.listeners.data.length = 0;
            this.listeners.error.length = 0;
            this.listeners.end.length = 0;
            this.pendingWritePromises.length = 0;
        }
    }
}
/**
 * Helper to fully read a T readable into a T.
 */
export function consumeReadable(readable, reducer) {
    const chunks = [];
    let chunk;
    while ((chunk = readable.read()) !== null) {
        chunks.push(chunk);
    }
    return reducer(chunks);
}
/**
 * Helper to read a T readable up to a maximum of chunks. If the limit is
 * reached, will return a readable instead to ensure all data can still
 * be read.
 */
export function peekReadable(readable, reducer, maxChunks) {
    const chunks = [];
    let chunk = undefined;
    while ((chunk = readable.read()) !== null && chunks.length < maxChunks) {
        chunks.push(chunk);
    }
    // If the last chunk is null, it means we reached the end of
    // the readable and return all the data at once
    if (chunk === null && chunks.length > 0) {
        return reducer(chunks);
    }
    // Otherwise, we still have a chunk, it means we reached the maxChunks
    // value and as such we return a new Readable that first returns
    // the existing read chunks and then continues with reading from
    // the underlying readable.
    return {
        read: () => {
            // First consume chunks from our array
            if (chunks.length > 0) {
                return chunks.shift();
            }
            // Then ensure to return our last read chunk
            if (typeof chunk !== 'undefined') {
                const lastReadChunk = chunk;
                // explicitly use undefined here to indicate that we consumed
                // the chunk, which could have either been null or valued.
                chunk = undefined;
                return lastReadChunk;
            }
            // Finally delegate back to the Readable
            return readable.read();
        }
    };
}
export function consumeStream(stream, reducer) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        listenStream(stream, {
            onData: chunk => {
                if (reducer) {
                    chunks.push(chunk);
                }
            },
            onError: error => {
                if (reducer) {
                    reject(error);
                }
                else {
                    resolve(undefined);
                }
            },
            onEnd: () => {
                if (reducer) {
                    resolve(reducer(chunks));
                }
                else {
                    resolve(undefined);
                }
            }
        });
    });
}
/**
 * Helper to listen to all events of a T stream in proper order.
 */
export function listenStream(stream, listener, token) {
    stream.on('error', error => {
        if (!token?.isCancellationRequested) {
            listener.onError(error);
        }
    });
    stream.on('end', () => {
        if (!token?.isCancellationRequested) {
            listener.onEnd();
        }
    });
    // Adding the `data` listener will turn the stream
    // into flowing mode. As such it is important to
    // add this listener last (DO NOT CHANGE!)
    stream.on('data', data => {
        if (!token?.isCancellationRequested) {
            listener.onData(data);
        }
    });
}
/**
 * Helper to peek up to `maxChunks` into a stream. The return type signals if
 * the stream has ended or not. If not, caller needs to add a `data` listener
 * to continue reading.
 */
export function peekStream(stream, maxChunks) {
    return new Promise((resolve, reject) => {
        const streamListeners = new DisposableStore();
        const buffer = [];
        // Data Listener
        const dataListener = (chunk) => {
            // Add to buffer
            buffer.push(chunk);
            // We reached maxChunks and thus need to return
            if (buffer.length > maxChunks) {
                // Dispose any listeners and ensure to pause the
                // stream so that it can be consumed again by caller
                streamListeners.dispose();
                stream.pause();
                return resolve({ stream, buffer, ended: false });
            }
        };
        // Error Listener
        const errorListener = (error) => {
            streamListeners.dispose();
            return reject(error);
        };
        // End Listener
        const endListener = () => {
            streamListeners.dispose();
            return resolve({ stream, buffer, ended: true });
        };
        streamListeners.add(toDisposable(() => stream.removeListener('error', errorListener)));
        stream.on('error', errorListener);
        streamListeners.add(toDisposable(() => stream.removeListener('end', endListener)));
        stream.on('end', endListener);
        // Important: leave the `data` listener last because
        // this can turn the stream into flowing mode and we
        // want `error` events to be received as well.
        streamListeners.add(toDisposable(() => stream.removeListener('data', dataListener)));
        stream.on('data', dataListener);
    });
}
/**
 * Helper to create a readable stream from an existing T.
 */
export function toStream(t, reducer) {
    const stream = newWriteableStream(reducer);
    stream.end(t);
    return stream;
}
/**
 * Helper to create an empty stream
 */
export function emptyStream() {
    const stream = newWriteableStream(() => { throw new Error('not supported'); });
    stream.end();
    return stream;
}
/**
 * Helper to convert a T into a Readable<T>.
 */
export function toReadable(t) {
    let consumed = false;
    return {
        read: () => {
            if (consumed) {
                return null;
            }
            consumed = true;
            return t;
        }
    };
}
/**
 * Helper to transform a readable stream into another stream.
 */
export function transform(stream, transformer, reducer) {
    const target = newWriteableStream(reducer);
    listenStream(stream, {
        onData: data => target.write(transformer.data(data)),
        onError: error => target.error(transformer.error ? transformer.error(error) : error),
        onEnd: () => target.end()
    });
    return target;
}
/**
 * Helper to take an existing readable that will
 * have a prefix injected to the beginning.
 */
export function prefixedReadable(prefix, readable, reducer) {
    let prefixHandled = false;
    return {
        read: () => {
            const chunk = readable.read();
            // Handle prefix only once
            if (!prefixHandled) {
                prefixHandled = true;
                // If we have also a read-result, make
                // sure to reduce it to a single result
                if (chunk !== null) {
                    return reducer([prefix, chunk]);
                }
                // Otherwise, just return prefix directly
                return prefix;
            }
            return chunk;
        }
    };
}
/**
 * Helper to take an existing stream that will
 * have a prefix injected to the beginning.
 */
export function prefixedStream(prefix, stream, reducer) {
    let prefixHandled = false;
    const target = newWriteableStream(reducer);
    listenStream(stream, {
        onData: data => {
            // Handle prefix only once
            if (!prefixHandled) {
                prefixHandled = true;
                return target.write(reducer([prefix, data]));
            }
            return target.write(data);
        },
        onError: error => target.error(error),
        onEnd: () => {
            // Handle prefix only once
            if (!prefixHandled) {
                prefixHandled = true;
                target.write(prefix);
            }
            target.end();
        }
    });
    return target;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyZWFtLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vc3RyZWFtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUNoRCxPQUFPLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBMkUvRCxNQUFNLFVBQVUsVUFBVSxDQUFJLEdBQVk7SUFDekMsTUFBTSxTQUFTLEdBQUcsR0FBOEIsQ0FBQztJQUNqRCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDaEIsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRUQsT0FBTyxPQUFPLFNBQVMsQ0FBQyxJQUFJLEtBQUssVUFBVSxDQUFDO0FBQzdDLENBQUM7QUFnRUQsTUFBTSxVQUFVLGdCQUFnQixDQUFJLEdBQVk7SUFDL0MsTUFBTSxTQUFTLEdBQUcsR0FBb0MsQ0FBQztJQUN2RCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDaEIsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRUQsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsU0FBUyxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsS0FBSyxVQUFVLENBQUMsQ0FBQztBQUNuSCxDQUFDO0FBRUQsTUFBTSxVQUFVLHdCQUF3QixDQUFJLEdBQVk7SUFDdkQsTUFBTSxTQUFTLEdBQUcsR0FBNEMsQ0FBQztJQUMvRCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDaEIsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRUQsT0FBTyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsTUFB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