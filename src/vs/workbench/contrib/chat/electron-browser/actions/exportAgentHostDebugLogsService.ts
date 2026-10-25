/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../../base/common/network.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, getErrorMessage, isCancellationError } from '../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { dirname, joinPath } from '../../../../../base/common/resources.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES } from '../../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { ByteSize, IFileService } from '../../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService, type INativeZipFile } from '../../../../../platform/native/common/native.js';
import { commitAgentHostDebugLogsExport, createHostArtifactStream, IAgentHostDebugLogFile, IAgentHostDebugLogsExportService, resolveAgentHostDebugLogsExportDirectory, type IAgentHostDebugLogsExportOptions, type IAgentHostDebugLogsHostArtifact, type IAgentHostDebugLogsSaveResult } from '../../browser/actions/exportAgentHostDebugLogsAction.js';

export class NativeAgentHostDebugLogsExportService implements IAgentHostDebugLogsExportService {
	declare readonly _serviceBrand: undefined;
	readonly hostArtifactKind = 'archive';

	constructor(
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@ILogService private readonly logService: ILogService,
	) { }

	async selectDestination(exportName: string): Promise<URI | undefined> {
		const defaultDirectory = await resolveAgentHostDebugLogsExportDirectory(this.configurationService, this.fileDialogService, this.fileService, this.logService);
		const defaultUri = joinPath(defaultDirectory, `${exportName}.zip`);
		return this.fileDialogService.showSaveDialog({
			title: localize('exportDebugLogs.saveDialogTitle', "Export Agent Host Debug Logs"),
			defaultUri,
			filters: [{ name: localize('exportDebugLogs.zipFilter', "Zip Archive"), extensions: ['zip'] }],
			availableFileSystems: [Schemas.file],
		});
	}

