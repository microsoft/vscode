// Type definitions for gulp-util v3.0.x
// Project: https://github.com/gulpjs/gulp-util
// Definitions by: jedmao <https://github.com/jedmao>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare module 'gulp-util' {

	import vinyl = require('vinyl');
	import chalk = require('chalk');
	import through2 = require('through2');

	export class File extends vinyl { }

	/**
	* Replaces a file extension in a path. Returns the new path.
	*/
	export function replaceExtension(npath: string, ext: string): string;

	export var colors: typeof chalk;

	export var date: {
		(now?: Date, mask?: string, convertLocalTimeToUTC?: boolean): any;
		(date?: string, mask?: string, convertLocalTimeToUTC?: boolean): any;
		masks: any;
	};

	/**
	* Logs stuff. Already prefixed with [gulp] and all that. Use the right colors
	* for values. If you pass in multiple arguments it will join them by a space.
	*/
	export function log(message?: any, ...optionalParams: any[]): void;

	/**
	* This is a lodash.template function wrapper. You must pass in a valid gulp
	* file object so it is available to the user or it will error. You can not
	* configure any of the delimiters. Look at the lodash docs for more info.
	*/
	export function template(tmpl: string): (opt: { file: { path: string } }) => string;
	export function template(tmpl: string, opt: { file: { path: string } }): string;

	export var env: any;

	export function beep(): void;

	/**
	* Returns a stream that does nothing but pass data straight through.
	*/
	export var noop: typeof through2;

	export function isStream(obj: any): boolean;

	export function isBuffer(obj: any): boolean;

	export function isNull(obj: any): boolean;

	export var linefeed: string;

	export function combine(streams: NodeJS.ReadWriteStream[]): () => NodeJS.ReadWriteStream;
	export function combine(...streams: NodeJS.ReadWriteStream[]): () => NodeJS.ReadWriteStream;

	/**
	* This is similar to es.wait but instead of buffering text into one string
	* it buffers anything into an array (so very useful for file objects).
	*/
	export function buffer(cb?: (err: Error, data: any[]) => void): NodeJS.ReadWriteStream;

	export class PluginError implements Error, PluginErrorOptions {
		constructor(options?: PluginErrorOptions);
		constructor(pluginName: string, options?: PluginErrorOptions);
		constructor(pluginName: string, message: string, options?: PluginErrorOptions);
		constructor(pluginName: string, message: Error, options?: PluginErrorOptions);
		/**
		* The module name of your plugin.
		*/
		name: string;
		/**
		* Can be a string or an existing error.
		*/
		message: any;
		fileName: string;
		lineNumber: number;
		/**
		* You need to include the message along with this stack. If you pass an
		* error in as the message the stack will be pulled from that, otherwise one
		* will be created.
		*/
		stack: string;
		/**
		* By default the stack will not be shown. Set this to true if you think the
		* stack is important for your error.
		*/
		showStack: boolean;
		/**
		* Error properties will be included in err.toString(). Can be omitted by
		* setting this to false.
		*/
		showProperties: boolean;
		plugin: string;
		error: Error;
	}

}

interface PluginErrorOptions {
	/**
	* The module name of your plugin.
	*/
	name?: string;
	/**
	* Can be a string or an existing error.
	*/
	message?: any;
	fileName?: string;
	lineNumber?: number;
	/**
	* You need to include the message along with this stack. If you pass an
	* error in as the message the stack will be pulled from that, otherwise one
	* will be created.
	*/
	stack?: string;
	/**
	* By default the stack will not be shown. Set this to true if you think the
	* stack is important for your error.
	*/
	showStack?: boolean;
	/**
	* Error properties will be included in err.toString(). Can be omitted by
	* setting this to false.
	*/
	showProperties?: boolean;
	plugin?: string;
	error?: Error;
}