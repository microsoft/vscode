/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createHash } from 'crypto';
import { createConnection, createServer } from 'net';
import { tmpdir } from 'os';
import { createDeflateRaw, createInflateRaw } from 'zlib';
import { VSBuffer } from '../../../common/buffer.js';
import { onUnexpectedError } from '../../../common/errors.js';
import { Emitter, Event } from '../../../common/event.js';
import { Disposable } from '../../../common/lifecycle.js';
import { join } from '../../../common/path.js';
import { platform } from '../../../common/platform.js';
import { generateUuid } from '../../../common/uuid.js';
import { IPCServer } from '../common/ipc.js';
import { ChunkStream, Client, Protocol, SocketDiagnostics } from '../common/ipc.net.js';
export function upgradeToISocket(req, socket, { debugLabel, skipWebSocketFrames = false, disableWebSocketCompression = false, enableMessageSplitting = true, }) {
    if (req.headers.upgrade === undefined || req.headers.upgrade.toLowerCase() !== 'websocket') {
        socket.end('HTTP/1.1 400 Bad Request');
        return;
    }
    // https://tools.ietf.org/html/rfc6455#section-4
    const requestNonce = req.headers['sec-websocket-key'];
    const hash = createHash('sha1'); // CodeQL [SM04514] SHA1 must be used here to respect the WebSocket protocol specification
    hash.update(requestNonce + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
    const responseNonce = hash.digest('base64');
    const responseHeaders = [
        `HTTP/1.1 101 Switching Protocols`,
        `Upgrade: websocket`,
        `Connection: Upgrade`,
        `Sec-WebSocket-Accept: ${responseNonce}`
    ];
    // See https://tools.ietf.org/html/rfc7692#page-12
    let permessageDeflate = false;
    if (!skipWebSocketFrames && !disableWebSocketCompression && req.headers['sec-websocket-extensions']) {
        const websocketExtensionOptions = Array.isArray(req.headers['sec-websocket-extensions']) ? req.headers['sec-websocket-extensions'] : [req.headers['sec-websocket-extensions']];
        for (const websocketExtensionOption of websocketExtensionOptions) {
            if (/\b((server_max_window_bits)|(server_no_context_takeover)|(client_no_context_takeover))\b/.test(websocketExtensionOption)) {
                // sorry, the server does not support zlib parameter tweaks
                continue;
            }
            if (/\b(permessage-deflate)\b/.test(websocketExtensionOption)) {
                permessageDeflate = true;
                responseHeaders.push(`Sec-WebSocket-Extensions: permessage-deflate`);
                break;
            }
            if (/\b(x-webkit-deflate-frame)\b/.test(websocketExtensionOption)) {
                permessageDeflate = true;
                responseHeaders.push(`Sec-WebSocket-Extensions: x-webkit-deflate-frame`);
                break;
            }
        }
    }
    socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');
    // Never timeout this socket due to inactivity!
    socket.setTimeout(0);
    // Disable Nagle's algorithm
    socket.setNoDelay(true);
    // Finally!
    if (skipWebSocketFrames) {
        return new NodeSocket(socket, debugLabel);
    }
    else {
        return new WebSocketNodeSocket(new NodeSocket(socket, debugLabel), permessageDeflate, null, true, enableMessageSplitting);
    }
}
/**
 * Maximum time to wait for a 'close' event to fire after the socket stream
 * ends. For unix domain sockets, the close event may not fire consistently
 * due to what appears to be a Node.js bug.
 *
 * @see https://github.com/microsoft/vscode/issues/211462#issuecomment-2155471996
 */
const socketEndTimeoutMs = 30_000;
export class NodeSocket {
    traceSocketEvent(type, data) {
        SocketDiagnostics.traceSocketEvent(this.socket, this.debugLabel, type, data);
    }
    constructor(socket, debugLabel = '') {
        this._canWrite = true;
        this.debugLabel = debugLabel;
        this.socket = socket;
        this.traceSocketEvent("created" /* SocketDiagnosticsEventType.Created */, { type: 'NodeSocket' });
        this._errorListener = (err) => {
            this.traceSocketEvent("error" /* SocketDiagnosticsEventType.Error */, { code: err?.code, message: err?.message });
            if (err) {
                if (err.code === 'EPIPE') {
                    // An EPIPE exception at the wrong time can lead to a renderer process crash
                    // so ignore the error since the socket will fire the close event soon anyways:
                    // > https://nodejs.org/api/errors.html#errors_common_system_errors
                    // > EPIPE (Broken pipe): A write on a pipe, socket, or FIFO for which there is no
                    // > process to read the data. Commonly encountered at the net and http layers,
                    // > indicative that the remote side of the stream being written to has been closed.
                    return;
                }
                onUnexpectedError(err);
            }
        };
        this.socket.on('error', this._errorListener);
        let endTimeoutHandle;
        this._closeListener = (hadError) => {
            this.traceSocketEvent("close" /* SocketDiagnosticsEventType.Close */, { hadError });
            this._canWrite = false;
            if (endTimeoutHandle) {
                clearTimeout(endTimeoutHandle);
            }
        };
        this.socket.on('close', this._closeListener);
        this._endListener = () => {
            this.traceSocketEvent("nodeEndReceived" /* SocketDiagnosticsEventType.NodeEndReceived */);
            this._canWrite = false;
            endTimeoutHandle = setTimeout(() => socket.destroy(), socketEndTimeoutMs);
        };
        this.socket.on('end', this._endListener);
    }
    dispose() {
        this.socket.off('error', this._errorListener);
        this.socket.off('close', this._closeListener);
        this.socket.off('end', this._endListener);
        this.socket.destroy();
    }
    onData(_listener) {
        const listener = (buff) => {
            this.traceSocketEvent("read" /* SocketDiagnosticsEventType.Read */, buff);
            _listener(VSBuffer.wrap(buff));
        };
        this.socket.on('data', listener);
        return {
            dispose: () => this.socket.off('data', listener)
        };
    }
    onClose(listener) {
        const adapter = (hadError) => {
            listener({
                type: 0 /* SocketCloseEventType.NodeSocketCloseEvent */,
                hadError: hadError,
                error: undefined
            });
        };
        this.socket.on('close', adapter);
        return {
            dispose: () => this.socket.off('close', adapter)
        };
    }
    onEnd(listener) {
        const adapter = () => {
            listener();
        };
        this.socket.on('end', adapter);
        return {
            dispose: () => this.socket.off('end', adapter)
        };
    }
    write(buffer) {
        // return early if socket has been destroyed in the meantime
        if (this.socket.destroyed || !this._canWrite) {
            return;
        }
        // we ignore the returned value from `write` because we would have to cached the data
        // anyways and nodejs is already doing that for us:
        // > https://nodejs.org/api/stream.html#stream_writable_write_chunk_encoding_callback
        // > However, the false return value is only advisory and the writable stream will unconditionally
        // > accept and buffer chunk even if it has not been allowed to drain.
        try {
            this.traceSocketEvent("write" /* SocketDiagnosticsEventType.Write */, buffer);
            this.socket.write(buffer.buffer, (err) => {
                if (err) {
                    if (err.code === 'EPIPE') {
                        // An EPIPE exception at the wrong time can lead to a renderer process crash
                        // so ignore the error since the socket will fire the close event soon anyways:
                        // > https://nodejs.org/api/errors.html#errors_common_system_errors
                        // > EPIPE (Broken pipe): A write on a pipe, socket, or FIFO for which there is no
                        // > process to read the data. Commonly encountered at the net and http layers,
                        // > indicative that the remote side of the stream being written to has been closed.
                        return;
                    }
                    onUnexpectedError(err);
                }
            });
        }
        catch (err) {
            if (err.code === 'EPIPE') {
                // An EPIPE exception at the wrong time can lead to a renderer process crash
                // so ignore the error since the socket will fire the close event soon anyways:
                // > https://nodejs.org/api/errors.html#errors_common_system_errors
                // > EPIPE (Broken pipe): A write on a pipe, socket, or FIFO for which there is no
                // > process to read the data. Commonly encountered at the net and http layers,
                // > indicative that the remote side of the stream being written to has been closed.
                return;
            }
            onUnexpectedError(err);
        }
    }
    end() {
        this.traceSocketEvent("nodeEndSent" /* SocketDiagnosticsEventType.NodeEndSent */);
        this.socket.end();
    }
    drain() {
        this.traceSocketEvent("nodeDrainBegin" /* SocketDiagnosticsEventType.NodeDrainBegin */);
        return new Promise((resolve, reject) => {
            if (this.socket.bufferSize === 0) {
                this.traceSocketEvent("nodeDrainEnd" /* SocketDiagnosticsEventType.NodeDrainEnd */);
                resolve();
                return;
            }
            const finished = () => {
                this.socket.off('close', finished);
                this.socket.off('end', finished);
                this.socket.off('error', finished);
                this.socket.off('timeout', finished);
                this.socket.off('drain', finished);
                this.traceSocketEvent("nodeDrainEnd" /* SocketDiagnosticsEventType.NodeDrainEnd */);
                resolve();
            };
            this.socket.on('close', finished);
            this.socket.on('end', finished);
            this.socket.on('error', finished);
            this.socket.on('timeout', finished);
            this.socket.on('drain', finished);
        });
    }
}
var Constants;
(function (Constants) {
    Constants[Constants["MinHeaderByteSize"] = 2] = "MinHeaderByteSize";
    /**
     * If we need to write a large buffer, we will split it into 256KB chunks and
     * send each chunk as a websocket message. This is to prevent that the sending
     * side is stuck waiting for the entire buffer to be compressed before writing
     * to the underlying socket or that the receiving side is stuck waiting for the
     * entire message to be received before processing the bytes.
     */
    Constants[Constants["MaxWebSocketMessageLength"] = 262144] = "MaxWebSocketMessageLength"; // 256 KB
})(Constants || (Constants = {}));
var ReadState;
(function (ReadState) {
    ReadState[ReadState["PeekHeader"] = 1] = "PeekHeader";
    ReadState[ReadState["ReadHeader"] = 2] = "ReadHeader";
    ReadState[ReadState["ReadBody"] = 3] = "ReadBody";
    ReadState[ReadState["Fin"] = 4] = "Fin";
})(ReadState || (ReadState = {}));
/**
 * See https://tools.ietf.org/html/rfc6455#section-5.2
 */
export class WebSocketNodeSocket extends Disposable {
    get permessageDeflate() {
        return this._flowManager.permessageDeflate;
    }
    get recordedInflateBytes() {
        return this._flowManager.recordedInflateBytes;
    }
    setRecordInflateBytes(record) {
        this._flowManager.setRecordInflateBytes(record);
    }
    traceSocketEvent(type, data) {
        this.socket.traceSocketEvent(type, data);
    }
    /**
     * Create a socket which can communicate using WebSocket frames.
     *
     * **NOTE**: When using the permessage-deflate WebSocket extension, if parts of inflating was done
     *  in a different zlib instance, we need to pass all those bytes into zlib, otherwise the inflate
     *  might hit an inflated portion referencing a distance too far back.
     *
     * @param socket The underlying socket
     * @param permessageDeflate Use the permessage-deflate WebSocket extension
     * @param inflateBytes "Seed" zlib inflate with these bytes.
     * @param recordInflateBytes Record all bytes sent to inflate
     */
    constructor(socket, permessageDeflate, inflateBytes, recordInflateBytes, enableMessageSplitting = true) {
        super();
        this._onData = this._register(new Emitter());
        this._onClose = this._register(new Emitter());
        this._isEnded = false;
        this._state = {
            state: 1 /* ReadState.PeekHeader */,
            readLen: 2 /* Constants.MinHeaderByteSize */,
            fin: 0,
            compressed: false,
            firstFrameOfMessage: true,
            mask: 0,
            opcode: 0
        };
        this.socket = socket;
        this._maxSocketMessageLength = enableMessageSplitting ? 262144 /* Constants.MaxWebSocketMessageLength */ : Infinity;
        this.traceSocketEvent("created" /* SocketDiagnosticsEventType.Created */, { type: 'WebSocketNodeSocket', permessageDeflate, inflateBytesLength: inflateBytes?.byteLength || 0, recordInflateBytes });
        this._flowManager = this._register(new WebSocketFlowManager(this, permessageDeflate, inflateBytes, recordInflateBytes, this._onData, (data, options) => this._write(data, options)));
        this._register(this._flowManager.onError((err) => {
            // zlib errors are fatal, since we have no idea how to recover
            console.error(err);
            onUnexpectedError(err);
            this._onClose.fire({
                type: 0 /* SocketCloseEventType.NodeSocketCloseEvent */,
                hadError: true,
                error: err
            });
        }));
        this._incomingData = new ChunkStream();
        this._register(this.socket.onData(data => this._acceptChunk(data)));
        this._register(this.socket.onClose(async (e) => {
            // Delay surfacing the close event until the async inflating is done
            // and all data has been emitted
            if (this._flowManager.isProcessingReadQueue()) {
                await Event.toPromise(this._flowManager.onDidFinishProcessingReadQueue);
            }
            this._onClose.fire(e);
        }));
    }
    dispose() {
        if (this._flowManager.isProcessingWriteQueue()) {
            // Wait for any outstanding writes to finish before disposing
            this._register(this._flowManager.onDidFinishProcessingWriteQueue(() => {
                this.dispose();
            }));
        }
        else {
            this.socket.dispose();
            super.dispose();
        }
    }
    onData(listener) {
        return this._onData.event(listener);
    }
    onClose(listener) {
        return this._onClose.event(listener);
    }
    onEnd(listener) {
        return this.socket.onEnd(listener);
    }
    write(buffer) {
        // If we write many logical messages (let's say 1000 messages of 100KB) during a single process tick, we do
        // this thing where we install a process.nextTick timer and group all of them together and we then issue a
        // single WebSocketNodeSocket.write with a 100MB buffer.
        //
        // The first problem is that the actual writing to the underlying node socket will only happen after all of
        // the 100MB have been deflated (due to waiting on zlib flush). The second problem is on the reading side,
        // where we will get a single WebSocketNodeSocket.onData event fired when all the 100MB have arrived,
        // delaying processing the 1000 received messages until all have arrived, instead of processing them as each
        // one arrives.
        //
        // We therefore split the buffer into chunks, and issue a write for each chunk.
        let start = 0;
        while (start < buffer.byteLength) {
            this._flowManager.writeMessage(buffer.slice(start, Math.min(start + this._maxSocketMessageLength, buffer.byteLength)), { compressed: true, opcode: 0x02 /* Binary frame */ });
            start += this._maxSocketMessageLength;
        }
    }
    _write(buffer, { compressed, opcode }) {
        if (this._isEnded) {
            // Avoid ERR_STREAM_WRITE_AFTER_END
            return;
        }
        this.traceSocketEvent("webSocketNodeSocketWrite" /* SocketDiagnosticsEventType.WebSocketNodeSocketWrite */, buffer);
        let headerLen = 2 /* Constants.MinHeaderByteSize */;
        if (buffer.byteLength < 126) {
            headerLen += 0;
        }
        else if (buffer.byteLength < 2 ** 16) {
            headerLen += 2;
        }
        else {
            headerLen += 8;
        }
        const header = VSBuffer.alloc(headerLen);
        // The RSV1 bit indicates a compressed frame
        const compressedFlag = compressed ? 0b01000000 : 0;
        const opcodeFlag = opcode & 0b00001111;
        header.writeUInt8(0b10000000 | compressedFlag | opcodeFlag, 0);
        if (buffer.byteLength < 126) {
            header.writeUInt8(buffer.byteLength, 1);
        }
        else if (buffer.byteLength < 2 ** 16) {
            header.writeUInt8(126, 1);
            let offset = 1;
            header.writeUInt8((buffer.byteLength >>> 8) & 0b11111111, ++offset);
            header.writeUInt8((buffer.byteLength >>> 0) & 0b11111111, ++offset);
        }
        else {
            header.writeUInt8(127, 1);
            let offset = 1;
            header.writeUInt8(0, ++offset);
            header.writeUInt8(0, ++offset);
            header.writeUInt8(0, ++offset);
            header.writeUInt8(0, ++offset);
            header.writeUInt8((buffer.byteLength >>> 24) & 0b11111111, ++offset);
            header.writeUInt8((buffer.byteLength >>> 16) & 0b11111111, ++offset);
            header.writeUInt8((buffer.byteLength >>> 8) & 0b11111111, ++offset);
            header.writeUInt8((buffer.byteLength >>> 0) & 0b11111111, ++offset);
        }
        this.socket.write(VSBuffer.concat([header, buffer]));
    }
    end() {
        this._isEnded = true;
        this.socket.end();
    }
    _acceptChunk(data) {
        if (data.byteLength === 0) {
            return;
        }
        this._incomingData.acceptChunk(data);
        while (this._incomingData.byteLength >= this._state.readLen) {
            if (this._state.state === 1 /* ReadState.PeekHeader */) {
                // peek to see if we can read the entire header
                const peekHeader = this._incomingData.peek(this._state.readLen);
                const firstByte = peekHeader.readUInt8(0);
                const finBit = (firstByte & 0b10000000) >>> 7;
                const rsv1Bit = (firstByte & 0b01000000) >>> 6;
                const opcode = (firstByte & 0b00001111);
                const secondByte = peekHeader.readUInt8(1);
                const hasMask = (secondByte & 0b10000000) >>> 7;
                const len = (secondByte & 0b01111111);
                this._state.state = 2 /* ReadState.ReadHeader */;
                this._state.readLen = 2 /* Constants.MinHeaderByteSize */ + (hasMask ? 4 : 0) + (len === 126 ? 2 : 0) + (len === 127 ? 8 : 0);
                this._state.fin = finBit;
                if (this._state.firstFrameOfMessage) {
                    // if the frame is compressed, the RSV1 bit is set only for the first frame of the message
                    this._state.compressed = Boolean(rsv1Bit);
                }
                this._state.firstFrameOfMessage = Boolean(finBit);
                this._state.mask = 0;
                this._state.opcode = opcode;
                this.traceSocketEvent("webSocketNodeSocketPeekedHeader" /* SocketDiagnosticsEventType.WebSocketNodeSocketPeekedHeader */, { headerSize: this._state.readLen, compressed: this._state.compressed, fin: this._state.fin, opcode: this._state.opcode });
            }
            else if (this._state.state === 2 /* ReadState.ReadHeader */) {
                // read entire header
                const header = this._incomingData.read(this._state.readLen);
                const secondByte = header.readUInt8(1);
                const hasMask = (secondByte & 0b10000000) >>> 7;
                let len = (secondByte & 0b01111111);
                let offset = 1;
                if (len === 126) {
                    len = (header.readUInt8(++offset) * 2 ** 8
                        + header.readUInt8(++offset));
                }
                else if (len === 127) {
                    len = (header.readUInt8(++offset) * 0
                        + header.readUInt8(++offset) * 0
                        + header.readUInt8(++offset) * 0
                        + header.readUInt8(++offset) * 0
                        + header.readUInt8(++offset) * 2 ** 24
                        + header.readUInt8(++offset) * 2 ** 16
                        + header.readUInt8(++offset) * 2 ** 8
                        + header.readUInt8(++offset));
                }
                let mask = 0;
                if (hasMask) {
                    mask = (header.readUInt8(++offset) * 2 ** 24
                        + header.readUInt8(++offset) * 2 ** 16
                        + header.readUInt8(++offset) * 2 ** 8
                        + header.readUInt8(++offset));
                }
                this._state.state = 3 /* ReadState.ReadBody */;
                this._state.readLen = len;
                this._state.mask = mask;
                this.traceSocketEvent("webSocketNodeSocketPeekedHeader" /* SocketDiagnosticsEventType.WebSocketNodeSocketPeekedHeader */, { bodySize: this._state.readLen, compressed: this._state.compressed, fin: this._state.fin, mask: this._state.mask, opcode: this._state.opcode });
            }
            else if (this._state.state === 3 /* ReadState.ReadBody */) {
                // read body
                const body = this._incomingData.read(this._state.readLen);
                this.traceSocketEvent("webSocketNodeSocketReadData" /* SocketDiagnosticsEventType.WebSocketNodeSocketReadData */, body);
                unmask(body, this._state.mask);
                this.traceSocketEvent("webSocketNodeSocketUnmaskedData" /* SocketDiagnosticsEventType.WebSocketNodeSocketUnmaskedData */, body);
                this._state.state = 1 /* ReadState.PeekHeader */;
                this._state.readLen = 2 /* Constants.MinHeaderByteSize */;
                this._state.mask = 0;
                if (this._state.opcode <= 0x02 /* Continuation frame or Text frame or binary frame */) {
                    this._flowManager.acceptFrame(body, this._state.compressed, !!this._state.fin);
                }
                else if (this._state.opcode === 0x09 /* Ping frame */) {
                    // Ping frames could be send by some browsers e.g. Firefox
                    this._flowManager.writeMessage(body, { compressed: false, opcode: 0x0A /* Pong frame */ });
                }
            }
        }
    }
    async drain() {
        this.traceSocketEvent("webSocketNodeSocketDrainBegin" /* SocketDiagnosticsEventType.WebSocketNodeSocketDrainBegin */);
        if (this._flowManager.isProcessingWriteQueue()) {
            await Event.toPromise(this._flowManager.onDidFinishProcessingWriteQueue);
        }
        await this.socket.drain();
        this.traceSocketEvent("webSocketNodeSocketDrainEnd" /* SocketDiagnosticsEventType.WebSocketNodeSocketDrainEnd */);
    }
}
class WebSocketFlowManager extends Disposable {
    get permessageDeflate() {
        return Boolean(this._zlibInflateStream && this._zlibDeflateStream);
    }
    get recordedInflateBytes() {
        if (this._zlibInflateStream) {
            return this._zlibInflateStream.recordedInflateBytes;
        }
        return VSBuffer.alloc(0);
    }
    setRecordInflateBytes(record) {
        this._zlibInflateStream?.setRecordInflateBytes(record);
    }
    constructor(_tracer, permessageDeflate, inflateBytes, recordInflateBytes, _onData, _writeFn) {
        super();
        this._tracer = _tracer;
        this._onData = _onData;
        this._writeFn = _writeFn;
        this._onError = this._register(new Emitter());
        this.onError = this._onError.event;
        this._writeQueue = [];
        this._readQueue = [];
        this._onDidFinishProcessingReadQueue = this._register(new Emitter());
        this.onDidFinishProcessingReadQueue = this._onDidFinishProcessingReadQueue.event;
        this._onDidFinishProcessingWriteQueue = this._register(new Emitter());
        this.onDidFinishProcessingWriteQueue = this._onDidFinishProcessingWriteQueue.event;
        this._isProcessingWriteQueue = false;
        this._isProcessingReadQueue = false;
        if (permessageDeflate) {
            // See https://tools.ietf.org/html/rfc7692#page-16
            // To simplify our logic, we don't negotiate the window size
            // and simply dedicate (2^15) / 32kb per web socket
            this._zlibInflateStream = this._register(new ZlibInflateStream(this._tracer, recordInflateBytes, inflateBytes, { windowBits: 15 }));
            this._zlibDeflateStream = this._register(new ZlibDeflateStream(this._tracer, { windowBits: 15 }));
            this._register(this._zlibInflateStream.onError((err) => this._onError.fire(err)));
            this._register(this._zlibDeflateStream.onError((err) => this._onError.fire(err)));
        }
        else {
            this._zlibInflateStream = null;
            this._zlibDeflateStream = null;
        }
    }
    writeMessage(data, options) {
        this._writeQueue.push({ data, options });
        this._processWriteQueue();
    }
    async _processWriteQueue() {
        if (this._isProcessingWriteQueue) {
            return;
        }
        this._isProcessingWriteQueue = true;
        while (this._writeQueue.length > 0) {
            const { data, options } = this._writeQueue.shift();
            if (this._zlibDeflateStream && options.compressed) {
                const compressedData = await this._deflateMessage(this._zlibDeflateStream, data);
                this._writeFn(compressedData, options);
            }
            else {
                this._writeFn(data, { ...options, compressed: false });
            }
        }
        this._isProcessingWriteQueue = false;
        this._onDidFinishProcessingWriteQueue.fire();
    }
    isProcessingWriteQueue() {
        return (this._isProcessingWriteQueue);
    }
    /**
     * Subsequent calls should wait for the previous `_deflateBuffer` call to complete.
     */
    _deflateMessage(zlibDeflateStream, buffer) {
        return new Promise((resolve, reject) => {
            zlibDeflateStream.write(buffer);
            zlibDeflateStream.flush(data => resolve(data));
        });
    }
    acceptFrame(data, isCompressed, isLastFrameOfMessage) {
        this._readQueue.push({ data, isCompressed, isLastFrameOfMessage });
        this._processReadQueue();
    }
    async _processReadQueue() {
        if (this._isProcessingReadQueue) {
            return;
        }
        this._isProcessingReadQueue = true;
        while (this._readQueue.length > 0) {
            const frameInfo = this._readQueue.shift();
            if (this._zlibInflateStream && frameInfo.isCompressed) {
                // See https://datatracker.ietf.org/doc/html/rfc7692#section-9.2
                // Even if permessageDeflate is negotiated, it is possible
                // that the other side might decide to send uncompressed messages
                // So only decompress messages that have the RSV 1 bit set
                const data = await this._inflateFrame(this._zlibInflateStream, frameInfo.data, frameInfo.isLastFrameOfMessage);
                this._onData.fire(data);
            }
            else {
                this._onData.fire(frameInfo.data);
            }
        }
        this._isProcessingReadQueue = false;
        this._onDidFinishProcessingReadQueue.fire();
    }
    isProcessingReadQueue() {
        return (this._isProcessingReadQueue);
    }
    /**
     * Subsequent calls should wait for the previous `transformRead` call to complete.
     */
    _inflateFrame(zlibInflateStream, buffer, isLastFrameOfMessage) {
        return new Promise((resolve, reject) => {
            // See https://tools.ietf.org/html/rfc7692#section-7.2.2
            zlibInflateStream.write(buffer);
            if (isLastFrameOfMessage) {
                zlibInflateStream.write(VSBuffer.fromByteArray([0x00, 0x00, 0xff, 0xff]));
            }
            zlibInflateStream.flush(data => resolve(data));
        });
    }
}
class ZlibInflateStream extends Disposable {
    get recordedInflateBytes() {
        if (this._recordInflateBytes) {
            return VSBuffer.concat(this._recordedInflateBytes);
        }
        return VSBuffer.alloc(0);
    }
    constructor(_tracer, recordInflateBytes, inflateBytes, options) {
        super();
        this._tracer = _tracer;
        this._onError = this._register(new Emitter());
        this.onError = this._onError.event;
        this._recordedInflateBytes = [];
        this._pendingInflateData = [];
        this._recordInflateBytes = recordInflateBytes;
        this._zlibInflate = createInflateRaw(options);
        this._zlibInflate.on('error', (err) => {
            this._tracer.traceSocketEvent("zlibInflateError" /* SocketDiagnosticsEventType.zlibInflateError */, { message: err?.message, code: err?.code });
            this._onError.fire(err);
        });
        this._zlibInflate.on('data', (data) => {
            this._tracer.traceSocketEvent("zlibInflateData" /* SocketDiagnosticsEventType.zlibInflateData */, data);
            this._pendingInflateData.push(VSBuffer.wrap(data));
        });
        if (inflateBytes) {
            this._tracer.traceSocketEvent("zlibInflateInitialWrite" /* SocketDiagnosticsEventType.zlibInflateInitialWrite */, inflateBytes.buffer);
            this._zlibInflate.write(inflateBytes.buffer);
            this._zlibInflate.flush(() => {
                this._tracer.traceSocketEvent("zlibInflateInitialFlushFired" /* SocketDiagnosticsEventType.zlibInflateInitialFlushFired */);
                this._pendingInflateData.length = 0;
            });
        }
    }
    write(buffer) {
        if (this._recordInflateBytes) {
            this._recordedInflateBytes.push(buffer.clone());
        }
        this._tracer.traceSocketEvent("zlibInflateWrite" /* SocketDiagnosticsEventType.zlibInflateWrite */, buffer);
        this._zlibInflate.write(buffer.buffer);
    }
    setRecordInflateBytes(record) {
        this._recordInflateBytes = record;
        if (!record) {
            this._recordedInflateBytes.length = 0;
        }
    }
    flush(callback) {
        this._zlibInflate.flush(() => {
            this._tracer.traceSocketEvent("zlibInflateFlushFired" /* SocketDiagnosticsEventType.zlibInflateFlushFired */);
            const data = VSBuffer.concat(this._pendingInflateData);
            this._pendingInflateData.length = 0;
            callback(data);
        });
    }
    dispose() {
        this._recordedInflateBytes.length = 0;
        this._pendingInflateData.length = 0;
        try {
            this._zlibInflate.close();
        }
        catch {
            // ignore errors while disposing
        }
        super.dispose();
    }
}
class ZlibDeflateStream extends Disposable {
    constructor(_tracer, options) {
        super();
        this._tracer = _tracer;
        this._onError = this._register(new Emitter());
        this.onError = this._onError.event;
        this._pendingDeflateData = [];
        this._zlibDeflate = createDeflateRaw({
            windowBits: 15
        });
        this._zlibDeflate.on('error', (err) => {
            this._tracer.traceSocketEvent("zlibDeflateError" /* SocketDiagnosticsEventType.zlibDeflateError */, { message: err?.message, code: err?.code });
            this._onError.fire(err);
        });
        this._zlibDeflate.on('data', (data) => {
            this._tracer.traceSocketEvent("zlibDeflateData" /* SocketDiagnosticsEventType.zlibDeflateData */, data);
            this._pendingDeflateData.push(VSBuffer.wrap(data));
        });
    }
    write(buffer) {
        this._tracer.traceSocketEvent("zlibDeflateWrite" /* SocketDiagnosticsEventType.zlibDeflateWrite */, buffer.buffer);
        this._zlibDeflate.write(buffer.buffer);
    }
    flush(callback) {
        // See https://zlib.net/manual.html#Constants
        this._zlibDeflate.flush(/*Z_SYNC_FLUSH*/ 2, () => {
            this._tracer.traceSocketEvent("zlibDeflateFlushFired" /* SocketDiagnosticsEventType.zlibDeflateFlushFired */);
            let data = VSBuffer.concat(this._pendingDeflateData);
            this._pendingDeflateData.length = 0;
            // See https://tools.ietf.org/html/rfc7692#section-7.2.1
            data = data.slice(0, data.byteLength - 4);
            callback(data);
        });
    }
    dispose() {
        this._pendingDeflateData.length = 0;
        try {
            this._zlibDeflate.close();
        }
        catch {
            // ignore errors while disposing
        }
        super.dispose();
    }
}
function unmask(buffer, mask) {
    if (mask === 0) {
        return;
    }
    const cnt = buffer.byteLength >>> 2;
    for (let i = 0; i < cnt; i++) {
        const v = buffer.readUInt32BE(i * 4);
        buffer.writeUInt32BE(v ^ mask, i * 4);
    }
    const offset = cnt * 4;
    const bytesLeft = buffer.byteLength - offset;
    const m3 = (mask >>> 24) & 0b11111111;
    const m2 = (mask >>> 16) & 0b11111111;
    const m1 = (mask >>> 8) & 0b11111111;
    if (bytesLeft >= 1) {
        buffer.writeUInt8(buffer.readUInt8(offset) ^ m3, offset);
    }
    if (bytesLeft >= 2) {
        buffer.writeUInt8(buffer.readUInt8(offset + 1) ^ m2, offset + 1);
    }
    if (bytesLeft >= 3) {
        buffer.writeUInt8(buffer.readUInt8(offset + 2) ^ m1, offset + 2);
    }
}
// Read this before there's any chance it is overwritten
// Related to https://github.com/microsoft/vscode/issues/30624
export const XDG_RUNTIME_DIR = process.env['XDG_RUNTIME_DIR'];
const safeIpcPathLengths = {
    [2 /* Platform.Linux */]: 107,
    [1 /* Platform.Mac */]: 103
};
export function createRandomIPCHandle() {
    const randomSuffix = generateUuid();
    // Windows: use named pipe
    if (process.platform === 'win32') {
        return `\\\\.\\pipe\\vscode-ipc-${randomSuffix}-sock`;
    }
    // Mac & Unix: Use socket file
    // Unix: Prefer XDG_RUNTIME_DIR over user data path
    const basePath = process.platform !== 'darwin' && XDG_RUNTIME_DIR ? XDG_RUNTIME_DIR : tmpdir();
    const result = join(basePath, `vscode-ipc-${randomSuffix}.sock`);
    // Validate length
    validateIPCHandleLength(result);
    return result;
}
export function createStaticIPCHandle(directoryPath, type, version) {
    const scope = createHash('sha256').update(directoryPath).digest('hex');
    const scopeForSocket = scope.substr(0, 8);
    // Windows: use named pipe
    if (process.platform === 'win32') {
        return `\\\\.\\pipe\\${scopeForSocket}-${version}-${type}-sock`;
    }
    // Mac & Unix: Use socket file
    // Unix: Prefer XDG_RUNTIME_DIR over user data path, unless portable
    // Trim the version and type values for the socket to prevent too large
    // file names causing issues: https://unix.stackexchange.com/q/367008
    const versionForSocket = version.substr(0, 4);
    const typeForSocket = type.substr(0, 6);
    let result;
    if (process.platform !== 'darwin' && XDG_RUNTIME_DIR && !process.env['VSCODE_PORTABLE']) {
        result = join(XDG_RUNTIME_DIR, `vscode-${scopeForSocket}-${versionForSocket}-${typeForSocket}.sock`);
    }
    else {
        result = join(directoryPath, `${versionForSocket}-${typeForSocket}.sock`);
    }
    // Validate length
    validateIPCHandleLength(result);
    return result;
}
function validateIPCHandleLength(handle) {
    const limit = safeIpcPathLengths[platform];
    if (typeof limit === 'number' && handle.length >= limit) {
        // https://nodejs.org/api/net.html#net_identifying_paths_for_ipc_connections
        console.warn(`WARNING: IPC handle "${handle}" is longer than ${limit} chars, try a shorter --user-data-dir`);
    }
}
export class Server extends IPCServer {
    static toClientConnectionEvent(server) {
        const onConnection = Event.fromNodeEventEmitter(server, 'connection');
        return Event.map(onConnection, socket => ({
            protocol: new Protocol(new NodeSocket(socket, 'ipc-server-connection')),
            onDidClientDisconnect: Event.once(Event.fromNodeEventEmitter(socket, 'close'))
        }));
    }
    constructor(server) {
        super(Server.toClientConnectionEvent(server));
        this.server = server;
    }
    dispose() {
        super.dispose();
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }
}
export function serve(hook) {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.on('error', reject);
        server.listen(hook, () => {
            server.removeListener('error', reject);
            resolve(new Server(server));
        });
    });
}
export function connect(hook, clientId) {
    return new Promise((resolve, reject) => {
        let socket;
        const callbackHandler = () => {
            socket.removeListener('error', reject);
            resolve(Client.fromSocket(new NodeSocket(socket, `ipc-client${clientId}`), clientId));
        };
        if (typeof hook === 'string') {
            socket = createConnection(hook, callbackHandler);
        }
        else {
            socket = createConnection(hook, callbackHandler);
        }
        socket.once('error', reject);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaXBjLm5ldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvcGFydHMvaXBjL25vZGUvaXBjLm5ldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBRXBDLE9BQU8sRUFBK0IsZ0JBQWdCLEVBQUUsWUFBWSxFQUFFLE1BQU0sS0FBSyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDNUIsT0FBTyxFQUF1QyxnQkFBZ0IsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLE1BQU0sQ0FBQztBQUMvRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDckQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDOUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sOEJBQThCLENBQUM7QUFDdkUsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQy9DLE9BQU8sRUFBWSxRQUFRLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNqRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdkQsT0FBTyxFQUF5QixTQUFTLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUNwRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBVyxRQUFRLEVBQTBDLGlCQUFpQixFQUE4QixNQUFNLHNCQUFzQixDQUFDO0FBRXJLLE1BQU0sVUFBVSxnQkFBZ0IsQ0FBQyxHQUF5QixFQUFFLE1BQWMsRUFBRSxFQUMzRSxVQUFVLEVBQ1YsbUJBQW1CLEdBQUcsS0FBSyxFQUMzQiwyQkFBMkIsR0FBRyxL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QUFDLFVBQVUsS0FBSyxDQUFDLENBQUMsR0FBRyxVQUFVLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNyRSxDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzFCLElBQUksTUFBTSxHQUFHLENBQUMsQ0FBQztZQUNmLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDL0IsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUMvQixNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsRUFBRSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQy9CLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDL0IsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEtBQUssRUFBRSxDQUFDLEdBQUcsVUFBVSxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDckUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEtBQUssRUFBRSxDQUFDLEdBQUcsVUFBVSxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDckUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEtBQUssQ0FBQyxDQUFDLEdBQUcsVUFBVSxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDcEUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEtBQUssQ0FBQyxDQUFDLEdBQUcsVUFBVSxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDckUsQ0FBQztRQUVELElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RELENBQUM7SUFFTSxHQUFHO1FBQ1Qs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