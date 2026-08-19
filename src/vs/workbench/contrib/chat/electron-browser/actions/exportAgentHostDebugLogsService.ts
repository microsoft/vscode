/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService, type INativeZipFile } from '../../../../../platform/native/common/native.js';
import { createHostArtifactStream, IAgentHostDebugLogFile, IAgentHostDebugLogsExportService, type IAgentHostDebugLogsHostArtifact } from '../../browser/actions/exportAgentHostDebugLogsAction.js';

class NativeAgentHostDebugLogsExportService implements IAgentHostDebugLogsExportService {
	declare readonly _serviceBrand: undefined;
	readonly hostArtifactKind = 'archive';

	constructor(
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IFileService private readonly fileService: IFileService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@ILogService private readonly logService: ILogService,
	) { }

	async save(exportName: string, files: readonly IAgentHostDebugLogFile[], hostArtifact: IAgentHostDebugLogsHostArtifact): Promise<boolean> {
		const defaultUri = joinPath(await this.fileDialogService.preferredHome(Schemas.file), `${exportName}.zip`);
		const saveUri = await this.fileDialogService.showSaveDialog({
			title: localize('exportDebugLogs.saveDialogTitle', "Export Agent Host Debug Logs"),
			defaultUri,
			filters: [{ name: localize('exportDebugLogs.zipFilter', "Zip Archive"), extensions: ['zip'] }],
			availableFileSystems: [Schemas.file],
		});

		if (!saveUri) {
			return false;
		}

		const zipFiles: INativeZipFile[] = files.map(file => {
			return hasKey(file, { contents: true })
				? file
				: { path: file.path, source: file.resource, size: file.size };
		});
		let temporaryHostArchive: URI | undefined;
		try {
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
				await this.fileService.writeFile(localHostArchive, createHostArtifactStream(artifact, position => readChunk(artifact.resource, position)));
			}
			zipFiles.push({ sourceArchive: localHostArchive });
			await this.nativeHostService.createZipFile(saveUri, zipFiles);
		} finally {
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
		return true;
	}
}

registerSingleton(IAgentHostDebugLogsExportService, NativeAgentHostDebugLogsExportService, InstantiationType.Delayed);
