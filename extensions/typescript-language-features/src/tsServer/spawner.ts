/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SyntaxServerConfiguration, TsServerLogLevel, TypeScriptServiceConfiguration } from '../configuration/configuration';
import { Logger } from '../logging/logger';
import { TelemetryReporter } from '../logging/telemetry';
import Tracer from '../logging/tracer';
import { OngoingRequestCancellerFactory } from '../tsServer/cancellation';
import { ClientCapabilities, ClientCapability, ServerType } from '../typescriptService';
import { memoize } from '../utils/memoize';
import { isWeb, isWebAndHasSharedArrayBuffers } from '../utils/platform';
import { API } from './api';
import { ILogDirectoryProvider } from './logDirectoryProvider';
import { TypeScriptPluginPathsProvider } from './pluginPathsProvider';
import { PluginManager } from './plugins';
import { GetErrRoutingTsServer, ITypeScriptServer, SingleTsServer, SyntaxRoutingTsServer, TsServerDelegate, TsServerLog, TsServerProcessFactory, TsServerProcessKind } from './server';
import { TypeScriptVersionManager } from './versionManager';
import { ITypeScriptVersionProvider, TypeScriptVersion } from './versionProvider';
import { NodeVersionManager } from './nodeManager';

const enum CompositeServerType {
	/** Run a single server that handles all commands  */
	Single,

	/** Run a separate server for syntax commands */
	SeparateSyntax,

	/** Use a separate syntax server while the project is loading */
	DynamicSeparateSyntax,

	/** Only enable the syntax server */
	SyntaxOnly
}

export class TypeScriptServerSpawner {

	@memoize
	public static get tsServerLogOutputChannel(): vscode.OutputChannel {
		return vscode.window.createOutputChannel(vscode.l10n.t("TypeScript Server Log"));
	}

	public constructor(
		private readonly _versionProvider: ITypeScriptVersionProvider,
		private readonly _versionManager: TypeScriptVersionManager,
		private readonly _nodeVersionManager: NodeVersionManager,
		private readonly _logDirectoryProvider: ILogDirectoryProvider,
		private readonly _pluginPathsProvider: TypeScriptPluginPathsProvider,
		private readonly _logger: Logger,
		private readonly _telemetryReporter: TelemetryReporter,
		private readonly _tracer: Tracer,
		private readonly _factory: TsServerProcessFactory,
	) { }

	public spawn(
		version: TypeScriptVersion,
		capabilities: ClientCapabilities,
		configuration: TypeScriptServiceConfiguration,
		pluginManager: PluginManager,
		cancellerFactory: OngoingRequestCancellerFactory,
		delegate: TsServerDelegate,
	): ITypeScriptServer {
		let primaryServer: ITypeScriptServer;
		const serverType = this.getCompositeServerType(version, capabilities, configuration);
		const shouldUseSeparateDiagnosticsServer = this.shouldUseSeparateDiagnosticsServer(configuration);

		switch (serverType) {
			case CompositeServerType.SeparateSyntax:
			case CompositeServerType.DynamicSeparateSyntax:
				{
					const enableDynamicRouting = !shouldUseSeparateDiagnosticsServer && serverType === CompositeServerType.DynamicSeparateSyntax;
					primaryServer = new SyntaxRoutingTsServer({
						syntax: this.spawnTsServer(TsServerProcessKind.Syntax, version, configuration, pluginManager, cancellerFactory),
						semantic: this.spawnTsServer(TsServerProcessKind.Semantic, version, configuration, pluginManager, cancellerFactory),
					}, delegate, enableDynamicRouting);
					break;
				}
			case CompositeServerType.Single:
				{
					primaryServer = this.spawnTsServer(TsServerProcessKind.Main, version, configuration, pluginManager, cancellerFactory);
					break;
				}
			case CompositeServerType.SyntaxOnly:
				{
					primaryServer = this.spawnTsServer(TsServerProcessKind.Syntax, version, configuration, pluginManager, cancellerFactory);
					break;
				}
		}

		if (shouldUseSeparateDiagnosticsServer) {
			return new GetErrRoutingTsServer({
				getErr: this.spawnTsServer(TsServerProcessKind.Diagnostics, version, configuration, pluginManager, cancellerFactory),
				primary: primaryServer,
			}, delegate);
		}

		return primaryServer;
	}

