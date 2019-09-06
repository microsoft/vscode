/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as child_process from 'child_process';
import * as path from 'path';
import * as stream from 'stream';
import * as vscode from 'vscode';
import * as Proto from '../protocol';
import API from '../utils/api';
import { TsServerLogLevel, TypeScriptServiceConfiguration } from '../utils/configuration';
import * as electron from '../utils/electron';
import LogDirectoryProvider from '../utils/logDirectoryProvider';
import Logger from '../utils/logger';
import { TypeScriptPluginPathsProvider } from '../utils/pluginPathsProvider';
import { PluginManager } from '../utils/plugins';
import TelemetryReporter from '../utils/telemetry';
import Tracer from '../utils/tracer';
import { TypeScriptVersion, TypeScriptVersionProvider } from '../utils/versionProvider';
import { ITypeScriptServer, PipeRequestCanceller, ProcessBasedTsServer, SyntaxRoutingTsServer, TsServerProcess } from './server';

type ServerKind = 'main' | 'syntax' | 'semantic';

export class TypeScriptServerSpawner {
	public constructor(
		private readonly _versionProvider: TypeScriptVersionProvider,
		private readonly _logDirectoryProvider: LogDirectoryProvider,
		private readonly _pluginPathsProvider: TypeScriptPluginPathsProvider,
		private readonly _logger: Logger,
		private readonly _telemetryReporter: TelemetryReporter,
		private readonly _tracer: Tracer,
	) { }

	public spawn(
		version: TypeScriptVersion,
		configuration: TypeScriptServiceConfiguration,
		pluginManager: PluginManager
	): ITypeScriptServer {
		if (this.shouldUseSeparateSyntaxServer(version, configuration)) {
			const syntaxServer = this.spawnTsServer('syntax', version, configuration, pluginManager);
			const semanticServer = this.spawnTsServer('semantic', version, configuration, pluginManager);
			return new SyntaxRoutingTsServer(syntaxServer, semanticServer);
		}

		return this.spawnTsServer('main', version, configuration, pluginManager);
	}

	private shouldUseSeparateSyntaxServer(
		version: TypeScriptVersion,
		configuration: TypeScriptServiceConfiguration,
	): boolean {
		return configuration.useSeparateSyntaxServer && !!version.apiVersion && version.apiVersion.gte(API.v340);
	}

	private spawnTsServer(
		kind: ServerKind,
		version: TypeScriptVersion,
		configuration: TypeScriptServiceConfiguration,
		pluginManager: PluginManager,
	): ITypeScriptServer {
		const apiVersion = version.apiVersion || API.defaultVersion;

		const { args, cancellationPipeName, tsServerLogFile } = this.getTsServerArgs(kind, configuration, version, apiVersion, pluginManager);

		if (TypeScriptServerSpawner.isLoggingEnabled(apiVersion, configuration)) {
			if (tsServerLogFile) {
				this._logger.info(`<${kind}>  Log file: ${tsServerLogFile}`);
			} else {
				this._logger.error(`<${kind}> Could not create log directory`);
			}
		}

		this._logger.info(`<${kind}> Forking...`);
		const childProcess = electron.fork(version.tsServerPath, args, this.getForkOptions(kind));
		this._logger.info(`<${kind}> Starting...`);

		return new ProcessBasedTsServer(
			kind,
			new ChildServerProcess(childProcess),
			tsServerLogFile,
			new PipeRequestCanceller(kind, cancellationPipeName, this._tracer),
			version,
			this._telemetryReporter,
			this._tracer);
	}

	private getForkOptions(kind: ServerKind) {
		const debugPort = TypeScriptServerSpawner.getDebugPort(kind);
		const tsServerForkOptions: electron.ForkOptions = {
			execArgv: debugPort ? [`--inspect=${debugPort}`] : [],
		};
		return tsServerForkOptions;
	}

