/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { FileSystem } from '@vscode/sync-api-client';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { Logger } from './logging';
import { WebTypingsInstallerClient } from './typingsInstaller/typingsInstaller';
import { hrtime } from './util/hrtime';
import { WasmCancellationToken } from './wasmCancellationToken';
import { PathMapper } from './pathMapper';

export interface StartSessionOptions {
	readonly globalPlugins: ts.server.SessionOptions['globalPlugins'];
	readonly pluginProbeLocations: ts.server.SessionOptions['pluginProbeLocations'];
	readonly allowLocalPluginLoads: ts.server.SessionOptions['allowLocalPluginLoads'];
	readonly useSingleInferredProject: ts.server.SessionOptions['useSingleInferredProject'];
	readonly useInferredProjectPerProjectRoot: ts.server.SessionOptions['useInferredProjectPerProjectRoot'];
	readonly suppressDiagnosticEvents: ts.server.SessionOptions['suppressDiagnosticEvents'];
	readonly noGetErrOnBackgroundUpdate: ts.server.SessionOptions['noGetErrOnBackgroundUpdate'];
	readonly serverMode: ts.server.SessionOptions['serverMode'];
	readonly disableAutomaticTypingAcquisition: boolean;
}

export function startWorkerSession(
	ts: typeof import('typescript/lib/tsserverlibrary'),
	host: ts.server.ServerHost,
	fs: FileSystem | undefined,
	options: StartSessionOptions,
	port: MessagePort,
	pathMapper: PathMapper,
	logger: Logger,
): void {
	const indent: (str: string) => string = (ts as any).server.indent;

	const worker = new class WorkerSession extends ts.server.Session<{}> {

		private readonly wasmCancellationToken: WasmCancellationToken;
		private readonly listener: (message: any) => void;

		constructor() {
			const cancellationToken = new WasmCancellationToken();
			const typingsInstaller = options.disableAutomaticTypingAcquisition || !fs ? ts.server.nullTypingsInstaller : new WebTypingsInstallerClient(host, '/vscode-global-typings/ts-nul-authority/projects');

			super({
				host,
				cancellationToken,
				...options,
				typingsInstaller,
				byteLength: () => { throw new Error('Not implemented'); }, // Formats the message text in send of Session which is overridden in this class so not needed
				hrtime,
				logger: logger.tsLogger,
				canUseEvents: true,
			});
			this.wasmCancellationToken = cancellationToken;

			this.listener = (message: any) => {
				// TEMP fix since Cancellation.retrieveCheck is not correct
				function retrieveCheck2(data: any) {
					if (!globalThis.crossOriginIsolated || !(data.$cancellationData instanceof SharedArrayBuffer)) {
						return () => false;
					}
					const typedArray = new Int32Array(data.$cancellationData, 0, 1);
					return () => {
						return Atomics.load(typedArray, 0) === 1;
					};
				}

				const shouldCancel = retrieveCheck2(message.data);
				if (shouldCancel) {
					this.wasmCancellationToken.shouldCancel = shouldCancel;
				}

				try {
					if (message.data.command === 'updateOpen') {
						const args = message.data.arguments as ts.server.protocol.UpdateOpenRequestArgs;
						for (const open of args.openFiles ?? []) {
							if (open.projectRootPath) {
								pathMapper.addProjectRoot(open.projectRootPath);
							}
						}
					}
				} catch {
					// Noop
				}

				this.onMessage(message.data);
			};
		}

		public override send(msg: ts.server.protocol.Message) {
			if (msg.type === 'event' && !this.canUseEvents) {
				if (this.logger.hasLevel(ts.server.LogLevel.verbose)) {
					this.logger.info(`Session does not support events: ignored event: ${JSON.stringify(msg)}`);
				}
				return;
			}
			if (this.logger.hasLevel(ts.server.LogLevel.verbose)) {
				this.logger.info(`${msg.type}:${indent(JSON.stringify(msg))}`);
			}
			port.postMessage(msg);
		}

		protected override parseMessage(message: {}): ts.server.protocol.Request {
			return message as ts.server.protocol.Request;
		}

		protected override toStringMessage(message: {}) {
			return JSON.stringify(message, undefined, 2);
		}

		override exit() {
			this.logger.info('Exiting...');
			port.removeEventListener('message', this.listener);
			this.projectService.closeLog();
			close();
		}

		listen() {
			this.logger.info(`webServer.ts: tsserver starting to listen for messages on 'message'...`);
			port.onmessage = this.listener;
		}
	}();

	worker.listen();
}
