/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/ban-types */
import * as $wcm from '@vscode/wasm-component-model';
import type { u64, u32, s32, float32, i64, i32, ptr, f32 } from '@vscode/wasm-component-model';

export namespace Types {
	/**
	 * Basic data types
	 */
	export type Timerange = {
		start: u64;
		end: u64;
		timescale: string;
	};

	export type SignalInfo = {
		id: u32;
		name: string;
		width: u32;
		signalType: string;
		encoding: string;
		msb: s32;
		lsb: s32;
	};

	export type ScopeInfo = {
		id: u32;
		name: string;
		scopeType: string;
		parentId?: u32 | undefined;
	};

	export type Transition = {
		time: u64;
		value: string;
	};

	export type SignalData = {
		signalId: u32;
		transitions: Transition[];
		minTime: u64;
		maxTime: u64;
	};

	export type HierarchyNode = {
		id: u32;
		name: string;
		nodeType: string;

		/**
		 * "scope" or "signal"
		 */
		parentId?: u32 | undefined;
		children: Uint32Array;
		signalInfo?: SignalInfo | undefined;
	};

	export type FileMetadata = {
		format: string;

		/**
		 * "vcd", "fst", "ghw", "fsdb"
		 */
		version: string;
		date: string;
		timescale: string;
		totalSignals: u32;
		totalScopes: u32;
		timeRange: Timerange;
	};

	export enum ParseError {
		invalidFormat = 'invalidFormat',
		fileNotFound = 'fileNotFound',
		permissionDenied = 'permissionDenied',
		corruptedData = 'corruptedData',
		unsupportedVersion = 'unsupportedVersion',
		memoryError = 'memoryError',
		unknownError = 'unknownError'
	}

	export namespace ParseResult {
		export const ok = 'ok' as const;
		export type Ok = { readonly tag: typeof ok; readonly value: FileMetadata } & _common;
		export function Ok(value: FileMetadata): Ok {
			return new VariantImpl(ok, value) as Ok;
		}

		export const err = 'err' as const;
		export type Err = { readonly tag: typeof err; readonly value: ParseError } & _common;
		export function Err(value: ParseError): Err {
			return new VariantImpl(err, value) as Err;
		}

		export type _tt = typeof ok | typeof err;
		export type _vt = FileMetadata | ParseError;
		type _common = Omit<VariantImpl, 'tag' | 'value'>;
		export function _ctor(t: _tt, v: _vt): ParseResult {
			return new VariantImpl(t, v) as ParseResult;
		}
		class VariantImpl {
			private readonly _tag: _tt;
			private readonly _value: _vt;
			constructor(t: _tt, value: _vt) {
				this._tag = t;
				this._value = value;
			}
			get tag(): _tt {
				return this._tag;
			}
			get value(): _vt {
				return this._value;
			}
			isOk(): this is Ok {
				return this._tag === ParseResult.ok;
			}
			isErr(): this is Err {
				return this._tag === ParseResult.err;
			}
		}
	}
	export type ParseResult = ParseResult.Ok | ParseResult.Err;
}
export type Types = {
};
export namespace surferParser {
	export type FileMetadata = Types.FileMetadata;
	export type HierarchyNode = Types.HierarchyNode;
	export type SignalData = Types.SignalData;
	export type SignalInfo = Types.SignalInfo;
	export type ScopeInfo = Types.ScopeInfo;
	export type ParseError = Types.ParseError;
	export const ParseError = Types.ParseError;
	export type ParseResult = Types.ParseResult;
	export const ParseResult = Types.ParseResult;
	export type Timerange = Types.Timerange;
	export type Imports = {
		/**
		 * File system interface - called by WASM to read file data
		 */
		fsRead: (offset: u64, length: u32) => Uint8Array;
		logMessage: (level: string, message: string) => void;
		progressUpdate: (percent: float32, message: string) => void;
		/**
		 * Hierarchy callbacks - called by WASM to send hierarchy data
		 */
		hierarchyNodeDiscovered: (node: HierarchyNode) => void;
		metadataReady: (metadata: FileMetadata) => void;
		/**
		 * Signal data callbacks - called by WASM to send waveform data
		 */
		signalDataChunk: (data: SignalData, chunkIndex: u32, totalChunks: u32) => void;
	};
	export namespace Imports {
		export type Promisified = $wcm.$imports.Promisify<Imports>;
	}
	export namespace imports {
		export type Promisify<T> = $wcm.$imports.Promisify<T>;
	}
	export type Exports = {
		/**
		 * Main API - called by TypeScript to control WASM
		 */
		parseFile: (fileSize: u64, formatHint: string | undefined) => ParseResult;
		getHierarchyChildren: (parentId: u32 | undefined) => HierarchyNode[];
		getSignalData: (signalIds: Uint32Array, timeStart: u64 | undefined, timeEnd: u64 | undefined) => void;
		getSignalValueAtTime: (signalId: u32, time: u64) => string | undefined;
		getTimeRange: () => Timerange | undefined;
		cleanup: () => void;
	};
	export namespace Exports {
		export type Promisified = $wcm.$exports.Promisify<Exports>;
	}
	export namespace exports {
		export type Promisify<T> = $wcm.$exports.Promisify<T>;
	}
}