	async save(destination: URI, files: readonly IAgentHostDebugLogFile[], hostArtifact: IAgentHostDebugLogsHostArtifact | undefined, options?: IAgentHostDebugLogsExportOptions): Promise<IAgentHostDebugLogsSaveResult> {
		const listeners = new DisposableStore();
		const cancellation = listeners.add(new CancellationTokenSource(options?.token));
		const token = cancellation.token;
		const checkCancellation = () => {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
		};
		const operationId = generateUuid();
		const temporaryExport = joinPath(dirname(destination), `.agent-host-debug-logs-${operationId}.zip`);
		const zipOptions = { maxEntries: AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES, operationId };
		let temporaryHostArchive: URI | undefined;
		let hostSaveError: string | undefined;
		let hostZipFile: INativeZipFile | undefined;
		let availableClientEntries = AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES;
		const includedHostPaths = new Set<string>();
		let creatingZip = false;
		try {
			checkCancellation();
			if (hostArtifact) {
				try {
					const { artifact, readChunk } = hostArtifact;
					if (artifact.kind !== 'archive') {
						throw new Error(`Expected an Agent Host debug-log archive, got ${artifact.kind}`);
					}
					let localHostArchive = artifact.resource;
					if (artifact.resource.scheme !== Schemas.file) {
						// Remote archives must be downloaded in bounded chunks before native ZIP creation.
						localHostArchive = joinPath(this.environmentService.tmpDir, `agent-host-debug-logs-${generateUuid()}.zip`);
						temporaryHostArchive = localHostArchive;
						const watch = StopWatch.create();
						let lastReport = 0;
						const reportDownload = (bytes: number) => {
							const elapsed = watch.elapsed();
							if (bytes === artifact.size || elapsed - lastReport >= 100) {
								lastReport = elapsed;
								options?.progress.report({ message: localize('exportDebugLogs.downloadProgress', "Downloading Agent Host logs: {0} / {1}", ByteSize.formatSize(bytes), ByteSize.formatSize(artifact.size)) });
							}
						};
						options?.progress.report({ message: localize('exportDebugLogs.downloadProgress', "Downloading Agent Host logs: {0} / {1}", ByteSize.formatSize(0), ByteSize.formatSize(artifact.size)) });
						await this.fileService.writeFile(localHostArchive, createHostArtifactStream(artifact, position => readChunk(artifact.resource, position), token, reportDownload));
						this.logService.info(`[ExportAgentHostDebugLogs] Downloaded ${artifact.size} bytes in ${watch.elapsed()}ms`);
					}
					const stat = await this.fileService.stat(localHostArchive);
					if (!stat.isFile || stat.size !== artifact.size) {
						throw new Error('Agent Host debug-log archive no longer matches its manifest');
					}
					hostZipFile = { path: 'host-logs.zip', source: localHostArchive, size: artifact.size, compress: false, skipSourceErrors: true };
					availableClientEntries = Math.max(0, AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES - Math.max(1, artifact.entries.length));
					for (const entry of artifact.entries) {
						includedHostPaths.add(entry.path);
					}
				} catch (error) {
					if (isCancellationError(error) || token.isCancellationRequested) {
						throw new CancellationError();
					}
					hostSaveError = getErrorMessage(error);
					this.logService.warn('[ExportAgentHostDebugLogs] Failed to save Agent Host logs; saving client-owned logs only', error);
				}
			}
			checkCancellation();
			const createZipFiles = (includeHost: boolean): INativeZipFile[] => {
				const zipFiles: INativeZipFile[] = [];
				const clientLimit = includeHost ? availableClientEntries : AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES;
				let omittedFiles = 0;
				for (const file of files) {
					if (includeHost && file.path.startsWith('ahp/') && includedHostPaths.has(`ahp/mission-control/${file.path.slice('ahp/'.length)}`)) {
						continue;
					}
					if (zipFiles.length >= clientLimit) {
						omittedFiles++;
						continue;
					}
					if (hasKey(file, { contents: true })) {
						zipFiles.push(file);
						continue;
					}
					const source = file.resource.scheme === Schemas.vscodeUserData ? file.resource.with({ scheme: Schemas.file }) : file.resource;
					if (source.scheme !== Schemas.file) {
						this.logService.warn(`[ExportAgentHostDebugLogs] Cannot add non-local resource '${source.toString()}' to a ZIP; skipping '${file.path}'`);
						continue;
					}
					zipFiles.push({ path: file.path, source, size: file.size, skipSourceErrors: true });
				}
				if (omittedFiles > 0) {
					this.logService.warn(`[ExportAgentHostDebugLogs] Omitted ${omittedFiles} client log files to keep the combined export within ${AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES} entries`);
				}
				if (includeHost && hostZipFile) {
					zipFiles.push(hostZipFile);
				}
				return zipFiles;
			};
			options?.progress.report({ message: localize('exportDebugLogs.zipProgress', "Creating debug logs ZIP...") });
			listeners.add(this.nativeHostService.onDidProgressZipFile(progress => {
				if (progress.operationId === operationId && !token.isCancellationRequested) {
					options?.progress.report({ message: localize('exportDebugLogs.zipBytesProgress', "Creating ZIP ({0}): {1} / {2}", progress.path, ByteSize.formatSize(progress.bytes), ByteSize.formatSize(progress.total)) });
				}
			}));
			listeners.add(token.onCancellationRequested(() => {
				if (creatingZip) {
					void this.nativeHostService.cancelZipFile(operationId).catch(error => this.logService.warn('[ExportAgentHostDebugLogs] Failed to cancel ZIP creation', error));
				}
			}));
			const watch = StopWatch.create();
			creatingZip = true;
			try {
				const result = await this.nativeHostService.createZipFile(temporaryExport, createZipFiles(!!hostZipFile), zipOptions);
				checkCancellation();
				const skippedHost = hostZipFile && result.skippedFiles.find(file => file.path === 'host-logs.zip');
				if (skippedHost) {
					hostSaveError = skippedHost.error;
					this.logService.warn(`[ExportAgentHostDebugLogs] Failed to save Agent Host logs: ${hostSaveError}; retrying with client-owned logs only`);
					await this.nativeHostService.createZipFile(temporaryExport, createZipFiles(false), zipOptions);
				}
			} finally {
				creatingZip = false;
			}
			await commitAgentHostDebugLogsExport(temporaryExport, destination, this.fileService, this.logService, options);
			this.logService.info(`[ExportAgentHostDebugLogs] Created final ZIP in ${watch.elapsed()}ms`);
			return { hostSaveError };
		} finally {
			cancellation.cancel();
			listeners.dispose();
			try {
				if (await this.fileService.exists(temporaryExport)) {
					await this.fileService.del(temporaryExport);
				}
			} catch (error) {
				this.logService.warn('[ExportAgentHostDebugLogs] Failed to remove incomplete export', error);
			}
			if (temporaryHostArchive) {
				try {
					if (await this.fileService.exists(temporaryHostArchive)) {
						await this.fileService.del(temporaryHostArchive);
					}
				} catch (error) {
					this.logService.warn(`[ExportAgentHostDebugLogs] Failed to remove temporary host archive: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		}
	}
}

registerSingleton(IAgentHostDebugLogsExportService, NativeAgentHostDebugLogsExportService, InstantiationType.Delayed);
