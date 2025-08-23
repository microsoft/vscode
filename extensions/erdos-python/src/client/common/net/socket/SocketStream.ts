'use strict';

import * as net from 'net';

const uint64be = require('uint64be');

enum DataType {
    string,
    int32,
    int64,
}

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
        const buffer = uint64be.encode(num);
        this.socket.write(buffer);
    }
    public WriteString(value: string) {
        const stringBuffer = Buffer.from(value, 'utf-8');
        this.WriteInt32(stringBuffer.length);
        if (stringBuffer.length > 0) {
            this.socket.write(stringBuffer);
        }
    }
    public Write(buffer: Buffer) {
        this.socket.write(buffer);
    }

    private buffer: Buffer;
    private isInTransaction!: boolean;
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
        this.isInTransaction = false;
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
        const newBuffer = Buffer.alloc(this.buffer.length + additionalData.length);
        this.buffer.copy(newBuffer);
        additionalData.copy(newBuffer, this.buffer.length);
        this.buffer = newBuffer;
    }

    private isSufficientDataAvailable(length: number): boolean {
        if (this.buffer.length < this.bytesRead + length) {
            this.hasInsufficientDataForReading = true;
        }

        return !this.hasInsufficientDataForReading;
    }

    public ReadByte(): number {
        if (!this.isSufficientDataAvailable(1)) {
            return null as any;
        }

        const value = this.buffer.slice(this.bytesRead, this.bytesRead + 1)[0];
        if (this.isInTransaction) {
            this.bytesRead += 1;
        } else {
            this.buffer = this.buffer.slice(1);
        }
        return value;
    }

    public ReadString(): string {
        const byteRead = this.ReadByte();
        if (this.HasInsufficientDataForReading) {
            return null as any;
        }

        if (byteRead < 0) {
            throw new Error('IOException() - Socket.ReadString failed to read string type;');
        }

        const type = Buffer.from([byteRead]).toString();
        let isUnicode = false;
        switch (type) {
            case 'N': // null string
                return null as any;
            case 'U':
                isUnicode = true;
                break;
            case 'A': {
                isUnicode = false;
                break;
            }
            default: {
                throw new Error(`IOException(); Socket.ReadString failed to parse unknown string type ${type}`);
            }
        }

        const len = this.ReadInt32();
        if (this.HasInsufficientDataForReading) {
            return null as any;
        }

        if (!this.isSufficientDataAvailable(len)) {
            return null as any;
        }

        const stringBuffer = this.buffer.slice(this.bytesRead, this.bytesRead + len);
        if (this.isInTransaction) {
            this.bytesRead = this.bytesRead + len;
        } else {
            this.buffer = this.buffer.slice(len);
        }

        return isUnicode ? stringBuffer.toString('utf-8') : stringBuffer.toString();
    }

    public ReadInt32(): number {
        return this.ReadInt64();
    }

    public ReadInt64(): number {
        if (!this.isSufficientDataAvailable(8)) {
            return null as any;
        }

        const buf = this.buffer.slice(this.bytesRead, this.bytesRead + 8);

        if (this.isInTransaction) {
            this.bytesRead = this.bytesRead + 8;
        } else {
            this.buffer = this.buffer.slice(8);
        }

        return uint64be.decode(buf);
    }

    public ReadAsciiString(length: number): string {
        if (!this.isSufficientDataAvailable(length)) {
            return null as any;
        }

        const stringBuffer = this.buffer.slice(this.bytesRead, this.bytesRead + length);
        if (this.isInTransaction) {
            this.bytesRead = this.bytesRead + length;
        } else {
            this.buffer = this.buffer.slice(length);
        }
        return stringBuffer.toString('ascii');
    }

    private readValueInTransaction<T>(dataType: DataType): T {
        let startedTransaction = false;
        if (!this.isInTransaction) {
            this.BeginTransaction();
            startedTransaction = true;
        }
        let data: any;
        switch (dataType) {
            case DataType.string: {
                data = this.ReadString();
                break;
            }
            case DataType.int32: {
                data = this.ReadInt32();
                break;
            }
            case DataType.int64: {
                data = this.ReadInt64();
                break;
            }
            default: {
                break;
            }
        }
        if (this.HasInsufficientDataForReading) {
            if (startedTransaction) {
                this.RollBackTransaction();
            }
            return undefined as any;
        }
        if (startedTransaction) {
            this.EndTransaction();
        }
        return data;
    }
    public readStringInTransaction(): string {
        return this.readValueInTransaction<string>(DataType.string);
    }

    public readInt32InTransaction(): number {
        return this.readValueInTransaction<number>(DataType.int32);
    }

    public readInt64InTransaction(): number {
        return this.readValueInTransaction<number>(DataType.int64);
    }
}
