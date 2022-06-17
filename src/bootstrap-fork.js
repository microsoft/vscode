/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

const performance = require('./vs/base/common/performance');
performance.mark('code/fork/start');

const bootstrap = require('./bootstrap');
const bootstrapNode = require('./bootstrap-node');

// Remove global paths from the node module lookup
bootstrapNode.removeGlobalNodeModuleLookupPaths();

// Enable ASAR in our forked processes
bootstrap.enableASARSupport();

if (process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH']) {
	bootstrapNode.injectNodeModuleLookupPath(process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH']);
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

// Listen for message ports
if (process.env['VSCODE_WILL_SEND_MESSAGE_PORT']) {
	listenForMessagePort();
}

// Load AMD entry point
require('./bootstrap-amd').load(process.env['VSCODE_AMD_ENTRYPOINT']);


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

		// Add the stack trace as payload if we are told so. We remove the message and the 2 top frames
		// to start the stacktrace where the console message was being written
		if (process.env['VSCODE_LOG_STACK'] === 'true') {
			const stack = new Error().stack;
			if (stack) {
				argsArray.push({ __$stack: stack.split('\n').slice(3).join('\n') });
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

	let isMakingConsoleCall = false;

	/**
	 * Wraps a console message so that it is transmitted to the renderer. If
	 * native logging is turned on, the original console message will be written
	 * as well. This is needed since the console methods are "magic" in V8 and
	 * are the only methods that allow later introspection of logged variables.
	 *
	 * The wrapped property is not defined with `writable: false` to avoid
	 * throwing errors, but rather a no-op setting. See https://github.com/microsoft/vscode-extension-telemetry/issues/88
	 *
	 * @param {'log' | 'info' | 'warn' | 'error'} method
	 * @param {'log' | 'warn' | 'error'} severity
	 */
	function wrapConsoleMethod(method, severity) {
		if (process.env['VSCODE_LOG_NATIVE'] === 'true') {
			const original = console[method];
			const stream = method === 'error' || method === 'warn' ? process.stderr : process.stdout;
			Object.defineProperty(console, method, {
				set: () => { },
				get: () => function () {
					safeSendConsoleMessage(severity, safeToArray(arguments));
					isMakingConsoleCall = true;
					stream.write('\nSTART_NATIVE_LOG\n');
					original.apply(console, arguments);
					stream.write('\nEND_NATIVE_LOG\n');
					isMakingConsoleCall = false;
				},
			});
		} else {
			Object.defineProperty(console, method, {
				set: () => { },
				get: () => function () { safeSendConsoleMessage(severity, safeToArray(arguments)); },
			});
		}
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
			get: () => (chunk, encoding, callback) => {
				if (!isMakingConsoleCall) {
					buf += chunk.toString(encoding);
					const eol = buf.length > MAX_STREAM_BUFFER_LENGTH ? buf.length : buf.lastIndexOf('\n');
					if (eol !== -1) {
						console[severity](buf.slice(0, eol));
						buf = buf.slice(eol + 1);
					}
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
	} else if (process.env['VSCODE_LOG_NATIVE'] !== 'true') {
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

function listenForMessagePort() {
	// We need to listen for the 'port' event as soon as possible,
	// otherwise we might miss the event. But we should also be
	// prepared in case the event arrives late.
	process.on('port', (e) => {
		if (global.vscodePortsCallback) {
			global.vscodePortsCallback(e.ports);
		} else {
			global.vscodePorts = e.ports;
		}
	});
}

//#endregion