	private getCompositeServerType(
		version: TypeScriptVersion,
		capabilities: ClientCapabilities,
		configuration: TypeScriptServiceConfiguration,
	): CompositeServerType {
		if (!capabilities.has(ClientCapability.Semantic)) {
			return CompositeServerType.SyntaxOnly;
		}

		switch (configuration.useSyntaxServer) {
			case SyntaxServerConfiguration.Always:
				return CompositeServerType.SyntaxOnly;

			case SyntaxServerConfiguration.Never:
				return CompositeServerType.Single;

			case SyntaxServerConfiguration.Auto:
				return version.apiVersion?.gte(API.v400)
					? CompositeServerType.DynamicSeparateSyntax
					: CompositeServerType.SeparateSyntax;
		}
	}

	private shouldUseSeparateDiagnosticsServer(
		configuration: TypeScriptServiceConfiguration,
	): boolean {
		return configuration.enableProjectDiagnostics;
	}

	private spawnTsServer(
		kind: TsServerProcessKind,
		version: TypeScriptVersion,
		configuration: TypeScriptServiceConfiguration,
		pluginManager: PluginManager,
		cancellerFactory: OngoingRequestCancellerFactory,
	): ITypeScriptServer {
		const apiVersion = version.apiVersion || API.defaultVersion;

		const canceller = cancellerFactory.create(kind, this._tracer);
		const { args, tsServerLog, tsServerTraceDirectory } = this.getTsServerArgs(kind, configuration, version, apiVersion, pluginManager, canceller.cancellationPipeName);

		if (TypeScriptServerSpawner.isLoggingEnabled(configuration)) {
			if (tsServerLog?.type === 'file') {
				this._logger.info(`<${kind}> Log file: ${tsServerLog.uri.fsPath}`);
			} else if (tsServerLog?.type === 'output') {
				this._logger.info(`<${kind}> Logging to output`);
			} else {
				this._logger.error(`<${kind}> Could not create TS Server log`);
			}
		}

		if (configuration.enableTsServerTracing) {
			if (tsServerTraceDirectory) {
				this._logger.info(`<${kind}> Trace directory: ${tsServerTraceDirectory.fsPath}`);
			} else {
				this._logger.error(`<${kind}> Could not create trace directory`);
			}
		}

		this._logger.info(`<${kind}> Forking...`);
		const process = this._factory.fork(version, args, kind, configuration, this._versionManager, this._nodeVersionManager, tsServerLog);
		this._logger.info(`<${kind}> Starting...`);

		return new SingleTsServer(
			kind,
			this.kindToServerType(kind),
			process!,
			tsServerLog,
			canceller,
			version,
			this._telemetryReporter,
			this._tracer);
	}

	private kindToServerType(kind: TsServerProcessKind): ServerType {
		switch (kind) {
			case TsServerProcessKind.Syntax:
				return ServerType.Syntax;

			case TsServerProcessKind.Main:
			case TsServerProcessKind.Semantic:
			case TsServerProcessKind.Diagnostics:
			default:
				return ServerType.Semantic;
		}
	}

