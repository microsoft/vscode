/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

// ESM-comment-begin
// const performance = require('./vs/base/common/performance');
// const bootstrapNode = require('./bootstrap-node');
// const bootstrapAmd = require('./bootstrap-amd');
// ESM-comment-end
// ESM-uncomment-begin
import * as performance from './vs/base/common/performance.js';
import * as bootstrapNode from './bootstrap-node.js';
import * as bootstrapAmd from './bootstrap-amd.js';
// ESM-uncomment-end

performance.mark('code/fork/start');

// Crash reporter
configureCrashReporter();

// Remove global paths from the node module lookup (node.js only)
bootstrapNode.removeGlobalNodeJsModuleLookupPaths();

// Enable ASAR in our forked processes
bootstrapNode.enableASARSupport();

if (process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH']) {
	bootstrapNode.devInjectNodeModuleLookupPath(process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH']);
}

// Configure: pipe logging to parent process
if (!!process.send && process.env['VSCODE_PIPE_LOGGING'] === 'true') {
	pipeLoggingToParent();
}

// Handle Exceptions
if (!process.env['VSCODE_HANDLES_UNCAUGHT_ERRORS']) {
	handleExceptions();
}

// Terminate when parent terminates
if (process.env['VSCODE_PARENT_PID']) {
	terminateWhenParentTerminates();
}

// Load AMD entry point
bootstrapAmd.load(process.env['VSCODE_AMD_ENTRYPOINT']);


//#region Helpers

function pipeLoggingToParent() {
	const MAX_STREAM_BUFFER_LENGTH = 1024 * 1024;
	const MAX_LENGTH = 100000;

	/**
	 * Prevent circular stringify and convert arguments to real array
	 *
	 * @param {ArrayLike<unknown>} args
	 */
	function safeToArray(args) {
		/**
		 * @type {string[]}
		 */
		const seen = [];
		const argsArray = [];

		// Massage some arguments with special treatment
		if (args.length) {
			for (let i = 0; i < args.length; i++) {
				let arg = args[i];

				// Any argument of type 'undefined' needs to be specially treated because
				// JSON.stringify will simply ignore those. We replace them with the string
				// 'undefined' which is not 100% right, but good enough to be logged to console
				if (typeof arg === 'undefined') {
					arg = 'undefined';
				}

				// Any argument that is an Error will be changed to be just the error stack/message
				// itself because currently cannot serialize the error over entirely.
				else if (arg instanceof Error) {
					const errorObj = arg;
					if (errorObj.stack) {
						arg = errorObj.stack;
					} else {
						arg = errorObj.toString();
					}
				}

				argsArray.push(arg);
			}
		}

		try {
			const res = JSON.stringify(argsArray, function (key, value) {

				// Objects get special treatment to prevent circles
				if (isObject(value) || Array.isArray(value)) {
					if (seen.indexOf(value) !== -1) {
						return '[Circular]';
					}

					seen.push(value);
				}

				return value;
			});

			if (res.length > MAX_LENGTH) {
				return 'Output omitted for a large object that exceeds the limits';
			}

			return res;
		} catch (error) {
			return `Output omitted for an object that cannot be inspected ('${error.toString()}')`;
		}
	}

	/**
	 * @param {{ type: string; severity: string; arguments: string; }} arg
	 */
	function safeSend(arg) {
		try {
			if (process.send) {
				process.send(arg);
			}
		} catch (error) {
			// Can happen if the parent channel is closed meanwhile
		}
	}

	/**
	 * @param {unknown} obj
	 */
	function isObject(obj) {
		return typeof obj === 'object'
			&& obj !== null
			&& !Array.isArray(obj)
			&& !(obj instanceof RegExp)
			&& !(obj instanceof Date);
	}

	/**
	 *
	 * @param {'log' | 'warn' | 'error'} severity
	 * @param {string} args
	 */
	function safeSendConsoleMessage(severity, args) {
		safeSend({ type: '__$console', severity, arguments: args });
	}

	/**
	 * Wraps a console message so that it is transmitted to the renderer.
	 *
	 * The wrapped property is not defined with `writable: false` to avoid
	 * throwing errors, but rather a no-op setting. See https://github.com/microsoft/vscode-extension-telemetry/issues/88
	 *
	 * @param {'log' | 'info' | 'warn' | 'error'} method
	 * @param {'log' | 'warn' | 'error'} severity
	 */
	function wrapConsoleMethod(method, severity) {
		Object.defineProperty(console, method, {
			set: () => { },
			get: () => function () { safeSendConsoleMessage(severity, safeToArray(arguments)); },
		});
	}

	/**
	 * Wraps process.stderr/stdout.write() so that it is transmitted to the
	 * renderer or CLI. It both calls through to the original method as well
	 * as to console.log with complete lines so that they're made available
	 * to the debugger/CLI.
	 *
	 * @param {'stdout' | 'stderr'} streamName
	 * @param {'log' | 'warn' | 'error'} severity
	 */
	function wrapStream(streamName, severity) {
		const stream = process[streamName];
		const original = stream.write;

		/** @type string */
		let buf = '';

		Object.defineProperty(stream, 'write', {
			set: () => { },
			get: () => (/** @type {string | Buffer | Uint8Array} */ chunk, /** @type {BufferEncoding | undefined} */ encoding, /** @type {((err?: Error | undefined) => void) | undefined} */ callback) => {
				buf += chunk.toString(encoding);
				const eol = buf.length > MAX_STREAM_BUFFER_LENGTH ? buf.length : buf.lastIndexOf('\n');
				if (eol !== -1) {
					console[severity](buf.slice(0, eol));
					buf = buf.slice(eol + 1);
				}

				original.call(stream, chunk, encoding, callback);
			},
		});
	}

	// Pass console logging to the outside so that we have it in the main side if told so
	if (process.env['VSCODE_VERBOSE_LOGGING'] === 'true') {
		wrapConsoleMethod('info', 'log');
		wrapConsoleMethod('log', 'log');
		wrapConsoleMethod('warn', 'warn');
		wrapConsoleMethod('error', 'error');
	} else {
		console.log = function () { /* ignore */ };
		console.warn = function () { /* ignore */ };
		console.info = function () { /* ignore */ };
		wrapConsoleMethod('error', 'error');
	}

	wrapStream('stderr', 'error');
	wrapStream('stdout', 'log');
}

function handleExceptions() {

	// Handle uncaught exceptions
	process.on('uncaughtException', function (err) {
		console.error('Uncaught Exception: ', err);
	});

	// Handle unhandled promise rejections
	process.on('unhandledRejection', function (reason) {
		console.error('Unhandled Promise Rejection: ', reason);
	});
}

function terminateWhenParentTerminates() {
	const parentPid = Number(process.env['VSCODE_PARENT_PID']);

	if (typeof parentPid === 'number' && !isNaN(parentPid)) {
		setInterval(function () {
			try {
				process.kill(parentPid, 0); // throws an exception if the main process doesn't exist anymore.
			} catch (e) {
				process.exit();
			}
		}, 5000);
	}
}

function configureCrashReporter() {
	const crashReporterProcessType = process.env['VSCODE_CRASH_REPORTER_PROCESS_TYPE'];
	if (crashReporterProcessType) {
		try {
			// @ts-ignore
			if (process['crashReporter'] && typeof process['crashReporter'].addExtraParameter === 'function' /* Electron only */) {
				// @ts-ignore
				process['crashReporter'].addExtraParameter('processType', crashReporterProcessType);
			}
		} catch (error) {
			console.error(error);
		}
	}
}

//#endregion
