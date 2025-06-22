/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/ban-types */
import * as $wcm from '@vscode/wasm-component-model';
import type { u32, u64, s32, float64, i32, i64, ptr, f64 } from '@vscode/wasm-component-model';

export namespace Types {
	export type Scopeitem = {
		name: string;
		id: string;
		tpe: string;
	};
}
export type Types = {
};
export namespace filehandler {
	export type Scopeitem = Types.Scopeitem;
	export type Imports = {
		log: (msg: string) => void;
		outputlog: (msg: string) => void;
		fsread: (fd: u32, offset: u64, length: u32) => Uint8Array;
		getsize: (fd: u32) => u64;
		setscopetop: (name: string, id: u32, tpe: string) => void;
		setvartop: (name: string, id: u32, signalid: u32, tpe: string, encoding: string, width: u32, msb: s32, lsb: s32) => void;
		setmetadata: (scopecount: u32, varcount: u32, timescale: u32, timeunit: string) => void;
		setchunksize: (chunksize: u64, timeend: u64, timetablelength: u64) => void;
		sendtransitiondatachunk: (signalid: u32, totalchunks: u32, chunknum: u32, min: float64, max: float64, data: string) => void;
	};
	export namespace Imports {
		export type Promisified = $wcm.$imports.Promisify<Imports>;
	}
	export namespace imports {
		export type Promisify<T> = $wcm.$imports.Promisify<T>;
	}
	export type Exports = {
		loadfile: (size: u64, fd: u32, loadstatic: boolean, buffersize: u32) => void;
		readbody: () => void;
		unload: () => void;
		/**
		 * wit2ts seems to have issues returning lists of custom types
		 * so we will convert to JSON string
		 */
		getchildren: (id: u32, startindex: u32) => string;
		getsignaldata: (signalidlist: Uint32Array) => void;
		getvaluesattime: (time: u64, paths: string) => string;
	};
	export namespace Exports {
		export type Promisified = $wcm.$exports.Promisify<Exports>;
	}
	export namespace exports {
		export type Promisify<T> = $wcm.$exports.Promisify<T>;
	}
}