	private getTsServerArgs(
		kind: TsServerProcessKind,
		configuration: TypeScriptServiceConfiguration,
		currentVersion: TypeScriptVersion,
		apiVersion: API,
		pluginManager: PluginManager,
		cancellationPipeName: string | undefined,
	): { args: string[]; tsServerLog: TsServerLog | undefined; tsServerTraceDirectory: vscode.Uri | undefined } {
		const args: string[] = [];
		let tsServerLog: TsServerLog | undefined;
		let tsServerTraceDirectory: vscode.Uri | undefined;

		if (kind === TsServerProcessKind.Syntax) {
			if (apiVersion.gte(API.v401)) {
				args.push('--serverMode', 'partialSemantic');
			} else {
				args.push('--syntaxOnly');
			}
		}

		args.push('--useInferredProjectPerProjectRoot');

		if (configuration.disableAutomaticTypeAcquisition || kind === TsServerProcessKind.Syntax || kind === TsServerProcessKind.Diagnostics) {
			args.push('--disableAutomaticTypingAcquisition');
		}

		if (kind === TsServerProcessKind.Semantic || kind === TsServerProcessKind.Main) {
			args.push('--enableTelemetry');
		}

		if (cancellationPipeName) {
			args.push('--cancellationPipeName', cancellationPipeName + '*');
		}

		if (TypeScriptServerSpawner.isLoggingEnabled(configuration)) {
			if (isWeb()) {
				args.push('--logVerbosity', TsServerLogLevel.toString(configuration.tsServerLogLevel));
				tsServerLog = { type: 'output', output: TypeScriptServerSpawner.tsServerLogOutputChannel };
			} else {
				const logDir = this._logDirectoryProvider.getNewLogDirectory();
				if (logDir) {
					const logFilePath = vscode.Uri.joinPath(logDir, `tsserver.log`);
					tsServerLog = { type: 'file', uri: logFilePath };

					args.push('--logVerbosity', TsServerLogLevel.toString(configuration.tsServerLogLevel));
					args.push('--logFile', logFilePath.fsPath);
				}
			}
		}

		if (configuration.enableTsServerTracing && !isWeb()) {
			tsServerTraceDirectory = this._logDirectoryProvider.getNewLogDirectory();
			if (tsServerTraceDirectory) {
				args.push('--traceDirectory', `"${tsServerTraceDirectory.fsPath}"`);
			}
		}

		const pluginPaths = isWeb() ? [] : this._pluginPathsProvider.getPluginPaths();

		if (pluginManager.plugins.length) {
			args.push('--globalPlugins', pluginManager.plugins.map(x => x.name).join(','));

			const isUsingBundledTypeScriptVersion = currentVersion.path === this._versionProvider.defaultVersion.path;
			for (const plugin of pluginManager.plugins) {
				if (isUsingBundledTypeScriptVersion || plugin.enableForWorkspaceTypeScriptVersions) {
					pluginPaths.push(isWeb() ? plugin.uri.toString() : plugin.uri.fsPath);
				}
			}
		}

		if (pluginPaths.length !== 0) {
			args.push('--pluginProbeLocations', pluginPaths.join(','));
		}

		if (configuration.npmLocation && !isWeb()) {
			args.push('--npmLocation', `"${configuration.npmLocation}"`);
		}

		args.push('--locale', TypeScriptServerSpawner.getTsLocale(configuration));

		args.push('--noGetErrOnBackgroundUpdate');

		if (
			apiVersion.gte(API.v544)
			&& configuration.useVsCodeWatcher
			&& !apiVersion.isYarnPnp() // Disable for yarn pnp as it currently breaks with the VS Code watcher
		) {
			args.push('--canUseWatchEvents');
		}

		args.push('--validateDefaultNpmLocation');

		if (isWebAndHasSharedArrayBuffers()) {
			args.push('--enableProjectWideIntelliSenseOnWeb');
		}

		return { args, tsServerLog, tsServerTraceDirectory };
	}

	private static isLoggingEnabled(configuration: TypeScriptServiceConfiguration) {
		return configuration.tsServerLogLevel !== TsServerLogLevel.Off;
	}

	private static getTsLocale(configuration: TypeScriptServiceConfiguration): string {
		return configuration.locale
			? configuration.locale
			: vscode.env.language;
	}
}

