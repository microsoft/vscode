/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference lib='webworker' />

import ts from 'typescript/lib/tsserverlibrary';
import { URI } from 'vscode-uri';
import { FileWatcherManager } from './fileWatcherManager';
import { Logger, parseLogLevel } from './logging';
import { PathMapper } from './pathMapper';
import { createSys } from './serverHost';
import { findArgument, findArgumentStringArray, hasArgument, parseServerMode } from './util/args';
import { StartSessionOptions, startWorkerSession } from './workerSession';

type TsModule = typeof ts;

interface TsInternals extends TsModule {
	setSys(sys: ts.System): void;
}

const setSys: (s: ts.System) => void = (ts as TsInternals).setSys;

async function initializeSession(
	args: readonly string[],
	extensionUri: URI,
	ports: { tsserver: MessagePort; sync: MessagePort; watcher: MessagePort },
): Promise<void> {
	const logLevel = parseLogLevel(findArgument(args, '--logVerbosity'));
	const logger = new Logger(logLevel);

	const modeOrUnknown = parseServerMode(args);
	const serverMode = typeof modeOrUnknown === 'number' ? modeOrUnknown : undefined;
	const unknownServerMode = typeof modeOrUnknown === 'string' ? modeOrUnknown : undefined;
	logger.tsLogger.info(`Starting TS Server`);
	logger.tsLogger.info(`Version: 0.0.0`);
	logger.tsLogger.info(`Arguments: ${args.join(' ')}`);
	logger.tsLogger.info(`ServerMode: ${serverMode} unknownServerMode: ${unknownServerMode}`);
	const sessionOptions = parseSessionOptions(args, serverMode);

	const enabledExperimentalTypeAcquisition = hasArgument(args, '--enableProjectWideIntelliSenseOnWeb') && hasArgument(args, '--experimentalTypeAcquisition');

	const pathMapper = new PathMapper(extensionUri);
	const watchManager = new FileWatcherManager(ports.watcher, extensionUri, enabledExperimentalTypeAcquisition, pathMapper, logger);

	const { sys, fs } = await createSys(ts, args, ports.sync, logger, watchManager, pathMapper, () => {
		removeEventListener('message', listener);
	});
	setSys(sys);

	const localeStr = findArgument(args, '--locale');
	if (localeStr) {
		ts.validateLocaleAndSetLanguage(localeStr, sys);
	}

	startWorkerSession(ts, sys, fs, sessionOptions, ports.tsserver, pathMapper, logger);
}

function parseSessionOptions(args: readonly string[], serverMode: ts.LanguageServiceMode | undefined): StartSessionOptions {
	return {
		globalPlugins: findArgumentStringArray(args, '--globalPlugins'),
		pluginProbeLocations: findArgumentStringArray(args, '--pluginProbeLocations'),
		allowLocalPluginLoads: hasArgument(args, '--allowLocalPluginLoads'),
		useSingleInferredProject: hasArgument(args, '--useSingleInferredProject'),
		useInferredProjectPerProjectRoot: hasArgument(args, '--useInferredProjectPerProjectRoot'),
		suppressDiagnosticEvents: hasArgument(args, '--suppressDiagnosticEvents'),
		noGetErrOnBackgroundUpdate: hasArgument(args, '--noGetErrOnBackgroundUpdate'),
		serverMode,
		disableAutomaticTypingAcquisition: hasArgument(args, '--disableAutomaticTypingAcquisition'),
	};
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
