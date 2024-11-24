/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { streamToBuffer, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { hashAsync } from '../../../../../base/common/hash.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { SnapshotContext } from '../../../../services/workingCopy/common/fileWorkingCopy.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { IModifiedEntryTelemetryInfo, IModifiedTextFileEntry, INotebookSnapshotEntry, INotebookSnapshotEntryDTO, STORAGE_CONTENTS_FOLDER, WorkingSetEntryState } from '../../common/chatEditingService.js';
import { getStorageLocation } from './chatEditingModifiedFileEntry.js';
import { ChatEditingNotebookFileSystemProvider } from './chatEditingNotebookFileSytemProviders.js';

export class NotebookSnapshotEntry implements INotebookSnapshotEntry {
	public readonly kind = 'notebook';
	constructor(
		public readonly resource: URI,
		public readonly snapshotUri: URI,
		public readonly original: VSBuffer,
		public readonly current: VSBuffer,
		public readonly state: WorkingSetEntryState,
		public readonly telemetryInfo: IModifiedEntryTelemetryInfo,
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
	) {
	}

	public static create(entry: IModifiedTextFileEntry, requestId: string | undefined, instantiationService: IInstantiationService): Promise<NotebookSnapshotEntry> {
		return instantiationService.invokeFunction(async accessor => {
			const notebookService = accessor.get(INotebookService);
			const [original, current] = await Promise.all([
				notebookService.createNotebookTextDocumentSnapshot(entry.originalModel.uri, SnapshotContext.Backup, CancellationToken.None).then(stream => streamToBuffer(stream)),
				notebookService.createNotebookTextDocumentSnapshot(entry.modifiedModel.uri, SnapshotContext.Backup, CancellationToken.None).then(stream => streamToBuffer(stream)),
			]);
			return instantiationService.createInstance(NotebookSnapshotEntry,
				entry.modifiedURI,
				ChatEditingNotebookFileSystemProvider.getSnapshotFileURI(requestId, entry.modifiedURI.path),
				original,
				current,
				entry.state.get(),
				entry.telemetryInfo);
		});
	}

	public static async deserialize(entry: INotebookSnapshotEntryDTO, chatSessionId: string, instantiationService: IInstantiationService): Promise<NotebookSnapshotEntry> {
		return instantiationService.invokeFunction(async accessor => {
			const workspaceContextService = accessor.get(IWorkspaceContextService);
			const environmentService = accessor.get(IEnvironmentService);
			const fileService = accessor.get(IFileService);
			const storageLocation = getStorageLocation(chatSessionId, workspaceContextService, environmentService);

			const [original, current] = await Promise.all([
				getFileContent(entry.originalHash, fileService, storageLocation),
				getFileContent(entry.currentHash, fileService, storageLocation)
			]);

			return instantiationService.createInstance(NotebookSnapshotEntry,
				URI.parse(entry.resource),
				URI.parse(entry.snapshotUri),
				original,
				current,
				entry.state,
				{ requestId: entry.telemetryInfo.requestId, agentId: entry.telemetryInfo.agentId, command: entry.telemetryInfo.command, sessionId: chatSessionId, result: undefined }
			);
		});
	}

	async serialize(): Promise<INotebookSnapshotEntryDTO> {
		const fileContents = new Map<string, string>();
		const [originalHash, currentHash] = await Promise.all([
			this.computeContentHash(this.original),
			this.computeContentHash(this.current)
		]);

		const serialized = {
			kind: 'notebook',
			resource: this.resource.toString(),
			originalHash,
			currentHash,
			state: this.state,
			snapshotUri: this.snapshotUri.toString(),
			telemetryInfo: { requestId: this.telemetryInfo.requestId, agentId: this.telemetryInfo.agentId, command: this.telemetryInfo.command }
		} satisfies INotebookSnapshotEntryDTO;

		const storageFolder = getStorageLocation(this.telemetryInfo.sessionId, this._workspaceContextService, this._environmentService);
		const contentsFolder = URI.joinPath(storageFolder, STORAGE_CONTENTS_FOLDER);

		await Promise.all(Array.from(fileContents.entries()).map(async ([hash, content]) => {
			const file = joinPath(contentsFolder, hash);
			if (!(await this._fileService.exists(file))) {
				await this._fileService.writeFile(joinPath(contentsFolder, hash), VSBuffer.fromString(content));
			}
		}));

		return serialized;
	}
	private async computeContentHash(content: VSBuffer): Promise<string> {
		const hash = await hashAsync(content);
		return hash.substring(0, 7);
	}
}


function getFileContent(hash: string, fileService: IFileService, storageLocation: URI) {
	return fileService.readFile(joinPath(storageLocation, STORAGE_CONTENTS_FOLDER, hash)).then(content => content.value);
}

