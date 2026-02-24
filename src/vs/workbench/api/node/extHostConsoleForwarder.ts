/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractExtHostConsoleForwarder } from '../common/extHostConsoleForwarder.js';
import { IExtHostInitDataService } from '../common/extHostInitDataService.js';
import { IExtHostRpcService } from '../common/extHostRpcService.js';
import { NativeLogMarkers } from '../../services/extensions/common/extensionHostProtocol.js';

const MAX_STREAM_BUFFER_LENGTH = 1024 * 1024;

export class ExtHostConsoleForwarder extends AbstractExtHostConsoleForwarder {

	private _isMakingConsoleCall: boolean = false;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService initData: IExtHostInitDataService,
	) {
		super(extHostRpc, initData);

		this._wrapStream('stderr', 'error');
		this._wrapStream('stdout', 'log');
	}

	protected override _nativeConsoleLogMessage(method: 'log' | 'info' | 'warn' | 'error' | 'debug', original: (...args: any[]) => void, args: IArguments) {
		const stream = method === 'error' || method === 'warn' ? process.stderr : process.stdout;
		this._isMakingConsoleCall = true;
		stream.write(`\n${NativeLogMarkers.Start}\n`);
		// eslint-disable-next-line local/code-no-any-casts
		original.apply(console, args as any);
		stream.write(`\n${NativeLogMarkers.End}\n`);
		this._isMakingConsoleCall = false;
	}

	/**
	 * Wraps process.stderr/stdout.write() so that it is transmitted to the
	 * renderer or CLI. It both calls through to the original method as well
	 * as to console.log with complete lines so that they're made available
	 * to the debugger/CLI.
	 */
	private _wrapStream(streamName: 'stdout' | 'stderr', severity: 'log' | 'warn' | 'error') {
		const stream = process[streamName];
		const original = stream.write;

		let buf = '';

		Object.defineProperty(stream, 'write', {
			set: () => { },
			get: () => (chunk: Uint8Array | string, encoding?: BufferEncoding, callback?: (err?: Error | null) => void) => {
				if (!this._isMakingConsoleCall) {
					// eslint-disable-next-line local/code-no-any-casts
					buf += (chunk as any).toString(encoding);
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
}
