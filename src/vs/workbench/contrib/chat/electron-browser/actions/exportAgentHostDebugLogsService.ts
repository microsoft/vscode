/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../../base/common/network.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
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
import { commitAgentHostDebugLogsExport, createHostArtifactStream, IAgentHostDebugLogFile, IAgentHostDebugLogsExportService, resolveAgentHostDebugLogsExportDirectory, type IAgentHostDebugLogsExportOptions, type IAgentHostDebugLogsHostArtifact } from '../../browser/actions/exportAgentHostDebugLogsAction.js';

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

	async save(destination: URI, files: readonly IAgentHostDebugLogFile[], hostArtifact: IAgentHostDebugLogsHostArtifact | undefined, options?: IAgentHostDebugLogsExportOptions): Promise<void> {
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
		const zipFiles: INativeZipFile[] = files.map(file => {
			return hasKey(file, { contents: true })
				? file
				: { path: file.path, source: file.resource.scheme === Schemas.vscodeUserData ? file.resource.with({ scheme: Schemas.file }) : file.resource, size: file.size };
		});
		const zipOptions = { maxEntries: AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES, operationId };
		let temporaryHostArchive: URI | undefined;
		let creatingZip = false;
		try {
			checkCancellation();
			if (hostArtifact) {
				const { artifact, readChunk } = hostArtifact;
				if (artifact.kind !== 'archive') {
					throw new Error(`Expected an Agent Host debug-log archive, got ${artifact.kind}`);
				}
				let localHostArchive = artifact.resource;
				if (artifact.resource.scheme !== Schemas.file) {
					// The archive lives on a remote agent host. Stream it down in
					// bounded chunks rather than pulling the whole thing over in a
					// single protocol message.
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
				zipFiles.push({ path: 'host-logs.zip', source: localHostArchive, size: artifact.size, compress: false });
			}
			checkCancellation();
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
				await this.nativeHostService.createZipFile(temporaryExport, zipFiles, zipOptions);
			} finally {
				creatingZip = false;
			}
			await commitAgentHostDebugLogsExport(temporaryExport, destination, this.fileService, this.logService, options);
			this.logService.info(`[ExportAgentHostDebugLogs] Created final ZIP in ${watch.elapsed()}ms`);
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
				// Best-effort: the download may have failed before the file was
				// created, and a cleanup failure must never mask that error.
				try {
					await this.fileService.del(temporaryHostArchive);
				} catch (error) {
					this.logService.warn(`[ExportAgentHostDebugLogs] Failed to remove temporary host archive: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		}
	}
}

registerSingleton(IAgentHostDebugLogsExportService, NativeAgentHostDebugLogsExportService, InstantiationType.Delayed);