	private getTsServerArgs(
		kind: ServerKind,
		configuration: TypeScriptServiceConfiguration,
		currentVersion: TypeScriptVersion,
		apiVersion: API,
		pluginManager: PluginManager,
	): { args: string[], cancellationPipeName: string | undefined, tsServerLogFile: string | undefined } {
		const args: string[] = [];
		let cancellationPipeName: string | undefined;
		let tsServerLogFile: string | undefined;

		if (kind === 'syntax') {
			args.push('--syntaxOnly');
		}

		if (apiVersion.gte(API.v206)) {
			if (apiVersion.gte(API.v250)) {
				args.push('--useInferredProjectPerProjectRoot');
			} else {
				args.push('--useSingleInferredProject');
			}

			if (configuration.disableAutomaticTypeAcquisition || kind === 'syntax') {
				args.push('--disableAutomaticTypingAcquisition');
			}
		}

		if (apiVersion.gte(API.v208) && kind !== 'syntax') {
			args.push('--enableTelemetry');
		}

		if (apiVersion.gte(API.v222)) {
			cancellationPipeName = electron.getTempFile('tscancellation');
			args.push('--cancellationPipeName', cancellationPipeName + '*');
		}

		if (TypeScriptServerSpawner.isLoggingEnabled(apiVersion, configuration)) {
			const logDir = this._logDirectoryProvider.getNewLogDirectory();
			if (logDir) {
				tsServerLogFile = path.join(logDir, `tsserver.log`);
				args.push('--logVerbosity', TsServerLogLevel.toString(configuration.tsServerLogLevel));
				args.push('--logFile', tsServerLogFile);
			}
		}

		if (apiVersion.gte(API.v230)) {
			const pluginPaths = this._pluginPathsProvider.getPluginPaths();

			if (pluginManager.plugins.length) {
				args.push('--globalPlugins', pluginManager.plugins.map(x => x.name).join(','));

				const isUsingBundledTypeScriptVersion = currentVersion.path === this._versionProvider.defaultVersion.path;
				for (const plugin of pluginManager.plugins) {
					if (isUsingBundledTypeScriptVersion || plugin.enableForWorkspaceTypeScriptVersions) {
						pluginPaths.push(plugin.path);
					}
				}
			}

			if (pluginPaths.length !== 0) {
				args.push('--pluginProbeLocations', pluginPaths.join(','));
			}
		}

		if (apiVersion.gte(API.v234)) {
			if (configuration.npmLocation) {
				args.push('--npmLocation', `"${configuration.npmLocation}"`);
			}
		}

		if (apiVersion.gte(API.v260)) {
			args.push('--locale', TypeScriptServerSpawner.getTsLocale(configuration));
		}

		if (apiVersion.gte(API.v291)) {
			args.push('--noGetErrOnBackgroundUpdate');
		}

		if (apiVersion.gte(API.v345)) {
			args.push('--validateDefaultNpmLocation');
		}

		return { args, cancellationPipeName, tsServerLogFile };
	}

	private static getDebugPort(kind: ServerKind): number | undefined {
		if (kind === 'syntax') {
			// We typically only want to debug the main semantic server
			return undefined;
		}
		const value = process.env['TSS_DEBUG'];
		if (value) {
			const port = parseInt(value);
			if (!isNaN(port)) {
				return port;
			}
		}
		return undefined;
	}

	private static isLoggingEnabled(apiVersion: API, configuration: TypeScriptServiceConfiguration) {
		return apiVersion.gte(API.v222) &&
			configuration.tsServerLogLevel !== TsServerLogLevel.Off;
	}

	private static getTsLocale(configuration: TypeScriptServiceConfiguration): string {
		return configuration.locale
			? configuration.locale
			: vscode.env.language;
	}
}

class ChildServerProcess implements TsServerProcess {

	public constructor(
		private readonly _process: child_process.ChildProcess,
	) { }

	get stdout(): stream.Readable { return this._process.stdout!; }

	write(serverRequest: Proto.Request): void {
		this._process.stdin!.write(JSON.stringify(serverRequest) + '\r\n', 'utf8');
	}

	on(name: 'exit', handler: (code: number | null) => void): void;
	on(name: 'error', handler: (error: Error) => void): void;
	on(name: any, handler: any) {
		this._process.on(name, handler);
	}

	kill(): void {
		this._process.kill();
	}
}