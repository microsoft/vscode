//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// Place this right on top
// The module 'assert' provides assertion methods from node
import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as net from 'net';
import { SocketStream } from '../../client/common/net/socket/SocketStream';

const uint64be = require('uint64be');

class MockSocket {
    private _data: string;

    private _rawDataWritten: any;
    constructor() {
        this._data = '';
    }
    public get dataWritten(): string {
        return this._data;
    }

    public get rawDataWritten(): any {
        return this._rawDataWritten;
    }

    public write(data: any) {
        this._data = `${data}` + '';
        this._rawDataWritten = data;
    }
}
// Defines a Mocha test suite to group tests of similar kind together

suite('SocketStream', () => {
    test('Read Byte', (done) => {
        const buffer = Buffer.from('X');
        const byteValue = buffer[0];
        const socket = new MockSocket();

        const stream = new SocketStream((socket as any) as net.Socket, buffer);

        assert.strictEqual(stream.ReadByte(), byteValue);
        done();
    });
    test('Read Int32', (done) => {
        const num = 1234;
        const socket = new MockSocket();
        const buffer = uint64be.encode(num);

        const stream = new SocketStream((socket as any) as net.Socket, buffer);

        assert.strictEqual(stream.ReadInt32(), num);
        done();
    });
    test('Read Int64', (done) => {
        const num = 9007199254740993;
        const socket = new MockSocket();
        const buffer = uint64be.encode(num);

        const stream = new SocketStream((socket as any) as net.Socket, buffer);

        assert.strictEqual(stream.ReadInt64(), num);
        done();
    });
    test('Read Ascii String', (done) => {
        const message = 'Hello World';
        const socket = new MockSocket();
        const buffer = Buffer.concat([Buffer.from('A'), uint64be.encode(message.length), Buffer.from(message)]);

        const stream = new SocketStream((socket as any) as net.Socket, buffer);

        assert.strictEqual(stream.ReadString(), message);
        done();
    });
    test('Read Unicode String', (done) => {
        const message = 'Hello World - Функция проверки ИНН и КПП - 说明';
        const socket = new MockSocket();
        const stringBuffer = Buffer.from(message);
        const buffer = Buffer.concat([
            Buffer.concat([Buffer.from('U'), uint64be.encode(stringBuffer.byteLength)]),
            stringBuffer,
        ]);

        const stream = new SocketStream((socket as any) as net.Socket, buffer);

        assert.strictEqual(stream.ReadString(), message);
        done();
    });
    test('Read RollBackTransaction', (done) => {
        const message = 'Hello World';
        const socket = new MockSocket();
        let buffer = Buffer.concat([Buffer.from('A'), uint64be.encode(message.length), Buffer.from(message)]);

        // Write part of a second message
        const partOfSecondMessage = Buffer.concat([Buffer.from('A'), uint64be.encode(message.length)]);
        buffer = Buffer.concat([buffer, partOfSecondMessage]);

        const stream = new SocketStream((socket as any) as net.Socket, buffer);

        stream.BeginTransaction();
        assert.strictEqual(stream.ReadString(), message, 'First message not read properly');
        stream.ReadString();
        assert.strictEqual(stream.HasInsufficientDataForReading, true, 'Should not have sufficient data for reading');
        stream.RollBackTransaction();
        assert.strictEqual(
            stream.ReadString(),
            message,
            'First message not read properly after rolling back transaction',
        );
        done();
    });
    test('Read EndTransaction', (done) => {
        const message = 'Hello World';
        const socket = new MockSocket();
        let buffer = Buffer.concat([Buffer.from('A'), uint64be.encode(message.length), Buffer.from(message)]);

        // Write part of a second message
        const partOfSecondMessage = Buffer.concat([Buffer.from('A'), uint64be.encode(message.length)]);
        buffer = Buffer.concat([buffer, partOfSecondMessage]);

        const stream = new SocketStream((socket as any) as net.Socket, buffer);

        stream.BeginTransaction();
        assert.strictEqual(stream.ReadString(), message, 'First message not read properly');
        stream.ReadString();
        assert.strictEqual(stream.HasInsufficientDataForReading, true, 'Should not have sufficient data for reading');
        stream.EndTransaction();
        stream.RollBackTransaction();
        assert.notStrictEqual(stream.ReadString(), message, 'First message cannot be read after commit transaction');
        done();
    });
    test('Write Buffer', (done) => {
        const message = 'Hello World';
        const buffer = Buffer.from('');
        const socket = new MockSocket();

        const stream = new SocketStream((socket as any) as net.Socket, buffer);
        stream.Write(Buffer.from(message));

        assert.strictEqual(socket.dataWritten, message);
        done();
    });
    test('Write Int32', (done) => {
        const num = 1234;
        const buffer = Buffer.from('');
        const socket = new MockSocket();

        const stream = new SocketStream((socket as any) as net.Socket, buffer);
        stream.WriteInt32(num);

        assert.strictEqual(uint64be.decode(socket.rawDataWritten), num);
        done();
    });
    test('Write Int64', (done) => {
        const num = 9007199254740993;
        const buffer = Buffer.from('');
        const socket = new MockSocket();

        const stream = new SocketStream((socket as any) as net.Socket, buffer);
        stream.WriteInt64(num);

        assert.strictEqual(uint64be.decode(socket.rawDataWritten), num);
        done();
    });
    test('Write Ascii String', (done) => {
        const message = 'Hello World';
        const buffer = Buffer.from('');
        const socket = new MockSocket();

        const stream = new SocketStream((socket as any) as net.Socket, buffer);
        stream.WriteString(message);

        assert.strictEqual(socket.dataWritten, message);
        done();
    });
    test('Write Unicode String', (done) => {
        const message = 'Hello World - Функция проверки ИНН и КПП - 说明';
        const buffer = Buffer.from('');
        const socket = new MockSocket();

        const stream = new SocketStream((socket as any) as net.Socket, buffer);
        stream.WriteString(message);

        assert.strictEqual(socket.dataWritten, message);
        done();
    });
});
