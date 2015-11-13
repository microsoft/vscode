declare module 'gulp-filter' {
	import { ThroughStream } from 'through';

	function fn(pattern: string): ThroughStream;
	function fn(patterns: string[]): ThroughStream;

	export = fn;
}