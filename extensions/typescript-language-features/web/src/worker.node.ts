/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from 'vscode-uri';
import { MessagePort, parentPort, workerData } from 'worker_threads';
import { Logger, parseLogLevel } from './logging';
import { PathMapper } from './pathMapper';
import { parseSessionOptions, startSession } from './session';
import { findArgument, parseServerMode } from './util/args';
import { FileWatcherManager } from './fileWatcherManager';

async function initializeSession(
	ts: typeof import('typescript/lib/tsserverlibrary'),
	args: readonly string[],
	extensionUri: URI,
	ports: { tsserver: MessagePort; sync: MessagePort; watcher: MessagePort },
): Promise<void> {
	const logLevel = parseLogLevel(findArgument(args, '--logVerbosity'));
	const logger = new Logger(logLevel, msg => parentPort?.postMessage(msg));

	const modeOrUnknown = parseServerMode(args);
	const serverMode = typeof modeOrUnknown === 'number' ? modeOrUnknown : undefined;
	const unknownServerMode = typeof modeOrUnknown === 'string' ? modeOrUnknown : undefined;
	logger.tsLogger.info(`Starting TS Server`);
	logger.tsLogger.info(`Version: ${ts.version}`);
	logger.tsLogger.info(`Arguments: ${args.join(' ')}`);
	logger.tsLogger.info(`ServerMode: ${serverMode} unknownServerMode: ${unknownServerMode}`);
	const sessionOptions = parseSessionOptions(args, serverMode);


	const pathMapper = new PathMapper(extensionUri);
	const watchManager = new FileWatcherManager(ports.watcher as any, extensionUri, /*enabledExperimentalTypeAcquisition*/ false, pathMapper, logger);

	const sys = ts.sys as any;
	const fs = undefined;

	void watchManager;

	// TODO: shim out sys
	// const { sys, fs } = await createSys(ts, args, ports.sync, logger, watchManager, pathMapper, () => {
	// 	removeEventListener('message', listener);
	// });
	// const setSys: (s: ts.System) => void = (ts as any).setSys;
	// setSys(sys);
	startSession(ts, sys, fs, sessionOptions, ports.tsserver, pathMapper, logger);
}


let hasInitialized = false;
const listener = async (e: any) => {
	if (!hasInitialized) {
		hasInitialized = true;
		if ('args' in e) {
			const args = e.args;
			const { syncFs, tsserver, watcher } = e.ports;
			const extensionUri = URI.parse(e.extensionUri);
			const ts = require(/* webpackIgnore: true */ workerData.serverPath);
			await initializeSession(ts, args, extensionUri, { sync: syncFs, tsserver, watcher });
		} else {
			console.error('unexpected message in place of initial message: ' + JSON.stringify(e));
		}
		return;
	}
	console.error(`unexpected message on main channel: ${JSON.stringify(e)}`);
};

parentPort?.on('message', listener);

process.on('uncaughtException', (err) => {
	console.error('An unhandled exception occurred:', err);
	parentPort?.postMessage({ type: 'log', body: `An unhandled exception occurred: ${err}` });
});
