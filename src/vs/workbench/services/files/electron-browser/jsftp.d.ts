

import { Readable } from 'stream';
import { EventEmitter } from 'events';

declare namespace JSFtp {


	interface JSFtpOptions {
		host: string;
		port?: number | 21;
		user?: string | 'anonymous';
		pass?: string | '@anonymous';
		useList?: boolean
	}

	interface Callback<T> {
		(err: any, result: T): void;
	}


	interface Entry {
		name: string;
		size: number;
		time: number;
		type: 0 | 1;
	}
}

interface JSFtp extends EventEmitter {
	keepAlive(wait?: number): void;
	ls(path: string, callback: JSFtp.Callback<JSFtp.Entry[]>): void;
	list(path: string, callback: JSFtp.Callback<any>): void;
	put(buffer: Buffer, path: string, callback: JSFtp.Callback<void>): void;
	get(path: string, callback: JSFtp.Callback<Readable>): void;
	setType(type: 'A' | 'AN' | 'AT' | 'AC' | 'E' | 'I' | 'L', callback: JSFtp.Callback<any>): void;
	raw<T = any>(command: string, args: any[], callback: JSFtp.Callback<T>): void
}

interface JSFtpConstructor {
	new(options: JSFtp.JSFtpOptions): JSFtp;
}

declare const JSFtp: JSFtpConstructor;

export = JSFtp;