export namespace Types.$ {
	export const Timerange = new $wcm.RecordType<Types.Timerange>([
		['start', $wcm.u64],
		['end', $wcm.u64],
		['timescale', $wcm.wstring],
	]);
	export const SignalInfo = new $wcm.RecordType<Types.SignalInfo>([
		['id', $wcm.u32],
		['name', $wcm.wstring],
		['width', $wcm.u32],
		['signalType', $wcm.wstring],
		['encoding', $wcm.wstring],
		['msb', $wcm.s32],
		['lsb', $wcm.s32],
	]);
	export const ScopeInfo = new $wcm.RecordType<Types.ScopeInfo>([
		['id', $wcm.u32],
		['name', $wcm.wstring],
		['scopeType', $wcm.wstring],
		['parentId', new $wcm.OptionType<u32>($wcm.u32)],
	]);
	export const Transition = new $wcm.RecordType<Types.Transition>([
		['time', $wcm.u64],
		['value', $wcm.wstring],
	]);
	export const SignalData = new $wcm.RecordType<Types.SignalData>([
		['signalId', $wcm.u32],
		['transitions', new $wcm.ListType<Types.Transition>(Transition)],
		['minTime', $wcm.u64],
		['maxTime', $wcm.u64],
	]);
	export const HierarchyNode = new $wcm.RecordType<Types.HierarchyNode>([
		['id', $wcm.u32],
		['name', $wcm.wstring],
		['nodeType', $wcm.wstring],
		['parentId', new $wcm.OptionType<u32>($wcm.u32)],
		['children', new $wcm.Uint32ArrayType()],
		['signalInfo', new $wcm.OptionType<Types.SignalInfo>(SignalInfo)],
	]);
	export const FileMetadata = new $wcm.RecordType<Types.FileMetadata>([
		['format', $wcm.wstring],
		['version', $wcm.wstring],
		['date', $wcm.wstring],
		['timescale', $wcm.wstring],
		['totalSignals', $wcm.u32],
		['totalScopes', $wcm.u32],
		['timeRange', Timerange],
	]);
	export const ParseError = new $wcm.EnumType<Types.ParseError>(['invalidFormat', 'fileNotFound', 'permissionDenied', 'corruptedData', 'unsupportedVersion', 'memoryError', 'unknownError']);
	export const ParseResult = new $wcm.VariantType<Types.ParseResult, Types.ParseResult._tt, Types.ParseResult._vt>([['ok', FileMetadata], ['err', ParseError]], Types.ParseResult._ctor);
}
export namespace Types._ {
	export const id = 'waveform-surfer:surfer/types' as const;
	export const witName = 'types' as const;
	export const types: Map<string, $wcm.AnyComponentModelType> = new Map<string, $wcm.AnyComponentModelType>([
		['Timerange', $.Timerange],
		['SignalInfo', $.SignalInfo],
		['ScopeInfo', $.ScopeInfo],
		['Transition', $.Transition],
		['SignalData', $.SignalData],
		['HierarchyNode', $.HierarchyNode],
		['FileMetadata', $.FileMetadata],
		['ParseError', $.ParseError],
		['ParseResult', $.ParseResult]
	]);
	export type WasmInterface = {
	};
}
export namespace surferParser.$ {
	export const FileMetadata = Types.$.FileMetadata;
	export const HierarchyNode = Types.$.HierarchyNode;
	export const SignalData = Types.$.SignalData;
	export const SignalInfo = Types.$.SignalInfo;
	export const ScopeInfo = Types.$.ScopeInfo;
	export const ParseError = Types.$.ParseError;
	export const ParseResult = Types.$.ParseResult;
	export const Timerange = Types.$.Timerange;
	export namespace imports {
		export const fsRead = new $wcm.FunctionType<surferParser.Imports['fsRead']>('fs-read',[
			['offset', $wcm.u64],
			['length', $wcm.u32],
		], new $wcm.Uint8ArrayType());
		export const logMessage = new $wcm.FunctionType<surferParser.Imports['logMessage']>('log-message',[
			['level', $wcm.wstring],
			['message', $wcm.wstring],
		], undefined);
		export const progressUpdate = new $wcm.FunctionType<surferParser.Imports['progressUpdate']>('progress-update',[
			['percent', $wcm.float32],
			['message', $wcm.wstring],
		], undefined);
		export const hierarchyNodeDiscovered = new $wcm.FunctionType<surferParser.Imports['hierarchyNodeDiscovered']>('hierarchy-node-discovered',[
			['node', HierarchyNode],
		], undefined);
		export const metadataReady = new $wcm.FunctionType<surferParser.Imports['metadataReady']>('metadata-ready',[
			['metadata', FileMetadata],
		], undefined);
		export const signalDataChunk = new $wcm.FunctionType<surferParser.Imports['signalDataChunk']>('signal-data-chunk',[
			['data', SignalData],
			['chunkIndex', $wcm.u32],
			['totalChunks', $wcm.u32],
		], undefined);
	}
	export namespace exports {
		export const parseFile = new $wcm.FunctionType<surferParser.Exports['parseFile']>('parse-file',[
			['fileSize', $wcm.u64],
			['formatHint', new $wcm.OptionType<string>($wcm.wstring)],
		], ParseResult);
		export const getHierarchyChildren = new $wcm.FunctionType<surferParser.Exports['getHierarchyChildren']>('get-hierarchy-children',[
			['parentId', new $wcm.OptionType<u32>($wcm.u32)],
		], new $wcm.ListType<surferParser.HierarchyNode>(HierarchyNode));
		export const getSignalData = new $wcm.FunctionType<surferParser.Exports['getSignalData']>('get-signal-data',[
			['signalIds', new $wcm.Uint32ArrayType()],
			['timeStart', new $wcm.OptionType<u64>($wcm.u64)],
			['timeEnd', new $wcm.OptionType<u64>($wcm.u64)],
		], undefined);
		export const getSignalValueAtTime = new $wcm.FunctionType<surferParser.Exports['getSignalValueAtTime']>('get-signal-value-at-time',[
			['signalId', $wcm.u32],
			['time', $wcm.u64],
		], new $wcm.OptionType<string>($wcm.wstring));
		export const getTimeRange = new $wcm.FunctionType<surferParser.Exports['getTimeRange']>('get-time-range', [], new $wcm.OptionType<surferParser.Timerange>(Timerange));
		export const cleanup = new $wcm.FunctionType<surferParser.Exports['cleanup']>('cleanup', [], undefined);
	}
}
export namespace surferParser._ {
	export const id = 'waveform-surfer:surfer/surfer-parser' as const;
	export const witName = 'surfer-parser' as const;
	export type $Root = {
		'fs-read': (offset: i64, length: i32, result: ptr<Uint8Array>) => void;
		'log-message': (level_ptr: i32, level_len: i32, message_ptr: i32, message_len: i32) => void;
		'progress-update': (percent: f32, message_ptr: i32, message_len: i32) => void;
		'hierarchy-node-discovered': (args: ptr<[HierarchyNode]>) => void;
		'metadata-ready': (metadata_FileMetadata_format_ptr: i32, metadata_FileMetadata_format_len: i32, metadata_FileMetadata_version_ptr: i32, metadata_FileMetadata_version_len: i32, metadata_FileMetadata_date_ptr: i32, metadata_FileMetadata_date_len: i32, metadata_FileMetadata_timescale_ptr: i32, metadata_FileMetadata_timescale_len: i32, metadata_FileMetadata_totalSignals: i32, metadata_FileMetadata_totalScopes: i32, metadata_FileMetadata_timeRange_start: i64, metadata_FileMetadata_timeRange_end: i64, metadata_FileMetadata_timeRange_timescale_ptr: i32, metadata_FileMetadata_timeRange_timescale_len: i32) => void;
		'signal-data-chunk': (data_SignalData_signalId: i32, data_SignalData_transitions_ptr: i32, data_SignalData_transitions_len: i32, data_SignalData_minTime: i64, data_SignalData_maxTime: i64, chunkIndex: i32, totalChunks: i32) => void;
	};
	export namespace imports {
		export const functions: Map<string, $wcm.FunctionType> = new Map([
			['fsRead', $.imports.fsRead],
			['logMessage', $.imports.logMessage],
			['progressUpdate', $.imports.progressUpdate],
			['hierarchyNodeDiscovered', $.imports.hierarchyNodeDiscovered],
			['metadataReady', $.imports.metadataReady],
			['signalDataChunk', $.imports.signalDataChunk]
		]);
		export const interfaces: Map<string, $wcm.InterfaceType> = new Map<string, $wcm.InterfaceType>([
			['Types', Types._]
		]);
		export function create(service: surferParser.Imports, context: $wcm.WasmContext): Imports {
			return $wcm.$imports.create<Imports>(_, service, context);
		}
		export function loop(service: surferParser.Imports, context: $wcm.WasmContext): surferParser.Imports {
			return $wcm.$imports.loop<surferParser.Imports>(_, service, context);
		}
	}
	export type Imports = {
		'$root': $Root;
	};
	export namespace exports {
		export const functions: Map<string, $wcm.FunctionType> = new Map([
			['parseFile', $.exports.parseFile],
			['getHierarchyChildren', $.exports.getHierarchyChildren],
			['getSignalData', $.exports.getSignalData],
			['getSignalValueAtTime', $.exports.getSignalValueAtTime],
			['getTimeRange', $.exports.getTimeRange],
			['cleanup', $.exports.cleanup]
		]);
		export function bind(exports: Exports, context: $wcm.WasmContext): surferParser.Exports {
			return $wcm.$exports.bind<surferParser.Exports>(_, exports, context);
		}
	}
	export type Exports = {
		'parse-file': (fileSize: i64, formatHint_case: i32, formatHint_option_ptr: i32, formatHint_option_len: i32, result: ptr<ParseResult>) => void;
		'get-hierarchy-children': (parentId_case: i32, parentId_option: i32, result: ptr<HierarchyNode[]>) => void;
		'get-signal-data': (signalIds_ptr: i32, signalIds_len: i32, timeStart_case: i32, timeStart_option: i64, timeEnd_case: i32, timeEnd_option: i64) => void;
		'get-signal-value-at-time': (signalId: i32, time: i64, result: ptr<string | undefined>) => void;
		'get-time-range': (result: ptr<Timerange | undefined>) => void;
		'cleanup': () => void;
	};
	export function bind(service: surferParser.Imports, code: $wcm.Code, context?: $wcm.ComponentModelContext): Promise<surferParser.Exports>;
	export function bind(service: surferParser.Imports.Promisified, code: $wcm.Code, port: $wcm.RAL.ConnectionPort, context?: $wcm.ComponentModelContext): Promise<surferParser.Exports.Promisified>;
	export function bind(service: surferParser.Imports | surferParser.Imports.Promisified, code: $wcm.Code, portOrContext?: $wcm.RAL.ConnectionPort | $wcm.ComponentModelContext, context?: $wcm.ComponentModelContext | undefined): Promise<surferParser.Exports> | Promise<surferParser.Exports.Promisified> {
		return $wcm.$main.bind(_, service, code, portOrContext, context);
	}
}