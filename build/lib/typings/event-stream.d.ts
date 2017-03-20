declare module "event-stream" {
	import { Stream } from 'stream';
	import { ThroughStream } from 'through';
	import { MapStream } from 'map-stream';

	function merge(streams: Stream[]): ThroughStream;
	function merge(...streams: Stream[]): ThroughStream;
	function concat(...stream: Stream[]): ThroughStream;
	function duplex(istream: Stream, ostream: Stream): ThroughStream;

	function through(write?: (data: any) => void, end?: () => void,
		opts?: {autoDestroy: boolean; }): ThroughStream;

	function readArray<T>(array: T[]): ThroughStream;
	function writeArray<T>(cb: (err:Error, array:T[]) => void): ThroughStream;

	function mapSync<I,O>(cb: (data:I) => O): ThroughStream;
	function map<I,O>(cb: (data:I, cb:(err?:Error, data?: O)=>void) => O): ThroughStream;

	function readable(asyncFunction: Function): MapStream;
}