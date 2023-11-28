/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference lib='webworker' />

// Use direct import as TS server is bundled on web
import ts from 'typescript/lib/tsserverlibrary';

import { URI } from 'vscode-uri';
import { FileWatcherManager } from './fileWatcherManager';
import { Logger, parseLogLevel } from './logging';
import { PathMapper } from './pathMapper';
import { createSys } from './serverHost.browser';
import { parseSessionOptions, startSession } from './session';
import { findArgument, hasArgument, parseServerMode } from './util/args';

const setSys: (s: ts.System) => void = (ts as any).setSys;

async function initializeSession(
	args: readonly string[],
	extensionUri: URI,
	ports: { tsserver: MessagePort; sync: MessagePort; watcher: MessagePort },
): Promise<void> {
	const logLevel = parseLogLevel(findArgument(args, '--logVerbosity'));
	const logger = new Logger(logLevel, postMessage);

	const modeOrUnknown = parseServerMode(args);
	const serverMode = typeof modeOrUnknown === 'number' ? modeOrUnknown : undefined;
	const unknownServerMode = typeof modeOrUnknown === 'string' ? modeOrUnknown : undefined;
	logger.tsLogger.info(`Starting TS Server`);
	logger.tsLogger.info(`Version: ${ts.version}`);
	logger.tsLogger.info(`Arguments: ${args.join(' ')}`);
	logger.tsLogger.info(`ServerMode: ${serverMode} unknownServerMode: ${unknownServerMode}`);
	const sessionOptions = parseSessionOptions(args, serverMode);

	const enabledExperimentalTypeAcquisition = hasArgument(args, '--enableProjectWideIntelliSenseOnWeb') && hasArgument(args, '--experimentalTypeAcquisition');

	const pathMapper = new PathMapper(extensionUri);
	const watchManager = new FileWatcherManager(ports.watcher as any, extensionUri, enabledExperimentalTypeAcquisition, pathMapper, logger);

	const { sys, fs } = await createSys(ts, args, ports.sync, logger, watchManager, pathMapper, () => {
		removeEventListener('message', listener);
	});
	setSys(sys);
	startSession(ts, sys, fs, sessionOptions, ports.tsserver as any, pathMapper, logger);
}

let hasInitialized = false;
const listener = async (e: any) => {
	if (!hasInitialized) {
		hasInitialized = true;
		if ('args' in e.data) {
			const args = e.data.args;
			const extensionUri = URI.from(e.data.extensionUri);
			const [sync, tsserver, watcher] = e.ports as MessagePort[];
			await initializeSession(args, extensionUri, { sync, tsserver, watcher });
		} else {
			console.error('unexpected message in place of initial message: ' + JSON.stringify(e.data));
		}
		return;
	}
	console.error(`unexpected message on main channel: ${JSON.stringify(e)}`);
};
addEventListener('message', listener);