export namespace Types.$ {
	export const Scopeitem = new $wcm.RecordType<Types.Scopeitem>([
		['name', $wcm.wstring],
		['id', $wcm.wstring],
		['tpe', $wcm.wstring],
	]);
}
export namespace Types._ {
	export const id = 'vscode:example/types' as const;
	export const witName = 'types' as const;
	export const types: Map<string, $wcm.AnyComponentModelType> = new Map<string, $wcm.AnyComponentModelType>([
		['Scopeitem', $.Scopeitem]
	]);
	export type WasmInterface = {
	};
}
export namespace filehandler.$ {
	export const Scopeitem = Types.$.Scopeitem;
	export namespace imports {
		export const log = new $wcm.FunctionType<filehandler.Imports['log']>('log',[
			['msg', $wcm.wstring],
		], undefined);
		export const outputlog = new $wcm.FunctionType<filehandler.Imports['outputlog']>('outputlog',[
			['msg', $wcm.wstring],
		], undefined);
		export const fsread = new $wcm.FunctionType<filehandler.Imports['fsread']>('fsread',[
			['fd', $wcm.u32],
			['offset', $wcm.u64],
			['length', $wcm.u32],
		], new $wcm.Uint8ArrayType());
		export const getsize = new $wcm.FunctionType<filehandler.Imports['getsize']>('getsize',[
			['fd', $wcm.u32],
		], $wcm.u64);
		export const setscopetop = new $wcm.FunctionType<filehandler.Imports['setscopetop']>('setscopetop',[
			['name', $wcm.wstring],
			['id', $wcm.u32],
			['tpe', $wcm.wstring],
		], undefined);
		export const setvartop = new $wcm.FunctionType<filehandler.Imports['setvartop']>('setvartop',[
			['name', $wcm.wstring],
			['id', $wcm.u32],
			['signalid', $wcm.u32],
			['tpe', $wcm.wstring],
			['encoding', $wcm.wstring],
			['width', $wcm.u32],
			['msb', $wcm.s32],
			['lsb', $wcm.s32],
		], undefined);
		export const setmetadata = new $wcm.FunctionType<filehandler.Imports['setmetadata']>('setmetadata',[
			['scopecount', $wcm.u32],
			['varcount', $wcm.u32],
			['timescale', $wcm.u32],
			['timeunit', $wcm.wstring],
		], undefined);
		export const setchunksize = new $wcm.FunctionType<filehandler.Imports['setchunksize']>('setchunksize',[
			['chunksize', $wcm.u64],
			['timeend', $wcm.u64],
			['timetablelength', $wcm.u64],
		], undefined);
		export const sendtransitiondatachunk = new $wcm.FunctionType<filehandler.Imports['sendtransitiondatachunk']>('sendtransitiondatachunk',[
			['signalid', $wcm.u32],
			['totalchunks', $wcm.u32],
			['chunknum', $wcm.u32],
			['min', $wcm.float64],
			['max', $wcm.float64],
			['data', $wcm.wstring],
		], undefined);
	}
	export namespace exports {
		export const loadfile = new $wcm.FunctionType<filehandler.Exports['loadfile']>('loadfile',[
			['size', $wcm.u64],
			['fd', $wcm.u32],
			['loadstatic', $wcm.bool],
			['buffersize', $wcm.u32],
		], undefined);
		export const readbody = new $wcm.FunctionType<filehandler.Exports['readbody']>('readbody', [], undefined);
		export const unload = new $wcm.FunctionType<filehandler.Exports['unload']>('unload', [], undefined);
		export const getchildren = new $wcm.FunctionType<filehandler.Exports['getchildren']>('getchildren',[
			['id', $wcm.u32],
			['startindex', $wcm.u32],
		], $wcm.wstring);
		export const getsignaldata = new $wcm.FunctionType<filehandler.Exports['getsignaldata']>('getsignaldata',[
			['signalidlist', new $wcm.Uint32ArrayType()],
		], undefined);
		export const getvaluesattime = new $wcm.FunctionType<filehandler.Exports['getvaluesattime']>('getvaluesattime',[
			['time', $wcm.u64],
			['paths', $wcm.wstring],
		], $wcm.wstring);
	}
}
export namespace filehandler._ {
	export const id = 'vscode:example/filehandler' as const;
	export const witName = 'filehandler' as const;
	export type $Root = {
		'log': (msg_ptr: i32, msg_len: i32) => void;
		'outputlog': (msg_ptr: i32, msg_len: i32) => void;
		'fsread': (fd: i32, offset: i64, length: i32, result: ptr<Uint8Array>) => void;
		'getsize': (fd: i32) => i64;
		'setscopetop': (name_ptr: i32, name_len: i32, id: i32, tpe_ptr: i32, tpe_len: i32) => void;
		'setvartop': (name_ptr: i32, name_len: i32, id: i32, signalid: i32, tpe_ptr: i32, tpe_len: i32, encoding_ptr: i32, encoding_len: i32, width: i32, msb: i32, lsb: i32) => void;
		'setmetadata': (scopecount: i32, varcount: i32, timescale: i32, timeunit_ptr: i32, timeunit_len: i32) => void;
		'setchunksize': (chunksize: i64, timeend: i64, timetablelength: i64) => void;
		'sendtransitiondatachunk': (signalid: i32, totalchunks: i32, chunknum: i32, min: f64, max: f64, data_ptr: i32, data_len: i32) => void;
	};
	export namespace imports {
		export const functions: Map<string, $wcm.FunctionType> = new Map([
			['log', $.imports.log],
			['outputlog', $.imports.outputlog],
			['fsread', $.imports.fsread],
			['getsize', $.imports.getsize],
			['setscopetop', $.imports.setscopetop],
			['setvartop', $.imports.setvartop],
			['setmetadata', $.imports.setmetadata],
			['setchunksize', $.imports.setchunksize],
			['sendtransitiondatachunk', $.imports.sendtransitiondatachunk]
		]);
		export const interfaces: Map<string, $wcm.InterfaceType> = new Map<string, $wcm.InterfaceType>([
			['Types', Types._]
		]);
		export function create(service: filehandler.Imports, context: $wcm.WasmContext): Imports {
			return $wcm.$imports.create<Imports>(_, service, context);
		}
		export function loop(service: filehandler.Imports, context: $wcm.WasmContext): filehandler.Imports {
			return $wcm.$imports.loop<filehandler.Imports>(_, service, context);
		}
	}
	export type Imports = {
		'$root': $Root;
	};
	export namespace exports {
		export const functions: Map<string, $wcm.FunctionType> = new Map([
			['loadfile', $.exports.loadfile],
			['readbody', $.exports.readbody],
			['unload', $.exports.unload],
			['getchildren', $.exports.getchildren],
			['getsignaldata', $.exports.getsignaldata],
			['getvaluesattime', $.exports.getvaluesattime]
		]);
		export function bind(exports: Exports, context: $wcm.WasmContext): filehandler.Exports {
			return $wcm.$exports.bind<filehandler.Exports>(_, exports, context);
		}
	}
	export type Exports = {
		'loadfile': (size: i64, fd: i32, loadstatic: i32, buffersize: i32) => void;
		'readbody': () => void;
		'unload': () => void;
		'getchildren': (id: i32, startindex: i32, result: ptr<string>) => void;
		'getsignaldata': (signalidlist_ptr: i32, signalidlist_len: i32) => void;
		'getvaluesattime': (time: i64, paths_ptr: i32, paths_len: i32, result: ptr<string>) => void;
	};
	export function bind(service: filehandler.Imports, code: $wcm.Code, context?: $wcm.ComponentModelContext): Promise<filehandler.Exports>;
	export function bind(service: filehandler.Imports.Promisified, code: $wcm.Code, port: $wcm.RAL.ConnectionPort, context?: $wcm.ComponentModelContext): Promise<filehandler.Exports.Promisified>;
	export function bind(service: filehandler.Imports | filehandler.Imports.Promisified, code: $wcm.Code, portOrContext?: $wcm.RAL.ConnectionPort | $wcm.ComponentModelContext, context?: $wcm.ComponentModelContext | undefined): Promise<filehandler.Exports> | Promise<filehandler.Exports.Promisified> {
		return $wcm.$main.bind(_, service, code, portOrContext, context);
	}
}