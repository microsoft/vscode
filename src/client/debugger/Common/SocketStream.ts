'use strict';

import * as net from 'net';
var uint64be = require("uint64be");


export class SocketStream {
    constructor(socket: net.Socket, buffer: Buffer) {
        this.buffer = buffer;
        this.socket = socket;
    }

    private socket: net.Socket;
    public WriteInt32(num: number) {
        this.WriteInt64(num);
    }

    public WriteInt64(num: number) {
        var buffer = uint64be.encode(num);
        this.socket.write(buffer);
    }
    public WriteString(value: string) {
        var stringBuffer = new Buffer(value, "utf-8");
        this.WriteInt32(stringBuffer.length);
        if (stringBuffer.length > 0) {
            this.socket.write(stringBuffer);
        }
    }
    public Write(buffer: Buffer) {
        this.socket.write(buffer);
    }


    private buffer: Buffer;
    private isInTransaction: boolean;
    private bytesRead: number = 0;
    public get Buffer(): Buffer {
        return this.buffer;
    }
    public BeginTransaction() {
        this.isInTransaction = true;
        this.bytesRead = 0;
        this.ClearErrors();
    }
    public EndTransaction() {
        this.isInTransaction = true;
        this.buffer = this.buffer.slice(this.bytesRead);
        this.bytesRead = 0;
        this.ClearErrors();
    }
    public RollBackTransaction() {
        this.isInTransaction = false;
        this.bytesRead = 0;
        this.ClearErrors();
    }

    public ClearErrors() {
        this.hasInsufficientDataForReading = false;
    }

    private hasInsufficientDataForReading: boolean = false;
    public get HasInsufficientDataForReading(): boolean {
        return this.hasInsufficientDataForReading;
    }

    public toString(): string {
        return this.buffer.toString();
    }

    public get Length(): number {
        return this.buffer.length;
    }

    public Append(additionalData: Buffer) {
        if (this.buffer.length === 0) {
            this.buffer = additionalData;
            return;
        }
        var newBuffer = new Buffer(this.buffer.length + additionalData.length);
        this.buffer.copy(newBuffer);
        additionalData.copy(newBuffer, this.buffer.length)
        this.buffer = newBuffer;
    }

    private isSufficientDataAvailable(length: number): boolean {
        if (this.buffer.length < (this.bytesRead + length)) {
            this.hasInsufficientDataForReading = true;
        }

        return !this.hasInsufficientDataForReading;
    }

    public ReadByte(): number {
        if (!this.isSufficientDataAvailable(1)) {
            return null;
        }

        var value = this.buffer.slice(this.bytesRead, this.bytesRead + 1)[0];
        if (this.isInTransaction) {
            this.bytesRead++;
        }
        else {
            this.buffer = this.buffer.slice(1);
        }
        return value;
    }

    public ReadString(): string {
        var byteRead = this.ReadByte();
        if (this.HasInsufficientDataForReading) {
            return null;
        }

        if (byteRead < 0) {
            throw new Error("IOException() - Socket.ReadString failed to read string type;");
        }

        var type = new Buffer([byteRead]).toString();
        var isUnicode = false;
        switch (type) {
            case 'N': // null string
                return null;
            case 'U':
                isUnicode = true;
                break;
            case 'A': {
                isUnicode = false;
                break;
            }
            default: {
                throw new Error("IOException(); Socket.ReadString failed to parse unknown string type " + type);
            }
        }

        var len = this.ReadInt32();
        if (this.HasInsufficientDataForReading) {
            return null;
        }

        if (!this.isSufficientDataAvailable(len)) {
            return null;
        }

        var stringBuffer = this.buffer.slice(this.bytesRead, this.bytesRead + len);
        if (this.isInTransaction) {
            this.bytesRead = this.bytesRead + len;
        }
        else {
            this.buffer = this.buffer.slice(len);
        }

        var resp = isUnicode ? stringBuffer.toString('utf-8') : stringBuffer.toString();
        return resp;
    }

    public ReadInt32(): number {
        return this.ReadInt64();
    }

    public ReadInt64(): number {
        if (!this.isSufficientDataAvailable(8)) {
            return null;
        }

        var buf = this.buffer.slice(this.bytesRead, this.bytesRead + 8);

        if (this.isInTransaction) {
            this.bytesRead = this.bytesRead + 8;
        }
        else {
            this.buffer = this.buffer.slice(8);
        }

        var returnValue = uint64be.decode(buf);
        return returnValue;
    }

    public ReadAsciiString(length: number): string {
        if (!this.isSufficientDataAvailable(length)) {
            return null;
        }

        var stringBuffer = this.buffer.slice(this.bytesRead, this.bytesRead + length);
        if (this.isInTransaction) {
            this.bytesRead = this.bytesRead + length;
        }
        else {
            this.buffer = this.buffer.slice(length);
        }
        return stringBuffer.toString("ascii");
    }
}

